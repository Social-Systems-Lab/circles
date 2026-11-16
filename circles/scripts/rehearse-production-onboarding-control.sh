#!/usr/bin/env bash
# Privileged rehearsal. Run only on a disposable Linux runner with a dedicated Docker daemon.
set +x
set -euo pipefail

REHEARSAL_CONFIRM="KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL_V1"
EXPECTED_REPO_DIR="/root/circles/circles"
APP_DIR="$EXPECTED_REPO_DIR/circles"
SECRET_DIR="/root/circles/onboarding-secrets"
CONTROL_DIR="/root/circles/rehearsal-control"
RUNTIME_DIR="$CONTROL_DIR/runtime"
ORIGIN_BARE="/root/circles/rehearsal-origin.git"
ROOT_MARKER="/root/circles/.rehearsal-owned"
LOCK_FILE="/run/lock/circles-production-docker.lock"
DISPOSABLE_MARKER="/run/kamooni-production-onboarding-rehearsal-disposable"
PROJECT_NAME="circles"
PUBLIC_HOST="kamooni.org"
REHEARSAL_MONGO_URI="mongodb://rehearsal:rehearsal-not-a-credential@127.0.0.1:27017/circles?authSource=admin"
DEPLOY_PID=""

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
RUN_ID="$(openssl rand -hex 16)"
CONTROL_SCRIPT="$APP_DIR/scripts/production-onboarding-control.sh"
DEPLOY_SCRIPT="$EXPECTED_REPO_DIR/deploy-genesis2.sh"
PTY_HELPER="$SOURCE_APP_DIR/scripts/rehearse-production-onboarding-control.pty.py"
BASE_COMPOSE=(
    docker compose
    --project-name "$PROJECT_NAME"
    --project-directory "$APP_DIR"
    --env-file "$APP_DIR/.env"
    -f "$APP_DIR/docker-compose.yml"
)
OPS_COMPOSE=("${BASE_COMPOSE[@]}" -f "$APP_DIR/docker-compose.production-ops.yml" --profile production-onboarding-ops)

fail() {
    echo "REHEARSAL ERROR: $1" >&2
    exit 1
}

cleanup() {
    local status=$?
    local owned=false
    set +e
    if [[ -n "$DEPLOY_PID" ]] && kill -0 "$DEPLOY_PID" 2>/dev/null; then
        kill -TERM "$DEPLOY_PID" 2>/dev/null
        wait "$DEPLOY_PID" 2>/dev/null
    fi
    if [[ -f "$ROOT_MARKER" && "$(cat "$ROOT_MARKER" 2>/dev/null)" == "$RUN_ID" ]]; then
        owned=true
        "${BASE_COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1
        docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" | \
            xargs -r docker rm -f >/dev/null 2>&1
        docker network rm circles_webnet >/dev/null 2>&1
        docker volume rm circles_users >/dev/null 2>&1
        docker image rm -f "circles-circles:latest" >/dev/null 2>&1
        docker image rm -f "circles-cron:latest" >/dev/null 2>&1
        docker images --format '{{.Repository}}:{{.Tag}}' | grep '^circles-registration-ops:' | \
            xargs -r docker image rm -f >/dev/null 2>&1
    fi
    if [[ "${HOSTS_ENTRY_ADDED:-false}" == true ]]; then
        sed -i '/^127[.]0[.]0[.]1 kamooni[.]org$/d' /etc/hosts 2>/dev/null
    fi
    if [[ "$owned" == true ]]; then
        rm -f -- "$LOCK_FILE"
        rm -rf -- /root/circles
        rm -f -- "$DISPOSABLE_MARKER"
    fi
    exit "$status"
}

docker_project_has_resources() {
    [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")" ]] || \
        docker volume ls --format '{{.Name}}' | grep -Eq '^circles($|_)' || \
        docker network inspect circles_webnet >/dev/null 2>&1 || \
        docker image inspect circles-circles:latest >/dev/null 2>&1 || \
        docker image inspect circles-cron:latest >/dev/null 2>&1 || \
        docker images --format '{{.Repository}}' | grep -qx 'circles-registration-ops'
}

