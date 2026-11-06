#!/usr/bin/env bash
# Controlled registration routing and application-gate operations for staging.
set +x
set -euo pipefail

EXPECTED_INFRA_REPO_DIR="/home/ubuntu/kamooni"
EXPECTED_INFRA_BRANCH="infra/kamooni-staging"
PROJECT_NAME="kamooni_staging"
MAINTENANCE_LOCK="${KAMOONI_STAGING_LOCK_FILE:-/run/lock/kamooni-staging-docker.lock}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STAGING_INFRA_APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
INFRA_REPO_DIR="$(cd -- "$STAGING_INFRA_APP_DIR/.." && pwd -P)"
STAGING_TARGET_REPO_DIR="$(dirname -- "$INFRA_REPO_DIR")/kamooni-target"
STAGING_TARGET_APP_DIR="$STAGING_TARGET_REPO_DIR/circles"
ENV_FILE="$STAGING_INFRA_APP_DIR/.env.staging"
ACTIVATION_ENV_FILE="$STAGING_INFRA_APP_DIR/.env.staging.activation"
STAGING_COMPOSE_FILE="$STAGING_INFRA_APP_DIR/docker-compose.staging.yml"
ACTIVATION_COMPOSE_FILE="$STAGING_INFRA_APP_DIR/docker-compose.staging-activation.yml"
OPS_COMPOSE_FILE="$STAGING_INFRA_APP_DIR/docker-compose.staging-ops.yml"
ROUTING_OPERATOR_VERIFIER_FILE="$STAGING_INFRA_APP_DIR/.registration-routing-operator.sha256"

usage() {
    cat >&2 <<'EOF'
Usage:
  staging-onboarding-control.sh status
  staging-onboarding-control.sh inspect [PENDING_OBJECT_ID]
  staging-onboarding-control.sh route-set EXPECTED_MODE NEW_MODE DEPLOYMENT_ID ACTOR
  staging-onboarding-control.sh activate-services
  staging-onboarding-control.sh activate-services-recovery
  staging-onboarding-control.sh deactivate-services
EOF
    exit 2
}

[[ "$#" -ge 1 ]] || usage
command_name="$1"
shift

exec 9>"$MAINTENANCE_LOCK"
flock -x 9

[[ "$INFRA_REPO_DIR" == "$EXPECTED_INFRA_REPO_DIR" ]] || { echo "Error: unexpected infrastructure path." >&2; exit 1; }
[[ "$(git -C "$INFRA_REPO_DIR" branch --show-current)" == "$EXPECTED_INFRA_BRANCH" ]] || { echo "Error: infrastructure checkout must remain on $EXPECTED_INFRA_BRANCH." >&2; exit 1; }
for required in "$ENV_FILE" "$STAGING_COMPOSE_FILE" "$ACTIVATION_COMPOSE_FILE" "$OPS_COMPOSE_FILE" "$STAGING_TARGET_APP_DIR/docker-compose.yml" "$STAGING_TARGET_APP_DIR/Dockerfile.registration-ops"; do
    [[ -f "$required" ]] || { echo "Error: required file is missing: $required" >&2; exit 1; }
done

GIT_SHA="$(git -C "$STAGING_TARGET_REPO_DIR" rev-parse HEAD)"
STAGING_IMAGE_TAG="$(git -C "$STAGING_TARGET_REPO_DIR" rev-parse --short=8 HEAD)"
BUILD_TIME="operator-control"
export GIT_SHA STAGING_IMAGE_TAG BUILD_TIME STAGING_INFRA_APP_DIR STAGING_TARGET_APP_DIR

