#!/usr/bin/env bash
# Never trace this script: it handles activation secrets and the production Mongo URI.
set +x
set -euo pipefail

EXPECTED_REPO_DIR="/root/circles/circles"
PROJECT_NAME="circles"
LOCK_FILE="/run/lock/circles-production-docker.lock"
LOCK_TIMEOUT_SECONDS=120
SECRET_DIR="/root/circles/onboarding-secrets"
ACTIVATION_ENV_FILE="$SECRET_DIR/activation.env"
ROUTING_OPERATOR_VERIFIER_FILE="$SECRET_DIR/routing-operator.sha256"
ACTIVATION_CONFIRM="AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_DIR="$(cd -- "$APP_DIR/.." && pwd -P)"
BASE_ENV_FILE="$APP_DIR/.env"
BASE_COMPOSE_FILE="$APP_DIR/docker-compose.yml"
OPS_COMPOSE_FILE="$APP_DIR/docker-compose.production-ops.yml"
ACTIVATION_COMPOSE_FILE="$APP_DIR/docker-compose.production-activation.yml"
ACTIVATION_VALIDATOR="$APP_DIR/scripts/validate-production-onboarding-activation.py"
OPERATOR_VERIFIER_VALIDATOR="$APP_DIR/scripts/validate-routing-operator-verifier.py"
RUNTIME_VALIDATOR="$APP_DIR/scripts/verify-production-onboarding-runtime.py"
APPLICATION_IMAGE_VALIDATOR="$APP_DIR/scripts/verify-production-application-image.py"
POSTMARK_CANARY_SCRIPT="$APP_DIR/scripts/postmark-verification-canary.mjs"
POSTMARK_CANARY_ENV_FILE=""
TEMP_FILES=()
TEMP_CONTAINERS=()

cleanup_temporary_files() {
    local file container
    if [[ "${#TEMP_FILES[@]}" -gt 0 ]]; then
        for file in "${TEMP_FILES[@]}"; do
            [[ ! -e "$file" ]] || rm -f -- "$file"
        done
    fi
    if [[ "${#TEMP_CONTAINERS[@]}" -gt 0 ]]; then
        for container in "${TEMP_CONTAINERS[@]}"; do
            docker rm -f "$container" >/dev/null 2>&1 || true
        done
    fi
}

trap cleanup_temporary_files EXIT

usage() {
    cat >&2 <<'EOF'
Usage:
  production-onboarding-control.sh build-operator
  production-onboarding-control.sh preflight
  production-onboarding-control.sh status
  production-onboarding-control.sh inspect [PENDING_OBJECT_ID]
  production-onboarding-control.sh prepare-indexes
  production-onboarding-control.sh route-set EXPECTED_MODE NEW_MODE DEPLOYMENT_SELECTOR ACTOR
  production-onboarding-control.sh activate-services
  production-onboarding-control.sh deactivate-services
  production-onboarding-control.sh recover-default-services
  production-onboarding-control.sh postmark-canary
EOF
    exit 2
}

fail() {
    echo "Error: $1" >&2
    exit 1
}

require_terminal_confirmation() {
    local expected="$1" supplied=""
    [[ -r /dev/tty ]] || fail "an interactive terminal is required for explicit confirmation"
    read -r -p "Type $expected to continue: " supplied </dev/tty
    [[ "$supplied" == "$expected" ]] || fail "explicit confirmation did not match"
}

[[ "$#" -ge 1 ]] || usage
command_name="$1"
shift
expected=""
target=""
if [[ "$command_name" == "route-set" ]]; then
    expected="${1:-}"
    target="${2:-}"
fi

[[ "$(id -u)" -eq 0 ]] || fail "production onboarding control must run as root"
exec 9>"$LOCK_FILE"
if ! flock -w "$LOCK_TIMEOUT_SECONDS" 9; then
    fail "could not acquire the production maintenance lock within ${LOCK_TIMEOUT_SECONDS}s; another deployment or onboarding operation is active"
fi

[[ "$REPO_DIR" == "$EXPECTED_REPO_DIR" ]] || fail "unexpected production repository path"
[[ -f "$BASE_ENV_FILE" ]] || fail "production environment file is missing"
[[ -f "$BASE_COMPOSE_FILE" && -f "$OPS_COMPOSE_FILE" && -f "$ACTIVATION_COMPOSE_FILE" ]] || \
    fail "production Compose configuration is incomplete"
