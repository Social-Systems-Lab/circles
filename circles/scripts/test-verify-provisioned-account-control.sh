#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-verify-provisioned-account.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

captured_stdin="$test_root/stdin"
runner="$test_root/run.sh"
printf '%s\n' pilot-account >"$test_root/tty-input"
for function_name in verify_completed_account_runtime verify_application run_ops route_status require_route_mode; do
    sed -n "/^${function_name}()/,/^}/p" "$control" >>"$test_root/function.sh"
done
sed -n '/^run_completed_account_verification()/,/^}/p' "$control" |
    sed -e 's#\[\[ -r /dev/tty \]\]#true#' \
        -e 's#</dev/tty#<"$TEST_TTY_INPUT"#g' \
        -e 's#>/dev/tty#> "$TEST_TTY_OUTPUT"#g' \
        >>"$test_root/function.sh"
sed -n '/^    verify-provisioned-account)/,/^        ;;/p' "$control" >"$test_root/command.sh"
grep -Fq "read -r -s -p 'Completed account handle: '" "$test_root/function.sh"

cat >"$runner" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
ACTIVATION_VALIDATOR="$REPO_DIR/scripts/validate-production-onboarding-activation.py"
RUNTIME_VALIDATOR="$REPO_DIR/scripts/verify-production-onboarding-runtime.py"
GIT_SHA="$(printf 'a%.0s' {1..40})"
image_id="sha256:$(printf 'a%.0s' {1..64})"
approved_deployment=production-onboarding-20261113-2437ad23-01
ops_compose=(docker compose --project-name synthetic -f synthetic.yml --profile production-onboarding-ops)
runtime_checks=0
require_default_and_ops_contracts() {
    [[ "$SCENARIO" != invalid-default-compose ]]
}
require_images() {
    [[ "$SCENARIO" != missing-image ]]
}
require_operator_image() { :; }
require_activation_file() {
    [[ "$SCENARIO" != invalid-activation-file ]]
}
require_compose_contracts() {
    require_activation_file
    runtime_checks=$((runtime_checks + 1))
    [[ "$SCENARIO" != invalid-activation-compose ]]
}
activation_value() {
    [[ "$1" == REGISTRATION_DEPLOYMENT_ID ]]
    if [[ "$SCENARIO" == changed-activation-file && "$runtime_checks" -gt 1 ]]; then
        printf '%s\n' production-onboarding-changed-release
    else
        printf '%s\n' "$approved_deployment"
    fi
}
application_container_id() {
    [[ "$SCENARIO" != ambiguous-container ]] || return 1
    printf '%s\n' synthetic-container
}
verify_application_build_identity() {
    [[ "$1" == synthetic-container && "$SCENARIO" != wrong-build-identity ]]
}
docker() {
    if [[ "$*" == "image inspect --format {{.Id}} circles-circles:latest" ]]; then
        printf '%s\n' "$image_id"
    elif [[ "$*" == "inspect --format {{.Image}} synthetic-container" ]]; then
        if [[ "$SCENARIO" == wrong-image || ( "$SCENARIO" == changed-image && -f "$TEST_ROOT/runtime-checked" ) ]]; then
            printf '%s\n' sha256:wrong-image
        else
            printf '%s\n' "$image_id"
        fi
    elif [[ "$*" == 'inspect synthetic-container' ]]; then
        if [[ "$SCENARIO" == changed-runtime && -f "$TEST_ROOT/runtime-checked" ]]; then
            printf '%s\n' '[]'
        else
            cat "$TEST_ROOT/runtime.json"
        fi
        touch "$TEST_ROOT/runtime-checked"
    elif [[ "$*" == *'run --rm --no-deps --pull never -T registration_ops route-status' ]]; then
        if [[ "$SCENARIO" == changed-routing && -f "$TEST_ROOT/runtime-checked" ]]; then
            printf '%s\n' '{"mode":"pending","deploymentId":null}'
        elif [[ "$SCENARIO" == changed-to-paused && -f "$TEST_ROOT/runtime-checked" ]]; then
            printf '%s\n' '{"mode":"paused","deploymentId":null}'
        else
            cat "$TEST_ROOT/routing.json"
        fi
    elif [[ "$*" == *'run --rm --no-deps --pull never -T registration_ops verify-provisioned-account --users-dir /circles/users' ]]; then
        cat >"$CAPTURED_STDIN"
        printf '%s\n' '{"result":"PASS"}'
    else
        fail 'unexpected Docker operation in isolated test'
    fi
}
fail() {
    printf '%s\n' "${1:-verification rejected}" >&2
    exit 1
}
usage() { exit 2; }
source "$FUNCTION_FILE"
command_name=verify-provisioned-account
case "$command_name" in
SCRIPT
cat "$test_root/command.sh" >>"$runner"
printf '%s\n' esac >>"$runner"
chmod 755 "$runner"