require_disposable_environment() {
    [[ "$(id -u)" -eq 0 ]] || fail "must run as root inside a disposable Linux environment"
    [[ "$(uname -s)" == "Linux" ]] || fail "macOS and shared workstation Docker daemons are forbidden"
    [[ "${KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL:-}" == "$REHEARSAL_CONFIRM" ]] || \
        fail "explicit disposable-rehearsal confirmation is missing"
    [[ -f "$DISPOSABLE_MARKER" && ! -L "$DISPOSABLE_MARKER" ]] || \
        fail "disposable-runner marker is missing"
    [[ "$(cat "$DISPOSABLE_MARKER")" == "$REHEARSAL_CONFIRM" ]] || \
        fail "disposable-runner marker is invalid"

    if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
        [[ "${RUNNER_ENVIRONMENT:-}" == "github-hosted" ]] || \
            fail "only GitHub-hosted runners are supported in GitHub Actions"
    else
        [[ "${KAMOONI_REHEARSAL_DEDICATED_VM:-}" == "true" ]] || \
            fail "dedicated disposable VM confirmation is missing"
        command -v systemd-detect-virt >/dev/null 2>&1 || fail "VM detection is unavailable"
        [[ "$(systemd-detect-virt 2>/dev/null || true)" != "none" ]] || \
            fail "a dedicated virtual machine is required"
    fi

    command -v docker >/dev/null 2>&1 || fail "docker is unavailable"
    command -v openssl >/dev/null 2>&1 || fail "openssl is unavailable"
    command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable"
    command -v curl >/dev/null 2>&1 || fail "curl is unavailable"
    command -v flock >/dev/null 2>&1 || fail "flock is unavailable"
    docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable"
    compose_version="$(docker compose version --short 2>/dev/null)" || fail "cannot read Docker Compose version"
    python3 - "$compose_version" <<'PY' || fail "Docker Compose 2.24.4 or later is required"
import re
import sys

match = re.search(r"(\d+)\.(\d+)\.(\d+)", sys.argv[1])
raise SystemExit(0 if match and tuple(map(int, match.groups())) >= (2, 24, 4) else 1)
PY

    local daemon_name
    daemon_name="$(docker info --format '{{.Name}}' 2>/dev/null)" || fail "cannot identify the Docker daemon"
    case "$(printf '%s' "$daemon_name" | tr '[:upper:]' '[:lower:]')" in
        *genesis*|*production*|*staging*|kamooniorg)
            fail "production or staging Docker daemon detected"
            ;;
    esac
    [[ -n "${KAMOONI_REHEARSAL_DAEMON_ID:-}" ]] || fail "expected Docker daemon identity is missing"
    [[ "$(docker info --format '{{.ID}}' 2>/dev/null)" == "$KAMOONI_REHEARSAL_DAEMON_ID" ]] || \
        fail "Docker daemon identity does not match the dedicated rehearsal daemon"

    [[ ! -e /root/circles ]] || fail "refusing to replace an existing /root/circles path"
    [[ ! -e /home/ubuntu/kamooni && ! -e /home/ubuntu/kamooni-target ]] || \
        fail "staging infrastructure paths are present; refuse to use this daemon"
    [[ ! -e "$LOCK_FILE" ]] || fail "refusing an existing production maintenance lock"
    [[ -z "$(docker ps -aq)" ]] || fail "the dedicated Docker daemon already has containers"
    if docker_project_has_resources; then
        fail "production-named Docker resources already exist on this daemon"
    fi
    python3 - <<'PY' || fail "loopback port 443 is already in use"
import socket

socket = socket.socket()
try:
    socket.bind(("127.0.0.1", 443))
finally:
    socket.close()
PY
    python3 - <<'PY' || fail "loopback port 3000 is already in use"
import socket

socket_instance = socket.socket()
try:
    socket_instance.bind(("127.0.0.1", 3000))
finally:
    socket_instance.close()
PY
    ! grep -Eq '(^|[[:space:]])kamooni[.]org([[:space:]]|$)' /etc/hosts || \
        fail "kamooni.org already has a host override"
}

