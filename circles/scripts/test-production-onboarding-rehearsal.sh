#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
harness="$repo_dir/scripts/rehearse-production-onboarding-control.sh"
pty_helper="$repo_dir/scripts/rehearse-production-onboarding-control.pty.py"
image_test="$repo_dir/scripts/verify-production-application-image.test.py"
workflow="$repo_dir/../.github/workflows/production-onboarding-rehearsal.yml"
build_workflow="$repo_dir/../.github/workflows/build-check.yml"
control="$repo_dir/scripts/production-onboarding-control.sh"
verifier_validator="$repo_dir/scripts/validate-routing-operator-verifier.py"

bash -n "$harness"
python3 "$pty_helper" --self-test >/dev/null
python3 "$image_test" >/dev/null

verifier_tmp="$(mktemp -d)"
trap 'rm -rf -- "$verifier_tmp"' EXIT
verifier_file="$verifier_tmp/routing-operator.sha256"
printf '%s' 'rehearsal-operator-token' | sha256sum | awk '{print $1}' >"$verifier_file"
chmod 600 "$verifier_file"
verifier_value="$(python3 "$verifier_validator" "$verifier_file")"
[[ "$verifier_value" =~ ^[0-9a-f]{64}$ ]] || {
    echo "generated rehearsal verifier is not exactly one lowercase SHA-256 line" >&2
    exit 1
}
if grep -Fq "printf '\\n' >>\"\$SECRET_DIR/routing-operator.sha256\"" "$harness"; then
    echo "rehearsal harness appends an extra newline to the verifier" >&2
    exit 1
fi

for required in \
    'KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL_V1' \
    '[[ "$(uname -s)" == "Linux" ]]' \
    'KAMOONI_REHEARSAL_DEDICATED_VM' \
    'RUNNER_ENVIRONMENT' \
    'KAMOONI_REHEARSAL_DAEMON_ID' \
    'refusing to replace an existing /root/circles path' \
    'staging infrastructure paths are present' \
    'the dedicated Docker daemon already has containers' \
    'production-named Docker resources already exist' \
    'loopback port 443 is already in use' \
    'NO_PROXY="kamooni.org,localhost,127.0.0.1"' \
    'cmp "$SOURCE_APP_DIR/scripts/production-onboarding-control.sh" "$CONTROL_SCRIPT"' \
    'legacy paused none REHEARSAL' \
    'paused pending activation REHEARSAL' \
    'pending paused none REHEARSAL' \
    'paused legacy none REHEARSAL' \
    'insert_active_locks' \
    'expire_active_locks' \
    'assert_pending_email_preserved' \
    'assert_synthetic_identity_preserved' \
    'recover-default-services' \
    'RECOVER_DEFAULT_SERVICES' \
    'verify-production-application-image.py' \
    'recovery unexpectedly succeeded while the application failure remained injected' \
    'recovery did not expose the default application' \
    'trap cleanup EXIT' \
    'local owned=false' \
    'label=com.docker.compose.project=$PROJECT_NAME' \
    'docker network rm circles_webnet' \
    'docker volume rm circles_users' \
    'rm -rf -- /root/circles'; do
    grep -Fq -- "$required" "$harness" || {
        echo "rehearsal harness is missing safety contract: $required" >&2
        exit 1
    }
done

recovery_app_line="$(grep -nF 'verify_application default none "$recovery_image_id"' "$control" | head -1 | cut -d: -f1)"
recovery_nginx_line="$(grep -nF 'production NGINX refresh failed after application recovery' "$control" | head -1 | cut -d: -f1)"
[[ -n "$recovery_app_line" && -n "$recovery_nginx_line" && "$recovery_app_line" -lt "$recovery_nginx_line" ]] || {
    echo "recovery must verify the default application before restoring NGINX" >&2
    exit 1
}

for forbidden in \
    'postmark.com' \
    'api.postmarkapp.com' \
    'staging.kamooni.org' \
    'docker system prune' \
    'docker volume prune'; do
    if grep -Fq -- "$forbidden" "$harness"; then
        echo "rehearsal harness contains forbidden reference: $forbidden" >&2
        exit 1
    fi
done

grep -Fq '#!/usr/bin/env bash' "$control"
grep -Fq 'set +x' "$control"

[[ -f "$workflow" ]]
grep -Fq 'workflow_dispatch:' "$workflow"
if grep -Eq 'pull_request:|push:' "$workflow"; then
    echo "privileged rehearsal workflow must remain manually triggered only" >&2
    exit 1
fi
grep -Fq 'runs-on: ubuntu-latest' "$workflow"
grep -Fq 'KAMOONI_REHEARSAL_DAEMON_ID=' "$workflow"
grep -Fq 'rehearse-production-onboarding-control.sh' "$workflow"

grep -Fq 'test-production-onboarding-control.sh' "$build_workflow"
grep -Fq 'test-production-git-sync.sh' "$build_workflow"
grep -Fq 'test-production-onboarding-rehearsal.sh' "$build_workflow"
if grep -Fq 'rehearse-production-onboarding-control.sh' "$build_workflow"; then
    echo "privileged rehearsal must not run in ordinary Build Check" >&2
    exit 1
fi

echo "production onboarding rehearsal safety contracts passed"
