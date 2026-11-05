#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-staging-compose.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

mkdir -p "$TEMP_DIR/nginx"
cp "$APP_DIR/.env.staging.example" "$TEMP_DIR/.env.staging"
cp "$APP_DIR/docker-compose.staging.yml" "$TEMP_DIR/docker-compose.staging.yml"
cp "$APP_DIR/docker-compose.staging-activation.yml" "$TEMP_DIR/docker-compose.staging-activation.yml"
cp "$APP_DIR/docker-compose.staging-ops.yml" "$TEMP_DIR/docker-compose.staging-ops.yml"
cp "$APP_DIR/nginx/nginx.staging.conf" "$TEMP_DIR/nginx/nginx.staging.conf"
cp "$APP_DIR/nginx/mailpit-ui.staging.conf" "$TEMP_DIR/nginx/mailpit-ui.staging.conf"

# The validator intentionally rejects placeholders. Generate disposable,
# process-local test values so this check never reads a real environment file.
python3 - "$TEMP_DIR/.env.staging" <<'PY'
import secrets
import sys
from pathlib import Path

path = Path(sys.argv[1])
values = {
    "MONGO_ROOT_USERNAME": secrets.token_hex(8),
    "MONGO_ROOT_PASSWORD": secrets.token_hex(32),
    "MINIO_ROOT_USERNAME": secrets.token_hex(8),
    "MINIO_ROOT_PASSWORD": secrets.token_hex(32),
    "CIRCLES_JWT_SECRET": secrets.token_hex(32),
    "CRON_SECRET": secrets.token_hex(32),
    "ALTCHA_HMAC_KEY": secrets.token_hex(32),
    "TELEGRAM_WEBHOOK_SECRET": secrets.token_hex(32),
}
values["MONGODB_URI"] = (
    f"mongodb://{values['MONGO_ROOT_USERNAME']}:{values['MONGO_ROOT_PASSWORD']}"
    "@db:27017/circles?authSource=admin"
)
lines = []
for line in path.read_text(encoding="utf-8").splitlines():
    key, separator, _ = line.partition("=")
    # Existing staging environments predate these keys. The Compose override
    # must supply the fail-closed values without requiring a live env-file edit.
    if key in {"PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"}:
        continue
    lines.append(f"{key}={values[key]}" if separator and key in values else line)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

cat >"$TEMP_DIR/.env.staging.activation" <<'EOF'
PENDING_REGISTRATION_TOKEN_HMAC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdea
REGISTRATION_DEPLOYMENT_ID=staging-onboarding-20261105-compose01
EOF
chmod 600 "$TEMP_DIR/.env.staging.activation"

python3 "$APP_DIR/scripts/validate-staging-environment.py" env-file "$TEMP_DIR/.env.staging"

export STAGING_INFRA_APP_DIR="$TEMP_DIR"
export STAGING_TARGET_APP_DIR="$APP_DIR"
export STAGING_IMAGE_TAG=compose-validation
export GIT_SHA=compose-validation
export BUILD_TIME=compose-validation
export KAMOONI_STAGING_ACTIVATION_CONFIRM=AUTHORIZED_STAGING_ONBOARDING_CONTROL

docker compose --project-name kamooni_staging --project-directory "$APP_DIR" \
    --env-file "$TEMP_DIR/.env.staging" \
    -f "$APP_DIR/docker-compose.yml" -f "$TEMP_DIR/docker-compose.staging.yml" \
    config --format json >"$TEMP_DIR/default.json"

docker compose --project-name kamooni_staging --project-directory "$APP_DIR" \
    --env-file "$TEMP_DIR/.env.staging" \
    -f "$APP_DIR/docker-compose.yml" -f "$TEMP_DIR/docker-compose.staging.yml" \
    --profile "*" config --format json >"$TEMP_DIR/all.json"

python3 "$APP_DIR/scripts/validate-staging-environment.py" compose-json "$TEMP_DIR/default.json"
python3 "$APP_DIR/scripts/validate-staging-compose.py" \
    "$TEMP_DIR/default.json" "$TEMP_DIR/all.json" kamooni_staging \
    "$TEMP_DIR/nginx/nginx.staging.conf" "$TEMP_DIR/nginx/mailpit-ui.staging.conf"

docker compose --project-name kamooni_staging --project-directory "$APP_DIR" \
    --env-file "$TEMP_DIR/.env.staging" --env-file "$TEMP_DIR/.env.staging.activation" \
    -f "$APP_DIR/docker-compose.yml" -f "$TEMP_DIR/docker-compose.staging.yml" \
    -f "$TEMP_DIR/docker-compose.staging-activation.yml" \
    config --format json >"$TEMP_DIR/activation.json"

docker compose --project-name kamooni_staging --project-directory "$APP_DIR" \
    --env-file "$TEMP_DIR/.env.staging" --env-file "$TEMP_DIR/.env.staging.activation" \
    -f "$APP_DIR/docker-compose.yml" -f "$TEMP_DIR/docker-compose.staging.yml" \
    -f "$TEMP_DIR/docker-compose.staging-activation.yml" \
    --profile "*" config --format json >"$TEMP_DIR/activation-all.json"

python3 "$APP_DIR/scripts/validate-staging-activation.py" env-file "$TEMP_DIR/.env.staging.activation"
python3 "$APP_DIR/scripts/validate-staging-activation.py" compose-json "$TEMP_DIR/activation.json"
python3 "$APP_DIR/scripts/validate-staging-compose.py" \
    "$TEMP_DIR/activation.json" "$TEMP_DIR/activation-all.json" kamooni_staging \
    "$TEMP_DIR/nginx/nginx.staging.conf" "$TEMP_DIR/nginx/mailpit-ui.staging.conf" activation

docker compose --project-name kamooni_staging --project-directory "$APP_DIR" \
    --env-file "$TEMP_DIR/.env.staging" -f "$APP_DIR/docker-compose.yml" \
    -f "$TEMP_DIR/docker-compose.staging.yml" -f "$TEMP_DIR/docker-compose.staging-ops.yml" \
    --profile onboarding-ops config --format json >"$TEMP_DIR/ops.json"

python3 - "$TEMP_DIR/ops.json" <<'PY'
import json, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
service = config["services"]["registration_ops"]
assert not service.get("ports")
assert service.get("read_only") is True
assert service.get("cap_drop") == ["ALL"]
assert service.get("security_opt") == ["no-new-privileges:true"]
assert set(service.get("networks", {})) == {"webnet"}
mounts = service.get("volumes", [])
assert len(mounts) == 1 and mounts[0]["source"] == "circles_users" and mounts[0]["target"] == "/circles/users" and mounts[0]["read_only"] is True
assert "REGISTRATION_ROUTING_OPERATOR_TOKEN" not in service.get("environment", {})
PY