install_fixture_files() {
    install -d -m 700 /root/circles
    printf '%s\n' "$RUN_ID" >"$ROOT_MARKER"
    chmod 600 "$ROOT_MARKER"
    install -d -m 700 "$APP_DIR" "$SECRET_DIR"
    install -d -m 755 "$CONTROL_DIR"

    install -d -m 755 "$APP_DIR/scripts" "$APP_DIR/src/lib/auth"
    install -d -m 755 "$APP_DIR/src/app" "$APP_DIR/src/components"
    install -d -m 755 "$APP_DIR/registration-ops"
    cp "$SOURCE_APP_DIR/Dockerfile.registration-ops" "$SOURCE_APP_DIR/tsconfig.json" "$APP_DIR/"
    cp "$SOURCE_APP_DIR/Dockerfile.cron" "$SOURCE_APP_DIR/crontab" "$APP_DIR/"
    cp "$SOURCE_APP_DIR/deploy-genesis2.sh" "$DEPLOY_SCRIPT"
    cp "$SOURCE_APP_DIR/registration-ops/package.json" "$SOURCE_APP_DIR/registration-ops/bun.lock" \
        "$APP_DIR/registration-ops/"
    cp "$SOURCE_APP_DIR/scripts/production-onboarding-control.sh" "$CONTROL_SCRIPT"
    cp "$SOURCE_APP_DIR/scripts/pending-registration-ops.ts" "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/check-branding-guard.sh" \
        "$SOURCE_APP_DIR/scripts/check-production-staging-isolation.sh" \
        "$SOURCE_APP_DIR/scripts/preflight-messaging-stage1a.sh" \
        "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/preflight-messaging-stage1a.mongo.js" \
        "$SOURCE_APP_DIR/scripts/migrate-chat-read-state-v2.mongo.js" \
        "$SOURCE_APP_DIR/scripts/verify-chat-read-state-v2.mongo.js" \
        "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/postmark-verification-canary.mjs" "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/validate-production-onboarding-activation.py" "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/validate-routing-operator-verifier.py" "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/verify-production-onboarding-runtime.py" "$APP_DIR/scripts/"
    cp "$SOURCE_APP_DIR/scripts/verify-production-application-image.py" \
        "$APP_DIR/scripts/verify-production-application-image.original.py"
    cp "$SOURCE_APP_DIR/src/lib/auth/email-normalization.ts" \
        "$SOURCE_APP_DIR/src/lib/auth/pending-registration.ts" \
        "$SOURCE_APP_DIR/src/lib/auth/pending-registration-reconciliation.ts" \
        "$SOURCE_APP_DIR/src/lib/auth/pending-registration-watchdog-alert.mjs" \
        "$SOURCE_APP_DIR/src/lib/auth/registration-routing.ts" \
        "$APP_DIR/src/lib/auth/"
    cp "$SOURCE_APP_DIR/docker-compose.production-activation.yml" \
        "$SOURCE_APP_DIR/docker-compose.production-maintenance.yml" \
        "$SOURCE_APP_DIR/docker-compose.production-ops.yml" \
        "$APP_DIR/"
    printf 'Kamooni rehearsal fixture\n' >"$APP_DIR/src/app/rehearsal.txt"
    printf 'Kamooni rehearsal fixture\n' >"$APP_DIR/src/components/rehearsal.txt"
    printf 'Kamooni rehearsal fixture\n' >"$APP_DIR/src/lib/rehearsal.txt"
    cmp "$SOURCE_APP_DIR/scripts/production-onboarding-control.sh" "$CONTROL_SCRIPT" || \
        fail "production wrapper copy changed"
    cmp "$SOURCE_APP_DIR/deploy-genesis2.sh" "$DEPLOY_SCRIPT" || fail "deployment script copy changed"
    chmod 755 "$CONTROL_SCRIPT" "$DEPLOY_SCRIPT" "$APP_DIR/scripts/"*.py \
        "$APP_DIR/scripts/check-branding-guard.sh" \
        "$APP_DIR/scripts/check-production-staging-isolation.sh" \
        "$APP_DIR/scripts/preflight-messaging-stage1a.sh"
}

write_fixture_configuration() {
    install -d -m 0777 "$RUNTIME_DIR"
    cat >"$APP_DIR/rehearsal-app.mjs" <<'NODE'
import fs from "node:fs";
import http from "node:http";

if (fs.existsSync("/rehearsal-control/failure")) process.exit(23);
const port = Number(process.env.PORT || process.env.CIRCLES_PORT || 3000);
const gitSha = process.env.GIT_SHA || "unknown";
function sendVersion(response) {
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ version: "rehearsal", gitSha, buildTime: "rehearsal" }));
}
http.createServer((request, response) => {
  if (request.url !== "/api/version") {
    if (
      request.url === "/api/cron/onboarding-watchdog" &&
      request.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: true, status: "skipped", reasons: ["routing_paused"] }));
      return;
    }
    response.writeHead(404).end("not found");
    return;
  }
  try {
    fs.writeFileSync("/rehearsal-runtime/internal-version-requested", gitSha);
  } catch {}
  let holdSha = "";
  try {
    holdSha = fs.readFileSync("/rehearsal-runtime/hold-version-sha", "utf8").trim();
  } catch {}
  if (
    fs.existsSync("/rehearsal-runtime/hold-version-response") &&
    holdSha === gitSha
  ) {
    const deadline = Date.now() + 9000;
    const waitForRelease = () => {
      if (
        fs.existsSync("/rehearsal-runtime/release-version-response") ||
        Date.now() >= deadline
      ) {
        sendVersion(response);
      } else {
        setTimeout(waitForRelease, 50);
      }
    };
    waitForRelease();
    return;
  }
  sendVersion(response);
}).listen(port, "0.0.0.0");
NODE

    cat >"$APP_DIR/Dockerfile.rehearsal-app" <<'DOCKER'
FROM node:20-alpine
WORKDIR /app
ARG GIT_SHA
ARG BUILD_TIME
ARG KAMOONI_DEPLOYMENT_ROLE=production
RUN printf '%s' "$KAMOONI_DEPLOYMENT_ROLE" > /app/.kamooni-deployment-role
RUN printf 'version=rehearsal\ngitSha=%s\nbuildTime=rehearsal\n' "$GIT_SHA" > /app/VERSION
COPY rehearsal-app.mjs /app/rehearsal-app.mjs
USER node
CMD ["node", "/app/rehearsal-app.mjs"]
DOCKER
    cp "$APP_DIR/Dockerfile.rehearsal-app" "$APP_DIR/Dockerfile"

    cat >"$APP_DIR/scripts/verify-production-application-image.py" <<'PY'
#!/usr/bin/env python3
import os
import sys

original = os.path.join(os.path.dirname(__file__), "verify-production-application-image.original.py")
marker = "/root/circles/rehearsal-control/image-validation-failure"
target = "/root/circles/rehearsal-control/image-validation-target"
if os.path.exists(marker) and os.path.exists(target) and len(sys.argv) > 1:
    with open(target, encoding="utf-8") as handle:
        expected_target = handle.read().strip()
    if sys.argv[1] == expected_target:
        raise SystemExit("rehearsal image validation failure")
