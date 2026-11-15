#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-verify-provisioned-account.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

captured_stdin="$test_root/stdin"
runner="$test_root/run.sh"
printf '%s\n' pilot-account >"$test_root/tty-input"
sed -n '/^run_completed_account_verification()/,/^}/p' "$control" |
    sed -e 's#\[\[ -r /dev/tty \]\]#true#' \
        -e 's#</dev/tty#<"$TEST_TTY_INPUT"#g' \
        -e 's#>/dev/tty#> "$TEST_TTY_OUTPUT"#g' \
        >"$test_root/function.sh"

cat >"$runner" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
verify_application() {
    [[ "$1" == default ]]
    [[ "$2" == none ]]
    [[ "$3" =~ ^sha256:[a-f0-9]{64}$ ]]
}
run_ops() {
    [[ "$1" == verify-provisioned-account ]]
    [[ "$2" == --users-dir ]]
    [[ "$3" == /circles/users ]]
    cat >"$CAPTURED_STDIN"
    printf '%s\n' '{"result":"PASS"}'
}
fail() {
    exit 1
}
source "$FUNCTION_FILE"
run_completed_account_verification "sha256:$(printf 'a%.0s' {1..64})"
SCRIPT
chmod 755 "$runner"

if ! CAPTURED_STDIN="$captured_stdin" FUNCTION_FILE="$test_root/function.sh" \
    TEST_TTY_INPUT="$test_root/tty-input" TEST_TTY_OUTPUT=/dev/null \
    "$runner" >"$test_root/output"; then
    cat "$test_root/output" >&2
    exit 1
fi

[[ "$(cat "$captured_stdin")" == pilot-account ]]
grep -Fq '{"result":"PASS"}' "$test_root/output"
if grep -Fq 'pilot-account' "$test_root/output"; then
    echo "completed-account handle was disclosed in operator output" >&2
    exit 1
fi

echo "completed-account verification wrapper contract passed"
