#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
deploy="$repo_dir/deploy-genesis2.sh"
control="$repo_dir/scripts/production-onboarding-control.sh"
validator="$repo_dir/scripts/validate-production-onboarding-activation.py"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-paused-deploy-test.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

bash -n "$deploy"
bash -n "$control"

assert_order() {
    local first="$1" second="$2" first_line second_line
    first_line="$(grep -nF -- "$first" "$deploy" | head -1 | cut -d: -f1)"
    second_line="$(grep -nF -- "$second" "$deploy" | head -1 | cut -d: -f1)"
    [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]] || \
        fail "paused deployment ordering failed: $first before $second"
}

grep -Fq 'DEPLOY_MODE="paused-onboarding"' "$deploy"
grep -Fq 'Error: normal production deployment requires routing mode legacy with no deployment ID.' "$deploy"
grep -Fq 'paused onboarding deployment requires routing mode paused with no deployment ID' "$deploy"
grep -Fq 'require_paused_operations_idle' "$deploy"
grep -Fq 'operations-idle' "$deploy"
grep -Fq 'activation-compose-json' "$deploy"
grep -Fq 'no-published-ports-json' "$deploy"
grep -Fq 'separation' "$deploy"
grep -Fq 'verify_application_image_identity' "$deploy"
grep -Fq 'verify_paused_application_runtime' "$deploy"
grep -Fq 'verify_registration_routing_paused' "$deploy"
grep -Fq 'recreate_and_verify_cron' "$deploy"
grep -Fq '^\*/5 .*\/api\/cron\/onboarding-watchdog' "$deploy"
grep -Fq 'require_application_cron_secret "$active_container_id"' "$deploy"
grep -Fq 'PAUSED_APPLICATION_COMPOSE=("${ACTIVATION_COMPOSE[@]}" -f "$MAINTENANCE_COMPOSE_FILE")' "$deploy"
grep -Fq 'no-published-ports >/dev/null' "$deploy"
grep -Fq '"$RUNTIME_VALIDATOR" activation "$PAUSED_DEPLOYMENT_ID" "$ACTIVATION_ENV_FILE"' "$deploy"
grep -Fq 'active_image_id="$(active_application_image_id "$active_container_id")"' "$deploy"
grep -Fq 'PAUSED_APPLICATION_VERIFIED=true' "$deploy"
grep -Fq 'exec "$APP_DIR/deploy-genesis2.sh" main --paused-onboarding' "$control"

if grep -Eq -- 'route-set|docker compose down|docker volume rm|rm -rf' "$deploy"; then
    fail "paused deployment contains a routing, container-stack, volume, or broad deletion operation"
fi
if grep -Fq 'active application image does not match circles-circles:latest' "$deploy"; then
    fail "paused deployment still ties the active container to the mutable latest tag"
fi
if grep -Eq -- 'pendingRegistrations.*(?:update|delete|insert)|pendingRegistrationDidReservations.*(?:update|delete|insert)' "$deploy"; then
    fail "paused deployment contains a pending-registration or DID-reservation mutation"
fi

assert_order '  require_paused_operations_idle' '"${BASE_COMPOSE[@]}" build circles cron'
assert_order '"${BASE_COMPOSE[@]}" build circles cron' \
    'verify_application_image_identity "$PAUSED_EXPECTED_IMAGE_ID"'
assert_order 'verify_application_image_identity "$PAUSED_EXPECTED_IMAGE_ID"' \
    '  stop_nginx_for_paused_onboarding'
assert_order '  stop_nginx_for_paused_onboarding' \
    '"${PAUSED_APPLICATION_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate circles'
assert_order 'verify_paused_application_runtime "$PAUSED_EXPECTED_IMAGE_ID"' \
    '"${BASE_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate nginx'
assert_order 'verify_registration_routing_paused || \' \
    '"${BASE_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate nginx'
assert_order 'recreate_and_verify_cron ||' \
    '"${BASE_COMPOSE[@]}" up -d --no-deps --no-build --pull never --force-recreate nginx'
assert_order 'if ! verify_external_version; then' 'registration remains paused'
replacement_guard_block="$(sed -n '/registration routing changed before the application replacement window/,/stop_nginx_for_paused_onboarding/p' "$deploy")"
grep -Fq 'require_paused_operations_idle' <<<"$replacement_guard_block" || \
    fail "paused deployment does not recheck operations immediately before replacement"
replacement_route_block="$(sed -n '/if ! verify_registration_routing_paused; then/,/registration routing changed before the application replacement window/p' "$deploy")"
grep -Fq 'stop_nginx_for_paused_onboarding' <<<"$replacement_route_block" || \
    fail "pre-replacement routing drift does not close NGINX"