os.execv(sys.executable, [sys.executable, original, *sys.argv[1:]])
PY
    chmod 755 "$APP_DIR/scripts/verify-production-application-image.py"

    cat >"$CONTROL_DIR/nginx.conf" <<'NGINX'
events {}
http {
    server {
      listen 443 ssl;
      server_name kamooni.org;
    ssl_certificate /run/rehearsal-certs/server.crt;
    ssl_certificate_key /run/rehearsal-certs/server.key;
    location / {
      proxy_pass http://circles:3000;
      proxy_set_header Host kamooni.org;
    }
  }
}
NGINX

    openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
        -keyout "$CONTROL_DIR/server.key" -out "$CONTROL_DIR/server.crt" \
        -subj "/CN=kamooni.org" -addext "subjectAltName=DNS:kamooni.org" >/dev/null 2>&1
    chmod 600 "$CONTROL_DIR/server.key"

    cat >"$APP_DIR/.env" <<'ENV'
CIRCLES_PORT=3000
CIRCLES_NODE_ENV=production
CIRCLES_JWT_SECRET=rehearsal-jwt-not-a-credential
MONGODB_URI=mongodb://rehearsal:rehearsal-not-a-credential@db:27017/circles?authSource=admin
MONGO_PORT=27017
MONGO_ROOT_USERNAME=rehearsal
MONGO_ROOT_PASSWORD=rehearsal-not-a-credential
MINIO_PORT=9000
MINIO_ROOT_USERNAME=rehearsal
MINIO_ROOT_PASSWORD=rehearsal-not-a-credential
CIRCLES_REGISTRY_URL=
POSTMARK_API_TOKEN=rehearsal-not-a-credential
POSTMARK_SENDER_EMAIL=rehearsal@example.invalid
ALTCHA_HMAC_KEY=rehearsal-altcha-not-a-credential
CRON_SECRET=rehearsal-cron-secret-not-a-credential
NEXT_PUBLIC_CHAT_PROVIDER=mongo
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
CIRCLES_URL=https://kamooni.org
ENV

    cat >"$APP_DIR/docker-compose.yml" <<'YAML'
services:
  circles:
    image: circles-circles:latest
    build:
      context: .
      dockerfile: Dockerfile.rehearsal-app
      args:
        KAMOONI_DEPLOYMENT_ROLE: production
        GIT_SHA: ${GIT_SHA:?GIT_SHA is required}
        BUILD_TIME: ${BUILD_TIME:-rehearsal}
    ports:
      - "${CIRCLES_PORT}:${CIRCLES_PORT}"
    env_file:
      - .env
    environment:
      - PORT=${CIRCLES_PORT}
      - NODE_ENV=${CIRCLES_NODE_ENV}
      - CIRCLES_URL=${CIRCLES_URL}
      - EMAIL_TRANSPORT=postmark
      - POSTMARK_API_TOKEN=${POSTMARK_API_TOKEN}
      - POSTMARK_SENDER_EMAIL=${POSTMARK_SENDER_EMAIL}
      - ALTCHA_HMAC_KEY=${ALTCHA_HMAC_KEY}
      - PENDING_REGISTRATION_ENABLED=false
      - PENDING_REGISTRATION_JOURNEY_READY=false
      - PENDING_REGISTRATION_TOKEN_HMAC_KEY=
      - REGISTRATION_DEPLOYMENT_ID=${REGISTRATION_DEPLOYMENT_ID:-}
      - GIT_SHA=${GIT_SHA:?GIT_SHA is required}
    volumes:
      - circles_users:/circles/users
      - /root/circles/rehearsal-control:/rehearsal-control:ro
      - /root/circles/rehearsal-control/runtime:/rehearsal-runtime:rw
    networks:
      - webnet
  db:
    image: mongo:7.0
    command: ["--bind_ip_all", "--auth"]
    env_file:
      - .env
    environment:
      MONGO_INITDB_ROOT_USERNAME: rehearsal
      MONGO_INITDB_ROOT_PASSWORD: rehearsal-not-a-credential
      MONGODB_URI: mongodb://rehearsal:rehearsal-not-a-credential@127.0.0.1:27017/circles?authSource=admin
    tmpfs:
      - /data/db
    networks:
      - webnet
  nginx:
    image: nginx:1.27.4-alpine
    ports:
      - "443:443"
    command:
      - sh
      - -lc
      - test ! -f /run/rehearsal-certs/nginx-failure && exec nginx -g 'daemon off;'
    volumes:
      - /root/circles/rehearsal-control/nginx.conf:/etc/nginx/nginx.conf:ro
      - /root/circles/rehearsal-control:/run/rehearsal-certs:ro
    depends_on:
      - circles
    networks:
      - webnet
  cron:
    build:
      context: .
      dockerfile: Dockerfile.cron
    restart: "no"
    env_file:
      - .env
    depends_on:
      - circles
    networks:
      - webnet
volumes:
  circles_users:
    name: circles_users
