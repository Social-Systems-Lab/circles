#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
runtime_validator="$repo_dir/scripts/verify-production-onboarding-runtime.py"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-application-sha-test.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

definition="$(
    sed -n '/^verify_application_build_identity() {/,/^verify_running_application_identity_if_present()/p' \
        "$control" | sed '$d'
)"

run_verification() {
    local address="$1" role="$2" node_status="$3" args_file="$4" script_file="$5"
    (
        set -euo pipefail
        eval "$definition"
        GIT_SHA="correct-sha"
        RUNTIME_VALIDATOR="$runtime_validator"
        fail() {
            echo "verification failed: $1" >&2
            exit 1
        }
        docker() {
            if [[ "$1" == "inspect" && "$2" == "mock-container" ]]; then
                printf '[{"State":{"Running":true},"NetworkSettings":{"Networks":{"circles_webnet":{"IPAddress":"%s"}}}}]' \
                    "$address"
                return 0
            fi
            if [[ "$1" == "exec" && "$2" == "mock-container" && "$3" == "cat" && "$4" == "/app/.kamooni-deployment-role" ]]; then
                printf '%s\n' "$role"
                return 0
            fi
            if [[ "$1" == "exec" && "$2" == "mock-container" && "$3" == "node" && "$4" == "-e" ]]; then
                printf '%s\n%s\n' "$6" "$7" >"$args_file"
                printf '%s' "$5" >"$script_file"
                return "$node_status"
            fi
            return 1
        }

        verify_application_build_identity mock-container
    )
}

loopback_args="$test_root/loopback.args"
loopback_script="$test_root/loopback.script"
set +e
run_verification 127.0.0.1 production 0 "$loopback_args" "$loopback_script"
loopback_status=$?
set -e
[[ "$loopback_status" -ne 0 ]]
[[ ! -e "$loopback_args" ]]

success_args="$test_root/success.args"
success_script="$test_root/success.script"
run_verification 172.20.0.4 production 0 "$success_args" "$success_script"
{
    IFS= read -r success_sha
    IFS= read -r success_address
} <"$success_args"
[[ "$success_sha" == "correct-sha" ]]
[[ "$success_address" == "172.20.0.4" ]]
[[ "$(cat "$success_script")" != *"127.0.0.1"* ]]
[[ "$(cat "$success_script")" == *"process.argv[2]"* ]]
[[ "$(cat "$success_script")" == *'fetch(`http://${host}:${port}/api/version`'* ]]
[[ "$(cat "$success_script")" == *"redirect: \"error\""* ]]
[[ "$(cat "$success_script")" == *"AbortSignal.timeout(10000)"* ]]

wrong_sha_args="$test_root/wrong-sha.args"
wrong_sha_script="$test_root/wrong-sha.script"
set +e
run_verification 172.20.0.4 production 1 "$wrong_sha_args" "$wrong_sha_script"
wrong_sha_status=$?
set -e
[[ "$wrong_sha_status" -ne 0 ]]
{
    IFS= read -r wrong_sha_expected
    IFS= read -r wrong_sha_address
} <"$wrong_sha_args"
[[ "$wrong_sha_expected" == "correct-sha" ]]
[[ "$wrong_sha_address" == "172.20.0.4" ]]

wrong_role_args="$test_root/wrong-role.args"
wrong_role_script="$test_root/wrong-role.script"
set +e
run_verification 172.20.0.4 staging 0 "$wrong_role_args" "$wrong_role_script"
wrong_role_status=$?
set -e
[[ "$wrong_role_status" -ne 0 ]]
[[ ! -e "$wrong_role_args" ]]

echo "Production application SHA verification tests passed"
