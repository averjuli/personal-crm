#!/usr/bin/env bash
# The deploy command on the server, run as root through sudo (no password, this script only).
# Installed as /usr/local/sbin/crm-deploy by install-on-server.sh and refreshed by every `upload`.
# The GitHub Actions key may run nothing else: authorized_keys forces
# `sudo -n /usr/local/sbin/crm-deploy $SSH_ORIGINAL_COMMAND`.
#
#   crm-deploy upload        read a tar.gz of the repo's deploy/ from stdin and install it
#   crm-deploy deploy <prod|staging> <sha>  deploy an image; only prod makes a backup
#                            a one-off container, start the new version, smoke-test /health; when the
#                            image is not on the server yet, registry user and token come on stdin,
#                            one per line
#   crm-deploy rollback <environment>  start the previous version again; manual only
#   crm-deploy status <environment>    containers, current and previous versions, health
#   crm-deploy logs <environment> [app|db]  last 200 journal lines, including replaced containers
#   crm-deploy verify-logs staging     recreate only the staging app and verify journal retention
#   crm-deploy backup prod [daily]     dump the production database
#   crm-deploy setup-backups           install and enable the daily backup timer
#   crm-deploy restore prod [file]     replace the production database after typing "yes";
#                            without a file name it lists the backups; manual only
#   crm-deploy seed          fill an empty database with test contacts
set -euo pipefail

APP_DIR=/opt/personal-crm
IMAGE_REPO=ghcr.io/averjuli/personal-crm
BACKUP_DIR=/var/backups/personal-crm
# Keep daily and deployment backups separately; pre-restore copies are retained.
KEEP_BACKUPS=7
LAST_BACKUP=""
DEPLOY_ENV=""
ENV_DIR=""
ENV_FILE=""
APP_HOST=""
APP_PORT=""
BACKUP_ENABLED=""

step() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
select_environment() {
  DEPLOY_ENV=${1:-}
  case "$DEPLOY_ENV" in
    prod)
      ENV_DIR=$APP_DIR
      ENV_FILE=$APP_DIR/.env
      APP_HOST=app.vupsen.space
      APP_PORT=3000
      BACKUP_ENABLED=yes
      ;;
    staging)
      ENV_DIR=$APP_DIR/staging
      ENV_FILE=$ENV_DIR/.env
      APP_HOST=test-app.vupsen.space
      APP_PORT=3002
      BACKUP_ENABLED=no
      ;;
    *) die "environment must be prod or staging" ;;
  esac
  [ -s "$ENV_FILE" ] || die "$ENV_FILE is missing or empty"
}
current_version() { cat "$ENV_DIR/current-version" 2>/dev/null || true; }
previous_version() { cat "$ENV_DIR/previous-version" 2>/dev/null || true; }
image_version() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null
}
compose() {
  APP_TAG=${APP_TAG:-$(current_version)} APP_PORT=$APP_PORT \
    docker compose --env-file "$ENV_FILE" -p "$DEPLOY_ENV" --project-directory "$APP_DIR" -f "$APP_DIR/deploy/compose.yaml" "$@"
}

