#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE="mongo:7.0"
TEST_ID="${UID:-1000}-$$"
CONTAINER="kamooni-pending-crash-test-${TEST_ID}"
DATABASE="circles_stage1a_test_pending_m1_${TEST_ID}"
CONTAINER_CREATED=false

cleanup() {
    if [[ "$CONTAINER_CREATED" == true ]]; then
        docker stop "$CONTAINER" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Refusing to reuse existing container $CONTAINER." >&2
    exit 1
fi

docker run --detach --rm \
    --name "$CONTAINER" \
    --memory 512m \
    --cpus 1 \
    --publish 127.0.0.1:27019:27017 \
    "$IMAGE" --bind_ip_all >/dev/null
CONTAINER_CREATED=true

ready=false
for _ in $(seq 1 45); do
    if docker exec "$CONTAINER" mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null | rg -q '^1$'; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "Disposable MongoDB did not become ready." >&2
    exit 1
fi

cd "$APP_DIR"
MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
MONGO_HOST=127.0.0.1 \
MONGO_PORT=27019 \
MONGO_ROOT_USERNAME= \
MONGO_ROOT_PASSWORD= \
CIRCLES_MONGODB_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TEST_MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
PENDING_REGISTRATION_TEST_DATABASE="$DATABASE" \
NODE_ENV=test \
IS_BUILD=true \
    bun src/lib/auth/pending-registration-crash.integration.test.ts

MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
MONGO_HOST=127.0.0.1 \
MONGO_PORT=27019 \
MONGO_ROOT_USERNAME= \
MONGO_ROOT_PASSWORD= \
CIRCLES_MONGODB_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TEST_MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
PENDING_REGISTRATION_TEST_DATABASE="$DATABASE" \
NODE_ENV=test \
IS_BUILD=true \
    bun src/lib/auth/pending-registration.integration.test.ts

echo "Disposable pending-registration crash tests completed; MongoDB container will be removed on exit."