final_route_block="$(sed -n '/if ! verify_external_version; then/,/registration remains paused/p' "$deploy")"
grep -Fq 'verify_registration_routing_paused ||' <<<"$final_route_block" || \
    fail "paused deployment does not recheck routing after restoring public access"
[[ "$(grep -nF 'if ! verify_external_version; then' <<<"$final_route_block" | cut -d: -f1)" -lt \
    "$(grep -nF 'verify_registration_routing_paused ||' <<<"$final_route_block" | cut -d: -f1)" ]] || \
    fail "final paused routing check is not ordered after public access restoration"

extract_function() {
    local name="$1"
    awk -v marker="$name() {" '
        $0 == marker { printing = 1 }
        printing { print }
        printing && $0 == "}" { exit }
    ' "$deploy"
}

cat >"$test_root/base-functions.sh" <<'SCRIPT'
fail() {
    echo "Error: $1" >&2
    exit 1
}
SCRIPT

# A rejection before the application replacement window must not stop public services.
{
    cat "$test_root/base-functions.sh"
    extract_function require_paused_operations_idle
} >"$test_root/idle-functions.sh"
cat >"$test_root/run-idle-failure.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
CALLS="$1"
OPS_COMPOSE=(mock_ops)
ACTIVATION_VALIDATOR="$2"
mock_ops() {
    printf '%s\n' "$*" >>"$CALLS"
    if [[ -n "${STATUS_JSON:-}" ]]; then
        printf '%s\n' "$STATUS_JSON"
    else
        printf '%s\n' '{"pendingRegistrations":1,"reconciliationRequired":0,"activeProvisioningLocks":1,"activeFinalizationLocks":0}'
    fi
}
source "$3"
require_paused_operations_idle
SCRIPT
chmod 755 "$test_root/run-idle-failure.sh"
if CALLS="$test_root/idle-calls" "$test_root/run-idle-failure.sh" \
    "$test_root/idle-calls" "$validator" "$test_root/idle-functions.sh" \
    >"$test_root/idle-output" 2>&1; then
    fail "active provisioning locks were accepted"
fi
grep -Fq 'activeProvisioningLocks must be zero' "$test_root/idle-output" || \
    fail "active-lock failure did not identify the blocking operation"
if grep -Fq 'stop ' "$test_root/idle-calls"; then
    fail "pre-replacement validation failure stopped public services"
fi
STATUS_JSON='{"pendingRegistrations":1,"reconciliationRequired":0,"activeProvisioningLocks":0,"activeFinalizationLocks":0}' \
    CALLS="$test_root/pending-email-calls" "$test_root/run-idle-failure.sh" \
    "$test_root/pending-email-calls" "$validator" "$test_root/idle-functions.sh" \
    >"$test_root/pending-email-output" 2>&1 || \
    fail "one unfinished pending_email registration was not accepted"

# Routing drift after replacement stops both public NGINX and the application.
{
    cat "$test_root/base-functions.sh"
    extract_function fail_offline
    extract_function verify_registration_routing_paused
} >"$test_root/routing-functions.sh"
cat >"$test_root/run-routing-failure.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
CALLS="$1"
DEPLOY_MODE=paused-onboarding
NGINX_STOPPED=false
PAUSED_APPLICATION_VERIFIED=true
BASE_COMPOSE=(mock_base)
OPS_COMPOSE=(mock_ops)
ACTIVATION_VALIDATOR="$2"
mock_base() {
    printf '%s\n' "$*" >>"$CALLS"
}
mock_ops() {
    printf '%s\n' '{"mode":"pending","deploymentId":"synthetic"}'
}
source "$3"
verify_registration_routing_paused || \
    fail_offline "registration routing changed after restoring public access" true
SCRIPT
chmod 755 "$test_root/run-routing-failure.sh"
if CALLS="$test_root/routing-calls" "$test_root/run-routing-failure.sh" \
    "$test_root/routing-calls" "$validator" "$test_root/routing-functions.sh" \
    >"$test_root/routing-output" 2>&1; then
    fail "routing drift after public-service restoration was accepted"
fi
grep -Fxq 'stop nginx' "$test_root/routing-calls" || \
    fail "routing drift did not stop NGINX"
grep -Fxq 'stop circles' "$test_root/routing-calls" || \
    fail "routing drift did not stop the application"
grep -Fq 'Production NGINX and circles remain stopped for recovery' "$test_root/routing-output" || \
    fail "routing-drift containment message is missing"