upload() {
  [ ! -t 0 ] || die "pipe a tar.gz of deploy/ into stdin: tar -C deploy -cz . | ssh ... upload"
  local new="$APP_DIR/deploy.new"
  rm -rf "$new"
  install -d -m 755 "$new"
  tar -xzf - -C "$new" --no-same-owner --no-same-permissions
  [ -f "$new/compose.yaml" ] && [ -f "$new/crm-deploy.sh" ] || die "compose.yaml or crm-deploy.sh is missing"
  local script
  for script in "$new"/*.sh; do
    bash -n "$script" || die "$(basename "$script") has syntax errors, nothing installed"
  done

  rm -rf "$APP_DIR/deploy.old"
  if [ -d "$APP_DIR/deploy" ]; then mv "$APP_DIR/deploy" "$APP_DIR/deploy.old"; fi
  mv "$new" "$APP_DIR/deploy"
  rm -rf "$APP_DIR/deploy.old"
  # A new file plus a rename: this running copy keeps reading the old one
  install -m 755 "$APP_DIR/deploy/crm-deploy.sh" /usr/local/sbin/crm-deploy.new
  mv /usr/local/sbin/crm-deploy.new /usr/local/sbin/crm-deploy
  step "Deploy scripts updated: $(cd "$APP_DIR/deploy" && echo *)"
}

setup_backups() {
  local unit changed=no
  for unit in personal-crm-backup.service personal-crm-backup.timer; do
    [ -f "$APP_DIR/deploy/$unit" ] || die "$unit is missing from deploy/"
    if ! cmp -s "$APP_DIR/deploy/$unit" "/etc/systemd/system/$unit"; then
      install -m 644 "$APP_DIR/deploy/$unit" "/etc/systemd/system/$unit"
      changed=yes
    fi
  done
  if [ "$changed" = yes ]; then systemctl daemon-reload; fi
  systemctl enable --now personal-crm-backup.timer
  if [ "$changed" = yes ]; then systemctl restart personal-crm-backup.timer; fi
  step "Daily production backup enabled at 03:00 Europe/Moscow"
}

# Pull with registry credentials from stdin (GitHub Actions sends its short-lived token);
# they are kept in a temporary docker config for this one pull only
pull() {
  local image=$1 user="" token="" config ok=0
  if [ ! -t 0 ]; then
    IFS= read -r user || true
    IFS= read -r token || true
  fi
  [ -n "$user" ] && [ -n "$token" ] || die "$image is not on the server and no registry credentials came on stdin"
  step "Pulling $image"
  config=$(mktemp -d)
  printf '%s\n' "$token" | DOCKER_CONFIG=$config docker login ghcr.io -u "$user" --password-stdin >/dev/null \
    && DOCKER_CONFIG=$config docker pull -q "$image" || ok=$?
  rm -rf "$config"
  [ "$ok" -eq 0 ] || die "could not pull $image"
}

# 200 from the public address, through nginx on this server, with status ok and the expected version
smoke() {
  local expected=$1 response="" code="" smoke_url="https://$APP_HOST/health"
  for _ in $(seq 1 10); do
    response=$(curl -sS --max-time 5 --resolve "$APP_HOST:443:127.0.0.1" -w '\n%{http_code}' "$smoke_url" 2>&1) || true
    code=${response##*$'\n'}
    [ "$code" = 200 ] && break
    sleep 3
  done
  echo "GET $smoke_url -> ${response//$'\n'/ }"
  [ "$code" = 200 ] && [[ $response == *'"status":"ok"'* && $response == *"\"version\":\"$expected\""* ]]
}

# Remove only this app's images older than two weeks, preserving rollback images.
prune_images() {
  local current previous staging_current ref created cutoff
  # A staging deploy can be pulling an older image. Wait until its version is recorded.
  exec 7>/run/crm-deploy-staging.lock
  flock -w 600 7 || die "staging is busy; old images were not removed"
  current=$(current_version)
  previous=$(previous_version)
  staging_current=$(cat "$APP_DIR/staging/current-version" 2>/dev/null || true)
  cutoff=$(date -d '14 days ago' +%s)
  docker image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE_REPO" | while read -r ref; do
    case "$ref" in
      "$IMAGE_REPO:$current" | "$IMAGE_REPO:$previous" | "$IMAGE_REPO:$staging_current" | *"<none>") ;;
      *)
        created=$(docker image inspect -f '{{.Created}}' "$ref" 2>/dev/null || true)
        if [ -n "$created" ] && [ "$(date -d "$created" +%s)" -lt "$cutoff" ]; then
          if docker image rm "$ref" >/dev/null; then echo "removed $ref"; fi
        fi
        ;;
    esac
  done
  echo "kept prod: $current (current) ${previous:-none} (previous); staging: ${staging_current:-none}"
  flock -u 7
  exec 7>&-
}

deploy() {
  local environment=${1:-} version=${2:-}
  select_environment "$environment"
  [[ $version =~ ^[0-9a-f]{40}$ ]] || die "usage: crm-deploy deploy <prod|staging> <full commit SHA>"
  echo "DEPLOY_SHA=$version"
  local image="$IMAGE_REPO:$version" current started=0
  current=$(current_version)
  export APP_TAG=$version

  if [ "$DEPLOY_ENV" = staging ]; then
    [ -s /etc/nginx/personal-crm-staging.htpasswd ] \
      && [ -s /etc/letsencrypt/live/test-app.vupsen.space/fullchain.pem ] \
      || die "staging HTTPS/password protection is not configured; run: ssh -t crm sudo crm-deploy setup-staging"
  fi

  # The first staging deploy starts from the most recent production backup.
  # A failed initial import leaves an empty volume, so retry it on the next deploy.
  if [ "$DEPLOY_ENV" = staging ]; then
    local staging_tables initial_backup
    if ! docker volume inspect staging_db-data >/dev/null 2>&1; then
      staging_tables=0
    else
      staging_tables=$(staging_table_count)
    fi
    if [ "$staging_tables" -eq 0 ]; then
      initial_backup=$(latest_prod_backup)
      step "Initializing staging from $initial_backup"
      load_prod_backup_into_staging "$initial_backup"
    fi
  fi

  # Only production takes a backup before migrations.
  if [ "$BACKUP_ENABLED" = yes ] && docker volume inspect "${DEPLOY_ENV}_db-data" >/dev/null 2>&1; then
    step "Backing up the database (version running now: ${current:-none})"
    compose up -d --wait db </dev/null
    backup || die "backup failed: $version was not started, ${current:-nothing} keeps running"
  elif [ "$BACKUP_ENABLED" = yes ]; then
    step "No database yet, nothing to back up"
  fi

  docker image inspect "$image" >/dev/null 2>&1 || pull "$image"
  [ "$(image_version "$image")" = "$version" ] || die "$image was built from another commit"

  step "Starting the database"
  compose up -d --wait db

  step "Applying migrations in a one-off container of $version"
  compose run --rm --no-deps app node scripts/migrate.mjs \
    || die "migrations failed: $version was not started, ${current:-nothing} keeps running"

  step "Starting $version"
  compose up -d --no-deps --wait --wait-timeout 120 app || started=$?
  if [ -n "$current" ] && [ "$current" != "$version" ]; then
    echo "$current" > "$ENV_DIR/previous-version"
  fi
  echo "$version" > "$ENV_DIR/current-version"
  if [ "$started" -ne 0 ]; then
    compose logs --tail 50 app || true
    die "$version did not become healthy. Nothing was rolled back; to return to $(previous_version): sudo crm-deploy rollback $DEPLOY_ENV"
  fi

  if [ "$DEPLOY_ENV" = staging ]; then
    update_staging_proxy
  fi

  step "Smoke test"
  smoke "$version" \
    || die "smoke test failed, $version is running. Nothing was rolled back; to return to $(previous_version): sudo crm-deploy rollback $DEPLOY_ENV"

  if [ "$DEPLOY_ENV" = prod ]; then
    step "Removing old images"
    prune_images
  fi
  step "Deployed $version"
}

rollback() {
  select_environment "${1:-}"
  local previous
  previous=$(previous_version)
  [ -n "$previous" ] || die "no previous version is recorded"
  docker image inspect "$IMAGE_REPO:$previous" >/dev/null 2>&1 || die "the image of $previous is not on the server"
  step "Rolling back from $(current_version) to $previous"
  # Migrations of an older image find nothing new to apply
  deploy "$DEPLOY_ENV" "$previous" </dev/null
}

status() {
  compose ps -a || true
  local service container
  for service in app db; do
    container=$(compose ps -q "$service")
    if [ -n "$container" ]; then
      docker inspect -f '{{.Name}} logging={{.HostConfig.LogConfig.Type}}' "$container"
    fi
  done
  echo "current:  $(current_version)"
  echo "previous: $(previous_version)"
  echo "health:   $(curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/health" || echo unavailable)"
}

logs() {
  local service=${1:-app}
  case "$service" in app|db) ;; *) die "log service must be app or db" ;; esac
  # A stable name matches all generations; compose logs only reads the current container.
  journalctl --quiet --no-pager -n 200 -o short-iso-precise "CONTAINER_NAME=$DEPLOY_ENV-$service-1"
}

verify_logs() {
  [ "$DEPLOY_ENV" = staging ] || die "log retention verification is staging-only"
  local service container before after database cutoff entry retained new_entry
  for service in app db; do
    container=$(compose ps -q "$service")
    [ -n "$container" ] || die "staging $service is not running"
    [ "$(docker inspect -f '{{.HostConfig.LogConfig.Type}}' "$container")" = journald ] \
      || die "staging $service is not using journald"
  done
  before=$(compose ps -q app)
  database=$(compose ps -q db)
  journalctl --sync
  cutoff=$(date --utc '+%Y-%m-%d %H:%M:%S.%6N UTC')
  entry=$(journalctl --quiet --no-pager -n 200 -o export --until "$cutoff" \
    CONTAINER_NAME=staging-app-1 "CONTAINER_ID_FULL=$before")
  [ -n "$entry" ] || die "no journal entry found for the current staging app"

  step "Recreating only the staging app; database and production stay running"
  compose up -d --no-deps --force-recreate --wait --wait-timeout 120 app \
    || die "staging app did not become healthy; nothing was rolled back"
  after=$(compose ps -q app)
  [ -n "$after" ] && [ "$before" != "$after" ] || die "staging app was not recreated"
  [ "$(compose ps -q db)" = "$database" ] || die "staging database container changed"
  journalctl --sync
  retained=$(journalctl --quiet --no-pager -n 200 -o export --until "$cutoff" \
    CONTAINER_NAME=staging-app-1 "CONTAINER_ID_FULL=$before")
  [ "$entry" = "$retained" ] || die "the old staging app journal entries were not preserved"
  new_entry=$(journalctl --quiet --no-pager -n 1 -o export \
    CONTAINER_NAME=staging-app-1 "CONTAINER_ID_FULL=$after")
  [ -n "$new_entry" ] || die "no journal entry found for the recreated staging app"
  smoke "$(current_version)" || die "staging smoke test failed; nothing was rolled back"
  echo "Old container: $before"
  echo "New container: $after"
  echo "Preserved journal entries SHA256: $(printf '%s' "$entry" | sha256sum | cut -d ' ' -f1)"
  journalctl --disk-usage
  step "Old journal entries preserved exactly; new container logs are present; staging is healthy"
}

# Name: <prefix>-<date>-<time>-<version running now>.sql.gz; the path goes to LAST_BACKUP
backup() {
  [ "$DEPLOY_ENV" = prod ] || die "backups are available only for prod"
  local prefix=${1:-prod} version file temporary
  case "$prefix" in prod|daily|pre-restore) ;; *) die "invalid backup type" ;; esac
  exec 6>/run/crm-backup.lock
  flock -w 600 6 || die "staging is reading production backups"
  version=$(current_version)
  install -d -m 700 "$BACKUP_DIR" || die "could not create the backup directory"
  file="$BACKUP_DIR/$prefix-$(TZ=Europe/Moscow date +%Y%m%d-%H%M%S%N)-${version:0:12}"
  [ -n "$version" ] && file="$file.sql.gz" || file="${file}none.sql.gz"
  temporary=$(mktemp "$BACKUP_DIR/.$prefix-XXXXXX.partial") || die "could not create a backup file"
  # $POSTGRES_* expand inside the container, so the password never shows up here
  # </dev/null: docker would otherwise swallow the registry credentials waiting on this script's stdin
  if ! compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </dev/null | gzip > "$temporary"; then
    rm -f "$temporary"
    flock -u 6
    exec 6>&-
    echo "ERROR: backup failed" >&2
    return 1
  fi
  gzip -t "$temporary" || die "backup archive is damaged: $temporary"
  mv "$temporary" "$file" || die "could not publish the completed backup: $temporary"
  LAST_BACKUP=$file
  echo "$file ($(du -h "$file" | cut -f1))"
  if [ "$prefix" != pre-restore ]; then prune_backups "$prefix"; fi
  flock -u 6
  exec 6>&-
}

# Keep the newest KEEP_BACKUPS files of each regular backup type.
prune_backups() {
  local prefix=$1 files excess
  mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$prefix-*.sql.gz" -printf '%T@ %p\n' | sort -n | cut -d ' ' -f2-)
  excess=$((${#files[@]} - KEEP_BACKUPS))
  if [ "$excess" -gt 0 ]; then
    rm -f -- "${files[@]:0:excess}"
    echo "removed $excess old backup(s), kept $KEEP_BACKUPS"
  fi
}

# Empty the database and load a backup into it (psql runs inside the db container)
reload_database() {
  local file=$1
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' </dev/null \
    && gunzip -c "$file" | compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -q -o /dev/null'
}

# Manual only: replaces the whole database with a backup and starts the same app version again
restore() {
  local name=${1:-} file version db backup_version=unknown answer
  if [ -z "$name" ]; then
    echo "usage: ssh -t crm sudo crm-deploy restore prod <backup file name>"
    echo "backups in $BACKUP_DIR (the name has the date, the time and the app version before the deploy):"
    ls -1 "$BACKUP_DIR" 2>/dev/null || true
    return 0
  fi
  [[ $name =~ ^[A-Za-z0-9._-]+\.sql\.gz$ ]] || die "give a backup file name from $BACKUP_DIR, without a path"
  file="$BACKUP_DIR/$name"
  [ -f "$file" ] || die "$file does not exist"
  gzip -t "$file" || die "$file is damaged, nothing changed"
  [ -t 0 ] || die "restore asks for a confirmation, run it in a terminal: ssh -t crm sudo crm-deploy restore prod $name"
  version=$(current_version)
  [ -n "$version" ] || die "no current version is recorded, there is nothing to start after the restore"
  docker image inspect "$IMAGE_REPO:$version" >/dev/null 2>&1 || die "the image of the current version $version is not on the server"
  [[ $name =~ -([0-9a-f]{12}|none)\.sql\.gz$ ]] && backup_version=${BASH_REMATCH[1]}

  [ "$DEPLOY_ENV" = prod ] || die "restore is available only for prod"
  compose up -d --wait db
  db=$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"' </dev/null)
  echo "The database \"$db\" on this server will be DELETED and created again from:"
  echo "  $file"
  echo "  (made while the app was at version $backup_version)"
  echo "The app will be stopped, then started again at its current version $version."
  echo "A copy of the current database is saved first."
  printf 'Type yes to continue: '
  IFS= read -r answer || answer=""
  [ "$answer" = yes ] || die "cancelled, nothing changed"

  step "Saving a copy of the current database"
  backup pre-restore || die "could not save a copy of the current database, nothing changed"
  local copy=$LAST_BACKUP

  step "Stopping the app"
  compose stop app
  step "Creating database $db again from $name"
  reload_database "$file" || die "restore failed, the app is stopped and the database may be empty or half loaded. Copy made before the restore: $copy. To return to it: ssh -t crm sudo crm-deploy restore prod ${copy##*/}"

  step "Starting $version"
  compose up -d --no-deps --wait --wait-timeout 120 app \
    || die "$version did not become healthy after the restore. The database is restored; copy made before the restore: $copy"
  step "Smoke test"
  smoke "$version" || die "smoke test failed after the restore, the database is restored; copy made before the restore: $copy"
  step "Restored from $name, the app runs at $version"
}

