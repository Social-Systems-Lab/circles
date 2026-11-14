#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-postmark-canary-cleanup.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

definitions="$(
    sed -n '/^cleanup_temporary_files()/,/^}/p' "$control"
    sed -n '/^write_postmark_canary_environment()/,/^}/p' "$control"
)"

install_mocks() {
    TEMP_FILES=()
    TEMP_CONTAINERS=()
    POSTMARK_CANARY_ENV_FILE=""
    fail() {
        echo "test failure: $1" >&2
        exit 1
    }
    runtime_container_value() {
        case "$2" in
            EMAIL_TRANSPORT) printf 'postmark' ;;
            CIRCLES_URL) printf 'https://kamooni.org' ;;
            POSTMARK_API_TOKEN) printf 'mock-postmark-token' ;;
            POSTMARK_SENDER_EMAIL) printf 'canary@example.invalid' ;;
            *) exit 1 ;;
        esac
    }
}

success_env="$test_root/success.env"
(
    set -euo pipefail
    eval "$definitions"
    install_mocks
    mktemp() {
        : >"$success_env"
        chmod 600 "$success_env"
        printf '%s' "$success_env"
    }
    trap cleanup_temporary_files EXIT

    write_postmark_canary_environment mock-container
    [[ "$POSTMARK_CANARY_ENV_FILE" == "$success_env" ]]
    [[ "${#TEMP_FILES[@]}" -eq 1 ]]
    [[ "${TEMP_FILES[0]}" == "$success_env" ]]
    [[ -f "$success_env" ]]
    [[ "$(python3 - "$success_env" <<'PY'
import stat
import sys
print(stat.S_IMODE(__import__("os").stat(sys.argv[1]).st_mode))
PY
)" == "384" ]]

    cleanup_temporary_files
    [[ ! -e "$success_env" ]]
    trap - EXIT
)

failure_env="$test_root/failure.env"
set +e
(
    set -euo pipefail
    eval "$definitions"
    install_mocks
    mktemp() {
        : >"$failure_env"
        command chmod 600 "$failure_env"
        printf '%s' "$failure_env"
    }
    chmod() {
        return 1
    }
    trap cleanup_temporary_files EXIT

    write_postmark_canary_environment mock-container
    echo "credential environment unexpectedly succeeded" >&2
    exit 99
)
failure_status=$?
set -e

[[ "$failure_status" -ne 0 && "$failure_status" -ne 99 ]]
[[ ! -e "$failure_env" ]]

echo "Postmark canary cleanup tests passed"
