#!/usr/bin/env bash
# Deploys and manages the app on the server. Installed as /usr/local/sbin/crm-deploy
# by deploy/install-on-server.sh and run as root through sudo (no password, this script only).
#
#   crm-deploy deploy   read a gzipped image tarball from stdin, migrate, restart, check health;
#                       the only command the GitHub Actions key can run
#   crm-deploy status   containers, deployed version and health
#   crm-deploy logs     last 200 lines of the app log
#   crm-deploy seed     fill an empty database with test contacts
set -euo pipefail

APP_DIR=/opt/personal-crm
IMAGE=personal-crm-app

compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.yaml" "$@"; }
step() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
image_version() {
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null
}
health() { curl -fsS --max-time 5 http://127.0.0.1:3000/health; }

# Put the previous image back as :latest and restart the app on it
rollback() {
  if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then
    step "Rolling back to $(image_version "$IMAGE:previous")"
    docker tag "$IMAGE:previous" "$IMAGE:latest"
    compose up -d --wait --wait-timeout 120 app || true
  fi
}

deploy() {
  [ -s "$APP_DIR/.env" ] || die "$APP_DIR/.env is missing or empty"
  [ ! -t 0 ] || die "pipe the image into stdin: docker save $IMAGE:latest | gzip | ssh ..."

  step "Loading the new image"
  if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
    docker tag "$IMAGE:latest" "$IMAGE:previous"
  fi
  local loaded
  loaded=$(docker load)
  echo "$loaded"
  if [ "$(grep -c '^Loaded image' <<<"$loaded")" != 1 ] || ! grep -qx "Loaded image: $IMAGE:latest" <<<"$loaded"; then
    die "expected exactly one image, $IMAGE:latest"
  fi
  step "Version $(image_version "$IMAGE:latest")"

  step "Starting the database"
  compose up -d --wait db

  step "Applying migrations"
  if ! compose run --rm --no-deps app node scripts/migrate.mjs; then
    # The app was not restarted yet, so it still runs the previous image
    docker image inspect "$IMAGE:previous" >/dev/null 2>&1 && docker tag "$IMAGE:previous" "$IMAGE:latest"
    die "migrations failed, the previous version keeps running"
  fi

  step "Restarting the app"
  if ! compose up -d --wait --wait-timeout 120 app; then
    compose logs --tail 50 app || true
    rollback
    die "the new version did not pass the health check"
  fi

  step "Health: $(health)"
  # Images that lost their last tag (the version before :previous)
  docker image prune -f >/dev/null
  step "Deployed"
}

status() {
  compose ps
  echo "latest:   $(image_version "$IMAGE:latest")"
  echo "previous: $(image_version "$IMAGE:previous")"
  echo "health:   $(health || echo unavailable)"
}

[ "$(id -u)" -eq 0 ] || die "run through sudo: sudo $0 ${1:-}"
cd "$APP_DIR"
# One deploy at a time
exec 9>/run/crm-deploy.lock
flock -w 600 9 || die "another crm-deploy is still running"

case "${1:-}" in
  deploy) deploy ;;
  status) status ;;
  logs) compose logs --tail 200 app ;;
  seed) compose run --rm app node scripts/seed.mjs ;;
  *) die "usage: crm-deploy deploy|status|logs|seed" ;;
esac
