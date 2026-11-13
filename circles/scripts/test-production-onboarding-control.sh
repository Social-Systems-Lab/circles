#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
deploy="$repo_dir/deploy-genesis2.sh"
activation="$repo_dir/docker-compose.production-activation.yml"
ops="$repo_dir/docker-compose.production-ops.yml"
production="$repo_dir/docker-compose.yml"
validator="$repo_dir/scripts/validate-production-onboarding-activation.py"
runtime_validator="$repo_dir/scripts/verify-production-onboarding-runtime.py"
application_image_validator="$repo_dir/scripts/verify-production-application-image.py"
verifier_validator="$repo_dir/scripts/validate-routing-operator-verifier.py"

bash -n "$control"
bash -n "$deploy"
for executable in "$control" "$validator" "$runtime_validator" "$application_image_validator" "$verifier_validator"; do
    [[ -x "$executable" ]] || { echo "required production onboarding tool is not executable: $executable" >&2; exit 1; }
done

for required in \
    'set +x' \
    'trap cleanup_temporary_files EXIT' \
    'LOCK_FILE="/run/lock/circles-production-docker.lock"' \
    'LOCK_TIMEOUT_SECONDS=120' \
    'flock -w "$LOCK_TIMEOUT_SECONDS" 9' \
    'origin-eligible' \
    'token-separation' \
    'operations-idle' \
    'SECRET_DIR="/root/circles/onboarding-secrets"' \
    'build-operator)' \
    'require_activation_file' \
    'require_operator_verifier' \
    'require_terminal_confirmation PREPARE_PENDING_REGISTRATION_INDEXES' \
    'prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES' \
    'route-set --expected' \
    'verify_application activation' \
    'deactivate-services' \
    'recover-default-services' \
    'RECOVER_DEFAULT_SERVICES' \
    'verify_recovery_application_image' \
    'require_failed_application_state' \
    '--pull=never --network none --read-only' \
    'verify-production-application-image.py' \
    'fail_public_services'; do
    grep -Fq -- "$required" "$control" || { echo "missing production control contract: $required" >&2; exit 1; }
done

for forbidden in \
    '--operator-token' \
    'REGISTRATION_ROUTING_OPERATOR_TOKEN;' \
    'docker compose down' \
    'docker volume rm' \
    'rm -rf'; do
    if grep -Fq -- "$forbidden" "$control"; then
        echo "production control contains forbidden operation: $forbidden" >&2
        exit 1
    fi
done

if grep -Fq -- 'PENDING_REGISTRATION_TOKEN_HMAC_KEY=' "$control"; then
    echo "production control must not assign or display the HMAC key" >&2
    exit 1
fi
if grep -Fq '[[ "$GIT_SHA" == "$ORIGIN_SHA" ]]' "$control"; then
    echo "production control still blocks rollback with a global origin/main equality check" >&2
    exit 1
fi
grep -Fq 'origin-eligible' "$control"
grep -Fq 'token-separation' "$control"
grep -Fq 'operations-idle' "$control"
if grep -Eq -- '-e[[:space:]]+REGISTRATION_ROUTING_OPERATOR_TOKEN([=[:space:]]|$)' "$control"; then
    echo "production control passes the raw routing operator token through Docker metadata" >&2
    exit 1
fi
if grep -Eq 'echo .*operator_token|echo .*HMAC' "$control"; then
    echo "production control may disclose an operator token or HMAC" >&2
    exit 1
fi

grep -Fq 'PRODUCTION_LOCK_FILE="/run/lock/circles-production-docker.lock"' "$deploy"
grep -Fq 'PRODUCTION_LOCK_TIMEOUT_SECONDS=120' "$deploy"
grep -Fq 'flock -w "$PRODUCTION_LOCK_TIMEOUT_SECONDS" 9' "$deploy"
grep -Fq 'registration_ops route-status' "$deploy"
grep -Fq 'route-status legacy' "$deploy"
grep -Fq 'normal production deployment is blocked while registration routing is not legacy' "$deploy"

route_guard_line="$(grep -nF 'registration_ops route-status' "$deploy" | head -1 | cut -d: -f1)"
app_build_line="$(grep -nF 'docker compose build circles cron' "$deploy" | head -1 | cut -d: -f1)"
[[ -n "$route_guard_line" && -n "$app_build_line" && "$route_guard_line" -lt "$app_build_line" ]] || {
    echo "registration routing guard must run before the application build and mutation window" >&2
    exit 1
}

assert_order() {
    local first="$1" second="$2" first_line second_line
    first_line="$(grep -nF -- "$first" "$control" | head -1 | cut -d: -f1)"
    second_line="$(grep -nF -- "$second" "$control" | head -1 | cut -d: -f1)"
    [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]] || {
        echo "production control ordering failed: $first before $second" >&2
        exit 1
    }
}

assert_order 'stop production NGINX before activation' 'force-recreate circles'
assert_order 'verify_application activation "$deployment_id"' 'production NGINX refresh failed after activation'
assert_order 'require_route_mode paused' 'stop production NGINX before deactivation'
assert_order 'verify_application default' 'production NGINX refresh failed after deactivation'

grep -Fq 'KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM:?' "$activation"
grep -Fq 'PENDING_REGISTRATION_ENABLED: "true"' "$activation"
grep -Fq 'PENDING_REGISTRATION_JOURNEY_READY: "true"' "$activation"
grep -Fq 'PENDING_REGISTRATION_TOKEN_HMAC_KEY: ${PENDING_REGISTRATION_TOKEN_HMAC_KEY:?' "$activation"
grep -Fq 'REGISTRATION_DEPLOYMENT_ID: ${REGISTRATION_DEPLOYMENT_ID:?' "$activation"

