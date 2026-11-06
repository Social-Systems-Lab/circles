#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE="mongo:7.0"
TEST_ID="${UID:-1000}-$$"
CONTAINER="kamooni-pending-crash-test-${TEST_ID}"
DATABASE="circles_stage1a_test_pending_m1_${TEST_ID}"
CONTAINER_CREATED=false
TMP_BASE="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
TEST_APP_DIR="$(mktemp -d "$TMP_BASE/kamooni-pending-m2b-app.XXXXXX")"
TEST_APP_DIR="$(cd -- "$TEST_APP_DIR" && pwd -P)"
case "$TEST_APP_DIR/" in
    "$REPO_DIR/"*) echo "Refusing to use a project-local APP_DIR." >&2; exit 1 ;;
esac

cleanup() {
    local cleanup_status=0
    if [[ "$CONTAINER_CREATED" == true ]]; then
        if ! docker stop "$CONTAINER" >/dev/null; then
            echo "Failed to stop disposable MongoDB container $CONTAINER." >&2
            cleanup_status=1
        else
            removed=false
            for _ in $(seq 1 50); do
                if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
                    removed=true
                    CONTAINER_CREATED=false
                    break
                fi
                sleep 0.1
            done
            if [[ "$removed" != true ]]; then
                echo "Disposable MongoDB container $CONTAINER remains after stop." >&2
                cleanup_status=1
            fi
        fi
    fi
    case "$TEST_APP_DIR" in
        "$TMP_BASE"/kamooni-pending-m2b-app.*) rm -rf -- "$TEST_APP_DIR" ;;
        *) echo "Refusing unsafe test APP_DIR cleanup: $TEST_APP_DIR" >&2; cleanup_status=1 ;;
    esac
    return "$cleanup_status"
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

cd "$REPO_DIR"
MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
MONGO_HOST=127.0.0.1 \
MONGO_PORT=27019 \
MONGO_ROOT_USERNAME= \
MONGO_ROOT_PASSWORD= \
CIRCLES_MONGODB_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TEST_MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
PENDING_REGISTRATION_TEST_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TOKEN_HMAC_KEY=disposable-integration-test-only \
NODE_ENV=test \
APP_DIR="$TEST_APP_DIR" \
IS_BUILD=false \
    bun src/lib/auth/pending-registration-crash.integration.test.ts

MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
MONGO_HOST=127.0.0.1 \
MONGO_PORT=27019 \
MONGO_ROOT_USERNAME= \
MONGO_ROOT_PASSWORD= \
CIRCLES_MONGODB_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TEST_MONGODB_URI="mongodb://127.0.0.1:27019/$DATABASE" \
PENDING_REGISTRATION_TEST_DATABASE="$DATABASE" \
PENDING_REGISTRATION_TOKEN_HMAC_KEY=disposable-integration-test-only \
NODE_ENV=test \
APP_DIR="$TEST_APP_DIR" \
IS_BUILD=false \
    bun src/lib/auth/pending-registration.integration.test.ts

echo "Disposable pending-registration crash tests completed; MongoDB container will be removed on exit."