networks:
  webnet:
    name: circles_webnet
YAML
}

initialize_fake_git_repository() {
    git init --bare -q "$ORIGIN_BARE"
    git -C "$EXPECTED_REPO_DIR" init -q -b main
    git -C "$EXPECTED_REPO_DIR" config user.name "Kamooni Rehearsal"
    git -C "$EXPECTED_REPO_DIR" config user.email "rehearsal@example.invalid"
    git -C "$EXPECTED_REPO_DIR" remote add origin https://github.com/Social-Systems-Lab/circles.git
    git -C "$EXPECTED_REPO_DIR" config \
        "url.file://$ORIGIN_BARE.insteadOf" https://github.com/Social-Systems-Lab/circles.git
    export GIT_ALLOW_PROTOCOL=file
    git -C "$EXPECTED_REPO_DIR" add .
    git -C "$EXPECTED_REPO_DIR" commit -qm "disposable production onboarding rehearsal"
    git -C "$EXPECTED_REPO_DIR" push -qu origin main
    git -C "$EXPECTED_REPO_DIR" update-ref refs/remotes/origin/main HEAD
    git --git-dir="$ORIGIN_BARE" symbolic-ref HEAD refs/heads/main
    [[ "$(git -C "$EXPECTED_REPO_DIR" remote get-url origin)" == \
        "https://github.com/Social-Systems-Lab/circles.git" ]] || fail "rehearsal origin identity changed"
    git -C "$EXPECTED_REPO_DIR" ls-remote origin refs/heads/main >/dev/null 2>&1 || \
        fail "local rewritten rehearsal origin is not readable with file-only Git transport"
}

prepare_fake_credentials() {
    umask 077
    local hmac operator_token
    hmac="$(openssl rand -hex 32)"
    operator_token="$(openssl rand -hex 32)"
    printf 'PENDING_REGISTRATION_TOKEN_HMAC_KEY=%s\nREGISTRATION_DEPLOYMENT_ID=production-onboarding-20261113-rehearsal-01\nONBOARDING_ALERT_EMAIL=onboarding-alerts@kamooni.invalid\n' \
        "$hmac" >"$SECRET_DIR/activation.env"
    printf '%s' "$operator_token" | sha256sum | awk '{print $1}' >"$SECRET_DIR/routing-operator.sha256"
    cp "$SECRET_DIR/activation.env" "$CONTROL_DIR/activation.env.snapshot"
    chmod 600 "$SECRET_DIR/activation.env" "$SECRET_DIR/routing-operator.sha256" \
        "$CONTROL_DIR/activation.env.snapshot"
    printf '%s\n' "$hmac" >"$CONTROL_DIR/.hmac"
    printf '%s\n' "$operator_token" >"$CONTROL_DIR/.operator-token"
    chmod 600 "$CONTROL_DIR/.hmac" "$CONTROL_DIR/.operator-token"
    unset hmac operator_token
}

write_response_file() {
    local path="$1"
    shift
    printf '%s\n' "$@" >"$path"
    chmod 600 "$path"
}

run_pty_wrapper() {
    local responses="$1"
    shift
    python3 "$PTY_HELPER" --responses "$responses" -- "$CONTROL_SCRIPT" "$@"
}

run_pty_command() {
    local responses="$1"
    shift
    python3 "$PTY_HELPER" --responses "$responses" -- "$@"
}

route_mode() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval \
        'const row=db.registrationRouting.findOne({_id:"registration-routing"}); print(row ? row.mode : "legacy")'
}

assert_route() {
    local expected="$1" actual
    actual="$(route_mode)"
    [[ "$actual" == "$expected" ]] || fail "expected route $expected, found $actual"
}

wait_for_external_version() {
    local expected="$1" output
    for _ in $(seq 1 30); do
        if output="$(curl -fsSL "https://$PUBLIC_HOST/api/version" 2>/dev/null)" && \
            python3 - "$expected" "$output" <<'PY'
import json
import sys
raise SystemExit(0 if json.loads(sys.argv[2]).get("gitSha") == sys.argv[1] else 1)
PY
        then
            return 0
        fi
        sleep 1
    done
    return 1
}