for required in \
    'read_only: true' \
    'cap_drop:' \
    '- ALL' \
    'no-new-privileges:true' \
    'circles_users:/circles/users:ro'; do
    grep -Fq -- "$required" "$ops" || { echo "operator overlay is missing: $required" >&2; exit 1; }
done
if grep -Eq 'ports:|expose:' "$ops"; then
    echo "operator overlay publishes or exposes a port" >&2
    exit 1
fi
if grep -Fq 'PENDING_REGISTRATION_TOKEN_HMAC_KEY' "$ops"; then
    echo "operator overlay receives the pending-registration HMAC key" >&2
    exit 1
fi

grep -Fq 'PENDING_REGISTRATION_ENABLED=false' "$production"
grep -Fq 'PENDING_REGISTRATION_JOURNEY_READY=false' "$production"
grep -Fq 'PENDING_REGISTRATION_TOKEN_HMAC_KEY=' "$production"
grep -Fq '.env.production.activation' "$repo_dir/.dockerignore"
grep -Fq '.env.production.activation' "$repo_dir/.gitignore"
if grep -Fqi 'mailpit' "$production"; then
    echo "production Compose contains Mailpit configuration" >&2
    exit 1
fi
if grep -Fq 'docker-compose.production-activation.yml' "$production"; then
    echo "ordinary production Compose references the activation overlay" >&2
    exit 1
fi

python3 "$repo_dir/scripts/validate-production-onboarding-activation.test.py"
python3 "$repo_dir/scripts/verify-production-onboarding-runtime.test.py"
python3 "$repo_dir/scripts/verify-production-application-image.test.py"

verifier_tmp="$(mktemp -d)"
trap 'rm -rf -- "$verifier_tmp"' EXIT
verifier_file="$verifier_tmp/verifier"
verifier="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
printf '%s\n' "$verifier" >"$verifier_file"
chmod 600 "$verifier_file"
[[ "$(python3 "$verifier_validator" "$verifier_file")" == "$verifier" ]]
chmod 644 "$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
chmod 600 "$verifier_file"
printf '%s\n%s\n' "$verifier" "$verifier" >"$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
printf '%s\n' '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF' >"$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
printf '%s\n' "$verifier" >"$verifier_file"
ln -s "$verifier_file" "$verifier_tmp/link"
! python3 "$verifier_validator" "$verifier_tmp/link" >/dev/null 2>&1

compose_tmp="$verifier_tmp/compose"
mkdir -p "$compose_tmp"
cp "$repo_dir/docker-compose.yml" "$repo_dir/docker-compose.production-ops.yml" \
    "$repo_dir/docker-compose.production-activation.yml" "$compose_tmp/"
fake_sha="2437ad23f850e31f71b3ab544326e0f471eef59d"
fake_deployment="production-onboarding-20261113-2437ad23-01"
cat >"$compose_tmp/.env" <<EOF
CIRCLES_PORT=3001
CIRCLES_NODE_ENV=production
CIRCLES_JWT_SECRET=test-only
MONGODB_URI=mongodb://test-only:test-only@db:27017/circles?authSource=admin
ALTCHA_HMAC_KEY=test-only-independent-value
MONGO_PORT=27017
MONGO_ROOT_USERNAME=test-only
MONGO_ROOT_PASSWORD=test-only
MINIO_PORT=9000
MINIO_ROOT_USERNAME=test-only
MINIO_ROOT_PASSWORD=test-only
CIRCLES_REGISTRY_URL=
POSTMARK_API_TOKEN=test-only
POSTMARK_SENDER_EMAIL=hello@example.invalid
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
CIRCLES_URL=https://kamooni.org
SYNAPSE_POSTGRES_USERNAME=
SYNAPSE_POSTGRES_PASSWORD=
EOF
cat >"$compose_tmp/activation.env" <<EOF
PENDING_REGISTRATION_TOKEN_HMAC_KEY=0123456789abcdef0123456789abcdeffedcba9876543210fedcba9876543210
REGISTRATION_DEPLOYMENT_ID=$fake_deployment
EOF
export GIT_SHA="$fake_sha"
export KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM="AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL"
docker compose --project-name circles --project-directory "$compose_tmp" \
    --env-file "$compose_tmp/.env" -f "$compose_tmp/docker-compose.yml" config --format json \
    >"$compose_tmp/default.json"
docker compose --project-name circles --project-directory "$compose_tmp" \
    --env-file "$compose_tmp/.env" --env-file "$compose_tmp/activation.env" \
    -f "$compose_tmp/docker-compose.yml" -f "$compose_tmp/docker-compose.production-activation.yml" \
    config --format json >"$compose_tmp/activation.json"
docker compose --project-name circles --project-directory "$compose_tmp" \
    --env-file "$compose_tmp/.env" -f "$compose_tmp/docker-compose.yml" \
    -f "$compose_tmp/docker-compose.production-ops.yml" --profile production-onboarding-ops \
    config --format json >"$compose_tmp/ops.json"
python3 "$validator" default-compose-json "$compose_tmp/default.json" >/dev/null
python3 "$validator" activation-compose-json "$compose_tmp/activation.json" "$fake_deployment" >/dev/null
python3 "$validator" ops-compose-json "$compose_tmp/ops.json" "$fake_sha" >/dev/null

[[ -f "$validator" && -f "$runtime_validator" ]]
echo "production onboarding control safety checks passed"
