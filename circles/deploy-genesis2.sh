#!/usr/bin/env bash
# Never trace this script: later commands handle the application's credential-bearing MongoDB URI.
set +x
set -euo pipefail

if [[ "$#" -lt 1 || "$1" != "main" ]]; then
  echo "Error: production deployment requires the explicit branch argument: main" >&2
  exit 2
fi
DEPLOY_MODE="legacy"
RECOVER_PAUSED=false
if [[ "$#" -ne 1 ]]; then
  if [[ "$#" -ne 3 || ( "$2" != "--paused-onboarding" && "$2" != "--recover-paused-onboarding" ) || ! "$3" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Error: paused onboarding deployment requires main --paused-onboarding APPROVED_FULL_SHA" >&2
    exit 2
  fi
  DEPLOY_MODE="paused-onboarding"
  APPROVED_SHA="$3"
  [[ "$2" != "--recover-paused-onboarding" ]] || RECOVER_PAUSED=true
fi

EXPECTED_DIR="/root/circles/circles"
APP_DIR="${EXPECTED_DIR}/circles"
CURRENT_DIR="$(pwd -P)"
BRANCH="$1"
PRODUCTION_LOCK_FILE="/run/lock/circles-production-docker.lock"
PRODUCTION_LOCK_TIMEOUT_SECONDS=120
ONBOARDING_SECRET_DIR="/root/circles/onboarding-secrets"
ACTIVATION_ENV_FILE="$ONBOARDING_SECRET_DIR/activation.env"
ROUTING_OPERATOR_VERIFIER_FILE="$ONBOARDING_SECRET_DIR/routing-operator.sha256"
ACTIVATION_VALIDATOR="$APP_DIR/scripts/validate-production-onboarding-activation.py"
OPERATOR_VERIFIER_VALIDATOR="$APP_DIR/scripts/validate-routing-operator-verifier.py"
RUNTIME_VALIDATOR="$APP_DIR/scripts/verify-production-onboarding-runtime.py"
APPLICATION_IMAGE_VALIDATOR="$APP_DIR/scripts/verify-production-application-image.py"
ACTIVATION_COMPOSE_FILE="$APP_DIR/docker-compose.production-activation.yml"
MAINTENANCE_COMPOSE_FILE="$APP_DIR/docker-compose.production-maintenance.yml"
OPS_COMPOSE_FILE="$APP_DIR/docker-compose.production-ops.yml"
ACTIVATION_CONFIRM="AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL"
PAUSED_DEPLOY_CONFIRM="DEPLOY_PAUSED_ONBOARDING_SERVICES"
PAUSED_RECOVERY_CONFIRM="RECOVER_PAUSED_ONBOARDING_SERVICES"
REHEARSAL_CONFIRM="KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL_V1"
REHEARSAL_MARKER="/run/kamooni-production-onboarding-rehearsal-disposable"
REHEARSAL_LOCAL_ORIGIN="file:///root/circles/rehearsal-origin.git"
TEMP_FILES=()
NGINX_STOPPED=false
PAUSED_APPLICATION_VERIFIED=false
PAUSED_EXPECTED_IMAGE_ID=""
PUBLIC_VERIFICATION_PENDING=false
APP_MONGODB_URI=""

exec 9>"$PRODUCTION_LOCK_FILE"
if ! flock -w "$PRODUCTION_LOCK_TIMEOUT_SECONDS" 9; then
  echo "Error: could not acquire the production maintenance lock within ${PRODUCTION_LOCK_TIMEOUT_SECONDS}s." >&2
  echo "Another deployment or onboarding operation may still be running." >&2
  exit 1
fi

cleanup_temporary_files() {
  local file
  for file in "${TEMP_FILES[@]}"; do
    [[ ! -e "$file" ]] || rm -f -- "$file"
  done
}
finish_deployment() {
  local status=$?
  if [[ "$PUBLIC_VERIFICATION_PENDING" == true ]]; then
    echo "Error: public verification was interrupted; closing production NGINX." >&2
    if ! close_public_access; then
      stop_unverified_application
      status=1
    fi
  fi
  cleanup_temporary_files
  return "$status"
}
trap finish_deployment EXIT
if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

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

render_compose() {
  local output="$1"
  shift
  "$@" config --format json >"$output"
}

require_paused_onboarding_configuration() {
  for file in "$ACTIVATION_VALIDATOR" "$OPERATOR_VERIFIER_VALIDATOR" "$RUNTIME_VALIDATOR" \
    "$APPLICATION_IMAGE_VALIDATOR" "$ACTIVATION_COMPOSE_FILE" "$MAINTENANCE_COMPOSE_FILE" \
    "$OPS_COMPOSE_FILE"; do
    [[ -f "$file" ]] || fail "missing paused onboarding deployment tool: $file"
  done
  require_paused_onboarding_secret_files
  PAUSED_ENV_CHECKSUMS="$(sha256sum -- "$BASE_ENV_FILE" "$ACTIVATION_ENV_FILE")" ||
    fail "could not fingerprint the production environment files"

  PAUSED_DEFAULT_CONFIG="$(mktemp /tmp/kamooni-paused-deploy-default.XXXXXX.json)"
  PAUSED_ACTIVATION_CONFIG="$(mktemp /tmp/kamooni-paused-deploy-activation.XXXXXX.json)"
  PAUSED_OPS_CONFIG="$(mktemp /tmp/kamooni-paused-deploy-ops.XXXXXX.json)"
  TEMP_FILES+=("$PAUSED_DEFAULT_CONFIG" "$PAUSED_ACTIVATION_CONFIG" "$PAUSED_OPS_CONFIG")
  chmod 600 "$PAUSED_DEFAULT_CONFIG" "$PAUSED_ACTIVATION_CONFIG" "$PAUSED_OPS_CONFIG"

  render_compose "$PAUSED_DEFAULT_CONFIG" "${BASE_COMPOSE[@]}"
  render_compose "$PAUSED_ACTIVATION_CONFIG" "${PAUSED_APPLICATION_COMPOSE[@]}"
  render_compose "$PAUSED_OPS_CONFIG" "${OPS_COMPOSE[@]}"
  python3 "$ACTIVATION_VALIDATOR" default-compose-json "$PAUSED_DEFAULT_CONFIG" >/dev/null
  python3 "$ACTIVATION_VALIDATOR" activation-compose-json "$PAUSED_ACTIVATION_CONFIG" "$PAUSED_DEPLOYMENT_ID" >/dev/null
  python3 "$ACTIVATION_VALIDATOR" no-published-ports-json "$PAUSED_ACTIVATION_CONFIG" >/dev/null
  python3 "$ACTIVATION_VALIDATOR" ops-compose-json "$PAUSED_OPS_CONFIG" "$GIT_SHA" >/dev/null
  python3 "$ACTIVATION_VALIDATOR" separation \
    "$ACTIVATION_ENV_FILE" "$BASE_ENV_FILE" "$ROUTING_OPERATOR_VERIFIER_FILE" >/dev/null
  APP_MONGODB_URI="$(paused_application_database_uri "$active_container_id")" ||
    fail "serving application, candidate, operator and migration database identity could not be verified"
  require_unchanged_paused_configuration
}

require_unchanged_paused_configuration() {
  local checksums
  checksums="$(sha256sum -- "$BASE_ENV_FILE" "$ACTIVATION_ENV_FILE")" ||
    fail "could not recheck the production environment files"
  [[ "$checksums" == "$PAUSED_ENV_CHECKSUMS" && "$(git rev-parse HEAD)" == "$APPROVED_SHA" ]] ||
    fail "production checkout or environment changed during paused deployment"
  require_clean_worktree || fail "production checkout changed during paused deployment"
}

paused_application_database_uri() {
  docker inspect "$1" | python3 "$RUNTIME_VALIDATOR" paused-database \
    "$PAUSED_DEFAULT_CONFIG" "$PAUSED_ACTIVATION_CONFIG" "$PAUSED_OPS_CONFIG"
}

require_paused_onboarding_secret_files() {
  [[ -d "$ONBOARDING_SECRET_DIR" ]] || fail "production onboarding secret directory is missing"
  [[ "$(LC_ALL=C stat -c '%u %a %F' "$ONBOARDING_SECRET_DIR")" == "0 700 directory" ]] || \
    fail "production onboarding secret directory must be root-owned and mode 700"
  python3 "$ACTIVATION_VALIDATOR" file "$ACTIVATION_ENV_FILE" 0 >/dev/null
  [[ "$(LC_ALL=C stat -c '%u %a %F' "$ROUTING_OPERATOR_VERIFIER_FILE")" == "0 600 regular file" ]] || \
    fail "routing operator verifier must be root-owned, mode 600, and a regular file"
  "$OPERATOR_VERIFIER_VALIDATOR" "$ROUTING_OPERATOR_VERIFIER_FILE" >/dev/null
  PAUSED_DEPLOYMENT_ID="$(activation_value REGISTRATION_DEPLOYMENT_ID)"
  [[ -n "$PAUSED_DEPLOYMENT_ID" ]] || fail "registration deployment ID is missing"
}

require_paused_operations_idle() {
  local status
  status="$(MONGODB_URI="$APP_MONGODB_URI" "${OPS_COMPOSE[@]}" run --rm --no-deps --pull never -T registration_ops \
    operations-status --users-dir /circles/users)" || return 1
  printf '%s\n' "$status" | python3 "$ACTIVATION_VALIDATOR" operations-idle >/dev/null
}

require_application_cron_secret() {
  local container_id="$1" cron_secret
  cron_secret="$(docker exec "$container_id" printenv CRON_SECRET)" || \
    fail "could not resolve CRON_SECRET from the active production application"
  [[ -n "$cron_secret" && "$cron_secret" != *$'\n'* && "$cron_secret" != *$'\r'* ]] || \
    fail "CRON_SECRET in the active production application is empty or invalid"
  unset cron_secret
}

stop_nginx_for_paused_onboarding() {
  local running_nginx=""
  [[ "$DEPLOY_MODE" == "paused-onboarding" && "$NGINX_STOPPED" == false ]] || return 0
  # NGINX's image uses SIGQUIT for graceful shutdown. Never force-kill requests still draining.
  timeout 75s "${BASE_COMPOSE[@]}" stop --timeout -1 nginx >/dev/null ||
    fail "production NGINX did not drain; the application was not stopped"
  running_nginx="$("${BASE_COMPOSE[@]}" ps --status running -q nginx)" || \
    fail "could not confirm that production NGINX stopped"
  [[ -z "$running_nginx" ]] || \
    fail "production NGINX is still running after the required stop"
  NGINX_STOPPED=true
}

application_sha_is_ancestor() {
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  git cat-file -e "${sha}^{commit}" 2>/dev/null || return 1
  git merge-base --is-ancestor "$sha" HEAD
}

active_application_image_id() {
  local container_id="$1" image_id
  image_id="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$image_id"
}

read_application_image_metadata() {
  local image_id="$1"
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  docker run --rm --pull never --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --user node --entrypoint sh "$image_id" -c \
    'cat /app/VERSION; printf "\n---KAMOONI-ROLE---\n"; cat /app/.kamooni-deployment-role'
}

verify_application_image_identity() {
  local image_id="$1" expected_sha="$2" metadata
  metadata="$(read_application_image_metadata "$image_id")" || return 1
  printf '%s' "$metadata" | \
    python3 "$APPLICATION_IMAGE_VALIDATOR" "$expected_sha" "$image_id" "$image_id" >/dev/null
}

verify_application_http_sha() {
  local container_id="$1" expected_sha="$2" container_ip
  container_ip="$(docker inspect "$container_id" | python3 "$RUNTIME_VALIDATOR" endpoint)" || return 1
  docker exec "$container_id" node -e '
const expected = process.argv[1];
const host = process.argv[2];
const port = Number(process.env.PORT);
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(1);
fetch(`http://${host}:${port}/api/version`, {
  redirect: "error",
  signal: AbortSignal.timeout(3000),
})
  .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  .then((body) => process.exit(body.gitSha === expected ? 0 : 1))
  .catch(() => process.exit(1));
' "$expected_sha" "$container_ip"
}

is_disposable_rehearsal_origin() {
  local rewritten_url="$1" raw_url="$2" marker_value="$3"
  [[ "${KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL:-}" == "$REHEARSAL_CONFIRM" ]] &&
    [[ "${GIT_ALLOW_PROTOCOL:-}" == "file" ]] &&
    [[ "$rewritten_url" == "$REHEARSAL_LOCAL_ORIGIN" ]] &&
    [[ "$raw_url" == "https://github.com/Social-Systems-Lab/circles.git" ]] &&
    [[ "$marker_value" == "$REHEARSAL_CONFIRM" ]]
}

require_production_docker() {
  local daemon_name socket
  [[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]] ||
    fail "Docker context and host overrides are forbidden for production deployment"
  [[ "$(docker context show)" == default ]] || fail "production deployment requires the default local Docker context"
  socket="$(docker context inspect default --format '{{.Endpoints.docker.Host}}')" ||
    fail "could not resolve the local Docker endpoint"
  [[ "$socket" == unix:///var/run/docker.sock ]] || fail "production deployment requires the system Docker socket"
  daemon_name="$(docker info --format '{{.Name}}')" || fail "could not identify the Docker daemon"
  if [[ "$REHEARSAL_ORIGIN" == true ]]; then
    [[ -n "${KAMOONI_REHEARSAL_DAEMON_ID:-}" &&
      "$(docker info --format '{{.ID}}')" == "$KAMOONI_REHEARSAL_DAEMON_ID" &&
      "${daemon_name%%.*}" != kamooniorg ]] || fail "unverified disposable rehearsal daemon"
  else
    [[ "$(hostname -s)" == kamooniorg && "${daemon_name%%.*}" == kamooniorg ]] ||
      fail "production deployment requires the kamooniorg host and Docker daemon"
  fi
  export DOCKER_CONTEXT=default
}

if [[ "$CURRENT_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Error: run this script from $EXPECTED_DIR (current: $CURRENT_DIR)" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "Error: app directory not found: $APP_DIR" >&2
  exit 1
fi

BASE_ENV_FILE="$APP_DIR/.env"
BASE_COMPOSE=(
  docker compose
  --project-name circles
  --project-directory "$APP_DIR"
  --env-file "$BASE_ENV_FILE"
  -f "$APP_DIR/docker-compose.yml"
)
OPS_COMPOSE=("${BASE_COMPOSE[@]}" -f "$OPS_COMPOSE_FILE" --profile production-onboarding-ops)
ACTIVATION_COMPOSE=("${BASE_COMPOSE[@]}" --env-file "$ACTIVATION_ENV_FILE" -f "$ACTIVATION_COMPOSE_FILE")
PAUSED_APPLICATION_COMPOSE=("${ACTIVATION_COMPOSE[@]}" -f "$MAINTENANCE_COMPOSE_FILE")
export KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM="$ACTIVATION_CONFIRM"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Error: production checkout must already be on branch main." >&2
  exit 1
fi

require_clean_worktree() {
  local dirty_status
  dirty_status="$(git status --porcelain --untracked-files=all)"
  if [[ -n "$dirty_status" ]]; then
    echo "Error: refusing to deploy with a dirty working tree." >&2
    echo "$dirty_status" >&2
    return 1
  fi
}

if ! require_clean_worktree; then
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
REHEARSAL_ORIGIN=false
ORIGIN_RAW_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
case "$ORIGIN_URL" in
  https://github.com/Social-Systems-Lab/circles.git|git@github.com:Social-Systems-Lab/circles.git|ssh://git@github.com/Social-Systems-Lab/circles.git)
    ;;
  *)
    rehearsal_marker_value="$(cat "$REHEARSAL_MARKER" 2>/dev/null || true)"
    if ! is_disposable_rehearsal_origin "$ORIGIN_URL" "$ORIGIN_RAW_URL" "$rehearsal_marker_value"; then
      echo "Error: origin must be the Social-Systems-Lab/circles GitHub repository (found: $ORIGIN_URL)." >&2
      exit 1
    fi
    [[ "$DEPLOY_MODE" == paused-onboarding &&
       "$(LC_ALL=C stat -c '%u %a %F' "$REHEARSAL_MARKER")" == "0 600 regular file" ]] ||
      fail "disposable rehearsal origin requires paused mode and the protected runner marker"
    REHEARSAL_ORIGIN=true
    echo "Disposable rehearsal origin verified with local file-only Git transport."
    ;;
esac

if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  [[ "$(id -u)" -eq 0 ]] || fail "paused deployment must run as root"
  [[ "$(git rev-parse HEAD)" == "$APPROVED_SHA" ]] ||
    fail "check out the approved origin/main SHA before invoking its paused deployment script"
  [[ "$(realpath -- "${BASH_SOURCE[0]}")" == "$APP_DIR/deploy-genesis2.sh" ]] ||
    fail "invoke the paused deployment script from the approved checkout"
fi
require_production_docker

CURRENT_ROUTING_STATE="$("${BASE_COMPOSE[@]}" exec -T db sh -lc \
  'mongosh "$MONGODB_URI" --quiet --eval '\''const record = db.getSiblingDB("circles").registrationRouting.findOne({_id:"registration-routing"}); const mode = record && record.mode ? record.mode : "legacy"; const deployment = record && record.deploymentId ? "set" : "null"; print(mode + "|" + deployment)'\''' 2>/dev/null)" || {
  echo "Error: could not read registration routing before production synchronization." >&2
  echo "The checkout and running application were not changed." >&2
  exit 1
}
case "$CURRENT_ROUTING_STATE" in
  "legacy|null"|"paused|null"|"pending|set")
    ;;
  *)
    echo "Error: registration routing returned an unrecognized state before production synchronization." >&2
    echo "The checkout and running application were not changed." >&2
    exit 1
    ;;
esac
if [[ "$DEPLOY_MODE" == "legacy" && "$CURRENT_ROUTING_STATE" != "legacy|null" ]]; then
  echo "Error: normal production deployment requires routing mode legacy with no deployment ID." >&2
  echo "Use scripts/production-onboarding-control.sh to pause, inspect, or roll back onboarding first." >&2
  exit 1
fi
if [[ "$DEPLOY_MODE" == "paused-onboarding" && "$CURRENT_ROUTING_STATE" != "paused|null" ]]; then
  echo "Error: paused onboarding deployment requires routing mode paused with no deployment ID." >&2
  echo "No checkout or application change was made." >&2
  exit 1
fi
if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  [[ -f "$ACTIVATION_VALIDATOR" && -f "$OPERATOR_VERIFIER_VALIDATOR" && \
    -f "$RUNTIME_VALIDATOR" && -f "$APPLICATION_IMAGE_VALIDATOR" ]] || \
    fail "paused onboarding deployment validators are missing"
  require_paused_onboarding_secret_files
  expected_runtime=activation
  confirmation="$PAUSED_DEPLOY_CONFIRM"
  if [[ "$RECOVER_PAUSED" == true ]]; then
    running_public_ids="$("${BASE_COMPOSE[@]}" ps --status running -q nginx circles)" ||
      fail "could not verify that production public services are stopped"
    [[ -z "$running_public_ids" ]] ||
      fail "offline recovery requires both production NGINX and circles to be stopped"
    active_container_id="$("${BASE_COMPOSE[@]}" ps --all -q circles)"
    expected_runtime=stopped-activation
    confirmation="$PAUSED_RECOVERY_CONFIRM"
  else
    active_container_id="$("${BASE_COMPOSE[@]}" ps -q circles)"
  fi
  [[ "$(grep -c . <<<"$active_container_id" || true)" -eq 1 ]] ||
    fail "expected exactly one production application container in the requested state"
  active_image_id="$(active_application_image_id "$active_container_id")" ||
    fail "could not resolve the existing application image"
  active_version_file="$(read_application_image_metadata "$active_image_id")" ||
    fail "could not read existing application image version metadata"
  [[ "$(grep -c '^gitSha=' <<<"$active_version_file")" -eq 1 ]] ||
    fail "existing application image must contain exactly one Git SHA"
  ACTIVE_PAUSED_SHA="$(sed -n 's/^gitSha=//p' <<<"$active_version_file")"
  application_sha_is_ancestor "$ACTIVE_PAUSED_SHA" ||
    fail "existing application SHA is not a known ancestor of the approved checkout"
  printf '%s' "$active_version_file" | \
    python3 "$APPLICATION_IMAGE_VALIDATOR" "$ACTIVE_PAUSED_SHA" "$active_image_id" "$active_image_id" >/dev/null ||
    fail "existing application image SHA, identity, or production role is invalid"
  docker inspect "$active_container_id" | \
    python3 "$RUNTIME_VALIDATOR" "$expected_runtime" "$PAUSED_DEPLOYMENT_ID" "$ACTIVATION_ENV_FILE" >/dev/null ||
    fail "existing application is not using the validated paused onboarding runtime"
  if [[ "$RECOVER_PAUSED" == false ]]; then
    active_container_version="$(docker exec "$active_container_id" cat /app/VERSION)" ||
      fail "could not read serving container version metadata"
    [[ "$active_container_version" == "$(sed '/^---KAMOONI-ROLE---$/,$d' <<<"$active_version_file")" ]] ||
      fail "serving container version metadata does not match its image"
    verify_application_http_sha "$active_container_id" "$ACTIVE_PAUSED_SHA" ||
      fail "active application internal version endpoint does not match its image SHA"
    require_application_cron_secret "$active_container_id"
  fi
  require_terminal_confirmation "$confirmation"
fi

echo "Deploying branch: $BRANCH"
git fetch --no-tags origin "refs/heads/main:refs/remotes/origin/main"

if [[ "$DEPLOY_MODE" == "paused-onboarding" &&
      "$(git rev-parse refs/remotes/origin/main)" != "$APPROVED_SHA" ]]; then
  fail "origin/main does not match the approved paused onboarding SHA"
fi

if ! require_clean_worktree; then
  exit 1
fi

if ! git merge-base --is-ancestor HEAD refs/remotes/origin/main; then
  echo "Error: local main has diverged from origin/main; refusing synchronization." >&2
  exit 1
fi

if [[ "$DEPLOY_MODE" == "legacy" ]]; then
  git merge --ff-only refs/remotes/origin/main
fi

if ! require_clean_worktree; then
  echo "Error: working tree became dirty during main synchronization." >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Error: production checkout is not on main after synchronization." >&2
  exit 1
fi

LOCAL_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"
if [[ "$LOCAL_SHA" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "Error: production HEAD does not exactly match origin/main." >&2
  exit 1
fi
if [[ "$DEPLOY_MODE" == "paused-onboarding" && "$LOCAL_SHA" != "$APPROVED_SHA" ]]; then
  fail "production HEAD does not match the approved paused onboarding SHA"
fi

ISOLATION_GUARD="$APP_DIR/scripts/check-production-staging-isolation.sh"
if [[ ! -f "$ISOLATION_GUARD" || ! -x "$ISOLATION_GUARD" ]]; then
  echo "Error: production staging-isolation guard is missing or not executable: $ISOLATION_GUARD" >&2
  exit 1
fi
echo "Running production staging-isolation guard..."
(cd "$APP_DIR" && ./scripts/check-production-staging-isolation.sh)

GIT_SHA="$LOCAL_SHA"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_SHA BUILD_TIME

echo "Deploying SHA: $GIT_SHA"
echo "Build time (UTC): $BUILD_TIME"

echo "Running branding guard for Kamooni..."
(cd "$APP_DIR" && ./scripts/check-branding-guard.sh kamooni)

if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  require_paused_onboarding_configuration
fi

echo "Building the read-only registration operator for the production SHA..."
"${OPS_COMPOSE[@]}" build registration_ops

echo "Verifying registration routing is unchanged before production deployment..."
docker image inspect "circles-registration-ops:$GIT_SHA" >/dev/null
EXPECTED_ROUTING_MODE="legacy"
if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  EXPECTED_ROUTING_MODE="paused-drained"
  ROUTING_STATUS="$(MONGODB_URI="$APP_MONGODB_URI" "${OPS_COMPOSE[@]}" run --rm --no-deps --pull never -T registration_ops route-status)"
else
  ROUTING_STATUS="$("${OPS_COMPOSE[@]}" run --rm --no-deps --pull never -T registration_ops route-status)"
fi
if ! printf '%s\n' "$ROUTING_STATUS" | python3 "$ACTIVATION_VALIDATOR" route-status "$EXPECTED_ROUTING_MODE" >/dev/null; then
  if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
    echo "Error: paused onboarding deployment requires verified paused routing and a completed drain." >&2
  else
    echo "Error: normal production deployment is blocked while registration routing is not legacy." >&2
    echo "Use scripts/production-onboarding-control.sh to pause, inspect, or roll back onboarding first." >&2
  fi
  exit 1
fi
if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  require_paused_operations_idle
  # Keep the verified serving image addressable even when a candidate build moves latest.
  retained_image="circles-circles:paused-rollback-$ACTIVE_PAUSED_SHA-${active_image_id#sha256:}"
  docker image tag "$active_image_id" "$retained_image" || fail "could not retain the active production image"
  [[ "$(docker image inspect --format '{{.Id}}' "$retained_image")" == "$active_image_id" ]] ||
    fail "retained production image does not match the serving image"
fi

"${BASE_COMPOSE[@]}" build circles cron

if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  PAUSED_EXPECTED_IMAGE_ID="$(docker image inspect --format '{{.Id}}' circles-circles:latest)" || \
    fail "newly built production application image is missing"
  verify_application_image_identity "$PAUSED_EXPECTED_IMAGE_ID" "$GIT_SHA" || \
    fail "newly built production application image SHA, identity, or production role is invalid"
fi

resolve_application_mongodb_uri() {
  # Resolve the exact environment assigned to the application service. This works even when
  # the existing circles container is stopped because the newly built image runs only `node -e`.
  "${BASE_COMPOSE[@]}" run --rm --no-deps --pull never -T circles \
    node -e 'const uri = process.env.MONGODB_URI || ""; if (!uri || /[\r\n]/.test(uri)) process.exit(1); process.stdout.write(uri)'
}

application_container_id() {
  local -a ids=()
  local container_id
  while IFS= read -r container_id; do
    [[ -z "$container_id" ]] || ids+=("$container_id")
  done < <("${BASE_COMPOSE[@]}" ps -q circles)
  [[ "${#ids[@]}" -eq 1 ]] || return 1
  printf '%s\n' "${ids[0]}"
}

verify_paused_application_runtime() {
  local expected_image_id="$1" container_id actual_image_id version_file candidate_uri
  container_id="$(application_container_id)" || {
    echo "Error: expected exactly one production application container" >&2
    return 1
  }
  actual_image_id="$(docker inspect --format '{{.Image}}' "$container_id")" || return 1
  if [[ "$actual_image_id" != "$expected_image_id" ]]; then
    echo "Error: running application image does not match the newly built image" >&2
    return 1
  fi
  docker inspect "$container_id" | \
    python3 "$RUNTIME_VALIDATOR" activation "$PAUSED_DEPLOYMENT_ID" "$ACTIVATION_ENV_FILE" >/dev/null || {
    echo "Error: running activation runtime configuration is invalid" >&2
    return 1
  }
  docker inspect "$container_id" | python3 "$RUNTIME_VALIDATOR" no-published-ports >/dev/null || {
    echo "Error: running maintenance application publishes a host port" >&2
    return 1
  }
  candidate_uri="$(paused_application_database_uri "$container_id")" || return 1
  [[ "$candidate_uri" == "$APP_MONGODB_URI" ]] || return 1
  version_file="$(docker exec "$container_id" cat /app/VERSION)" || {
    echo "Error: could not read application version metadata" >&2
    return 1
  }
  if ! grep -Fxq "gitSha=$GIT_SHA" <<<"$version_file"; then
    echo "Error: application version metadata does not match the deployed SHA" >&2
    return 1
  fi
  for _ in $(seq 1 20); do
    if verify_application_http_sha "$container_id" "$GIT_SHA"; then
      return 0
    fi
    sleep 1
  done
  echo "Error: running application never reported the approved production SHA" >&2
  return 1
}

verify_registration_routing_paused() {
  local expected_mode="${1:-paused}" status
  status="$(MONGODB_URI="$APP_MONGODB_URI" "${OPS_COMPOSE[@]}" run --rm --no-deps --pull never -T registration_ops route-status)" || {
    echo "Error: could not read registration routing" >&2
    return 1
  }
  printf '%s\n' "$status" | python3 "$ACTIVATION_VALIDATOR" route-status "$expected_mode" >/dev/null || {
    echo "Error: registration routing did not remain paused" >&2
    return 1
  }
}

require_paused_replacement_ready() {
  [[ "$DEPLOY_MODE" == "paused-onboarding" ]] || return 0
  require_unchanged_paused_configuration
  if ! verify_registration_routing_paused; then
    stop_nginx_for_paused_onboarding
    fail "registration routing changed before the application replacement window"
  fi
  verify_registration_routing_paused paused-drained ||
    fail "five-minute registration drain could not be verified before replacement"
  require_paused_operations_idle || \
    fail "pending-registration operations became active before the application replacement window"
}

recreate_and_verify_cron() {
  "${BASE_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate cron || {
    echo "Error: cron service could not be recreated" >&2
    return 1
  }
  "${BASE_COMPOSE[@]}" exec -T cron sh -lc \
    'grep -Fq "/api/cron/email-reminders" /etc/crontabs/root && grep -Fq "/api/cron/first-topic-notifications" /etc/crontabs/root && grep -Fq "/api/cron/onboarding-watchdog" /etc/crontabs/root && grep -Eq "^\*/5 .*\/api\/cron\/onboarding-watchdog" /etc/crontabs/root' || {
    echo "Error: cron schedule verification failed" >&2
    return 1
  }
  "${BASE_COMPOSE[@]}" exec -T cron sh -lc \
    'curl -fsS --max-time 20 -H "Authorization: Bearer $CRON_SECRET" http://circles:3000/api/cron/onboarding-watchdog >/dev/null' || {
    echo "Error: authenticated onboarding watchdog invocation failed after cron recreation" >&2
    return 1
  }
}

verify_external_version() {
  local output
  for _ in $(seq 1 20); do
    if output="$(curl -fsS --noproxy kamooni.org --connect-timeout 3 --max-time 5 https://kamooni.org/api/version 2>/dev/null)" && \
      python3 -c 'import json, sys; sys.exit(json.load(sys.stdin)["gitSha"] != sys.argv[1])' \
        "$GIT_SHA" <<<"$output" 2>/dev/null; then
      echo "Version check:"
      echo "$output"
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ "$DEPLOY_MODE" == "legacy" ]] &&
   { ! APP_MONGODB_URI="$(resolve_application_mongodb_uri)" || [[ -z "$APP_MONGODB_URI" ]]; }; then
  echo "Error: could not resolve MONGODB_URI from the Compose circles service environment." >&2
  echo "Migration authentication requires the same MONGODB_URI used by the application." >&2
  exit 1
fi

if [[ "$APP_MONGODB_URI" == *$'\n'* || "$APP_MONGODB_URI" == *$'\r'* ]]; then
  echo "Error: resolved MONGODB_URI contains an invalid line break." >&2
  exit 1
fi

echo "Running read-only Messaging Stage 1A production preflight..."
preflight_args=()
[[ "$DEPLOY_MODE" == "legacy" ]] || preflight_args+=(--production-compose)
if ! (cd "$APP_DIR" && APP_MONGODB_URI="$APP_MONGODB_URI" ./scripts/preflight-messaging-stage1a.sh "${preflight_args[@]}"); then
  echo "Error: Messaging Stage 1A preflight failed." >&2
  echo "The running circles application and cron services were not stopped or replaced." >&2
  exit 1
fi

run_mongo_script() {
  local script_path="$1"
  local absolute_script_path="$APP_DIR/$script_path"
  if [[ ! -f "$absolute_script_path" ]]; then
    echo "Error: Mongo script not found: $absolute_script_path" >&2
    return 1
  fi

  # MONGO_INITDB_ROOT_PASSWORD initializes a new Mongo volume; it is not authoritative after
  # initialization. Send the application's URI over stdin so it never appears in process arguments.
  # The temporary JavaScript file contains connection code and the migration script, but not the URI.
  {
    printf '%s\n' "$APP_MONGODB_URI"
    cat "$absolute_script_path"
  } | ("${BASE_COMPOSE[@]}" exec -T db sh -lc \
    'IFS= read -r MONGODB_URI || exit 1
     [ -n "$MONGODB_URI" ] || exit 1
     export MONGODB_URI
     script_file="$(mktemp /tmp/circles-mongo-script.XXXXXX.js)" || exit 1
     trap '\''rm -f "$script_file"'\'' EXIT
     chmod 600 "$script_file" || exit 1
     printf '\''%s\n'\'' '\''db = connect(process.env.MONGODB_URI);'\'' > "$script_file" || exit 1
     cat >> "$script_file" || exit 1
     mongosh --nodb --quiet --file "$script_file" >/dev/null 2>&1')
}

get_chat_read_state_v2_completion_count() {
  # Use the same authoritative application URI without placing it in process arguments or logs.
  printf '%s\n' "$APP_MONGODB_URI" | ("${BASE_COMPOSE[@]}" exec -T db sh -lc \
    'IFS= read -r MONGODB_URI || exit 1
     [ -n "$MONGODB_URI" ] || exit 1
     export MONGODB_URI
     result="$(mongosh --nodb --quiet --eval '\''const migrationDb = connect(process.env.MONGODB_URI); migrationDb.schemaMigrations.countDocuments({_id:"chat-read-state-v2",status:"complete"})'\'' 2>/dev/null)" || exit 1
     case "$result" in
       ""|*[!0-9]*) exit 1 ;;
       *) printf '\''%s\n'\'' "$result" ;;
     esac')
}

close_public_access() {
  local running_nginx
  "${BASE_COMPOSE[@]}" stop nginx >/dev/null 2>&1 || true
  if ! running_nginx="$("${BASE_COMPOSE[@]}" ps --status running -q nginx 2>/dev/null)" ||
     [[ -n "$running_nginx" ]]; then
    echo "Error: production NGINX could not be confirmed stopped; operator intervention is required." >&2
    return 1
  fi
  NGINX_STOPPED=true
  PUBLIC_VERIFICATION_PENDING=false
}

stop_unverified_application() {
  local running_app
  "${BASE_COMPOSE[@]}" stop circles >/dev/null 2>&1 || true
  if ! running_app="$("${BASE_COMPOSE[@]}" ps --status running -q circles 2>/dev/null)" ||
     [[ -n "$running_app" ]]; then
    echo "Error: production application could not be confirmed stopped; operator intervention is required." >&2
  fi
}

fail_offline() {
  local reason="$1" stop_application="${2:-false}"
  if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
    echo "Error: $reason" >&2
    if ! close_public_access; then
      stop_application=true
    fi
    if [[ "$PAUSED_APPLICATION_VERIFIED" == true && "$stop_application" != true ]]; then
      echo "Registration routing was not changed. NGINX remains stopped; the verified new circles container remains private for diagnosis and retry." >&2
    else
      stop_unverified_application
      echo "Registration routing was not changed. Keep public services offline and use recover-paused-services." >&2
    fi
    echo "Do not reopen NGINX until the failure is corrected and paused routing, image SHA, runtime, and cron are revalidated." >&2
  else
    echo "Error: $reason" >&2
    echo "The old circles application remains stopped. Do not restart an old application image after chat read-state V2 migration has begun." >&2
    echo "Inspect the Mongo migration output and this deployment's newly built image before retrying." >&2
  fi
  exit 1
}

if ! CHAT_READ_STATE_V2_COMPLETION_COUNT="$(get_chat_read_state_v2_completion_count)"; then
  echo "Error: could not authenticate to Mongo or read chat migration status; migration was not started." >&2
  echo "The currently running circles application was not stopped or replaced." >&2
  exit 1
fi

if [[ "$CHAT_READ_STATE_V2_COMPLETION_COUNT" != "0" && "$CHAT_READ_STATE_V2_COMPLETION_COUNT" != "1" ]]; then
  echo "Error: unexpected chat migration completion count; migration was not started." >&2
  echo "The currently running circles application was not stopped or replaced." >&2
  exit 1
fi

if [[ "$CHAT_READ_STATE_V2_COMPLETION_COUNT" == "1" ]]; then
  echo "Chat read-state V2 migration is already complete; running the safe idempotent verifier without a migration window."
  if ! run_mongo_script scripts/verify-chat-read-state-v2.mongo.js; then
    echo "Error: chat read-state V2 verification failed; the current V2 application was not replaced." >&2
    exit 1
  fi
else
  echo "Stopping every Compose instance of the old circles application before chat read-state migration..."
  require_paused_replacement_ready
  stop_nginx_for_paused_onboarding
  require_paused_replacement_ready
  if ! "${BASE_COMPOSE[@]}" stop circles; then
    fail_offline "failed to stop the old circles application; migration was not started"
  fi

  RUNNING_CIRCLES_IDS="$("${BASE_COMPOSE[@]}" ps --status running -q circles)"
  if [[ -n "$RUNNING_CIRCLES_IDS" ]]; then
    fail_offline "old circles application containers are still running; migration was not started"
  fi
  echo "Confirmed: no Compose circles application container is running. Maintenance window started."

  # This migration is idempotent, but it is safe only while every old application writer is stopped.
  if ! run_mongo_script scripts/migrate-chat-read-state-v2.mongo.js; then
    fail_offline "chat read-state V2 migration failed"
  fi
  if ! run_mongo_script scripts/verify-chat-read-state-v2.mongo.js; then
    fail_offline "chat read-state V2 verification failed"
  fi
fi

require_paused_replacement_ready
stop_nginx_for_paused_onboarding
if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  require_paused_replacement_ready
  if ! "${PAUSED_APPLICATION_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate circles; then
    fail_offline "the newly built paused onboarding application failed to start"
  fi
else
  if ! "${BASE_COMPOSE[@]}" up -d --no-deps --force-recreate circles; then
    fail_offline "the newly built V2 circles application failed to start"
  fi
fi

RUNNING_CIRCLES_IDS="$("${BASE_COMPOSE[@]}" ps --status running -q circles)"
if [[ -z "$RUNNING_CIRCLES_IDS" ]]; then
  fail_offline "the newly built V2 circles application is not running"
fi

if [[ "$DEPLOY_MODE" == "paused-onboarding" ]]; then
  verify_paused_application_runtime "$PAUSED_EXPECTED_IMAGE_ID" || \
    fail_offline "paused onboarding application runtime verification failed"
  PAUSED_APPLICATION_VERIFIED=true
  verify_registration_routing_paused || \
    fail_offline "registration routing changed during paused onboarding deployment" true
  recreate_and_verify_cron || fail_offline "cron verification failed during paused onboarding deployment"
  require_unchanged_paused_configuration
  verify_registration_routing_paused || \
    fail_offline "registration routing changed before restoring public access" true
  PUBLIC_VERIFICATION_PENDING=true
  if ! "${BASE_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate nginx; then
    fail_offline "production NGINX restoration failed"
  fi
  NGINX_STOPPED=false
  if ! verify_external_version; then
    fail_offline "external paused onboarding deployment verification failed"
  fi
  verify_registration_routing_paused || \
    fail_offline "registration routing changed after restoring public access" true
  PUBLIC_VERIFICATION_PENDING=false
  echo "Paused onboarding deployment verified at $GIT_SHA; registration remains paused."
  exit 0
fi

VERSION_URL="https://kamooni.org/api/version"
VERSION_OUTPUT=""

for attempt in $(seq 1 20); do
  if VERSION_OUTPUT="$(curl -fsSL "$VERSION_URL" 2>/dev/null)" && \
    grep -Eq "\"gitSha\"[[:space:]]*:[[:space:]]*\"$GIT_SHA\"" <<<"$VERSION_OUTPUT"; then
    echo "Version check (attempt $attempt):"
    echo "$VERSION_OUTPUT"
    echo "Recreating the cron service with the verified application deployment..."
    if ! (cd "$APP_DIR" && docker compose up -d --no-deps --force-recreate cron); then
      echo "Error: application is healthy, but the cron service could not be recreated." >&2
      exit 1
    fi
    if ! (cd "$APP_DIR" && docker compose exec -T cron sh -lc \
      'grep -Fq "/api/cron/email-reminders" /etc/crontabs/root && grep -Fq "/api/cron/first-topic-notifications" /etc/crontabs/root && grep -Fq "/api/cron/onboarding-watchdog" /etc/crontabs/root'); then
      echo "Error: cron schedule verification failed; expected reminder, first-topic and onboarding-watchdog jobs." >&2
      exit 1
    fi
    if ! (cd "$APP_DIR" && docker compose exec -T cron sh -lc \
      'curl -fsS --max-time 20 -H "Authorization: Bearer $CRON_SECRET" http://circles:3000/api/cron/onboarding-watchdog >/dev/null'); then
      echo "Error: authenticated onboarding watchdog invocation failed after cron recreation." >&2
      exit 1
    fi
    echo "Verified cron schedules and an authenticated legacy-mode onboarding watchdog invocation."
    exit 0
  fi
  sleep 1
done

echo "Error: version check failed after 20 attempts: $VERSION_URL" >&2
echo "Expected deployed gitSha: $GIT_SHA" >&2
(cd "$APP_DIR" && docker compose logs --tail=50 circles || true)
fail_offline "new V2 application health/version verification failed"
