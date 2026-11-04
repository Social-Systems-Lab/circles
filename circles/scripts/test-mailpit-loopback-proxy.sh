#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ID="${UID:-1000}-$$"
SMTP_NETWORK="kamooni-mailpit-smtp-test-$TEST_ID"
UI_NETWORK="kamooni-mailpit-ui-test-$TEST_ID"
MAILPIT_CONTAINER="kamooni-mailpit-sink-test-$TEST_ID"
PROXY_CONTAINER="kamooni-mailpit-ui-test-$TEST_ID"
MAILPIT_IMAGE="axllent/mailpit:v1.33.0"
PROXY_IMAGE="nginx:1.27.4-alpine@sha256:4ff102c5d78d254a6f0da062b3cf39eaf07f01eec0927fd21e219d0af8bc0591"

cleanup() {
    docker rm --force "$PROXY_CONTAINER" "$MAILPIT_CONTAINER" >/dev/null 2>&1 || true
    docker network rm "$UI_NETWORK" "$SMTP_NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create --internal "$SMTP_NETWORK" >/dev/null
docker network create \
    --opt com.docker.network.bridge.enable_ip_masquerade=false \
    "$UI_NETWORK" >/dev/null

docker run --detach --name "$MAILPIT_CONTAINER" \
    --network "$SMTP_NETWORK" --network-alias mailpit \
    --env MP_SMTP_RELAY_ALL=false \
    --env MP_SMTP_RELAY_CONFIG= \
    --env MP_SMTP_FORWARD_CONFIG= \
    "$MAILPIT_IMAGE" >/dev/null

docker create --name "$PROXY_CONTAINER" \
    --network "$UI_NETWORK" \
    --publish 127.0.0.1::8025 \
    --mount "type=bind,source=$APP_DIR/nginx/mailpit-ui.staging.conf,target=/etc/nginx/nginx.conf,readonly" \
    --user 101:101 \
    --read-only \
    --tmpfs /tmp \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    "$PROXY_IMAGE" >/dev/null
docker network connect --gw-priority -1 "$SMTP_NETWORK" "$PROXY_CONTAINER"
docker start "$PROXY_CONTAINER" >/dev/null

ready=false
for _ in $(seq 1 30); do
    if [[ "$(docker inspect --format '{{.State.Status}}' "$PROXY_CONTAINER")" == running ]]; then
        ready=true
        break
    fi
    sleep 1
done
[[ "$ready" == true ]] || { docker logs "$PROXY_CONTAINER" >&2; exit 1; }

UI_BINDING="$(docker port "$PROXY_CONTAINER" 8025/tcp)"
[[ "$UI_BINDING" == 127.0.0.1:* ]]
UI_PORT="${UI_BINDING##*:}"
curl --max-time 5 --fail --silent --show-error "http://127.0.0.1:$UI_PORT/" >/dev/null

printf '%s\n' \
    'From: synthetic@staging.invalid' \
    'To: recipient@staging.invalid' \
    'Subject: isolated Mailpit UI proxy test' \
    '' \
    'Synthetic test message only.' |
    docker exec -i "$MAILPIT_CONTAINER" /mailpit sendmail recipient@staging.invalid

CAPTURE_COUNT="$(
    curl --max-time 5 --fail --silent --show-error "http://127.0.0.1:$UI_PORT/api/v1/messages" |
        python3 -c 'import json,sys; d=json.load(sys.stdin); a=d.get("messages",d.get("Messages",[])); print(sum((m.get("Subject") or m.get("subject")) == "isolated Mailpit UI proxy test" for m in a))'
)"
[[ "$CAPTURE_COUNT" == 1 ]]
[[ -z "$(docker port "$MAILPIT_CONTAINER")" ]]
[[ "$(docker port "$PROXY_CONTAINER" | wc -l | tr -d ' ')" == 1 ]]
if docker exec "$MAILPIT_CONTAINER" wget -T 3 -qO- http://example.com >/dev/null 2>&1; then
    echo "Mailpit unexpectedly has external HTTP egress." >&2
    exit 1
fi

echo "Mailpit loopback proxy isolation test passed."
