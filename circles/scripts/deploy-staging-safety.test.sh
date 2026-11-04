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
assert_contains "$DEPLOY" 'compose up -d --no-deps db minio mailpit nginx'
assert_contains "$DEPLOY" '[[ "$DEPLOY_CONTAINER_IMAGE_ID" == "$DEPLOY_IMAGE_ID" ]]'
assert_contains "$DEPLOY" 'mv -f "$LEDGER_TMP" "$IMAGE_LEDGER"'

version_line="$(grep -nF 'Version check passed for exact target' "$DEPLOY" | cut -d: -f1)"
ledger_line="$(grep -nF 'Recorded verified deployment' "$DEPLOY" | cut -d: -f1)"
if [[ -z "$version_line" || -z "$ledger_line" || "$version_line" -ge "$ledger_line" ]]; then
    echo "FAIL: verified-image ledger update must follow exact version verification" >&2
    exit 1
fi

for forbidden in 'docker volume rm' 'docker system prune' 'docker compose down -v'; do
    if grep -F -- "$forbidden" "$DEPLOY" >/dev/null; then
        echo "FAIL: deployment contains destructive operation: $forbidden" >&2
        exit 1
    fi
done

echo "Staging deployment safety checks passed."
