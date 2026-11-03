#!/usr/bin/env bash
# The deploy command on the server, run as root through sudo (no password, this script only).
# Installed as /usr/local/sbin/crm-deploy by install-on-server.sh and refreshed by every `upload`.
# The GitHub Actions key may run nothing else: authorized_keys forces
# `sudo -n /usr/local/sbin/crm-deploy $SSH_ORIGINAL_COMMAND`.
#
#   crm-deploy upload        read a tar.gz of the repo's deploy/ from stdin and install it
#   crm-deploy deploy <sha>  back up the database, pull the image of that commit, apply migrations in
#                            a one-off container, start the new version, smoke-test /health; when the
#                            image is not on the server yet, registry user and token come on stdin,
#                            one per line
#   crm-deploy rollback      start the previous version again; manual only, never automatic
#   crm-deploy status        containers, current and previous versions, health
#   crm-deploy logs          last 200 lines of the app log
#   crm-deploy backup        dump the database to /var/backups/personal-crm
#   crm-deploy restore [file]  replace the database with a backup, in a terminal, after typing "yes";
#                            without a file name it lists the backups; manual only
#   crm-deploy seed          fill an empty database with test contacts
set -euo pipefail

APP_DIR=/opt/personal-crm
IMAGE_REPO=ghcr.io/averjuli/personal-crm
APP_HOST=app.vupsen.space
SMOKE_URL="https://$APP_HOST/health"
BACKUP_DIR=/var/backups/personal-crm
# Regular backups (one per deploy) kept on the server; copies made before a restore are never removed
KEEP_BACKUPS=10
DB_VOLUME=prod_db-data
LAST_BACKUP=""

step() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
current_version() { cat "$APP_DIR/current-version" 2>/dev/null || true; }
previous_version() { cat "$APP_DIR/previous-version" 2>/dev/null || true; }
image_version() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null
}
compose() {
  APP_TAG=${APP_TAG:-$(current_version)} \
    docker compose -p prod --project-directory "$APP_DIR" -f "$APP_DIR/deploy/compose.yaml" "$@"
}

upload() {
  [ ! -t 0 ] || die "pipe a tar.gz of deploy/ into stdin: tar -C deploy -cz . | ssh ... upload"
  local new="$APP_DIR/deploy.new"
  rm -rf "$new"
  install -d -m 755 "$new"
  tar -xzf - -C "$new" --no-same-owner --no-same-permissions
  [ -f "$new/compose.yaml" ] && [ -f "$new/crm-deploy.sh" ] || die "compose.yaml or crm-deploy.sh is missing"
  bash -n "$new/crm-deploy.sh" || die "crm-deploy.sh has syntax errors, nothing installed"

  rm -rf "$APP_DIR/deploy.old"
  if [ -d "$APP_DIR/deploy" ]; then mv "$APP_DIR/deploy" "$APP_DIR/deploy.old"; fi
  mv "$new" "$APP_DIR/deploy"
  rm -rf "$APP_DIR/deploy.old"
  # A new file plus a rename: this running copy keeps reading the old one
  install -m 755 "$APP_DIR/deploy/crm-deploy.sh" /usr/local/sbin/crm-deploy.new
  mv /usr/local/sbin/crm-deploy.new /usr/local/sbin/crm-deploy
  step "Deploy scripts updated: $(cd "$APP_DIR/deploy" && echo *)"
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
  local expected=$1 response="" code=""
  for _ in $(seq 1 10); do
    response=$(curl -sS --max-time 5 --resolve "$APP_HOST:443:127.0.0.1" -w '\n%{http_code}' "$SMOKE_URL" 2>&1) || true
    code=${response##*$'\n'}
    [ "$code" = 200 ] && break
    sleep 3
  done
  echo "GET $SMOKE_URL -> ${response//$'\n'/ }"
  [ "$code" = 200 ] && [[ $response == *'"status":"ok"'* && $response == *"\"version\":\"$expected\""* ]]
}

# Keep only the current and the previous image of the app
prune_images() {
  local current previous ref
  current=$(current_version)
  previous=$(previous_version)
  docker image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE_REPO" | while read -r ref; do
    case "$ref" in
      "$IMAGE_REPO:$current" | "$IMAGE_REPO:$previous" | *"<none>") ;;
      *) if docker image rm "$ref" >/dev/null; then echo "removed $ref"; fi ;;
    esac
  done
  docker image prune -f >/dev/null
  echo "kept: $current (current) ${previous:-none} (previous)"
}

