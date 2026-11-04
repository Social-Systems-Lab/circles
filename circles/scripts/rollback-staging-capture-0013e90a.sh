#!/usr/bin/env bash
# Restore the verified pre-Mailpit staging image with its exact capture-era override.
# Run only after separate rollback authorization and database-compatibility review.
set +x
set -euo pipefail

PINNED_APP_SHA="0013e90a47ea2933ffcac1578a12d66f0454eed1"
PINNED_INFRA_SHA="b39e2169537de7e08c41ad0affa00da12a9fd9ca"
PINNED_IMAGE_TAG="kamooni-staging-circles:0013e90a"
PINNED_IMAGE_ID="sha256:0db0d222aab99763e63e08c2fb1721d25327935c2d238bf8e73a3d18e8f73ec6"
PINNED_OVERRIDE_BLOB="7ff85560fe75d1321fd920d4a675bae6ed4c953a"
PINNED_BASE_COMPOSE_BLOB="f8d8f71649f91dc09446a5ed44195af295dbf7b4"
PINNED_CAPTURE_CONTRACT_BLOB="5521b1b0a05f582a4071b0804a184a7ec2fdfa0d"
EXPECTED_INFRA_REPO_DIR="/home/ubuntu/kamooni"
EXPECTED_INFRA_BRANCH="infra/kamooni-staging"
PROJECT_NAME="kamooni_staging"
LOCK_FILE="${KAMOONI_STAGING_LOCK_FILE:-/run/lock/kamooni-staging-docker.lock}"
LEDGER="${KAMOONI_STAGING_IMAGE_LEDGER:-/home/ubuntu/.local/state/kamooni-staging/verified-images.tsv}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
INFRA_APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
INFRA_REPO_DIR="$(cd -- "$INFRA_APP_DIR/.." && pwd -P)"
TARGET_REPO_DIR="$(dirname -- "$INFRA_REPO_DIR")/kamooni-target"
TARGET_APP_DIR="$TARGET_REPO_DIR/circles"
ENV_FILE="$INFRA_APP_DIR/.env.staging"

[[ "$#" -eq 1 && "$1" == "--confirm-database-compatible" ]] || {
    echo "Usage: $0 --confirm-database-compatible" >&2
    exit 2
}

exec 9>"$LOCK_FILE"
flock -x 9

fail() { echo "Error: $*" >&2; exit 1; }
[[ "$INFRA_REPO_DIR" == "$EXPECTED_INFRA_REPO_DIR" ]] || fail "staging infrastructure must be at $EXPECTED_INFRA_REPO_DIR."
[[ "$(git -C "$INFRA_REPO_DIR" branch --show-current)" == "$EXPECTED_INFRA_BRANCH" ]] || fail "infrastructure checkout must remain on $EXPECTED_INFRA_BRANCH."
[[ -z "$(git -C "$INFRA_REPO_DIR" status --porcelain --untracked-files=normal)" ]] || fail "infrastructure checkout is dirty."
[[ -f "$ENV_FILE" && -f "$LEDGER" && ! -L "$LEDGER" ]] || fail "staging env file or verified-image ledger is missing or unsafe."

# These object identities bind the executable procedure to the exact reviewed
# capture-era application and infrastructure configuration without checking out
# or reverting the live infrastructure branch.
[[ "$(git -C "$INFRA_REPO_DIR" rev-parse "$PINNED_INFRA_SHA:circles/docker-compose.staging.yml")" == "$PINNED_OVERRIDE_BLOB" ]] || fail "pinned capture override identity mismatch."
[[ "$(git -C "$INFRA_REPO_DIR" rev-parse "$PINNED_APP_SHA:circles/docker-compose.yml")" == "$PINNED_BASE_COMPOSE_BLOB" ]] || fail "pinned application Compose identity mismatch."
[[ "$(git -C "$INFRA_REPO_DIR" rev-parse "$PINNED_APP_SHA:circles/src/lib/email/capture-config.ts")" == "$PINNED_CAPTURE_CONTRACT_BLOB" ]] || fail "pinned capture runtime identity mismatch."