for validator in \
    "$ACTIVATION_VALIDATOR" \
    "$OPERATOR_VERIFIER_VALIDATOR" \
    "$RUNTIME_VALIDATOR" \
    "$APPLICATION_IMAGE_VALIDATOR"; do
    [[ -f "$validator" ]] || fail "production onboarding validator is missing: $validator"
done
[[ -f "$POSTMARK_CANARY_SCRIPT" ]] || fail "Postmark canary script is missing"

[[ "$(git -C "$REPO_DIR" branch --show-current)" == "main" ]] || fail "production checkout must be on main"
[[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=all)" ]] || fail "production checkout is dirty"
GIT_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"
ORIGIN_SHA="$(git -C "$REPO_DIR" rev-parse refs/remotes/origin/main 2>/dev/null || true)"
python3 "$ACTIVATION_VALIDATOR" origin-eligible \
    "$command_name" "$expected" "$target" "$GIT_SHA" "$ORIGIN_SHA" >/dev/null
export GIT_SHA
export BUILD_TIME="operator-control"
export KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM="$ACTIVATION_CONFIRM"

base_compose=(
    docker compose
    --project-name "$PROJECT_NAME"
    --project-directory "$APP_DIR"
    --env-file "$BASE_ENV_FILE"
    -f "$BASE_COMPOSE_FILE"
)
ops_compose=("${base_compose[@]}" -f "$OPS_COMPOSE_FILE" --profile production-onboarding-ops)
activation_compose=(
    "${base_compose[@]}"
    --env-file "$ACTIVATION_ENV_FILE"
    -f "$ACTIVATION_COMPOSE_FILE"
)
ops_activation_compose=(
    "${base_compose[@]}"
    --env-file "$ACTIVATION_ENV_FILE"
    -f "$OPS_COMPOSE_FILE"
    --profile production-onboarding-ops
)

require_activation_file() {
    [[ -d "$SECRET_DIR" ]] || fail "production onboarding secret directory is missing"
    [[ "$(LC_ALL=C stat -c '%u %a %F' "$SECRET_DIR")" == "0 700 directory" ]] || \
        fail "production onboarding secret directory must be root-owned and mode 700"
    python3 "$ACTIVATION_VALIDATOR" file "$ACTIVATION_ENV_FILE" 0 >/dev/null
}

activation_value() {
    python3 - "$ACTIVATION_ENV_FILE" "$1" <<'PY'
import sys

wanted = sys.argv[2]
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if key.strip() == wanted:
        print(value.strip().strip("\"'"))
        break
else:
    raise SystemExit(f"Error: {wanted} is missing")
PY
}

require_operator_verifier() {
    metadata="$(LC_ALL=C stat -c '%u %a %F' "$ROUTING_OPERATOR_VERIFIER_FILE")"
    [[ "$metadata" == "0 600 regular file" ]] || fail "routing operator verifier must be root-owned, mode 600, and a regular file"
    python3 "$OPERATOR_VERIFIER_VALIDATOR" "$ROUTING_OPERATOR_VERIFIER_FILE"
}

run_ops() {
    require_operator_image
    "${ops_compose[@]}" run --rm --no-deps --pull never -T registration_ops "$@"
}

run_ops_with_activation() {
    require_activation_file
    require_operator_image
    "${ops_activation_compose[@]}" run --rm --no-deps --pull never -T registration_ops "$@"
}

run_authenticated_ops() {
    local compose_kind="$1"
    shift
    [[ -r /dev/tty ]] || fail "an interactive terminal is required to read the routing operator token"
    local operator_hash operator_token
    operator_hash="$(require_operator_verifier)"
    read -r -s -p 'Routing operator token: ' operator_token </dev/tty
    printf '\n' >/dev/tty
    [[ -n "$operator_token" ]] || fail "routing operator token is empty"
    if [[ "$compose_kind" == "activation" ]]; then
        require_activation_file
        require_operator_image
        printf '%s' "$operator_token" | \
            python3 "$ACTIVATION_VALIDATOR" token-separation "$ACTIVATION_ENV_FILE" >/dev/null
        printf '%s\n' "$operator_token" | \
            "${ops_activation_compose[@]}" run --rm --no-deps --pull never -T \
                -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" registration_ops "$@"
    else
        require_operator_image
        printf '%s\n' "$operator_token" | \
            "${ops_compose[@]}" run --rm --no-deps --pull never -T \
                -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" registration_ops "$@"
    fi
    unset operator_token operator_hash
}

route_status() {
    run_ops route-status
}

require_route_mode() {
    local expected="$1"
    route_status | python3 "$ACTIVATION_VALIDATOR" route-status "$expected" >/dev/null
}

require_operations_zero() {
    run_ops operations-status | python3 "$ACTIVATION_VALIDATOR" operations-zero >/dev/null
}

require_operations_idle() {
    run_ops operations-status | python3 "$ACTIVATION_VALIDATOR" operations-idle >/dev/null
}

render_compose() {
    local output="$1"
    shift
    "$@" config --format json >"$output"
}

require_default_and_ops_contracts() {
    local default_rendered ops_rendered
    default_rendered="$(mktemp /tmp/kamooni-production-default.XXXXXX.json)"
    ops_rendered="$(mktemp /tmp/kamooni-production-ops.XXXXXX.json)"
    TEMP_FILES+=("$default_rendered" "$ops_rendered")
    chmod 600 "$default_rendered" "$ops_rendered"
    render_compose "$default_rendered" "${base_compose[@]}"
    render_compose "$ops_rendered" "${ops_compose[@]}"
    python3 "$ACTIVATION_VALIDATOR" default-compose-json "$default_rendered" >/dev/null
    python3 "$ACTIVATION_VALIDATOR" ops-compose-json "$ops_rendered" "$GIT_SHA" >/dev/null
    rm -f -- "$default_rendered" "$ops_rendered"
}

require_activation_compose_contract() {
    require_activation_file
    local deployment_id activation_rendered
    deployment_id="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
    activation_rendered="$(mktemp /tmp/kamooni-production-activation.XXXXXX.json)"
    TEMP_FILES+=("$activation_rendered")
    chmod 600 "$activation_rendered"
    render_compose "$activation_rendered" "${activation_compose[@]}"
    python3 "$ACTIVATION_VALIDATOR" activation-compose-json "$activation_rendered" "$deployment_id" >/dev/null
    rm -f -- "$activation_rendered"
}

require_compose_contracts() {
    require_default_and_ops_contracts
    require_activation_compose_contract
    require_operator_verifier >/dev/null
    python3 "$ACTIVATION_VALIDATOR" separation \
        "$ACTIVATION_ENV_FILE" "$BASE_ENV_FILE" "$ROUTING_OPERATOR_VERIFIER_FILE" >/dev/null
}

application_container_id() {
    local -a ids=()
    while IFS= read -r container_id; do
        [[ -z "$container_id" ]] || ids+=("$container_id")
    done < <("${base_compose[@]}" ps -q circles)
    [[ "${#ids[@]}" -eq 1 ]] || return 1
    printf '%s\n' "${ids[0]}"
}

verify_application() {
    local mode="$1"
    local deployment_id="${2:-none}"
    local expected_image_id="${3:-}"
    local container_id
    container_id="$(application_container_id)" || fail "expected exactly one production application container"
    if [[ -n "$expected_image_id" ]]; then
        [[ "$(docker inspect --format '{{.Image}}' "$container_id")" == "$expected_image_id" ]] || \
            fail "running application image does not match the approved image"
    fi
    docker inspect "$container_id" | python3 "$RUNTIME_VALIDATOR" "$mode" "$deployment_id" >/dev/null
    verify_application_build_identity "$container_id"
}

verify_application_build_identity() {
    local container_id="$1" container_ip
    [[ "$(docker exec "$container_id" cat /app/.kamooni-deployment-role)" == "production" ]] || \
        fail "running application image role is not production"
    container_ip="$(docker inspect "$container_id" | python3 "$RUNTIME_VALIDATOR" endpoint)" || \
        fail "running application container address could not be verified"
    docker exec "$container_id" node -e '
const expected = process.argv[1];
const host = process.argv[2];
const port = Number(process.env.PORT);
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(1);
fetch(`http://${host}:${port}/api/version`, {
  redirect: "error",
  signal: AbortSignal.timeout(10000),
})
  .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  .then((body) => process.exit(body.gitSha === expected ? 0 : 1))
  .catch(() => process.exit(1));
' "$GIT_SHA" "$container_ip" || fail "running application SHA does not match the approved production SHA"
}

verify_running_application_identity_if_present() {
    local -a ids=()
    while IFS= read -r container_id; do
        [[ -z "$container_id" ]] || ids+=("$container_id")
    done < <("${base_compose[@]}" ps -q circles)
    [[ "${#ids[@]}" -le 1 ]] || fail "multiple production application containers are running"
    if [[ "${#ids[@]}" -eq 1 ]]; then
        verify_application_build_identity "${ids[0]}"
    fi
}

runtime_status_summary() {
    local -a ids=()
    local container_id
    while IFS= read -r container_id; do
        [[ -z "$container_id" ]] || ids+=("$container_id")
    done < <("${base_compose[@]}" ps -q circles)
    [[ "${#ids[@]}" -le 1 ]] || fail "multiple production application containers are running"
    if [[ "${#ids[@]}" -eq 0 ]]; then
        printf '{"available":false,"reason":"application-not-running"}'
        return
    fi
    docker inspect "${ids[0]}" | python3 "$RUNTIME_VALIDATOR" summary
}

verify_recovery_application_image() {
    local image_id stopped_ids stopped_id metadata
    image_id="$(docker image inspect --format '{{.Id}}' circles-circles:latest)" || \
        fail "verified production application image is missing"
    stopped_ids="$("${base_compose[@]}" ps --all -q circles)"
    [[ "$(grep -c . <<<"$stopped_ids" || true)" -le 1 ]] || \
        fail "multiple stopped production application containers require manual review"
    if [[ -n "$stopped_ids" ]]; then
        stopped_id="$(docker inspect --format '{{.Image}}' "$stopped_ids")"
        [[ "$stopped_id" == "$image_id" ]] || \
            fail "stopped application image does not match the verified application image"
    fi
    metadata="$(docker run --rm --pull=never --network none --read-only --entrypoint sh "$image_id" -c \
        'cat /app/VERSION; printf "\\n---KAMOONI-ROLE---\\n"; cat /app/.kamooni-deployment-role')" || \
        fail "could not read the verified application image metadata"
    printf '%s' "$metadata" | \
        python3 "$APPLICATION_IMAGE_VALIDATOR" "$GIT_SHA" "$image_id" "$image_id" >/dev/null
    printf '%s\n' "$image_id"
}

require_failed_application_state() {
    local running_ids all_ids
    running_ids="$("${base_compose[@]}" ps -q circles)"
    [[ -z "$running_ids" ]] || \
        fail "recover-default-services requires the application to be stopped or absent"
    all_ids="$("${base_compose[@]}" ps --all -q circles)"
    [[ "$(grep -c . <<<"$all_ids" || true)" -le 1 ]] || \
        fail "recover-default-services found multiple application containers"
}

verify_external_application() {
    local version ready=false
    for _ in $(seq 1 30); do
        if version="$(curl -fsSL https://kamooni.org/api/version 2>/dev/null)" && \
            python3 - "$GIT_SHA" "$version" <<'PY'
import json
import sys

try:
    actual = json.loads(sys.argv[2])["gitSha"]
except (json.JSONDecodeError, KeyError, TypeError):
    raise SystemExit(1)
raise SystemExit(0 if actual == sys.argv[1] else 1)
PY
        then
            ready=true
            break
        fi
        sleep 2
    done
    [[ "$ready" == true ]] || return 1
}

fail_public_services() {
    local reason="$1"
    echo "Error: $reason. Stopping production NGINX and circles; support services and volumes are preserved." >&2
    "${base_compose[@]}" stop nginx >/dev/null 2>&1 || true
    "${base_compose[@]}" stop circles >/dev/null 2>&1 || true
    if [[ -n "$("${base_compose[@]}" ps --status running -q nginx circles 2>/dev/null || true)" ]]; then
        echo "Error: production public services could not be confirmed stopped; operator intervention is required." >&2
    fi
    exit 1
}

require_application_image() {
    docker image inspect "circles-circles:latest" >/dev/null 2>&1 || fail "production application image is missing"
}

require_operator_image() {
    docker image inspect "circles-registration-ops:$GIT_SHA" >/dev/null 2>&1 || \
        fail "registration operator image is missing for the approved SHA"
}

require_images() {
    require_application_image
    require_operator_image
}

runtime_container_value() {
    local container_id="$1" key="$2" value
    value="$(docker exec "$container_id" printenv "$key")" || \
        fail "could not resolve required production email setting: $key"
    [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* ]] || \
        fail "required production email setting is empty or invalid: $key"
    printf '%s' "$value"
}

