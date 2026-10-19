#!/usr/bin/env bash
# Server setup for automatic deploys, run by a person with sudo; safe to re-run:
#   1. back up the database before changing anything
#   2. /opt/personal-crm with deploy/ and .env (secrets, root only); the crm-deploy command
#   3. access: crmapp may run crm-deploy through sudo without a password,
#      and the GitHub Actions key in crmapp's authorized_keys may run only crm-deploy
#   4. nginx: app.vupsen.space proxies to the app on 127.0.0.1:3000 instead of the stub page,
#      and shows deploy/unavailable.html while the app is not running
#   5. one-time move from the compose project "personal-crm" to "prod", data included;
#      the old volume personal-crm_db-data is kept untouched
# Run from the folder with this script: sudo bash install-on-server.sh
set -euo pipefail

APP_DIR=/opt/personal-crm
DEPLOY_USER=crmapp
DEPLOY_KEY_COMMENT="github-actions-deploy personal-crm"
IMAGE_REPO=ghcr.io/averjuli/personal-crm
BACKUP_DIR=/var/backups/personal-crm
SITE_CONF=/etc/nginx/sites-available/vupsen.conf
PROXY_SNIPPET=/etc/nginx/snippets/personal-crm-app.conf
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0"; exit 1; }
step() { echo; echo "=== $* ==="; }
die() { echo "ERROR: $*" >&2; exit 1; }

# Running container of a compose project's service, empty if none
container() {
  docker ps -q --filter "label=com.docker.compose.project=$1" --filter "label=com.docker.compose.service=$2"
}
image_version() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null || true
}
psql_in() { docker exec -i "$1" sh -c 'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
dump_db() {
  docker exec "$1" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | (umask 077 && gzip > "$2")
}
restore_db() {
  docker exec -i "$1" sh -c 'psql -v ON_ERROR_STOP=1 --single-transaction -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
}
table_count() {
  psql_in "$1" <<<"select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')"
}
# One line per table: row count and a checksum of all rows, to compare two databases
checksums() {
  psql_in "$1" <<'SQL'
select format('%s.%s %s', table_schema, table_name, (xpath('/row/c/text()', query_to_xml(
  format('select count(*) || '' '' || md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) as c from %I.%I t',
         table_schema, table_name), false, true, '')))[1])
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by 1;
SQL
}
print_tables() { awk '{ print "  " $1 ": " $2 " rows" }'; }

step "1/5 Database backup"
install -d -m 700 "$BACKUP_DIR"
backup=""
# Until the move in step 5 the data lives in the old project
for project in personal-crm prod; do
  db=$(container "$project" db)
  [ -n "$db" ] || continue
  backup="$BACKUP_DIR/$project-$(date +%Y%m%d-%H%M%S).sql.gz"
  dump_db "$db" "$backup" || { rm -f "$backup"; die "backup failed, nothing was changed"; }
  echo "$backup ($(du -h "$backup" | cut -f1))"
  checksums "$db" | print_tables
  break
done
[ -n "$backup" ] || echo "no running database, nothing to back up"

step "2/5 App folder $APP_DIR and the crm-deploy command"
install -d -m 755 "$APP_DIR"
if [ ! -e "$APP_DIR/.env" ]; then
  install -m 600 /dev/null "$APP_DIR/.env"
  echo "created an empty $APP_DIR/.env (readable by root only)"
else
  chmod 600 "$APP_DIR/.env"
  echo "$APP_DIR/.env already exists, left as is"
fi
tar -C "$HERE" -cz . | bash "$HERE/crm-deploy.sh" upload

step "3/5 Access for crmapp and GitHub Actions"
sudoers_tmp=$(mktemp)
cat > "$sudoers_tmp" <<SUDOERS
# Managed by personal-crm deploy/install-on-server.sh
# Deploys from GitHub Actions log in as $DEPLOY_USER and run this one script as root
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/crm-deploy
SUDOERS
visudo -cf "$sudoers_tmp" >/dev/null
install -m 440 "$sudoers_tmp" /etc/sudoers.d/crm-deploy
rm -f "$sudoers_tmp"
echo "sudo rule: $DEPLOY_USER may run /usr/local/sbin/crm-deploy without a password"
keys=/home/$DEPLOY_USER/.ssh/authorized_keys
# Literal $SSH_ORIGINAL_COMMAND: sshd's shell expands it to the command the client asked for
forced='command="sudo -n /usr/local/sbin/crm-deploy $SSH_ORIGINAL_COMMAND"'
if grep -q " $DEPLOY_KEY_COMMENT\$" "$keys"; then
  sed -i -E "/ $DEPLOY_KEY_COMMENT\$/ s|command=\"[^\"]*\"|$forced|" "$keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$keys"
  chmod 600 "$keys"
  echo "the key '$DEPLOY_KEY_COMMENT' may run only: sudo -n /usr/local/sbin/crm-deploy <command>"
else
  echo "WARNING: no key '$DEPLOY_KEY_COMMENT' in $keys, GitHub Actions cannot deploy yet"
fi

step "4/5 nginx: app.vupsen.space -> 127.0.0.1:3000, own page while the app is down"
snippet_old=""
if [ -e "$PROXY_SNIPPET" ]; then
  snippet_old=$(mktemp)
  cp -p "$PROXY_SNIPPET" "$snippet_old"
fi
cat > "$PROXY_SNIPPET" <<NGINX
# Managed by personal-crm deploy/install-on-server.sh
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
}