deploy() {
  local version=${1:-}
  [[ $version =~ ^[0-9a-f]{40}$ ]] || die "usage: crm-deploy deploy <full commit SHA>"
  [ -s "$APP_DIR/.env" ] || die "$APP_DIR/.env is missing or empty"
  local image="$IMAGE_REPO:$version" current started=0
  current=$(current_version)
  export APP_TAG=$version

  # First step: nothing is touched yet, so a failed backup stops the deploy and the old version keeps running
  if docker volume inspect "$DB_VOLUME" >/dev/null 2>&1; then
    step "Backing up the database (version running now: ${current:-none})"
    compose up -d --wait db </dev/null
    backup || die "backup failed: $version was not started, ${current:-nothing} keeps running"
  else
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
    echo "$current" > "$APP_DIR/previous-version"
  fi
  echo "$version" > "$APP_DIR/current-version"
  if [ "$started" -ne 0 ]; then
    compose logs --tail 50 app || true
    die "$version did not become healthy. Nothing was rolled back; to return to $(previous_version): sudo crm-deploy rollback"
  fi

  step "Smoke test"
  smoke "$version" \
    || die "smoke test failed, $version is running. Nothing was rolled back; to return to $(previous_version): sudo crm-deploy rollback"

  step "Removing old images"
  prune_images
  step "Deployed $version"
}

rollback() {
  local previous
  previous=$(previous_version)
  [ -n "$previous" ] || die "no previous version is recorded"
  docker image inspect "$IMAGE_REPO:$previous" >/dev/null 2>&1 || die "the image of $previous is not on the server"
  step "Rolling back from $(current_version) to $previous"
  # Migrations of an older image find nothing new to apply
  deploy "$previous" </dev/null
}

status() {
  compose ps -a || true
  echo "current:  $(current_version)"
  echo "previous: $(previous_version)"
  echo "health:   $(curl -fsS --max-time 5 http://127.0.0.1:3000/health || echo unavailable)"
}

# Name: <prefix>-<date>-<time>-<version running now>.sql.gz; the path goes to LAST_BACKUP
backup() {
  local prefix=${1:-prod} version file
  version=$(current_version)
  install -d -m 700 "$BACKUP_DIR"
  file="$BACKUP_DIR/$prefix-$(date +%Y%m%d-%H%M%S)-${version:0:12}"
  [ -n "$version" ] && file="$file.sql.gz" || file="${file}none.sql.gz"
  # $POSTGRES_* expand inside the container, so the password never shows up here
  # </dev/null: docker would otherwise swallow the registry credentials waiting on this script's stdin
  if ! compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' </dev/null | (umask 077 && gzip > "$file"); then
    rm -f "$file"
    echo "ERROR: backup failed" >&2
    return 1
  fi
  LAST_BACKUP=$file
  echo "$file ($(du -h "$file" | cut -f1))"
  if [ "$prefix" = prod ]; then prune_backups; fi
}

# Keep the newest KEEP_BACKUPS regular backups; the names sort by date
prune_backups() {
  local files excess
  mapfile -t files < <(ls -1 "$BACKUP_DIR"/prod-*.sql.gz | sort)
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
    echo "usage: ssh -t crm sudo crm-deploy restore <backup file name>"
    echo "backups in $BACKUP_DIR (the name has the date, the time and the app version before the deploy):"
    ls -1 "$BACKUP_DIR" 2>/dev/null || true
    return 0
  fi
  [[ $name =~ ^[A-Za-z0-9._-]+\.sql\.gz$ ]] || die "give a backup file name from $BACKUP_DIR, without a path"
  file="$BACKUP_DIR/$name"
  [ -f "$file" ] || die "$file does not exist"
  gzip -t "$file" || die "$file is damaged, nothing changed"
  [ -t 0 ] || die "restore asks for a confirmation, run it in a terminal: ssh -t crm sudo crm-deploy restore $name"
  version=$(current_version)
  [ -n "$version" ] || die "no current version is recorded, there is nothing to start after the restore"
  docker image inspect "$IMAGE_REPO:$version" >/dev/null 2>&1 || die "the image of the current version $version is not on the server"
  [[ $name =~ -([0-9a-f]{12}|none)\.sql\.gz$ ]] && backup_version=${BASH_REMATCH[1]}

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
  reload_database "$file" || die "restore failed, the app is stopped and the database may be empty or half loaded. Copy made before the restore: $copy. To return to it: ssh -t crm sudo crm-deploy restore ${copy##*/}"

  step "Starting $version"
  compose up -d --no-deps --wait --wait-timeout 120 app \
    || die "$version did not become healthy after the restore. The database is restored; copy made before the restore: $copy"
  step "Smoke test"
  smoke "$version" || die "smoke test failed after the restore, the database is restored; copy made before the restore: $copy"
  step "Restored from $name, the app runs at $version"
}

[ "$(id -u)" -eq 0 ] || die "run through sudo: sudo crm-deploy ${1:-}"
[ $# -le 2 ] || die "too many arguments"
cd "$APP_DIR"
# One crm-deploy at a time
exec 9>/run/crm-deploy.lock
flock -w 600 9 || die "another crm-deploy is still running"

case "${1:-}" in
  upload) upload ;;
  deploy) deploy "${2:-}" ;;
  rollback) rollback ;;
  status) status ;;
  logs) compose logs --tail 200 app ;;
  backup) backup ;;
  restore) restore "${2:-}" ;;
  seed) compose run --rm app node scripts/seed.mjs ;;
  *) die "usage: crm-deploy upload | deploy <sha> | rollback | status | logs | backup | restore [file] | seed" ;;
esac