latest_prod_backup() {
  local files
  mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'prod-*.sql.gz' -o -name 'daily-*.sql.gz' \) -printf '%T@ %p\n' 2>/dev/null | sort -n | cut -d ' ' -f2-)
  [ "${#files[@]}" -gt 0 ] || die "no production backup is available in $BACKUP_DIR"
  printf '%s\n' "${files[-1]}"
}

load_prod_backup_into_staging() {
  local file=$1 replace=${2:-no}
  select_environment staging
  mkdir -p "$ENV_DIR"
  compose up -d --wait db
  if [ "$replace" = yes ]; then
    compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' </dev/null
  fi
  gunzip -c "$file" \
    | sed -E '/^ALTER .* OWNER TO /d' \
    | compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -q -o /dev/null'
  echo "Loaded $(basename "$file") into staging; objects are owned by the staging database user"
}

staging_table_count() {
  compose up -d --wait db >/dev/null
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()"' </dev/null
}

staging_init() {
  local file
  select_environment staging
  if docker volume inspect staging_db-data >/dev/null 2>&1 && [ "$(staging_table_count)" -ne 0 ]; then
    die "staging database already has tables; use staging-refresh to replace its data"
  fi
  file=$(latest_prod_backup)
  echo "Initializing the empty staging database from $file"
  load_prod_backup_into_staging "$file" yes
}