wait_for_mongo() {
    for _ in $(seq 1 60); do
        if "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval \
            'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

container_id() {
    local id
    id="$("${BASE_COMPOSE[@]}" ps -q circles)"
    [[ -n "$id" ]] || return 1
    printf '%s\n' "$id"
}

assert_running_services() {
    [[ -n "$("${BASE_COMPOSE[@]}" ps --status running -q circles)" && \
        -n "$("${BASE_COMPOSE[@]}" ps --status running -q nginx)" ]] || \
        fail "expected circles and nginx to remain running"
}

assert_pending_email_preserved() {
    local pending
    pending="$("${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval \
        'db.pendingRegistrations.countDocuments({normalizedEmail:"rehearsal-pending@example.invalid",status:"pending_email"})')"
    [[ "$pending" == "1" ]] || fail "synthetic pending_email registration was altered"
}

assert_synthetic_identity_preserved() {
    local accounts reservations
    accounts="$("${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval \
        'db.circles.countDocuments({did:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"})')"
    reservations="$("${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval \
        'db.pendingRegistrationDidReservations.countDocuments({_id:"rehearsal-preserved-did"})')"
    [[ "$accounts" == "1" && "$reservations" == "1" ]] || \
        fail "synthetic account or DID reservation was altered"
}

seed_synthetic_data() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval '
db.pendingRegistrations.insertOne({
  name: "Rehearsal Pending",
  email: "rehearsal-pending@example.invalid",
  normalizedEmail: "rehearsal-pending@example.invalid",
  requestedHandle: "rehearsal-pending",
  status: "pending_email",
  expiresAt: new Date(Date.now() + 86400000)
});
db.pendingRegistrationDidReservations.insertOne({
  _id: "rehearsal-preserved-did",
  did: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  createdAt: new Date()
});
db.circles.insertOne({
  name: "Rehearsal Synthetic Account",
  did: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  email: "rehearsal-account@example.invalid"
});
' >/dev/null
}

clear_unfinished_pending_for_reactivation() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval '
db.pendingRegistrations.deleteOne({normalizedEmail:"rehearsal-pending@example.invalid"});
' >/dev/null
}

insert_active_locks() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval '
const expiresAt = new Date(Date.now() + 300000);
db.pendingRegistrationProvisioningLocks.insertOne({_id:"rehearsal-provisioning-lock",expiresAt});
db.pendingRegistrationFinalizationLocks.insertOne({_id:"rehearsal-finalization-lock",expiresAt});
' >/dev/null
}

expire_active_locks() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval '
const expiredAt = new Date(Date.now() - 60000);
db.pendingRegistrationProvisioningLocks.updateMany({}, {$set:{expiresAt:expiredAt}});
db.pendingRegistrationFinalizationLocks.updateMany({}, {$set:{expiresAt:expiredAt}});
' >/dev/null
}

assert_activation_state_preserved() {
    cmp "$SECRET_DIR/activation.env" "$CONTROL_DIR/activation.env.snapshot" || \
        fail "activation HMAC or deployment ID changed"
}

assert_no_app_host_port() {
    local id
    id="$(container_id)" || fail "application container is missing for host-port verification"
    [[ -z "$(docker port "$id")" ]] || fail "maintenance application still publishes a host port"
}

assert_public_services_stopped() {
    [[ -z "$("${BASE_COMPOSE[@]}" ps --status running -q circles nginx)" ]] || \
        fail "failed paused deployment did not keep public services stopped"
}

seed_pending_email() {
    "${BASE_COMPOSE[@]}" exec -T db mongosh "$REHEARSAL_MONGO_URI" --quiet --eval '
db.pendingRegistrations.insertOne({
  name: "Rehearsal Pending",
  email: "rehearsal-pending@example.invalid",
  normalizedEmail: "rehearsal-pending@example.invalid",
  requestedHandle: "rehearsal-pending",
  status: "pending_email",
  expiresAt: new Date(Date.now() + 86400000)
});
' >/dev/null
}

advance_fake_origin() {
    local label="$1" branch="candidate-$1" sha
    git -C "$EXPECTED_REPO_DIR" switch -q -c "$branch"
    printf '%s\n' "$label" >"$EXPECTED_REPO_DIR/REHEARSAL_RELEASE"
    git -C "$EXPECTED_REPO_DIR" add REHEARSAL_RELEASE
    git -C "$EXPECTED_REPO_DIR" commit -qm "rehearsal candidate $label"
    sha="$(git -C "$EXPECTED_REPO_DIR" rev-parse HEAD)"
    git -C "$EXPECTED_REPO_DIR" push -q origin HEAD:main
    git -C "$EXPECTED_REPO_DIR" update-ref refs/remotes/origin/main "$sha"
    git -C "$EXPECTED_REPO_DIR" switch -q main
    printf '%s\n' "$sha" >"$CONTROL_DIR/image-validation-target"
    chmod 600 "$CONTROL_DIR/image-validation-target"
    printf '%s\n' "$sha"
}

run_paused_deploy() {
    local log="$1"
    (
        cd "$EXPECTED_REPO_DIR"
        run_pty_command "$CONTROL_DIR/deploy.responses" "$CONTROL_SCRIPT" deploy-paused-services
    ) >"$log" 2>&1
}

start_paused_deploy_background() {
    local log="$1"
    (
        cd "$EXPECTED_REPO_DIR"
        run_pty_command "$CONTROL_DIR/deploy.responses" "$CONTROL_SCRIPT" deploy-paused-services
    ) >"$log" 2>&1 &
    DEPLOY_PID=$!
}

wait_for_internal_version_request() {
    local pid="$1" expected_sha="$2"
    for _ in $(seq 1 240); do
        if [[ -f "$RUNTIME_DIR/internal-version-requested" ]] && \
            [[ "$(cat "$RUNTIME_DIR/internal-version-requested" 2>/dev/null)" == "$expected_sha" ]]; then
            return 0
        fi
        kill -0 "$pid" 2>/dev/null || return 1
        sleep 0.5
    done
    return 1
}