# While the app is not running: a page in its style instead of nginx's "502 Bad Gateway".
# Every deploy refreshes the file together with the rest of deploy/
error_page 502 503 504 /_unavailable.html;
location = /_unavailable.html {
    internal;
    alias $APP_DIR/deploy/unavailable.html;
}
NGINX
chmod 644 "$PROXY_SNIPPET"
backup_conf=""
if grep -q "include snippets/personal-crm-app.conf;" "$SITE_CONF"; then
  echo "$SITE_CONF already proxies to the app"
else
  backup_conf="$SITE_CONF.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$SITE_CONF" "$backup_conf"
  # Swap the stub block written by ~/server-setup.sh for the proxy
  python3 - "$SITE_CONF" <<'PY'
import sys
path = sys.argv[1]
stub = """    # Stub until the app is deployed
    root /var/www/app.vupsen.space;
    location / {
        try_files $uri $uri/ =404;
    }
"""
proxy = """    # The app in Docker, see /opt/personal-crm
    include snippets/personal-crm-app.conf;
"""
text = open(path).read()
if text.count(stub) != 1:
    sys.exit("stub block for app.vupsen.space not found, nginx config left unchanged")
open(path, "w").write(text.replace(stub, proxy))
PY
  echo "backup of the old config: $backup_conf"
fi
# A broken config would also break the landing on the next reload, so put the old one back
if ! nginx -t; then
  if [ -n "$snippet_old" ]; then cp -p "$snippet_old" "$PROXY_SNIPPET"; else rm -f "$PROXY_SNIPPET"; fi
  [ -z "$backup_conf" ] || cp -p "$backup_conf" "$SITE_CONF"
  rm -f "$snippet_old"
  die "nginx config test failed, the previous nginx config is restored"
fi
rm -f "$snippet_old"
systemctl reload nginx
echo "nginx reloaded"
if runuser -u www-data -- test -r "$APP_DIR/deploy/unavailable.html"; then
  echo "nginx can read $APP_DIR/deploy/unavailable.html"
else
  echo "WARNING: nginx cannot read $APP_DIR/deploy/unavailable.html, it will show its own 502 page"
fi

step "5/5 Compose project personal-crm -> prod"
old_db=$(container personal-crm db)
if [ -z "$old_db" ]; then
  echo "nothing to move: the project personal-crm is not running"
else
  current=$(image_version personal-crm-app:latest)
  previous=$(image_version personal-crm-app:previous)
  [[ $current =~ ^[0-9a-f]{40}$ ]] || die "personal-crm-app:latest has no commit label"
  # Name the running images the way GitHub Actions names new ones, so crm-deploy can roll back to them
  docker tag personal-crm-app:latest "$IMAGE_REPO:$current"
  if [[ $previous =~ ^[0-9a-f]{40}$ ]]; then
    docker tag personal-crm-app:previous "$IMAGE_REPO:$previous"
    echo "$previous" > "$APP_DIR/previous-version"
  fi
  echo "$current" > "$APP_DIR/current-version"
  prod() {
    APP_TAG=$current docker compose -p prod --project-directory "$APP_DIR" -f "$APP_DIR/deploy/compose.yaml" "$@"
  }

  # No writes from here on; if the move fails, the old app starts again
  old_app=$(container personal-crm app)
  [ -z "$old_app" ] || docker stop "$old_app" >/dev/null
  fail() {
    [ -z "$old_app" ] || docker start "$old_app" >/dev/null
    die "$1; the old project personal-crm keeps running"
  }
  dump="$BACKUP_DIR/personal-crm-final-$(date +%Y%m%d-%H%M%S).sql.gz"
  dump_db "$old_db" "$dump" || fail "dump failed"
  echo "final dump of the stopped app: $dump"

  prod up -d --wait db || fail "the prod database did not start"
  new_db=$(container prod db)
  if [ "$(table_count "$new_db")" -eq 0 ]; then
    gunzip -c "$dump" | restore_db "$new_db" || fail "restore into prod failed"
  fi
  [ "$(checksums "$old_db")" = "$(checksums "$new_db")" ] || fail "data in prod differs from the old database"
  echo "prod database restored, every table matches the old one row for row:"
  checksums "$new_db" | print_tables

  # Containers and network only: the volume personal-crm_db-data stays as one more copy
  docker compose -p personal-crm down
  rm -f "$APP_DIR/compose.yaml"
  /usr/local/sbin/crm-deploy deploy "$current" </dev/null
  docker image rm personal-crm-app:latest >/dev/null
  docker image rm personal-crm-app:previous >/dev/null 2>&1 || true
fi

step "Check"
/usr/local/sbin/crm-deploy status
echo
echo "ALL DONE"
