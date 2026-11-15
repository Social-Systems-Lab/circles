#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ID="${UID:-1000}-$$"
MONGO_CONTAINER="kamooni-watchdog-mongo-${TEST_ID}"
MINIO_CONTAINER="kamooni-watchdog-minio-${TEST_ID}"
DATABASE="circles_stage1a_test_watchdog_${TEST_ID//-/_}"
TMP_BASE="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
USERS_DIR="$(mktemp -d "$TMP_BASE/kamooni-watchdog-users.XXXXXX")"
USERS_DIR="$(cd -- "$USERS_DIR" && pwd -P)"
MONGO_CREATED=false
MINIO_CREATED=false
MINIO_USER="watchdog_test"
MINIO_PASSWORD="$(openssl rand -hex 24)"

cleanup() {
    local cleanup_status=0
    if [[ "$MINIO_CREATED" == true ]]; then
        docker rm -f "$MINIO_CONTAINER" >/dev/null || cleanup_status=1
    fi
    if [[ "$MONGO_CREATED" == true ]]; then
        docker rm -f "$MONGO_CONTAINER" >/dev/null || cleanup_status=1
    fi
    case "$USERS_DIR" in
        "$TMP_BASE"/kamooni-watchdog-users.*) rm -rf -- "$USERS_DIR" ;;
        *) echo "Refusing unsafe test directory cleanup: $USERS_DIR" >&2; cleanup_status=1 ;;
    esac
    return "$cleanup_status"
}
trap cleanup EXIT

for container in "$MONGO_CONTAINER" "$MINIO_CONTAINER"; do
    if docker container inspect "$container" >/dev/null 2>&1; then
        echo "Refusing to reuse existing container $container." >&2
        exit 1
    fi
done

docker run --detach \
    --name "$MONGO_CONTAINER" \
    --memory 1g \
    --cpus 1 \
    --tmpfs /data/db:rw,nosuid,nodev,size=1g \
    --publish 127.0.0.1:27029:27017 \
    mongo:7.0 --bind_ip_all >/dev/null
MONGO_CREATED=true

docker run --detach \
    --name "$MINIO_CONTAINER" \
    --memory 512m \
    --cpus 1 \
    --tmpfs /data:rw,nosuid,nodev,size=256m \
    --publish 127.0.0.1:29001:9000 \
    --env MINIO_ROOT_USER="$MINIO_USER" \
    --env MINIO_ROOT_PASSWORD="$MINIO_PASSWORD" \
    minio/minio:latest server /data >/dev/null
MINIO_CREATED=true

mongo_ready=false
minio_ready=false
for _ in $(seq 1 45); do
    mongo_ping="$(docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null || true)"
    if [[ "$mongo_ping" == "1" ]]; then
        mongo_ready=true
    fi
    if curl -fsS http://127.0.0.1:29001/minio/health/live >/dev/null 2>&1; then
        minio_ready=true
    fi
    if [[ "$mongo_ready" == true && "$minio_ready" == true ]]; then break; fi
    sleep 1
done
if [[ "$mongo_ready" != true || "$minio_ready" != true ]]; then
    echo "Disposable watchdog MongoDB/MinIO services did not become ready." >&2
    docker logs --tail 80 "$MONGO_CONTAINER" >&2 || true
    docker logs --tail 80 "$MINIO_CONTAINER" >&2 || true
    exit 1
fi

cd "$REPO_DIR"
MONGODB_URI="mongodb://127.0.0.1:27029/$DATABASE" \
CIRCLES_MONGODB_DATABASE="$DATABASE" \
MINIO_HOST=127.0.0.1 \
MINIO_PORT=29001 \
MINIO_ROOT_USERNAME="$MINIO_USER" \
MINIO_ROOT_PASSWORD="$MINIO_PASSWORD" \
ONBOARDING_USERS_DIR="$USERS_DIR" \
ONBOARDING_WATCHDOG_INTEGRATION_TEST=1 \
NODE_ENV=test \
IS_BUILD=false \
VDB_ENABLED=false \
    bun test src/lib/auth/onboarding-watchdog.integration.test.ts

echo "Disposable onboarding watchdog fault-injection test passed; containers and temporary credentials are being removed."
