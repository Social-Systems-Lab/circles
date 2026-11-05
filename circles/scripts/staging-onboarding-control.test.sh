#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$root/scripts/staging-onboarding-control.sh"
activation="$root/docker-compose.staging-activation.yml"
ops="$root/docker-compose.staging-ops.yml"
production="$root/docker-compose.yml"

for required in \
    'flock -x 9' \
    'require_route_mode paused' \
    'PENDING_REGISTRATION_TOKEN_HMAC_KEY' \
    'AUTHORIZED_STAGING_ONBOARDING_CONTROL' \
    'up -d --no-deps --force-recreate circles' \
    'operations-status'; do
    grep -Fq -- "$required" "$control" || { echo "missing control contract: $required" >&2; exit 1; }
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