# An application that has not passed replacement verification must be stopped with NGINX.
{
    cat "$test_root/base-functions.sh"
    extract_function fail_offline
} >"$test_root/unverified-functions.sh"
cat >"$test_root/run-unverified-failure.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
CALLS="$1"
DEPLOY_MODE=paused-onboarding
NGINX_STOPPED=false
PAUSED_APPLICATION_VERIFIED=false
BASE_COMPOSE=(mock_base)
mock_base() {
    printf '%s\n' "$*" >>"$CALLS"
}
source "$2"
fail_offline "synthetic application verification failure"
SCRIPT
chmod 755 "$test_root/run-unverified-failure.sh"
if CALLS="$test_root/unverified-calls" "$test_root/run-unverified-failure.sh" \
    "$test_root/unverified-calls" "$test_root/unverified-functions.sh" \
    >"$test_root/unverified-output" 2>&1; then
    fail "unverified application failure unexpectedly succeeded"
fi
grep -Fxq 'stop nginx' "$test_root/unverified-calls"
grep -Fxq 'stop circles' "$test_root/unverified-calls"

# CRON_SECRET is checked for presence without being printed.
{
    cat "$test_root/base-functions.sh"
    extract_function require_application_cron_secret
} >"$test_root/cron-secret-functions.sh"
cat >"$test_root/run-cron-secret.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
docker() {
    if [[ "$1 $2 $3 $4" == "exec mock-container printenv CRON_SECRET" ]]; then
        printf '%s\n' "$SYNTHETIC_CRON_SECRET"
        return 0
    fi
    return 1
}
source "$1"
require_application_cron_secret mock-container
SCRIPT
chmod 755 "$test_root/run-cron-secret.sh"
SYNTHETIC_CRON_SECRET="synthetic-cron-secret-value" \
    "$test_root/run-cron-secret.sh" "$test_root/cron-secret-functions.sh" \
    >"$test_root/cron-secret-output" 2>&1
[[ ! -s "$test_root/cron-secret-output" ]] || \
    fail "CRON_SECRET validation wrote output"
if SYNTHETIC_CRON_SECRET="" "$test_root/run-cron-secret.sh" \
    "$test_root/cron-secret-functions.sh" >"$test_root/cron-secret-empty-output" 2>&1; then
    fail "empty CRON_SECRET was accepted"
fi
if grep -Fq 'synthetic-cron-secret-value' "$test_root/cron-secret-output" "$test_root/cron-secret-empty-output"; then
    fail "CRON_SECRET value was exposed"
fi

# Immutable image metadata is checked without printing its contents.
{
    extract_function verify_application_image_identity
} >"$test_root/image-functions.sh"
cat >"$test_root/run-image-check.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
APPLICATION_IMAGE_VALIDATOR="$1"
EXPECTED_SHA="$2"
METADATA_SHA="$3"
docker() {
    [[ "$1" == run && "$2" == --rm && "$3" == --pull && "$4" == never ]]
    [[ " $* " == *" --network none "* && " $* " == *" --read-only "* ]]
    printf 'gitSha=%s\n---KAMOONI-ROLE---\nproduction\n' "$METADATA_SHA"
}
source "$4"
verify_application_image_identity "sha256:$(printf 'a%.0s' {1..64})" "$EXPECTED_SHA"
SCRIPT
chmod 755 "$test_root/run-image-check.sh"
fake_application_sha="2437ad23f850e31f71b3ab544326e0f471eef59d"
"$test_root/run-image-check.sh" "$repo_dir/scripts/verify-production-application-image.py" \
    "$fake_application_sha" "$fake_application_sha" "$test_root/image-functions.sh" \
    >"$test_root/image-output" 2>&1
[[ ! -s "$test_root/image-output" ]] || \
    fail "application image metadata verification wrote output"
if "$test_root/run-image-check.sh" "$repo_dir/scripts/verify-production-application-image.py" \
    "$fake_application_sha" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$test_root/image-functions.sh" \
    >"$test_root/image-wrong-output" 2>&1; then
    fail "wrong immutable image SHA was accepted"
fi

# A failed build may retag latest; the active container must still be identified by its own image ID.
{
    extract_function active_application_image_id
} >"$test_root/active-image-functions.sh"
cat >"$test_root/run-active-image.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
ACTIVE_IMAGE_ID="$1"
docker() {
    [[ "$1 $2 $3 $4" == "inspect --format {{.Image}} mock-container" ]]
    printf '%s\n' "$ACTIVE_IMAGE_ID"
}
source "$2"
active_application_image_id mock-container
SCRIPT
chmod 755 "$test_root/run-active-image.sh"
old_active_image="sha256:$(printf 'b%.0s' {1..64})"
new_failed_latest="sha256:$(printf 'c%.0s' {1..64})"
[[ "$old_active_image" != "$new_failed_latest" ]]
[[ "$("$test_root/run-active-image.sh" "$old_active_image" "$test_root/active-image-functions.sh")" == "$old_active_image" ]] || \
    fail "failed image validation made the unchanged active container unrecoverable"