base_compose=(docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" --env-file "$ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE")
ops_compose=("${base_compose[@]}" -f "$OPS_COMPOSE_FILE")

require_activation_file() {
    [[ -f "$ACTIVATION_ENV_FILE" && ! -L "$ACTIVATION_ENV_FILE" ]] || { echo "Error: approved activation environment file is missing or is a symlink." >&2; exit 1; }
    mode="$(stat -c '%a' "$ACTIVATION_ENV_FILE")"
    [[ "$mode" == "600" ]] || { echo "Error: activation environment file mode must be 600." >&2; exit 1; }
    python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-activation.py" env-file "$ACTIVATION_ENV_FILE"
}

require_operator_verifier() {
    python3 "$STAGING_INFRA_APP_DIR/scripts/validate-routing-operator-verifier.py" "$ROUTING_OPERATOR_VERIFIER_FILE"
}

activation_compose_array() {
    require_activation_file
    export KAMOONI_STAGING_ACTIVATION_CONFIRM="AUTHORIZED_STAGING_ONBOARDING_CONTROL"
    activation_compose=(docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" --env-file "$ENV_FILE" --env-file "$ACTIVATION_ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE" -f "$ACTIVATION_COMPOSE_FILE")
}

run_ops() {
    "${ops_compose[@]}" run --rm --no-deps registration_ops "$@"
}

run_ops_with_activation() {
    require_activation_file
    docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" --env-file "$ENV_FILE" --env-file "$ACTIVATION_ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE" -f "$OPS_COMPOSE_FILE" run --rm --no-deps registration_ops "$@"
}

activation_value() {
    local key="$1"
    python3 - "$ACTIVATION_ENV_FILE" "$key" <<'PY'
import sys
for raw in open(sys.argv[1], encoding="utf-8"):
    key, separator, value = raw.partition("=")
    if separator and key.strip() == sys.argv[2]:
        print(value.strip().strip("\"'"))
        break
else:
    raise SystemExit(f"Error: {sys.argv[2]} is missing")
PY
}

require_clean_infra() {
    [[ -z "$(git -C "$INFRA_REPO_DIR" status --porcelain --untracked-files=normal)" ]] || { echo "Error: mutating control operation requires a clean infrastructure checkout." >&2; exit 1; }
}

require_route_mode() {
    local expected="$1" output
    output="$(run_ops route-status)"
    python3 - "$expected" "$output" <<'PY'
import json, sys
try:
    current = json.loads(sys.argv[2])["mode"]
except (json.JSONDecodeError, KeyError, TypeError):
    raise SystemExit("Error: could not parse registration routing status")
if current != sys.argv[1]:
    raise SystemExit(f"Error: registration routing is {current}, expected {sys.argv[1]}")
PY
}

require_clean_operations() {
    local output
    output="$(run_ops operations-status)"
    python3 - "$output" <<'PY'
import json, sys
try:
    status = json.loads(sys.argv[1])
except (json.JSONDecodeError, TypeError):
    raise SystemExit("Error: could not parse pending-registration operation status")
for key in ("pendingRegistrations", "reconciliationRequired", "activeProvisioningLocks", "activeFinalizationLocks"):
    if status.get(key) != 0:
        raise SystemExit(f"Error: {key} is {status.get(key)!r}; activation requires zero")
PY
}

require_single_recoverable_registration() {
    local operations recovery
    operations="$(run_ops operations-status)"
    recovery="$(run_ops recovery-activation-status)"
    python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-recovery-activation.py" "$operations" "$recovery"
}

fail_public_services() {
    local reason="$1" stop_failed=false
    echo "Error: $reason. Stopping staging NGINX and circles; support services and all volumes are preserved." >&2
    "${base_compose[@]}" stop nginx >/dev/null 2>&1 || stop_failed=true
    "${base_compose[@]}" stop circles >/dev/null 2>&1 || stop_failed=true
    if [[ "$stop_failed" == true ]] || [[ -n "$("${base_compose[@]}" ps --status running -q nginx circles 2>/dev/null || true)" ]]; then
        echo "Error: could not confirm that NGINX and circles are stopped; operator intervention is required." >&2
    else
        echo "Unverified public services are stopped." >&2
    fi
    exit 1
}

verify_running_mailpit() {
    local mailpit_id proxy_id
    mailpit_id="$("${base_compose[@]}" ps -q mailpit)"
    proxy_id="$("${base_compose[@]}" ps -q mailpit_ui_proxy)"
    [[ -n "$mailpit_id" && -n "$proxy_id" ]] || return 1
    docker inspect "$mailpit_id" "$proxy_id" | python3 "$STAGING_INFRA_APP_DIR/scripts/verify-staging-onboarding-runtime.py" mailpit
}

verify_internal_application() {
    local mode="$1" deployment_id="$2" container_id image_id expected_image_id app_webnet_ip ready
    local -a container_ids=()
    while IFS= read -r container_id; do
        [[ -z "$container_id" ]] || container_ids+=("$container_id")
    done < <("${base_compose[@]}" ps -q circles)
    [[ "${#container_ids[@]}" -ge 1 ]] || return 1
    expected_image_id="$(docker image inspect --format '{{.Id}}' "kamooni-staging-circles:$STAGING_IMAGE_TAG")"
    for container_id in "${container_ids[@]}"; do
        image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
        [[ "$image_id" == "$expected_image_id" ]] || return 1
        app_webnet_ip="$(docker inspect --format "{{with index .NetworkSettings.Networks \"${PROJECT_NAME}_webnet\"}}{{.IPAddress}}{{end}}" "$container_id")"
        [[ "$app_webnet_ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || return 1
        ready=false
        for _ in $(seq 1 30); do
            if docker exec "$container_id" node -e '
const [url, expectedSha] = process.argv.slice(1);
fetch(url)
  .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  .then((body) => process.exit(body.gitSha === expectedSha ? 0 : 1))
  .catch(() => process.exit(1));
' "http://$app_webnet_ip:3000/api/version" "$GIT_SHA"; then
                ready=true
                break
            fi
            sleep 2
        done
        [[ "$ready" == true ]] || return 1
        docker inspect "$container_id" | python3 "$STAGING_INFRA_APP_DIR/scripts/verify-staging-onboarding-runtime.py" application "$mode" "$deployment_id" || return 1
        docker exec "$container_id" node -e '
const net = require("net");
const socket = net.createConnection(1025, "mailpit");
socket.setTimeout(5000);
socket.once("data", (data) => { socket.end(); process.exit(/^220 /.test(data.toString()) ? 0 : 1); });
socket.on("timeout", () => process.exit(1));
socket.on("error", () => process.exit(1));
' || return 1
    done
}

verify_external_application() {
    local version ready=false
    for _ in $(seq 1 30); do
        if version="$(curl -fsSL https://staging.kamooni.org/api/version 2>/dev/null)" && python3 - "$GIT_SHA" "$version" <<'PY'
import json, sys
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
    [[ "$ready" == true ]]
}

case "$command_name" in
    status)
        [[ "$#" -eq 0 ]] || usage
        run_ops operations-status
        ;;
    inspect)
        [[ "$#" -le 1 ]] || usage
        if [[ "$#" -eq 1 ]]; then
            run_ops inspect --users-dir /circles/users --pending-id "$1"
        else
            run_ops inspect --users-dir /circles/users
        fi
        ;;
    route-set)
        [[ "$#" -eq 4 ]] || usage
        operator_hash="$(require_operator_verifier)"
        [[ -r /dev/tty ]] || { echo "Error: an interactive terminal is required to read the routing operator token." >&2; exit 1; }
        read -r -s -p 'Routing operator token: ' operator_token </dev/tty
        printf '\n' >/dev/tty
        [[ -n "$operator_token" ]] || { echo "Error: routing operator token is empty." >&2; exit 1; }
        expected="$1"; target="$2"; deployment_id="$3"; actor="$4"
        if [[ "$target" == "pending" ]]; then
            [[ "$deployment_id" == "activation" ]] || { echo "Error: pending transition requires deployment ID selector 'activation'." >&2; exit 1; }
            require_activation_file
            deployment_id="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
            verify_internal_application activation "$deployment_id" || { echo "Error: running activation application verification failed." >&2; exit 1; }
            verify_running_mailpit || { echo "Error: running Mailpit safety verification failed." >&2; exit 1; }
            verify_external_application || { echo "Error: external activation application verification failed." >&2; exit 1; }
            printf '%s\n' "$operator_token" | docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" --env-file "$ENV_FILE" --env-file "$ACTIVATION_ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE" -f "$OPS_COMPOSE_FILE" run --rm --no-deps -T -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" registration_ops route-set --expected "$expected" --to "$target" --deployment-id "$deployment_id" --actor "$actor" --confirm SET_REGISTRATION_ROUTE
        else
            printf '%s\n' "$operator_token" | "${ops_compose[@]}" run --rm --no-deps -T -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" registration_ops route-set --expected "$expected" --to "$target" --deployment-id "$deployment_id" --actor "$actor" --confirm SET_REGISTRATION_ROUTE
        fi
        unset operator_token
        ;;
    activate-services|activate-services-recovery)
        [[ "$#" -eq 0 ]] || usage
        require_clean_infra
        require_route_mode paused
        if [[ "$command_name" == "activate-services-recovery" ]]; then
            require_single_recoverable_registration
        else
            require_clean_operations
        fi
        activation_compose_array
        rendered="$(mktemp /tmp/kamooni-staging-activation.XXXXXX.json)"
        rendered_all="$(mktemp /tmp/kamooni-staging-activation-all.XXXXXX.json)"
        trap 'rm -f "$rendered" "$rendered_all"' EXIT
        "${activation_compose[@]}" config --format json >"$rendered"
        "${activation_compose[@]}" --profile "*" config --format json >"$rendered_all"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-activation.py" compose-json "$rendered"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-compose.py" "$rendered" "$rendered_all" "$PROJECT_NAME" "$STAGING_INFRA_APP_DIR/nginx/nginx.staging.conf" "$STAGING_INFRA_APP_DIR/nginx/mailpit-ui.staging.conf" activation
        deployment_id="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
        "${base_compose[@]}" stop nginx || fail_public_services "could not stop NGINX before activation"
        "${activation_compose[@]}" up -d --no-deps --force-recreate circles || fail_public_services "activation application recreation failed"
        verify_internal_application activation "$deployment_id" || fail_public_services "activation application failed internal webnet or runtime-policy verification"
        verify_running_mailpit || fail_public_services "running Mailpit safety verification failed"
        "${activation_compose[@]}" up -d --no-deps --force-recreate nginx || fail_public_services "NGINX refresh failed after activation"
        verify_external_application || fail_public_services "activation application failed external verification"
        run_ops_with_activation operations-status || fail_public_services "post-activation operation status failed"
        ;;
    deactivate-services)
        [[ "$#" -eq 0 ]] || usage
        require_clean_infra
        require_route_mode paused
        rendered="$(mktemp /tmp/kamooni-staging-default.XXXXXX.json)"
        rendered_all="$(mktemp /tmp/kamooni-staging-default-all.XXXXXX.json)"
        trap 'rm -f "$rendered" "$rendered_all"' EXIT
        "${base_compose[@]}" config --format json >"$rendered"
        "${base_compose[@]}" --profile "*" config --format json >"$rendered_all"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-environment.py" compose-json "$rendered"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-compose.py" "$rendered" "$rendered_all" "$PROJECT_NAME" "$STAGING_INFRA_APP_DIR/nginx/nginx.staging.conf" "$STAGING_INFRA_APP_DIR/nginx/mailpit-ui.staging.conf"
        "${base_compose[@]}" stop nginx || fail_public_services "could not stop NGINX before deactivation"
        "${base_compose[@]}" up -d --no-deps --force-recreate circles || fail_public_services "default application recreation failed"
        verify_internal_application default none || fail_public_services "default application failed internal webnet or runtime-policy verification"
        verify_running_mailpit || fail_public_services "running Mailpit safety verification failed"
        "${base_compose[@]}" up -d --no-deps --force-recreate nginx || fail_public_services "NGINX refresh failed after deactivation"
        verify_external_application || fail_public_services "default application failed external verification"
        run_ops operations-status || fail_public_services "post-deactivation operation status failed"
        ;;
    *) usage ;;
esac