staging_refresh() {
  local file answer
  select_environment staging
  docker volume inspect staging_db-data >/dev/null 2>&1 || die "staging database is not initialized; use staging-init"
  file=$(latest_prod_backup)
  echo "The staging database will be replaced with the production backup: $file"
  printf 'Type yes to continue: '
  IFS= read -r answer || answer=""
  [ "$answer" = yes ] || die "cancelled, nothing changed"
  compose stop app || true
  load_prod_backup_into_staging "$file" yes
  local version
  version=$(current_version)
  [ -n "$version" ] || die "staging has no deployed version; database copy is ready"
  compose run --rm --no-deps app node scripts/migrate.mjs \
    || die "migrations failed after staging refresh; app remains stopped"
  compose up -d --no-deps --wait --wait-timeout 120 app
  smoke "$version" || die "staging smoke failed after refresh; no automatic rollback was performed"
}

setup_staging() {
  local host=test-app.vupsen.space webroot=/var/www/letsencrypt
  local site=/etc/nginx/sites-available/personal-crm-staging.conf
  local enabled=/etc/nginx/sites-enabled/personal-crm-staging.conf
  local auth_file=/etc/nginx/personal-crm-staging.htpasswd
  local proxy_snippet=/etc/nginx/snippets/personal-crm-staging-proxy.conf
  local username password confirmation temp
  [ -t 0 ] || die "run setup-staging in a terminal: ssh -t crm sudo crm-deploy setup-staging"
  [ ! -e "$site" ] && [ ! -e "$enabled" ] && [ ! -e "$auth_file" ] && [ ! -e "$proxy_snippet" ] \
    || die "a staging nginx file already exists; refusing to replace existing server configuration"
  command -v nginx >/dev/null || die "nginx is not installed"
  if ! command -v certbot >/dev/null || ! command -v htpasswd >/dev/null; then
    command -v apt-get >/dev/null || die "install certbot and apache2-utils before setup-staging"
    apt-get update
    apt-get install -y certbot apache2-utils
  fi
  read -r -p 'HTTP Basic Auth username: ' username
  [ -n "$username" ] || die "username cannot be empty"
  read -r -s -p 'HTTP Basic Auth password: ' password; echo
  read -r -s -p 'Repeat password: ' confirmation; echo
  [ -n "$password" ] && [ "$password" = "$confirmation" ] || die "passwords do not match"
  install -o root -g www-data -m 640 /dev/null "$auth_file"
  printf '%s\n' "$password" | htpasswd -iB "$auth_file" "$username" >/dev/null
  unset password confirmation

  install -d -m 755 "$webroot/.well-known/acme-challenge"
  cat > "$site" <<NGINX
server {
    listen 80;
    server_name $host;
    location ^~ /.well-known/acme-challenge/ { root $webroot; }
    location / { return 404; }
}
NGINX
  ln -s "$site" "$enabled"
  if ! nginx -t; then rm -f "$enabled" "$site" "$auth_file"; die "nginx config invalid; added staging files were removed"; fi
  systemctl reload nginx

  if ! certbot certonly --webroot -w "$webroot" -d "$host" --non-interactive --agree-tos --register-unsafely-without-email; then
    rm -f "$enabled" "$site" "$auth_file"
    nginx -t && systemctl reload nginx
    die "certificate issuance failed; staging nginx files were removed"
  fi

  temp=$(mktemp)
  cat > "$temp" <<NGINX
server {
    listen 80;
    server_name $host;
    location ^~ /.well-known/acme-challenge/ { root $webroot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $host;
    ssl_certificate /etc/letsencrypt/live/$host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$host/privkey.pem;
    auth_basic "Staging";
    auth_basic_user_file $auth_file;
    location = /health {
        satisfy any;
        allow 127.0.0.1;
        deny all;
        proxy_pass http://127.0.0.1:3002;
        include snippets/personal-crm-staging-proxy.conf;
    }
    location / {
        proxy_pass http://127.0.0.1:3002;
        include snippets/personal-crm-staging-proxy.conf;
    }
}
NGINX
  install -m 644 "$temp" "$site"
  rm -f "$temp"
  install -d -m 755 /etc/nginx/snippets
  cat > "$proxy_snippet" <<'NGINX'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
NGINX
  chmod 644 "$proxy_snippet"
  if ! nginx -t; then
    rm -f "$enabled" "$site" "$auth_file" "$proxy_snippet"
    nginx -t && systemctl reload nginx
    die "nginx config invalid; the added staging files were removed"
  fi
  systemctl reload nginx
  echo "Staging HTTPS and password protection configured for https://$host"
}

update_staging_proxy() {
  local site=/etc/nginx/sites-available/personal-crm-staging.conf
  local auth_file=/etc/nginx/personal-crm-staging.htpasswd
  local temp backup proxy_count
  [ -f "$site" ] || die "staging nginx site is missing; run setup-staging"
  grep -Fqx '    server_name test-app.vupsen.space;' "$site" \
    || die "staging nginx site does not match the managed site; refusing to change it"
  [ -s "$auth_file" ] || die "staging Basic Auth file is missing; run setup-staging"
  chown root:www-data "$auth_file"
  chmod 640 "$auth_file"
  proxy_count=$(grep -Ec '^[[:space:]]*proxy_pass http://127\.0\.0\.1:[0-9]+;$' "$site" || true)
  [ "$proxy_count" -eq 2 ] || die "staging nginx site has an unexpected proxy configuration; refusing to change it"

  temp=$(mktemp)
  sed -E "s#^([[:space:]]*proxy_pass http://127\\.0\\.0\\.1:)[0-9]+;#\\1$APP_PORT;#" "$site" > "$temp"
  if cmp -s "$site" "$temp"; then
    rm -f "$temp"
    return
  fi

  backup=$(mktemp)
  cp -p "$site" "$backup"
  install -m 644 "$temp" "$site"
  rm -f "$temp"
  if ! nginx -t >/dev/null; then
    cp -p "$backup" "$site"
    rm -f "$backup"
    die "staging nginx config test failed; previous staging site config restored"
  fi
  if ! systemctl reload nginx; then
    cp -p "$backup" "$site"
    nginx -t >/dev/null && systemctl reload nginx || true
    rm -f "$backup"
    die "staging nginx reload failed; previous staging site config restored"
  fi
  rm -f "$backup"
  step "Updated staging nginx proxy to 127.0.0.1:$APP_PORT"
}

[ "$(id -u)" -eq 0 ] || die "run through sudo: sudo crm-deploy ${1:-}"
[ $# -le 3 ] || die "too many arguments"
cd "$APP_DIR"
case "${1:-}" in
  upload)
    exec 9>/run/crm-deploy-code.lock
    flock -x -w 600 9 || die "another deployment is using or updating deploy scripts"
    upload
    ;;
  deploy|rollback|status|logs|verify-logs|backup|restore|seed|staging-init|staging-refresh)
    select_environment "${2:-}"
    mkdir -p "$ENV_DIR"
    exec 8>/run/crm-deploy-code.lock
    flock -s -w 600 8 || die "deploy scripts are being updated"
    exec 9>"/run/crm-deploy-$DEPLOY_ENV.lock"
    flock -w 600 9 || die "another $DEPLOY_ENV deployment is still running"
    case "${1:-}:$DEPLOY_ENV" in
      deploy:staging|rollback:staging|staging-init:staging|staging-refresh:staging)
        exec 6>/run/crm-backup.lock
        flock -s -w 600 6 || die "production backups are being updated"
        ;;
    esac
    case "${1:-}" in
      deploy) deploy "$DEPLOY_ENV" "${3:-}" ;;
      rollback) rollback "$DEPLOY_ENV" ;;
      status) status ;;
      logs) logs "${3:-app}" ;;
      verify-logs) verify_logs ;;
      backup) backup "${3:-prod}" ;;
      restore) restore "${3:-}" ;;
      seed) compose run --rm app node scripts/seed.mjs ;;
      staging-init) [ "$DEPLOY_ENV" = staging ] || die "staging-init is staging-only"; staging_init ;;
      staging-refresh) [ "$DEPLOY_ENV" = staging ] || die "staging-refresh is staging-only"; staging_refresh ;;
    esac
    ;;
  setup-staging) setup_staging ;;
  setup-backups)
    exec 8>/run/crm-deploy-code.lock
    flock -x -w 600 8 || die "deploy scripts are in use"
    setup_backups
    ;;
  *) die "usage: crm-deploy upload | deploy <prod|staging> <sha> | rollback <prod|staging> | status <prod|staging> | logs <prod|staging> [app|db] | verify-logs staging | backup prod [daily] | restore prod [file] | staging-init staging | staging-refresh staging | setup-staging | setup-backups | seed <prod|staging>" ;;
esac
