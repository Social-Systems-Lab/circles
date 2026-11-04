#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE="axllent/mailpit:v1.33.0"
TEST_ID="${UID:-1000}-$$"
CONTAINER="kamooni-mailpit-test-${TEST_ID}"
CONTAINER_CREATED=false

cleanup() {
    if [[ "$CONTAINER_CREATED" == true ]]; then
        docker rm --force "$CONTAINER" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Refusing to reuse existing container $CONTAINER." >&2
    exit 1
fi
docker run --detach --rm \
    --name "$CONTAINER" \
    --memory 256m \
    --cpus 1 \
    --publish 127.0.0.1:18025:8025 \
    --publish 127.0.0.1:11025:1025 \
    --env MP_MAX_MESSAGES=10 \
    --env MP_MAX_AGE=1h \
    --env MP_SMTP_RELAY_ALL=false \
    --env MP_SMTP_RELAY_CONFIG= \
    --env MP_SMTP_FORWARD_CONFIG= \
    "$IMAGE" >/dev/null
CONTAINER_CREATED=true

ready=false
for _ in $(seq 1 30); do
    if curl --fail --silent --show-error http://127.0.0.1:18025/ >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "Disposable Mailpit did not become ready." >&2
    exit 1
fi

cd "$APP_DIR"
NODE_ENV=test \
EMAIL_TRANSPORT=mailpit \
MAILPIT_SMTP_HOST=127.0.0.1 \
MAILPIT_SMTP_PORT=11025 \
POSTMARK_API_TOKEN= \
POSTMARK_SENDER_EMAIL= \
CIRCLES_URL=http://127.0.0.1:3000 \
MAILPIT_HTTP_URL=http://127.0.0.1:18025 \
IS_BUILD=true \
    bun test src/lib/data/email.mailpit.integration.test.ts