record="$(awk -F '\t' -v sha="$PINNED_APP_SHA" '$1 == sha { if (seen++) exit 2; print } END { if (seen != 1) exit 1 }' "$LEDGER")" || fail "pinned app SHA must occur exactly once in the verified-image ledger."
IFS=$'\t' read -r ledger_sha ledger_id ledger_tag ledger_time extra <<<"$record"
[[ -z "${extra:-}" && "$ledger_sha" == "$PINNED_APP_SHA" && "$ledger_id" == "$PINNED_IMAGE_ID" && "$ledger_tag" == "$PINNED_IMAGE_TAG" ]] || fail "verified-image ledger does not match the pinned rollback identity."
[[ "$ledger_time" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail "verified-image ledger timestamp is malformed."
[[ "$(docker image inspect --format '{{.Id}}' "$PINNED_IMAGE_TAG")" == "$PINNED_IMAGE_ID" ]] || fail "pinned rollback image is unavailable or has the wrong immutable ID."

[[ "$(git -C "$TARGET_REPO_DIR" rev-parse --show-toplevel 2>/dev/null || true)" == "$TARGET_REPO_DIR" ]] || fail "target worktree is invalid."
[[ "$(git -C "$INFRA_REPO_DIR" rev-parse --path-format=absolute --git-common-dir)" == "$(git -C "$TARGET_REPO_DIR" rev-parse --path-format=absolute --git-common-dir)" ]] || fail "target worktree belongs to another repository."
[[ -z "$(git -C "$TARGET_REPO_DIR" status --porcelain --untracked-files=all)" && -z "$(git -C "$TARGET_REPO_DIR" clean -ndx)" ]] || fail "target worktree contains local content."

git -C "$TARGET_REPO_DIR" checkout --detach --force "$PINNED_APP_SHA"
[[ "$(git -C "$TARGET_REPO_DIR" rev-parse HEAD)" == "$PINNED_APP_SHA" ]] || fail "target worktree SHA mismatch."

override="$(mktemp /tmp/kamooni-capture-rollback.XXXXXX.yml)"
default_json="$(mktemp /tmp/kamooni-capture-rollback.XXXXXX.json)"
all_json="$(mktemp /tmp/kamooni-capture-rollback-all.XXXXXX.json)"
trap 'rm -f "$override" "$default_json" "$all_json"' EXIT
git -C "$INFRA_REPO_DIR" show "$PINNED_INFRA_SHA:circles/docker-compose.staging.yml" >"$override"

GIT_SHA="$PINNED_APP_SHA"
STAGING_IMAGE_TAG="0013e90a"
BUILD_TIME="$ledger_time"
STAGING_INFRA_APP_DIR="$INFRA_APP_DIR"
STAGING_TARGET_APP_DIR="$TARGET_APP_DIR"
export GIT_SHA STAGING_IMAGE_TAG BUILD_TIME STAGING_INFRA_APP_DIR STAGING_TARGET_APP_DIR

compose() {
    docker compose --project-name "$PROJECT_NAME" --project-directory "$TARGET_APP_DIR" \
        --env-file "$ENV_FILE" -f "$TARGET_APP_DIR/docker-compose.yml" -f "$override" "$@"
}
compose config --format json >"$default_json"
compose --profile "*" config --format json >"$all_json"
python3 "$INFRA_APP_DIR/scripts/validate-staging-capture-rollback.py" \
    "$default_json" "$all_json" "$INFRA_APP_DIR/nginx/nginx.staging.conf"

fail_public() {
    echo "Error: $*. Stopping only staging nginx and circles; database, object storage, and volumes are preserved." >&2
    compose stop nginx || true
    compose stop circles || true
    exit 1
}

compose stop circles nginx
compose up -d --no-deps --no-build --force-recreate circles || fail_public "capture rollback application startup failed"
compose up -d --no-deps --no-build db minio nginx || fail_public "capture rollback supporting-service startup failed"

version_output=""
for attempt in $(seq 1 30); do
    if version_output="$(curl -fsSL https://staging.kamooni.org/api/version)" && python3 - "$version_output" "$PINNED_APP_SHA" <<'PY'
import json, sys
try:
    raise SystemExit(0 if json.loads(sys.argv[1]).get("gitSha") == sys.argv[2] else 1)
except (json.JSONDecodeError, TypeError):
    raise SystemExit(1)
PY
    then
        container_id="$(compose ps -q circles)" || fail_public "could not identify capture rollback container"
        [[ -n "$container_id" ]] || fail_public "capture rollback container is missing"
        [[ "$(docker inspect --format '{{.Image}}' "$container_id")" == "$PINNED_IMAGE_ID" ]] || fail_public "running image does not match verified rollback identity"
        echo "Capture-compatible rollback verified at $PINNED_APP_SHA using $PINNED_IMAGE_ID."
        exit 0
    fi
    sleep 2
done
fail_public "capture rollback version verification failed; last response: $version_output"