# The browser-facing stop helper is idempotent.
{
    cat "$test_root/base-functions.sh"
    extract_function stop_nginx_for_paused_onboarding
} >"$test_root/stop-functions.sh"
cat >"$test_root/run-stop.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
CALLS="$1"
DEPLOY_MODE=paused-onboarding
NGINX_STOPPED=false
BASE_COMPOSE=(mock_base)
mock_base() {
    printf '%s\n' "$*" >>"$CALLS"
    if [[ "$1" == "ps" ]]; then
        printf '%s\n' "${PS_OUTPUT:-}"
        return "${PS_STATUS:-0}"
    fi
}
source "$2"
stop_nginx_for_paused_onboarding
stop_nginx_for_paused_onboarding
SCRIPT
chmod 755 "$test_root/run-stop.sh"
CALLS="$test_root/stop-calls" "$test_root/run-stop.sh" \
    "$test_root/stop-calls" "$test_root/stop-functions.sh"
[[ "$(grep -c '^stop nginx$' "$test_root/stop-calls")" -eq 1 ]] || \
    fail "NGINX stop helper was not idempotent"
if PS_OUTPUT="synthetic-nginx-id" CALLS="$test_root/stop-running-calls" "$test_root/run-stop.sh" \
    "$test_root/stop-running-calls" "$test_root/stop-functions.sh" \
    >"$test_root/stop-running-output" 2>&1; then
    fail "NGINX stop helper accepted a still-running NGINX container"
fi
grep -Fq 'still running after the required stop' "$test_root/stop-running-output"
if PS_STATUS=1 CALLS="$test_root/stop-unknown-calls" "$test_root/run-stop.sh" \
    "$test_root/stop-unknown-calls" "$test_root/stop-functions.sh" \
    >"$test_root/stop-unknown-output" 2>&1; then
    fail "NGINX stop helper accepted an unverifiable stop result"
fi
grep -Fq 'could not confirm that production NGINX stopped' "$test_root/stop-unknown-output"

# A partially started NGINX must be stopped again even when the stop-state flag says it was down.
{
    cat "$test_root/base-functions.sh"
    extract_function fail_offline
} >"$test_root/partial-nginx-functions.sh"
cat >"$test_root/run-partial-nginx.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
CALLS="$1"
DEPLOY_MODE=paused-onboarding
NGINX_STOPPED=true
PAUSED_APPLICATION_VERIFIED=true
BASE_COMPOSE=(mock_base)
mock_base() {
    printf '%s\n' "$*" >>"$CALLS"
}
source "$2"
fail_offline "synthetic NGINX startup failure"
SCRIPT
chmod 755 "$test_root/run-partial-nginx.sh"
if CALLS="$test_root/partial-nginx-calls" "$test_root/run-partial-nginx.sh" \
    "$test_root/partial-nginx-calls" "$test_root/partial-nginx-functions.sh" \
    >"$test_root/partial-nginx-output" 2>&1; then
    fail "partial NGINX startup failure unexpectedly succeeded"
fi
grep -Fqx 'stop nginx' "$test_root/partial-nginx-calls" || \
    fail "partial NGINX startup failure did not stop NGINX again"
if grep -Fqx 'stop circles' "$test_root/partial-nginx-calls"; then
    fail "partial NGINX startup failure stopped the verified private application"
fi

# The currently serving release may be an older main commit during the one-time tooling bootstrap.
{
    extract_function application_sha_is_ancestor
} >"$test_root/ancestor-functions.sh"
git init -q -b main "$test_root/ancestor-repo"
git -C "$test_root/ancestor-repo" config user.name Fixture
git -C "$test_root/ancestor-repo" config user.email fixture@example.test
printf 'base\n' >"$test_root/ancestor-repo/tracked.txt"
git -C "$test_root/ancestor-repo" add tracked.txt
git -C "$test_root/ancestor-repo" commit -qm base
base_sha="$(git -C "$test_root/ancestor-repo" rev-parse HEAD)"
printf 'next\n' >>"$test_root/ancestor-repo/tracked.txt"
git -C "$test_root/ancestor-repo" commit -qam next
tip_sha="$(git -C "$test_root/ancestor-repo" rev-parse HEAD)"
(
    cd "$test_root/ancestor-repo"
    source "$test_root/ancestor-functions.sh"
    application_sha_is_ancestor "$base_sha"
    application_sha_is_ancestor "$tip_sha"
    ! application_sha_is_ancestor "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ! application_sha_is_ancestor "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)

echo "production paused onboarding deployment contracts passed"
