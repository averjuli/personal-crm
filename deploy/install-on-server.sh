#!/usr/bin/env bash
# One-time server setup for automatic deploys (safe to re-run after changing deploy/*):
#   - /opt/personal-crm with compose.yaml and an empty .env for the secrets
#   - /usr/local/sbin/crm-deploy, which crmapp may run through sudo without a password
#   - nginx: app.vupsen.space proxies to the app on 127.0.0.1:3000 instead of the stub page
# Run from the folder with this script: sudo bash install-on-server.sh
set -euo pipefail

APP_DIR=/opt/personal-crm
DEPLOY_USER=crmapp
SITE_CONF=/etc/nginx/sites-available/vupsen.conf
PROXY_SNIPPET=/etc/nginx/snippets/personal-crm-app.conf
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0"; exit 1; }
step() { echo; echo "=== $* ==="; }

step "1/4 App folder $APP_DIR"
install -d -m 755 "$APP_DIR"
install -m 644 "$HERE/compose.yaml" "$APP_DIR/compose.yaml"
if [ ! -e "$APP_DIR/.env" ]; then
  install -m 600 /dev/null "$APP_DIR/.env"
  echo "created an empty $APP_DIR/.env (readable by root only)"
else
  chmod 600 "$APP_DIR/.env"
  echo "$APP_DIR/.env already exists, left as is"
fi

step "2/4 Deploy command"
install -m 755 "$HERE/crm-deploy.sh" /usr/local/sbin/crm-deploy
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

step "3/4 nginx: app.vupsen.space -> 127.0.0.1:3000"
cat > "$PROXY_SNIPPET" <<'NGINX'
# Managed by personal-crm deploy/install-on-server.sh
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
}
NGINX
if grep -q "include snippets/personal-crm-app.conf;" "$SITE_CONF"; then
  echo "$SITE_CONF already proxies to the app"
else
  backup="$SITE_CONF.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$SITE_CONF" "$backup"
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
  if ! nginx -t; then
    cp -p "$backup" "$SITE_CONF"
    echo "nginx config test failed, restored $SITE_CONF"
    exit 1
  fi
  echo "backup of the old config: $backup"
fi
nginx -t 2>/dev/null && systemctl reload nginx
echo "nginx reloaded"

step "4/4 Check"
if ss -tlnH 'sport = :3000' | grep -q .; then
  # Expected after the first deploy (docker-proxy for the app); a conflict before it
  echo "port 3000 is in use:"
  ss -tlnpH 'sport = :3000'
else
  echo "port 3000 is free"
fi
ls -l "$APP_DIR" /usr/local/sbin/crm-deploy /etc/sudoers.d/crm-deploy
echo
echo "ALL DONE"
