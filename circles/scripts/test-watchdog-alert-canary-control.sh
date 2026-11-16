#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-watchdog-alert-canary.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

captured_args="$test_root/docker-args"
captured_stdin="$test_root/docker-stdin"
source_file="$test_root/canary.mjs"
printf '%s\n' 'export async function runWatchdogAlertCanaryCli() {}' >"$source_file"
sed -n '/^run_watchdog_alert_canary()/,/^}/p' "$control" >"$test_root/function.sh"

WATCHDOG_ALERT_CANARY_SCRIPT="$source_file"
TEMP_CONTAINERS=()

application_container_id() {
    printf '%s\n' mock-container
}

runtime_container_value() {
    case "$2" in
        CIRCLES_URL) printf '%s\n' https://kamooni.org ;;
        EMAIL_TRANSPORT) printf '%s\n' postmark ;;
        POSTMARK_API_TOKEN) printf '%s\n' sensitive-postmark-token ;;
        POSTMARK_SENDER_EMAIL) printf '%s\n' hello@example.invalid ;;
        *) return 1 ;;
    esac
}

activation_value() {
    [[ "$1" == ONBOARDING_ALERT_EMAIL ]]
    printf '%s\n' watchdog-alert-recipient@example.invalid
}

require_terminal_confirmation() {
    [[ "$1" == SEND_WATCHDOG_ALERT_CANARY ]]
}

require_route_mode() {
    [[ "$1" == legacy ]]
}

require_activation_ready() {
    return 0
}

verify_application() {
    [[ "$1" == default ]]
}

fail() {
    echo "Error: $1" >&2
    return 1
}

docker() {
    if [[ "$1" == container && "$2" == inspect ]]; then
        return 1
    fi
    if [[ "$1" == inspect ]]; then
        [[ "${2:-}" == "--format" ]] || return 1
        printf '%s\n' "sha256:$(printf 'a%.0s' {1..64})"
        return
    fi
    [[ "$1" == run ]]
    printf '%s\n' "$@" >"$captured_args"
    cat >"$captured_stdin"
}

source "$test_root/function.sh"
run_watchdog_alert_canary >/dev/null

expected_stdin=$'https://kamooni.org\npostmark\nsensitive-postmark-token\nhello@example.invalid\nwatchdog-alert-recipient@example.invalid'
[[ "$(cat "$captured_stdin")" == "$expected_stdin" ]]
if grep -Fq 'sensitive-postmark-token' "$captured_args"; then
    echo "watchdog alert canary exposed the Postmark token in Docker arguments" >&2
    exit 1
fi
if grep -Fq 'watchdog-alert-recipient@example.invalid' "$captured_args"; then
    echo "watchdog alert canary exposed the alert recipient in Docker arguments" >&2
    exit 1
fi
if grep -Eq -- '--env|--env-file|--mount|--volume|docker.sock' "$captured_args"; then
    echo "watchdog alert canary exposed secrets or production resources through Docker options" >&2
    exit 1
fi
grep -Fq -- '--network' "$captured_args"
grep -Fq -- '--cap-drop' "$captured_args"
grep -Fq -- '--security-opt' "$captured_args"
grep -Fq -- '--user' "$captured_args"

echo "watchdog alert canary wrapper contract passed"
