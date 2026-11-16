#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
route="$repo_dir/src/app/api/cron/onboarding-watchdog/route.ts"
control="$repo_dir/src/lib/auth/pending-registration-watchdog-control.ts"
cron="$repo_dir/crontab"
deploy="$repo_dir/deploy-genesis2.sh"
policy="$repo_dir/src/lib/auth/pending-registration-watchdog-policy.ts"
alert_module="$repo_dir/src/lib/auth/pending-registration-watchdog-alert.mjs"
rehearsal_workflow="$repo_dir/../.github/workflows/production-onboarding-rehearsal.yml"
watchdog_integration="$repo_dir/scripts/test-onboarding-watchdog-integration.sh"

for file in "$route" "$control" "$cron" "$deploy" "$policy" "$alert_module" \
    "$rehearsal_workflow" "$watchdog_integration"; do
    [[ -f "$file" ]] || {
        echo "Missing onboarding watchdog file: $file" >&2
        exit 1
    }
done

grep -Fq '*/5 * * * * curl -f -H "Authorization: Bearer $CRON_SECRET" http://circles:3000/api/cron/onboarding-watchdog' "$cron" || {
    echo "Missing five-minute onboarding watchdog schedule." >&2
    exit 1
}
grep -Fq 'grep -Fq "/api/cron/onboarding-watchdog" /etc/crontabs/root' "$deploy" || {
    echo "Deployment does not verify the onboarding watchdog schedule." >&2
    exit 1
}
grep -Fq 'curl -fsS --max-time 20 -H "Authorization: Bearer $CRON_SECRET" http://circles:3000/api/cron/onboarding-watchdog >/dev/null' "$deploy" || {
    echo "Deployment does not verify an authenticated watchdog invocation." >&2
    exit 1
}
cron_recreate_line="$(grep -nF 'force-recreate cron' "$deploy" | head -1 | cut -d: -f1)"
schedule_check_line="$(grep -nF 'grep -Fq "/api/cron/onboarding-watchdog"' "$deploy" | head -1 | cut -d: -f1)"
authenticated_call_line="$(grep -nF 'http://circles:3000/api/cron/onboarding-watchdog >/dev/null' "$deploy" | head -1 | cut -d: -f1)"
[[ -n "$cron_recreate_line" && -n "$schedule_check_line" && -n "$authenticated_call_line" ]] &&
    (( cron_recreate_line < schedule_check_line && schedule_check_line < authenticated_call_line )) || {
    echo "Authenticated watchdog verification must follow cron recreation and schedule checks." >&2
    exit 1
}
grep -Fq 'supplied === `Bearer ${expected}`' "$route" || {
    echo "Watchdog does not use exact CRON_SECRET bearer authentication." >&2
    exit 1
}
grep -Fq 'updatedBy: "onboarding-watchdog"' "$control" || {
    echo "Watchdog pause is not explicitly attributed." >&2
    exit 1
}
if ! grep -Fq 'expectedMode: "pending"' "$control" || ! grep -Fq 'mode: "paused"' "$control"; then
    echo "Watchdog control does not implement the pending-to-paused CAS." >&2
    exit 1
fi
if grep -Fq 'REGISTRATION_ROUTING_OPERATOR_TOKEN' "$route" "$control"; then
    echo "Watchdog must not receive or use the routing operator credential." >&2
    exit 1
fi
if grep -Eq 'mode: "(legacy|pending)"' "$control"; then
    echo "Watchdog control contains a forbidden routing transition." >&2
    exit 1
fi
grep -Fq 'monitoring_unavailable' "$policy" || {
    echo "Watchdog policy does not expose monitoring-unavailable state." >&2
    exit 1
}
grep -Fq 'buildWatchdogAlertTemplateModel' "$route" || {
    echo "Live watchdog alerts do not use the shared canary payload builder." >&2
    exit 1
}
grep -Fq 'WATCHDOG_ALERT_TEMPLATE_ALIAS = "notification-reminder"' "$alert_module" || {
    echo "Watchdog alert canary does not use the live notification template alias." >&2
    exit 1
}
if grep -Eq 'getDb|registrationRouting|pendingRegistrations|MONGODB_URI' "$alert_module"; then
    echo "Watchdog alert canary contains a database or routing mutation path." >&2
    exit 1
fi
grep -Fq './circles/scripts/test-onboarding-watchdog-integration.sh' "$rehearsal_workflow" || {
    echo "Manual disposable rehearsal does not run the watchdog fault-injection test." >&2
    exit 1
}
grep -Fq 'docker.io/pgsty/silo:RELEASE.2026-11-12T00-00-00Z' "$rehearsal_workflow" "$watchdog_integration" || {
    echo "Watchdog rehearsal does not use the accessible pinned object-storage image." >&2
    exit 1
}
if grep -Eq 'minio/minio(:|$)|quay.io/minio/minio' "$rehearsal_workflow" "$watchdog_integration"; then
    echo "Watchdog rehearsal still references an unavailable MinIO image." >&2
    exit 1
fi

bash -n "$repo_dir/scripts/test-onboarding-watchdog-integration.sh"
echo "onboarding watchdog safety contracts passed"