require_disposable_environment
trap cleanup EXIT
install_fixture_files
write_fixture_configuration
initialize_fake_git_repository
prepare_fake_credentials

HOSTS_ENTRY_ADDED=true
printf '127.0.0.1 kamooni.org\n' >>/etc/hosts
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
export NO_PROXY="kamooni.org,localhost,127.0.0.1"
export no_proxy="$NO_PROXY"
export CURL_CA_BUNDLE="$CONTROL_DIR/server.crt"
export KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM="AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL"

export GIT_SHA="$(git -C "$EXPECTED_REPO_DIR" rev-parse HEAD)"
"${BASE_COMPOSE[@]}" build circles >/dev/null
"${BASE_COMPOSE[@]}" up -d --no-deps db circles nginx >/dev/null
wait_for_mongo || fail "fixture MongoDB did not become ready"
wait_for_external_version "$GIT_SHA" || fail "fixture application did not become reachable"

"$CONTROL_SCRIPT" build-operator >/dev/null
"$CONTROL_SCRIPT" preflight >/dev/null

operator_token="$(cat "$CONTROL_DIR/.operator-token")"
write_response_file "$CONTROL_DIR/prepare.responses" \
    "Type PREPARE_PENDING_REGISTRATION_INDEXES to continue:	PREPARE_PENDING_REGISTRATION_INDEXES" \
    "Routing operator token:	$operator_token"
run_pty_wrapper "$CONTROL_DIR/prepare.responses" prepare-indexes >/dev/null

write_response_file "$CONTROL_DIR/route.responses" "Routing operator token:	$operator_token"
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set legacy paused none REHEARSAL >/dev/null
assert_route paused

"$CONTROL_SCRIPT" activate-services >/dev/null

hmac="$(cat "$CONTROL_DIR/.hmac")"
printf '%s' "$hmac" | sha256sum | awk '{print $1}' >"$SECRET_DIR/routing-operator.sha256"
write_response_file "$CONTROL_DIR/collision.responses" "Routing operator token:	$hmac"
if run_pty_wrapper "$CONTROL_DIR/collision.responses" route-set paused pending activation REHEARSAL >/dev/null 2>&1; then
    fail "wrapper accepted identical operator token and activation HMAC"
fi
assert_route paused
printf '%s' "$operator_token" | sha256sum | awk '{print $1}' >"$SECRET_DIR/routing-operator.sha256"
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set paused pending activation REHEARSAL >/dev/null
assert_route pending

seed_synthetic_data
insert_active_locks

git -C "$EXPECTED_REPO_DIR" switch -q -c origin-ahead
printf 'upstream only\n' >"$EXPECTED_REPO_DIR/UPSTREAM_ONLY"
git -C "$EXPECTED_REPO_DIR" add UPSTREAM_ONLY
git -C "$EXPECTED_REPO_DIR" commit -qm "simulate origin/main advance"
git -C "$EXPECTED_REPO_DIR" update-ref refs/remotes/origin/main HEAD
git -C "$EXPECTED_REPO_DIR" switch -q main

"$CONTROL_SCRIPT" status >/dev/null
"$CONTROL_SCRIPT" inspect >/dev/null
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set pending paused none REHEARSAL >/dev/null
assert_route paused

circles_before="$(container_id)"
nginx_before="$("${BASE_COMPOSE[@]}" ps -q nginx)"
if "$CONTROL_SCRIPT" deactivate-services >/dev/null 2>&1; then
    fail "deactivation succeeded while active provisioning locks existed"
fi
[[ "$(container_id)" == "$circles_before" && "$("${BASE_COMPOSE[@]}" ps -q nginx)" == "$nginx_before" ]] || \
    fail "failed lock-gated deactivation mutated public services"
assert_running_services

expire_active_locks
"$CONTROL_SCRIPT" deactivate-services >/dev/null
assert_pending_email_preserved
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set paused legacy none REHEARSAL >/dev/null
assert_route legacy

git -C "$EXPECTED_REPO_DIR" update-ref refs/remotes/origin/main "$GIT_SHA"
clear_unfinished_pending_for_reactivation
touch "$CONTROL_DIR/failure"
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set legacy paused none REHEARSAL >/dev/null
if "$CONTROL_SCRIPT" activate-services >/dev/null 2>&1; then
    fail "fault-injected activation unexpectedly succeeded"
fi
assert_route paused
assert_synthetic_identity_preserved
[[ -z "$("${BASE_COMPOSE[@]}" ps --status running -q circles nginx)" ]] || \
    fail "failed activation did not leave failed-closed public services stopped"

write_response_file "$CONTROL_DIR/recovery.responses" \
    "Type RECOVER_DEFAULT_SERVICES to continue:	RECOVER_DEFAULT_SERVICES"
if run_pty_wrapper "$CONTROL_DIR/recovery.responses" recover-default-services >/dev/null 2>&1; then
    fail "recovery unexpectedly succeeded while the application failure remained injected"
fi
assert_route paused
assert_synthetic_identity_preserved
[[ -z "$("${BASE_COMPOSE[@]}" ps --status running -q circles nginx)" ]] || \
    fail "failed recovery did not leave failed-closed public services stopped"

