#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY="$SCRIPT_DIR/deploy-staging.sh"

assert_contains() {
    grep -F -- "$2" "$1" >/dev/null || {
        echo "FAIL: $1 lacks required staging safety contract: $2" >&2
        exit 1
    }
}

assert_contains "$DEPLOY" 'MAINTENANCE_LOCK="${KAMOONI_STAGING_LOCK_FILE:-/run/lock/kamooni-staging-docker.lock}"'
assert_contains "$DEPLOY" 'flock -x 9'
assert_contains "$DEPLOY" 'scripts/validate-staging-compose.py'
assert_contains "$DEPLOY" 'compose up -d db minio mailpit'
assert_contains "$DEPLOY" 'APP_WEBNET_IP="$(docker inspect --format'
assert_contains "$DEPLOY" 'circles did not serve the exact target on its NGINX-shared network'
assert_contains "$DEPLOY" 'compose up -d --no-deps db minio mailpit mailpit_ui_proxy'
assert_contains "$DEPLOY" 'compose up -d --no-deps --force-recreate nginx'
assert_contains "$DEPLOY" 'compose stop mailpit_ui_proxy'
assert_contains "$DEPLOY" '[[ "$DEPLOY_CONTAINER_IMAGE_ID" == "$DEPLOY_IMAGE_ID" ]]'
assert_contains "$DEPLOY" 'mv -f "$LEDGER_TMP" "$IMAGE_LEDGER"'

version_line="$(grep -nF 'Version check passed for exact target' "$DEPLOY" | cut -d: -f1)"
ledger_line="$(grep -nF 'Recorded verified deployment' "$DEPLOY" | cut -d: -f1)"
if [[ -z "$version_line" || -z "$ledger_line" || "$version_line" -ge "$ledger_line" ]]; then
    echo "FAIL: verified-image ledger update must follow exact version verification" >&2
    exit 1
fi

app_ready_line="$(grep -nF 'circles did not serve the exact target on its NGINX-shared network' "$DEPLOY" | cut -d: -f1)"
nginx_recreate_line="$(grep -nF 'compose up -d --no-deps --force-recreate nginx' "$DEPLOY" | cut -d: -f1)"
if [[ -z "$app_ready_line" || -z "$nginx_recreate_line" || "$app_ready_line" -ge "$nginx_recreate_line" ]]; then
    echo "FAIL: NGINX must be recreated only after shared-network application readiness" >&2
    exit 1
fi

for forbidden in 'docker volume rm' 'docker system prune' 'docker compose down -v'; do
    if grep -F -- "$forbidden" "$DEPLOY" >/dev/null; then
        echo "FAIL: deployment contains destructive operation: $forbidden" >&2
        exit 1
    fi
done

echo "Staging deployment safety checks passed."
