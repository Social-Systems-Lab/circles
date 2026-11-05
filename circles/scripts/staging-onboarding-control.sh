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

usage() {
    cat >&2 <<'EOF'
Usage:
  staging-onboarding-control.sh status
  staging-onboarding-control.sh inspect [PENDING_OBJECT_ID]
  staging-onboarding-control.sh route-set EXPECTED_MODE NEW_MODE DEPLOYMENT_ID ACTOR
  staging-onboarding-control.sh activate-services
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

verify_application_identity() {
    local container_id image_id expected_image_id version
    container_id="$("${base_compose[@]}" ps -q circles)"
    [[ -n "$container_id" ]] || { echo "Error: circles container is missing." >&2; exit 1; }
    image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
    expected_image_id="$(docker image inspect --format '{{.Id}}' "kamooni-staging-circles:$STAGING_IMAGE_TAG")"
    [[ "$image_id" == "$expected_image_id" ]] || { echo "Error: running application image does not match target tag." >&2; exit 1; }
    version="$(curl -fsSL https://staging.kamooni.org/api/version)"
    python3 - "$GIT_SHA" "$version" <<'PY'
import json, sys
try:
    actual = json.loads(sys.argv[2])["gitSha"]
except (json.JSONDecodeError, KeyError, TypeError):
    raise SystemExit("Error: invalid staging version response")
if actual != sys.argv[1]:
    raise SystemExit(f"Error: staging reports {actual}, expected {sys.argv[1]}")
PY
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
        [[ -n "${REGISTRATION_ROUTING_OPERATOR_TOKEN:-}" ]] || { echo "Error: REGISTRATION_ROUTING_OPERATOR_TOKEN is not loaded in the operator shell." >&2; exit 1; }
        expected="$1"; target="$2"; deployment_id="$3"; actor="$4"
        if [[ "$target" == "pending" ]]; then
            [[ "$deployment_id" == "activation" ]] || { echo "Error: pending transition requires deployment ID selector 'activation'." >&2; exit 1; }
            require_activation_file
            deployment_id="$(python3 - "$ACTIVATION_ENV_FILE" <<'PY'
import sys
for raw in open(sys.argv[1], encoding="utf-8"):
    if raw.startswith("REGISTRATION_DEPLOYMENT_ID="):
        print(raw.split("=", 1)[1].strip().strip("\"'"))
        break
else:
    raise SystemExit("Error: activation deployment ID is missing")
PY
)"
            docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" --env-file "$ENV_FILE" --env-file "$ACTIVATION_ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE" -f "$OPS_COMPOSE_FILE" run --rm --no-deps -e REGISTRATION_ROUTING_OPERATOR_TOKEN registration_ops route-set --expected "$expected" --to "$target" --deployment-id "$deployment_id" --actor "$actor" --confirm SET_REGISTRATION_ROUTE --operator-token "$REGISTRATION_ROUTING_OPERATOR_TOKEN"
        else
            "${ops_compose[@]}" run --rm --no-deps -e REGISTRATION_ROUTING_OPERATOR_TOKEN registration_ops route-set --expected "$expected" --to "$target" --deployment-id "$deployment_id" --actor "$actor" --confirm SET_REGISTRATION_ROUTE --operator-token "$REGISTRATION_ROUTING_OPERATOR_TOKEN"
        fi
        ;;
    activate-services)
        [[ "$#" -eq 0 ]] || usage
        require_clean_infra
        require_route_mode paused
        require_clean_operations
        activation_compose_array
        rendered="$(mktemp /tmp/kamooni-staging-activation.XXXXXX.json)"
        rendered_all="$(mktemp /tmp/kamooni-staging-activation-all.XXXXXX.json)"
        trap 'rm -f "$rendered" "$rendered_all"' EXIT
        "${activation_compose[@]}" config --format json >"$rendered"
        "${activation_compose[@]}" --profile "*" config --format json >"$rendered_all"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-activation.py" compose-json "$rendered"
        python3 "$STAGING_INFRA_APP_DIR/scripts/validate-staging-compose.py" "$rendered" "$rendered_all" "$PROJECT_NAME" "$STAGING_INFRA_APP_DIR/nginx/nginx.staging.conf" "$STAGING_INFRA_APP_DIR/nginx/mailpit-ui.staging.conf" activation
        "${activation_compose[@]}" up -d --no-deps --force-recreate circles
        verify_application_identity
        run_ops_with_activation operations-status
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
        "${base_compose[@]}" up -d --no-deps --force-recreate circles
        verify_application_identity
        container_id="$("${base_compose[@]}" ps -q circles)"
        docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" | python3 -c 'import sys; values=dict(line.rstrip().split("=",1) for line in sys.stdin if "=" in line); assert values.get("PENDING_REGISTRATION_ENABLED")=="false" and values.get("PENDING_REGISTRATION_JOURNEY_READY")=="false"; assert not values.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY") and not values.get("REGISTRATION_DEPLOYMENT_ID"); print("Pending registration gates are disabled.")'
        run_ops operations-status
        ;;
    *) usage ;;
esac