rm -f "$CONTROL_DIR/failure"
run_pty_wrapper "$CONTROL_DIR/recovery.responses" recover-default-services >/dev/null
assert_route paused
assert_synthetic_identity_preserved
wait_for_external_version "$GIT_SHA" || fail "recovery did not expose the default application"
run_pty_wrapper "$CONTROL_DIR/route.responses" route-set paused legacy none REHEARSAL >/dev/null
assert_route legacy
assert_synthetic_identity_preserved

export GIT_ALLOW_PROTOCOL=file
write_response_file "$CONTROL_DIR/deploy.responses" \
    "Type DEPLOY_PAUSED_ONBOARDING_SERVICES to continue:	DEPLOY_PAUSED_ONBOARDING_SERVICES"

run_pty_wrapper "$CONTROL_DIR/route.responses" route-set legacy paused none REHEARSAL >/dev/null
assert_route paused
"$CONTROL_SCRIPT" activate-services >/dev/null
seed_pending_email
assert_pending_email_preserved
assert_activation_state_preserved

image_failure_sha="$(advance_fake_origin image-failure)"
touch "$CONTROL_DIR/image-validation-failure"
circles_before="$(container_id)"
nginx_before="$("${BASE_COMPOSE[@]}" ps -q nginx)"
if run_paused_deploy "$CONTROL_DIR/deploy-image-failure.log"; then
    fail "paused deployment unexpectedly succeeded during image-validation fault injection"
fi
[[ "$(container_id)" == "$circles_before" && "$("${BASE_COMPOSE[@]}" ps -q nginx)" == "$nginx_before" ]] || \
    fail "image-validation failure replaced the running application or NGINX"
assert_route paused
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved
"$CONTROL_SCRIPT" status >/dev/null

rm -f "$CONTROL_DIR/image-validation-failure" "$RUNTIME_DIR/internal-version-requested" \
    "$RUNTIME_DIR/release-version-response"
printf '%s\n' "$image_failure_sha" >"$RUNTIME_DIR/hold-version-sha"
touch "$RUNTIME_DIR/hold-version-response"
chmod 644 "$RUNTIME_DIR/hold-version-sha" "$RUNTIME_DIR/hold-version-response"
start_paused_deploy_background "$CONTROL_DIR/deploy-image-retry.log"
wait_for_internal_version_request "$DEPLOY_PID" "$image_failure_sha" || \
    fail "retry deployment did not verify the internal application"
[[ -z "$("${BASE_COMPOSE[@]}" ps --status running -q nginx)" ]] || \
    fail "NGINX reopened before paused application verification"
assert_no_app_host_port
touch "$RUNTIME_DIR/release-version-response"
set +e
wait "$DEPLOY_PID"
deploy_status=$?
set -e
[[ "$deploy_status" -eq 0 ]] || fail "paused deployment retry failed after image-validation recovery"
rm -f "$RUNTIME_DIR/hold-version-sha" "$RUNTIME_DIR/hold-version-response" \
    "$RUNTIME_DIR/release-version-response"
wait_for_external_version "$image_failure_sha" || fail "retry deployment did not expose the approved SHA"
assert_route paused
assert_no_app_host_port
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved

startup_failure_sha="$(advance_fake_origin startup-failure)"
touch "$CONTROL_DIR/failure"
if run_paused_deploy "$CONTROL_DIR/deploy-startup-failure.log"; then
    fail "paused deployment unexpectedly succeeded during application startup fault injection"
fi
assert_route paused
assert_public_services_stopped
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved

rm -f "$CONTROL_DIR/failure"
run_pty_wrapper "$CONTROL_DIR/recovery.responses" recover-default-services >/dev/null
assert_route paused
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved
wait_for_external_version "$startup_failure_sha" || fail "startup-failure recovery did not expose the approved SHA"
clear_unfinished_pending_for_reactivation
"$CONTROL_SCRIPT" activate-services >/dev/null
seed_pending_email

nginx_failure_sha="$(advance_fake_origin nginx-failure)"
touch "$CONTROL_DIR/nginx-failure"
if run_paused_deploy "$CONTROL_DIR/deploy-nginx-failure.log"; then
    fail "paused deployment unexpectedly succeeded during NGINX fault injection"
fi
assert_route paused
assert_no_app_host_port
[[ -z "$("${BASE_COMPOSE[@]}" ps --status running -q nginx)" ]] || \
    fail "NGINX failure verification left NGINX running"
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved

rm -f "$CONTROL_DIR/nginx-failure"
run_paused_deploy "$CONTROL_DIR/deploy-nginx-retry.log" || fail "paused deployment retry failed after NGINX recovery"
wait_for_external_version "$nginx_failure_sha" || fail "NGINX retry did not expose the approved SHA"
assert_route paused
assert_no_app_host_port
assert_pending_email_preserved
assert_synthetic_identity_preserved
assert_activation_state_preserved

echo "Disposable production onboarding activation, rollback and paused-deployment rehearsal passed."