run_case() {
    local scenario="$1" mode="$2" expected="$3" actual=0
    rm -f -- "$captured_stdin" "$test_root/runtime-checked"
    printf '%s\n' pilot-account >"$test_root/tty-input"
    [[ "$scenario" != invalid-handle ]] || printf '%s\n' '../invalid' >"$test_root/tty-input"
    python3 - "$test_root" "$mode" "$scenario" <<'PY'
import json
from pathlib import Path
import sys

root, mode, scenario = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
deployment = "production-onboarding-20261113-2437ad23-01"
activation = mode == "activation"
route = {"mode": "pending" if activation else "legacy", "deploymentId": deployment if activation else None}
if scenario in ("paused-route", "paused-wrong-runtime", "paused-route-deployment", "paused-missing-deployment"):
    route = {"mode": "paused", "deploymentId": None}
elif scenario == "wrong-route":
    route = {"mode": "unknown", "deploymentId": None}
elif scenario == "default-pending-route":
    route = {"mode": "pending", "deploymentId": deployment}
if scenario in ("wrong-route-deployment", "paused-route-deployment", "legacy-route-deployment"):
    route["deploymentId"] = "production-onboarding-other-release"
elif scenario in ("missing-route-deployment", "paused-missing-deployment"):
    route.pop("deploymentId")
if scenario in ("wrong-runtime", "paused-wrong-runtime"):
    activation = not activation
runtime = [{
    "State": {"Running": True},
    "Config": {"Env": [
        "PENDING_REGISTRATION_ENABLED=" + str(activation).lower(),
        "PENDING_REGISTRATION_JOURNEY_READY=" + str(activation).lower(),
        "PENDING_REGISTRATION_TOKEN_HMAC_KEY=" + ("a" * 64 if activation else ""),
        "REGISTRATION_DEPLOYMENT_ID=" + (deployment if activation else ""),
        "CIRCLES_URL=https://kamooni.org", "EMAIL_TRANSPORT=postmark",
        "ALTCHA_HMAC_KEY=synthetic-altcha", "POSTMARK_API_TOKEN=synthetic-postmark",
        "POSTMARK_SENDER_EMAIL=synthetic@example.invalid",
    ]},
    "NetworkSettings": {"Networks": {"circles_webnet": {"IPAddress": "172.20.0.4"}}},
}]
if scenario == "wrong-runtime-deployment":
    runtime[0]["Config"]["Env"].append("REGISTRATION_DEPLOYMENT_ID=production-onboarding-other-release")
(root / "routing.json").write_text("invalid JSON" if scenario == "malformed-routing" else json.dumps(route))
(root / "runtime.json").write_text(json.dumps(runtime))
PY
    set -- "$mode"
    [[ "$mode" != omitted ]] || set --
    if CAPTURED_STDIN="$captured_stdin" FUNCTION_FILE="$test_root/function.sh" REPO_DIR="$repo_dir" \
        TEST_ROOT="$test_root" SCENARIO="$scenario" \
        TEST_TTY_INPUT="$test_root/tty-input" TEST_TTY_OUTPUT=/dev/null \
        "$runner" "$@" >"$test_root/output" 2>&1; then
        actual=0
    else
        actual=$?
    fi
    if [[ "$expected" == pass ]]; then
        [[ "$actual" -eq 0 && "$(cat "$captured_stdin")" == pilot-account ]] || {
            echo "completed-account verification unexpectedly failed: $scenario $mode" >&2
            cat "$test_root/output" >&2
            exit 1
        }
        grep -Fq '{"result":"PASS"}' "$test_root/output"
    else
        [[ "$actual" -ne 0 && ! -f "$captured_stdin" ]] || {
            echo "completed-account verification did not fail closed: $scenario $mode" >&2
            exit 1
        }
    fi
    if grep -Eq 'pilot-account|synthetic-postmark|synthetic-altcha|synthetic@example.invalid' "$test_root/output"; then
        echo "completed-account verification disclosed private input" >&2
        exit 1
    fi
}

for mode in omitted default activation; do
    run_case valid "$mode" pass
done
for mode in default activation; do
    for scenario in wrong-route wrong-runtime wrong-image changed-image changed-runtime changed-routing \
        wrong-build-identity ambiguous-container missing-image invalid-default-compose invalid-handle malformed-routing; do
        run_case "$scenario" "$mode" fail
    done
done
for scenario in invalid-activation-file invalid-activation-compose wrong-route-deployment missing-route-deployment \
    wrong-runtime-deployment changed-activation-file; do
    run_case "$scenario" activation fail
done
run_case default-pending-route default fail
run_case valid invalid-mode fail
for mode in omitted default; do
    run_case paused-route "$mode" pass
done
run_case paused-route activation fail
for scenario in paused-wrong-runtime paused-route-deployment legacy-route-deployment \
    missing-route-deployment paused-missing-deployment; do
    run_case "$scenario" default fail
done
run_case changed-to-paused default pass

echo "completed-account verification wrapper checks passed (44 isolated cases)"