write_postmark_canary_environment() {
    local container_id="$1" env_file transport origin token sender
    transport="$(runtime_container_value "$container_id" EMAIL_TRANSPORT)"
    origin="$(runtime_container_value "$container_id" CIRCLES_URL)"
    token="$(runtime_container_value "$container_id" POSTMARK_API_TOKEN)"
    sender="$(runtime_container_value "$container_id" POSTMARK_SENDER_EMAIL)"
    [[ "$transport" == "postmark" ]] || fail "production email transport is not Postmark"
    [[ "$origin" == "https://kamooni.org" ]] || fail "production public origin is not canonical"
    [[ "$token" != *[[:space:]]* ]] || fail "production Postmark token is invalid"

    env_file="$(mktemp /tmp/kamooni-postmark-canary.XXXXXX.env)"
    TEMP_FILES+=("$env_file")
    (
        umask 077
        printf 'EMAIL_TRANSPORT=%s\n' "$transport"
        printf 'CIRCLES_URL=%s\n' "$origin"
        printf 'POSTMARK_API_TOKEN=%s\n' "$token"
        printf 'POSTMARK_SENDER_EMAIL=%s\n' "$sender"
    ) >"$env_file"
    chmod 600 "$env_file"
    POSTMARK_CANARY_ENV_FILE="$env_file"
}

