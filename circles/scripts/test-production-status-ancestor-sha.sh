#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
control="$repo_dir/scripts/production-onboarding-control.sh"
application_image_validator="$repo_dir/scripts/verify-production-application-image.py"
runtime_validator="$repo_dir/scripts/verify-production-onboarding-runtime.py"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-status-ancestor-test.XXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

definitions="$(
    sed -n '/^verify_application_build_identity() {/,/^runtime_status_summary()/p' "$control" | sed '$d'
)"
grep -Fq 'verify_running_application_status_identity_if_present()' <<<"$definitions" || \
    fail "status identity helper is missing"

git init -q -b main "$test_root/repo"
git -C "$test_root/repo" config user.name Fixture
git -C "$test_root/repo" config user.email fixture@example.test
printf 'base\n' >"$test_root/repo/tracked.txt"
git -C "$test_root/repo" add tracked.txt
git -C "$test_root/repo" commit -qm base
base_sha="$(git -C "$test_root/repo" rev-parse HEAD)"
printf 'current\n' >>"$test_root/repo/tracked.txt"
git -C "$test_root/repo" commit -qam current
current_sha="$(git -C "$test_root/repo" rev-parse HEAD)"
git -C "$test_root/repo" checkout -q --orphan unrelated
git -C "$test_root/repo" rm -q -rf tracked.txt
git -C "$test_root/repo" commit -q --allow-empty -m unrelated
unrelated_sha="$(git -C "$test_root/repo" rev-parse HEAD)"
git -C "$test_root/repo" checkout -q main

printf '%s\n' "$definitions" >"$test_root/definitions.sh"

cat >"$test_root/run-status-identity.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
repo="$1"
definitions="$2"
application_image_validator="$3"
runtime_validator="$4"
calls="$5"

cd "$repo"
fail() {
    echo "Error: $1" >&2
    exit 1
}
base_compose=(mock_compose)
GIT_SHA="$CURRENT_SHA"
APPLICATION_IMAGE_VALIDATOR="$application_image_validator"
RUNTIME_VALIDATOR="$runtime_validator"

mock_compose() {
    [[ "$1" == "ps" && "$2" == "-q" && "$3" == "circles" ]]
    printf '%s\n' "${CONTAINER_IDS:-}"
}

docker() {
    printf '%s\n' "$*" >>"$calls"
    if [[ "$1" == "inspect" && "$2" == "--format" && "$3" == "{{.Image}}" && "$4" == "mock-container" ]]; then
        printf '%s\n' "${IMAGE_ID:-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
        return 0
    fi
    if [[ "$1" == "inspect" && "$2" == "mock-container" ]]; then
        printf '[{"State":{"Running":true},"NetworkSettings":{"Networks":{"circles_webnet":{"IPAddress":"172.20.0.4"}}}}]'
        return 0
    fi
    if [[ "$1" == "exec" && "$2" == "mock-container" && "$3" == "cat" && "$4" == "/app/VERSION" ]]; then
        printf 'version=0.8.15\ngitSha=%s\n' "${RUNNING_SHA:-}"
        return 0
    fi
    if [[ "$1" == "exec" && "$2" == "mock-container" && "$3" == "cat" && "$4" == "/app/.kamooni-deployment-role" ]]; then
        printf '%s\n' "${CONTAINER_ROLE:-production}"
        return 0
    fi
    if [[ "$1" == "exec" && "$2" == "mock-container" && "$3" == "node" && "$4" == "-e" ]]; then
        printf '%s\n%s\n' "$6" "$7" >"$calls.node"
        return "${NODE_STATUS:-0}"
    fi
    if [[ "$1" == "run" && "$2" == "--rm" && "$3" == "--pull=never" ]]; then
        printf 'version=0.8.15\ngitSha=%s\n---KAMOONI-ROLE---\n%s\n' \
            "${IMAGE_SHA:-}" "${IMAGE_ROLE:-production}"
        return 0
    fi
    return 1
}

source "$definitions"
verify_running_application_status_identity_if_present
SCRIPT
chmod 755 "$test_root/run-status-identity.sh"

run_case() {
    local label="$1" expected="$2"
    local output="$test_root/$label.out"
    local calls="$test_root/$label.calls"
    local status=0
    CURRENT_SHA="$current_sha" CONTAINER_IDS="${CONTAINER_IDS-mock-container}" RUNNING_SHA="$valid_running_sha" \
        IMAGE_SHA="${IMAGE_SHA-$valid_running_sha}" CONTAINER_ROLE="${CONTAINER_ROLE-production}" \
        IMAGE_ROLE="${IMAGE_ROLE-production}" NODE_STATUS="${NODE_STATUS-0}" \
        "$test_root/run-status-identity.sh" "$test_root/repo" "$test_root/definitions.sh" \
        "$application_image_validator" "$runtime_validator" "$calls" >"$output" 2>&1 || status=$?
    if [[ "$status" -ne "$expected" ]]; then
        cat "$output" >&2
        fail "$label returned $status instead of $expected"
    fi
}

valid_running_sha="$base_sha"
run_case "ancestor-valid" 0

valid_running_sha="$current_sha"
run_case "current-valid" 0

valid_running_sha="$unrelated_sha"
run_case "non-ancestor-invalid" 1

valid_running_sha="ffffffffffffffffffffffffffffffffffffffff"
run_case "unknown-commit-invalid" 1

valid_running_sha="$base_sha"
IMAGE_SHA="$current_sha" run_case "image-sha-invalid" 1

valid_running_sha="$base_sha"
IMAGE_ROLE=staging run_case "image-role-invalid" 1

valid_running_sha="$base_sha"
CONTAINER_ROLE=staging run_case "container-role-invalid" 1

valid_running_sha="$base_sha"
NODE_STATUS=1 run_case "internal-version-invalid" 1

valid_running_sha="$base_sha"
CONTAINER_IDS=$'mock-one\nmock-two' run_case "multiple-containers-invalid" 1

valid_running_sha="$base_sha"
CONTAINER_IDS="" run_case "application-absent-valid" 0

grep -Fq 'exec mock-container node -e' "$test_root/ancestor-valid.calls"
grep -Fq 'run --rm --pull=never --network none --read-only' "$test_root/ancestor-valid.calls"
{
    IFS= read -r verified_sha
    IFS= read -r verified_address
} <"$test_root/ancestor-valid.calls.node"
[[ "$verified_sha" == "$base_sha" ]]
[[ "$verified_address" == "172.20.0.4" ]]

echo "Production status ancestor SHA verification tests passed"
