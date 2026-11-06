#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$root/scripts/staging-onboarding-control.sh"
recovery_validator="$root/scripts/validate-staging-recovery-activation.py"
verifier_validator="$root/scripts/validate-routing-operator-verifier.py"
activation="$root/docker-compose.staging-activation.yml"
ops="$root/docker-compose.staging-ops.yml"
production="$root/docker-compose.yml"

for required in \
    'flock -x 9' \
    'require_route_mode paused' \
    'AUTHORIZED_STAGING_ONBOARDING_CONTROL' \
    'up -d --no-deps --force-recreate circles' \
    'operations-status' \
    'verify-staging-onboarding-runtime.py' \
    '${PROJECT_NAME}_webnet' \
    'REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256' \
    '.registration-routing-operator.sha256' \
    'require_operator_verifier'; do
    grep -Fq -- "$required" "$control" || { echo "missing control contract: $required" >&2; exit 1; }
done

for required in \
    'activate-services-recovery' \
    'require_single_recoverable_registration' \
    'run_ops recovery-activation-status' \
    'validate-staging-recovery-activation.py'; do
    grep -Fq -- "$required" "$control" || { echo "missing recovery activation contract: $required" >&2; exit 1; }
done

[[ -x "$recovery_validator" ]] || { echo "recovery activation validator is missing or not executable" >&2; exit 1; }
grep -Fq 'require_clean_operations' "$control"
python3 "$root/scripts/validate-staging-recovery-activation.test.py"

if grep -Fq -- '--operator-token' "$control" || grep -Fq -- '-e REGISTRATION_ROUTING_OPERATOR_TOKEN ' "$control"; then
    echo "raw routing operator token is passed through Docker argv or environment metadata" >&2
    exit 1
fi
if grep -Fq 'operator_hash="$(printf' "$control" || grep -Fq 'REGISTRATION_ROUTING_OPERATOR_TOKEN:-' "$control"; then
    echo "routing authentication verifier is derived from the supplied token or accepts the raw token from environment" >&2
    exit 1
fi
grep -Fq 'validate-routing-operator-verifier.py' "$control"

verifier_tmp="$(mktemp -d)"
trap 'rm -rf "$verifier_tmp"' EXIT
verifier_file="$verifier_tmp/verifier"
verifier='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
printf '%s\n' "$verifier" >"$verifier_file"
chmod 600 "$verifier_file"
[[ "$(python3 "$verifier_validator" "$verifier_file")" == "$verifier" ]]
chmod 644 "$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
chmod 600 "$verifier_file"
printf '%s\n%s\n' "$verifier" "$verifier" >"$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
printf '%s\n' '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF' >"$verifier_file"
! python3 "$verifier_validator" "$verifier_file" >/dev/null 2>&1
ln -s "$verifier_file" "$verifier_tmp/symlink"
! python3 "$verifier_validator" "$verifier_tmp/symlink" >/dev/null 2>&1

assert_order() {
    local first="$1" second="$2" first_line second_line
    first_line="$(grep -nF -- "$first" "$control" | head -1 | cut -d: -f1)"
    second_line="$(grep -nF -- "$second" "$control" | head -1 | cut -d: -f1)"
    [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]] || {
        echo "control ordering contract failed: $first before $second" >&2
        exit 1
    }
}

assert_order 'stop nginx || fail_public_services "could not stop NGINX before activation"' 'activation_compose[@]}" up -d --no-deps --force-recreate circles'
assert_order 'verify_internal_application activation' 'force-recreate nginx || fail_public_services "NGINX refresh failed after activation"'
assert_order 'verify_running_mailpit || fail_public_services "running Mailpit safety verification failed"' 'force-recreate nginx || fail_public_services "NGINX refresh failed after activation"'
assert_order 'stop nginx || fail_public_services "could not stop NGINX before deactivation"' 'base_compose[@]}" up -d --no-deps --force-recreate circles'
[[ "$(grep -Fc 'verify_internal_application activation' "$control")" -ge 2 ]] || {
    echo "activation must verify live runtime both after recreation and before paused-to-pending routing" >&2
    exit 1
}
grep -Fq 'verify_internal_application default none || fail_public_services' "$control"

for failure_path in \
    'activation application recreation failed' \
    'activation application failed internal webnet or runtime-policy verification' \
    'NGINX refresh failed after activation' \
    'activation application failed external verification' \
    'default application recreation failed' \
    'default application failed internal webnet or runtime-policy verification' \
    'NGINX refresh failed after deactivation' \
    'default application failed external verification'; do
    grep -Fq -- "$failure_path" "$control" || { echo "missing fail-closed path: $failure_path" >&2; exit 1; }
done

grep -Fq 'KAMOONI_STAGING_ACTIVATION_CONFIRM:?' "$activation"
grep -Fq 'PENDING_REGISTRATION_ENABLED: "true"' "$activation"
grep -Fq 'PENDING_REGISTRATION_JOURNEY_READY: "true"' "$activation"
grep -Fq 'PENDING_REGISTRATION_TOKEN_HMAC_KEY: ${PENDING_REGISTRATION_TOKEN_HMAC_KEY:?' "$activation"
grep -Fq 'REGISTRATION_DEPLOYMENT_ID: ${REGISTRATION_DEPLOYMENT_ID:?' "$activation"

if grep -Fq 'docker-compose.staging-activation.yml' "$production"; then
    echo "production Compose references the staging activation overlay" >&2
    exit 1
fi
if grep -Eq 'ports:|expose:' "$ops"; then
    echo "operator Compose publishes a service" >&2
    exit 1
fi
for forbidden in 'deleteMany' 'deleteOne' 'docker volume rm' 'docker compose down' 'rm -rf'; do
    if grep -Fq -- "$forbidden" "$control"; then
        echo "control script contains forbidden destructive operation: $forbidden" >&2
        exit 1
    fi
done

echo "staging onboarding control safety checks passed"
