#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
harness="$repo_dir/scripts/rehearse-production-onboarding-control.sh"
pty_helper="$repo_dir/scripts/rehearse-production-onboarding-control.pty.py"
image_test="$repo_dir/scripts/verify-production-application-image.test.py"
workflow="$repo_dir/../.github/workflows/production-onboarding-rehearsal.yml"
build_workflow="$repo_dir/../.github/workflows/build-check.yml"
control="$repo_dir/scripts/production-onboarding-control.sh"
deploy="$repo_dir/deploy-genesis2.sh"
verifier_validator="$repo_dir/scripts/validate-routing-operator-verifier.py"

bash -n "$harness"
bash -n "$deploy"
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
    'cmp "$SOURCE_APP_DIR/deploy-genesis2.sh" "$DEPLOY_SCRIPT"' \
    'pending-registration-monitoring.ts' \
    'verify_operator_build_context' \
    'docker-compose.production-maintenance.yml' \
    'deploy-paused-services' \
    'image-validation-failure' \
    'deploy-startup-failure.log' \
    'deploy-nginx-failure.log' \
    'assert_no_app_host_port' \
    'REHEARSAL_INTERNAL_VERSION' \
    'REHEARSAL_HOLD_VERSION_SHA' \
    'REHEARSAL_RELEASE_TOKEN' \
    'release_internal_version_response' \
    'report_retry_verification_failure' \
    'stage=internal-version-observation' \
    'assert_activation_state_preserved' \
    'assert_public_services_stopped' \
    'GIT_ALLOW_PROTOCOL=file' \
    'url.file://$ORIGIN_BARE.insteadOf' \
    'config --get remote.origin.url' \
    '"$(git -C "$EXPECTED_REPO_DIR" remote get-url origin)" == "file://$ORIGIN_BARE"' \
    'mongodb://rehearsal:rehearsal-not-a-credential@db:27017/circles?authSource=admin' \
    'USER node' \
    'status: "pending_email"' \
    'postmark-verification-canary.mjs' \
    'pending-registration-watchdog-alert.mjs' \
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

origin_tmp="$verifier_tmp/origin"
git init --bare -q "$origin_tmp.git"
git init -q -b main "$origin_tmp"
git -C "$origin_tmp" config user.name Fixture
git -C "$origin_tmp" config user.email fixture@example.test
printf 'origin fixture\n' >"$origin_tmp/tracked.txt"
git -C "$origin_tmp" add tracked.txt
git -C "$origin_tmp" commit -qm fixture
git -C "$origin_tmp" remote add origin https://github.com/Social-Systems-Lab/circles.git
git -C "$origin_tmp" config \
    "url.file://$origin_tmp.git.insteadOf" https://github.com/Social-Systems-Lab/circles.git
[[ "$(git -C "$origin_tmp" config --get remote.origin.url)" == \
    "https://github.com/Social-Systems-Lab/circles.git" ]] || {
    echo "raw disposable origin identity was not retained" >&2
    exit 1
}
[[ "$(git -C "$origin_tmp" remote get-url origin)" == "file://$origin_tmp.git" ]] || {
    echo "Git URL rewriting regression fixture did not reproduce the failure condition" >&2
    exit 1
}

origin_guard="$(
    sed -n '/^is_disposable_rehearsal_origin() {/,/^}/p' "$deploy"
)"
(
    set -euo pipefail
    REHEARSAL_CONFIRM="KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL_V1"
    REHEARSAL_LOCAL_ORIGIN="file:///root/circles/rehearsal-origin.git"
    eval "$origin_guard"
    KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL="$REHEARSAL_CONFIRM" GIT_ALLOW_PROTOCOL=file \
        is_disposable_rehearsal_origin \
        "$REHEARSAL_LOCAL_ORIGIN" \
        https://github.com/Social-Systems-Lab/circles.git \
        "$REHEARSAL_CONFIRM"
    if KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL="$REHEARSAL_CONFIRM" GIT_ALLOW_PROTOCOL=https \
        is_disposable_rehearsal_origin \
        "$REHEARSAL_LOCAL_ORIGIN" \
        https://github.com/Social-Systems-Lab/circles.git \
        "$REHEARSAL_CONFIRM"; then
        exit 1
    fi
    if KAMOONI_PRODUCTION_ONBOARDING_REHEARSAL="$REHEARSAL_CONFIRM" GIT_ALLOW_PROTOCOL=file \
        is_disposable_rehearsal_origin \
        "$REHEARSAL_LOCAL_ORIGIN" \
        https://github.com/Social-Systems-Lab/circles.git \
        wrong-marker; then
        exit 1
    fi
)

operator_context="$verifier_tmp/operator-context"
mkdir -p "$operator_context"
cp "$repo_dir/Dockerfile.registration-ops" "$operator_context/"
while IFS= read -r source; do
    [[ "$source" != "src/lib/auth/pending-registration-monitoring.ts" ]] || continue
    mkdir -p "$operator_context/$(dirname "$source")"
    printf 'fixture\n' >"$operator_context/$source"
done < <(awk '$1 == "COPY" { for (field = 2; field < NF; field += 1) print $field }' \
    "$repo_dir/Dockerfile.registration-ops")

operator_context_check="$(
    sed -n '/^verify_operator_build_context() {/,/^}/p' "$harness"
)"
if (
    APP_DIR="$operator_context"
    fail() { exit 1; }
    eval "$operator_context_check"
    verify_operator_build_context
); then
    echo "operator build-context regression accepted a missing COPY source" >&2
    exit 1
fi
mkdir -p "$operator_context/src/lib/auth"
printf 'fixture\n' >"$operator_context/src/lib/auth/pending-registration-monitoring.ts"
(
    APP_DIR="$operator_context"
    fail() { exit 1; }
    eval "$operator_context_check"
    verify_operator_build_context
)

wait_helper="$(
    sed -n '/^wait_for_internal_version_request() {/,/^}/p' "$harness"
)"
(
    set -euo pipefail
    RUNTIME_DIR="$verifier_tmp/no-runtime-marker"
    REHEARSAL_WAIT_ATTEMPTS=1
    REHEARSAL_WAIT_DELAY_SECONDS=0
    container_id() { printf 'mock-container\n'; }
    docker() {
        [[ "$1" == "logs" && "$2" == "mock-container" ]]
        printf 'REHEARSAL_INTERNAL_VERSION %s\n' "$LOG_SHA"
    }
    eval "$wait_helper"
    LOG_SHA=expected-sha
    wait_for_internal_version_request "$$" expected-sha
    LOG_SHA=different-sha
    if wait_for_internal_version_request "$$" expected-sha; then
        exit 1
    fi
)

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

guard_line="$(grep -nF 'require_disposable_environment' "$harness" | tail -1 | cut -d: -f1)"
first_up_line="$(grep -nF '"${BASE_COMPOSE[@]}" up -d --no-deps db circles nginx' "$harness" | head -1 | cut -d: -f1)"
[[ -n "$guard_line" && -n "$first_up_line" && "$guard_line" -lt "$first_up_line" ]] || {
    echo "disposable-environment guard must pass before containers start" >&2
    exit 1
}

grep -Fq '#!/usr/bin/env bash' "$control"
grep -Fq 'set +x' "$control"

[[ -f "$workflow" ]]
grep -Fq 'workflow_dispatch:' "$workflow"
if grep -Eq 'pull_request:|push:' "$workflow"; then
    echo "privileged rehearsal workflow must remain manually triggered only" >&2
    exit 1
fi
grep -Fq 'runs-on: ubuntu-latest' "$workflow"
grep -Fq 'timeout-minutes: 60' "$workflow"
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
