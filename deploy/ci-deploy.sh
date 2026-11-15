#!/usr/bin/env bash
# GitHub Actions entry point. The server receives the complete deploy/ directory.
set -euo pipefail

environment=${1:-}
version=${2:-}
rollback=${3:-false}
case "$environment" in prod|staging) ;; *) echo 'Invalid deployment environment' >&2; exit 1 ;; esac
case "$rollback" in true|false) ;; *) echo 'Invalid rollback flag' >&2; exit 1 ;; esac
if [ "$rollback" = true ]; then
  [ "$environment" = prod ] || { echo 'Workflow rollback is production-only' >&2; exit 1; }
else
  [[ $version =~ ^[0-9a-f]{40}$ ]] || { echo 'A full commit SHA is required' >&2; exit 1; }
fi

temporary=$(mktemp -d)
finish() {
  local result=$? deployed_sha
  deployed_sha=$(sed -n 's/^DEPLOY_SHA=\([0-9a-f]\{40\}\)$/\1/p' "$temporary/deploy.log" | tail -n 1)
  if [ -n "$deployed_sha" ]; then
    {
      printf '## %s deployment\n\n' "$environment"
      printf -- '- SHA `%s`\n' "$deployed_sha"
      printf -- '- Rollback `%s`\n' "$rollback"
      printf -- '- Exit code `%s`\n' "$result"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  rm -rf "$temporary"
  exit "$result"
}
touch "$temporary/deploy.log"
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$temporary/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$temporary/known_hosts"
cat > "$temporary/config" <<EOF
Host server
  HostName 153.76.175.28
  HostKeyAlias app.vupsen.space
  User crmapp
  IdentityFile $temporary/key
  UserKnownHostsFile $temporary/known_hosts
  StrictHostKeyChecking yes
  IdentitiesOnly yes
  BatchMode yes
  ServerAliveInterval 30
EOF
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS

tar -C deploy -cz . | ssh -F "$temporary/config" server upload
if [ "$rollback" = true ]; then
  ssh -F "$temporary/config" server rollback prod | tee "$temporary/deploy.log"
else
  # This also bootstraps the timer when upgrading from an older upload command.
  ssh -F "$temporary/config" server setup-backups
  printf '%s\n' "$GITHUB_ACTOR" "$GHCR_TOKEN" \
    | ssh -F "$temporary/config" server deploy "$environment" "$version" \
    | tee "$temporary/deploy.log"
fi