run_postmark_canary() {
    local container_id image_id env_file recipient canary_source canary_container
    container_id="$(application_container_id)" || fail "expected exactly one production application container"
    image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
    [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail "production application image identity is invalid"
    write_postmark_canary_environment "$container_id"
    env_file="$POSTMARK_CANARY_ENV_FILE"
    [[ -n "$env_file" && -f "$env_file" ]] || fail "Postmark canary environment file was not prepared"
    canary_source="$(<"$POSTMARK_CANARY_SCRIPT")"
    [[ -n "$canary_source" ]] || fail "Postmark canary script is empty"
    canary_source+=$'\nawait runCanaryCli();'

    [[ -r /dev/tty ]] || fail "an interactive terminal is required for the Postmark canary recipient"
    read -r -s -p 'Approved controlled Postmark canary recipient: ' recipient </dev/tty
    printf '\n' >/dev/tty
    local recipient_confirmation
    read -r -s -p 'Re-enter the controlled Postmark canary recipient: ' recipient_confirmation </dev/tty
    printf '\n' >/dev/tty
    [[ "$recipient" == "$recipient_confirmation" ]] || fail "Postmark canary recipient confirmation did not match"
    unset recipient_confirmation
    [[ "$recipient" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || \
        fail "Postmark canary recipient is invalid"
    require_terminal_confirmation SEND_POSTMARK_VERIFICATION_CANARY

    canary_container="kamooni-postmark-canary-$(date -u +%Y%m%dT%H%M%SZ)-$$"
    if docker container inspect "$canary_container" >/dev/null 2>&1; then
        fail "Postmark canary container name already exists"
    fi
    TEMP_CONTAINERS+=("$canary_container")
    printf '%s\n' "$recipient" | docker run --interactive --rm --pull never \
        --name "$canary_container" --network bridge --read-only \
        --cap-drop ALL --security-opt no-new-privileges --user node \
        --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
        --env-file "$env_file" --entrypoint node "$image_id" \
        --input-type=module -e "$canary_source"
}

case "$command_name" in
    build-operator)
        [[ "$#" -eq 0 ]] || usage
        "${ops_compose[@]}" build registration_ops
        docker image inspect "circles-registration-ops:$GIT_SHA" >/dev/null
        echo "Production registration operator image built for $GIT_SHA."
        ;;
    preflight)
        [[ "$#" -eq 0 ]] || usage
        require_activation_file
        require_operator_verifier >/dev/null
        require_images
        require_compose_contracts
        require_route_mode legacy
        require_operations_zero
        verify_application default
        echo "Production onboarding preflight passed; no state was changed."
        ;;
    status)
        [[ "$#" -eq 0 ]] || usage
        require_operator_image
        verify_running_application_identity_if_present
        runtime_summary="$(runtime_status_summary)"
        route_status
        if [[ -f "$ACTIVATION_ENV_FILE" ]]; then
            run_ops_with_activation operations-status --users-dir /circles/users --runtime-summary "$runtime_summary"
        else
            run_ops operations-status --users-dir /circles/users --runtime-summary "$runtime_summary"
        fi
        run_ops recovery-activation-status
        ;;
    inspect)
        [[ "$#" -le 1 ]] || usage
        require_operator_image
        verify_running_application_identity_if_present
        if [[ "$#" -eq 1 ]]; then
            run_ops inspect --users-dir /circles/users --pending-id "$1"
        else
            run_ops inspect --users-dir /circles/users
        fi
        ;;
    prepare-indexes)
        [[ "$#" -eq 0 ]] || usage
        require_route_mode legacy
        require_default_and_ops_contracts
        verify_application default
        require_images
        require_terminal_confirmation PREPARE_PENDING_REGISTRATION_INDEXES
        run_authenticated_ops base prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES
        ;;
    route-set)
        [[ "$#" -eq 4 ]] || usage
        expected="$1"
        target="$2"
        deployment_selector="$3"
        actor="$4"
        require_operator_image
        verify_running_application_identity_if_present
        require_route_mode "$expected"
        if [[ "$target" == "pending" ]]; then
            [[ "$expected" == "paused" && "$deployment_selector" == "activation" ]] || \
                fail "pending transition requires paused and deployment selector activation"
            require_activation_file
            deployment_id="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
            require_compose_contracts
            require_images
            verify_application activation "$deployment_id"
            run_authenticated_ops activation route-set --expected "$expected" --to "$target" \
                --deployment-id "$deployment_id" --actor "$actor" --confirm SET_REGISTRATION_ROUTE
        else
            [[ "$deployment_selector" == "none" ]] || fail "non-pending transitions require deployment selector none"
            run_authenticated_ops base route-set --expected "$expected" --to "$target" \
                --deployment-id none --actor "$actor" --confirm SET_REGISTRATION_ROUTE
        fi
        ;;
    activate-services)
        [[ "$#" -eq 0 ]] || usage
        require_route_mode paused
        require_operations_zero
        require_compose_contracts
        require_images
        deployment_id="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
        expected_image_id="$(docker image inspect --format '{{.Id}}' circles-circles:latest)"
        "${base_compose[@]}" stop nginx || fail_public_services "could not stop production NGINX before activation"
        "${activation_compose[@]}" up -d --no-deps --no-build --force-recreate circles || \
            fail_public_services "activation application recreation failed"
        verify_application activation "$deployment_id" "$expected_image_id" || \
            fail_public_services "activation application runtime verification failed"
        "${activation_compose[@]}" up -d --no-deps --force-recreate nginx || \
            fail_public_services "production NGINX refresh failed after activation"
        verify_external_application || fail_public_services "external production activation verification failed"
        ;;
    deactivate-services)
        [[ "$#" -eq 0 ]] || usage
        require_operator_image
        require_route_mode paused
        require_default_and_ops_contracts
        require_application_image
        current_container_id="$(application_container_id)" || \
            fail "expected exactly one production application container before deactivation"
        verify_application_build_identity "$current_container_id"
        expected_image_id="$(docker image inspect --format '{{.Id}}' circles-circles:latest)"
        require_operations_idle
        "${base_compose[@]}" stop nginx || fail_public_services "could not stop production NGINX before deactivation"
        "${base_compose[@]}" up -d --no-deps --no-build --force-recreate circles || \
            fail_public_services "default production application recreation failed"
        verify_application default none "$expected_image_id" || \
            fail_public_services "default production application runtime verification failed"
        "${base_compose[@]}" up -d --no-deps --force-recreate nginx || \
            fail_public_services "production NGINX refresh failed after deactivation"
        verify_external_application || fail_public_services "external production deactivation verification failed"
        ;;
    recover-default-services)
        [[ "$#" -eq 0 ]] || usage
        require_operator_image
        require_route_mode paused
        require_default_and_ops_contracts
        require_operations_idle
        require_failed_application_state
        recovery_image_id="$(verify_recovery_application_image)" || \
            fail "verified application image cannot be used for recovery"
        require_terminal_confirmation RECOVER_DEFAULT_SERVICES
        require_route_mode paused
        require_operations_idle
        "${base_compose[@]}" stop nginx || \
            fail_public_services "could not stop production NGINX before application recovery"
        "${base_compose[@]}" up -d --no-deps --no-build --force-recreate circles || \
            fail_public_services "default application recovery failed"
        verify_application default none "$recovery_image_id" || \
            fail_public_services "default application recovery verification failed"
        require_route_mode paused || \
            fail_public_services "registration routing changed during application recovery"
        "${base_compose[@]}" up -d --no-deps --force-recreate nginx || \
            fail_public_services "production NGINX refresh failed after application recovery"
        verify_external_application || \
            fail_public_services "external application recovery verification failed"
        require_route_mode paused || \
            fail_public_services "registration routing changed during NGINX recovery"
        ;;
    postmark-canary)
        [[ "$#" -eq 0 ]] || usage
        require_default_and_ops_contracts
        require_images
        require_route_mode legacy
        require_operations_zero
        verify_application default
        run_postmark_canary
        ;;
    *)
        usage
        ;;
esac
