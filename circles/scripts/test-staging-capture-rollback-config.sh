#!/usr/bin/env bash
# Render and validate the pinned capture rollback bundle without starting services.
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_DIR="$(cd -- "$APP_DIR/.." && pwd -P)"
APP_SHA="0013e90a47ea2933ffcac1578a12d66f0454eed1"
INFRA_SHA="b39e2169537de7e08c41ad0affa00da12a9fd9ca"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-capture-rollback-test.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

mkdir -p "$TEMP_DIR/infra/nginx" "$TEMP_DIR/target"
git -C "$REPO_DIR" archive "$APP_SHA:circles" docker-compose.yml Dockerfile Dockerfile.cron | tar -x -C "$TEMP_DIR/target"
git -C "$REPO_DIR" show "$INFRA_SHA:circles/docker-compose.staging.yml" >"$TEMP_DIR/infra/docker-compose.staging.yml"
cp "$APP_DIR/.env.staging.example" "$TEMP_DIR/infra/.env.staging"
cp "$APP_DIR/nginx/nginx.staging.conf" "$TEMP_DIR/infra/nginx/nginx.staging.conf"

python3 - "$TEMP_DIR/infra/.env.staging" <<'PY'
import secrets, sys
from pathlib import Path
path = Path(sys.argv[1])
values = {
    "MONGO_ROOT_USERNAME": secrets.token_hex(8), "MONGO_ROOT_PASSWORD": secrets.token_hex(32),
    "MINIO_ROOT_USERNAME": secrets.token_hex(8), "MINIO_ROOT_PASSWORD": secrets.token_hex(32),
    "CIRCLES_JWT_SECRET": secrets.token_hex(32), "CRON_SECRET": secrets.token_hex(32),
    "ALTCHA_HMAC_KEY": secrets.token_hex(32), "TELEGRAM_WEBHOOK_SECRET": secrets.token_hex(32),
}
values["MONGODB_URI"] = f"mongodb://{values['MONGO_ROOT_USERNAME']}:{values['MONGO_ROOT_PASSWORD']}@db:27017/circles?authSource=admin"
lines = []
for line in path.read_text(encoding="utf-8").splitlines():
    key, separator, _ = line.partition("=")
    lines.append(f"{key}={values[key]}" if separator and key in values else line)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

export STAGING_INFRA_APP_DIR="$TEMP_DIR/infra"
export STAGING_TARGET_APP_DIR="$TEMP_DIR/target"
export STAGING_IMAGE_TAG=0013e90a
export GIT_SHA="$APP_SHA"
export BUILD_TIME=2026-11-01T13:54:43Z

compose=(docker compose --project-name kamooni_staging --project-directory "$TEMP_DIR/target" \
    --env-file "$TEMP_DIR/infra/.env.staging" -f "$TEMP_DIR/target/docker-compose.yml" \
    -f "$TEMP_DIR/infra/docker-compose.staging.yml")
"${compose[@]}" config --format json >"$TEMP_DIR/default.json"
"${compose[@]}" --profile "*" config --format json >"$TEMP_DIR/all.json"
python3 "$APP_DIR/scripts/validate-staging-capture-rollback.py" \
    "$TEMP_DIR/default.json" "$TEMP_DIR/all.json" "$TEMP_DIR/infra/nginx/nginx.staging.conf"

echo "Pinned capture rollback rendered-config test passed without starting services."
