#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
MAINTAIN="$REPO_DIR/scripts/maintain-staging-docker.sh"
MANAGE="$REPO_DIR/scripts/manage-staging-docker-maintenance.sh"
DEPLOY="$REPO_DIR/scripts/deploy-staging.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-maintenance-test.XXXXXX")"
trap 'rm -rf "$TEST_ROOT"' EXIT
PASS=0

sha() { printf '%08d%032d' "$1" 0; }
image_id() { printf 'sha256:%064d' "$1"; }
tag_for() { printf 'kamooni-staging-circles:%s' "${1:0:8}"; }

assert_contains() { grep -F -- "$2" "$1" >/dev/null || { echo "FAIL: $1 lacks: $2" >&2; exit 1; }; }
assert_not_contains() { ! grep -F -- "$2" "$1" >/dev/null || { echo "FAIL: $1 unexpectedly contains: $2" >&2; exit 1; }; }
pass() { PASS=$((PASS + 1)); echo "ok $PASS - $1"; }

make_mocks() {
    CASE_DIR="$TEST_ROOT/$1"
    mkdir -p "$CASE_DIR/bin" "$CASE_DIR/state" "$CASE_DIR/systemd"
    : >"$CASE_DIR/commands.log"
    : >"$CASE_DIR/state/references.tsv"
    : >"$CASE_DIR/state/images.tsv"

    cat >"$CASE_DIR/bin/flock" <<'SH'
#!/usr/bin/env bash
echo "flock $*" >>"$MOCK_LOG"
[[ "${MOCK_FLOCK_FAIL:-0}" != 1 ]]
SH
    cat >"$CASE_DIR/bin/curl" <<'SH'
#!/usr/bin/env bash
echo "curl $*" >>"$MOCK_LOG"
[[ "${MOCK_CURL_FAIL:-0}" != 1 ]] || exit 22
while [[ -n "${MOCK_CURL_WAIT_FILE:-}" && -e "$MOCK_CURL_WAIT_FILE" ]]; do sleep 0.05; done
printf '{"gitSha":"%s"}\n' "$MOCK_CURRENT_SHA"
SH
    cat >"$CASE_DIR/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >>"$MOCK_LOG"
if [[ "$1 $2" == "ps -aq" ]]; then
    if [[ "$*" == *ancestor=* ]]; then
        wanted="${*: -1}"; wanted="${wanted#ancestor=}"
        awk -F '\t' -v id="$wanted" '$1==id {print $2}' "$MOCK_STATE/references.tsv"
    else
        printf '%s\n' "${MOCK_CONTAINER_ID:-container1}"
    fi
elif [[ "$1" == inspect ]]; then
    case "$3" in
        '{{.State.Running}}') printf '%s\n' "${MOCK_CONTAINER_RUNNING:-true}" ;;
        '{{.Image}}') printf '%s\n' "$MOCK_CURRENT_ID" ;;
        '{{.Config.Image}}') printf '%s\n' "$MOCK_CURRENT_TAG" ;;
        *) exit 90 ;;
    esac
elif [[ "$1 $2" == "image ls" ]]; then
    [[ "${MOCK_IMAGE_LS_FAIL:-0}" != 1 ]] || exit 91
    awk -F '\t' 'BEGIN {OFS="\t"} {print $1,$2,$3}' "$MOCK_STATE/images.tsv"
elif [[ "$1 $2" == "image inspect" ]]; then
    format="$4"; target="$5"
    if [[ "$format" == '{{.Id}}' ]]; then
        awk -F '\t' -v target="$target" '$1 ":" $2==target || $3==target {print $3; found=1} END {exit !found}' "$MOCK_STATE/images.tsv"
    elif [[ "$format" == '{{json .RepoTags}}' ]]; then
        awk -F '\t' -v target="$target" '$3==target {print $4; found=1; exit} END {exit !found}' "$MOCK_STATE/images.tsv"
    else
        exit 92
    fi
elif [[ "$1 $2" == "image rm" ]]; then
    [[ "${MOCK_RM_FAIL_ID:-}" != "$3" ]] || exit 93
elif [[ "$1 $2" == "image prune" ]]; then
    :
else
    exit 94
fi
SH
    cat >"$CASE_DIR/bin/systemctl" <<'SH'
#!/usr/bin/env bash
echo "systemctl $*" >>"$MOCK_LOG"
SH
    cat >"$CASE_DIR/bin/install" <<'SH'
#!/usr/bin/env bash
echo "install $*" >>"$MOCK_LOG"
argc=$#
eval "source=\${$((argc-1))}"
eval "target=\${$argc}"
/bin/cp "$source" "$target"
SH
    chmod +x "$CASE_DIR/bin/"*
    export PATH="$CASE_DIR/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    export MOCK_LOG="$CASE_DIR/commands.log" MOCK_STATE="$CASE_DIR/state"
    export KAMOONI_STAGING_LOCK_FILE="$CASE_DIR/state/maintenance.lock"
    export KAMOONI_STAGING_IMAGE_LEDGER="$CASE_DIR/state/ledger.tsv"
    export KAMOONI_STAGING_SYSTEMD_DIR="$CASE_DIR/systemd"
    export KAMOONI_STAGING_SYSTEMCTL="$CASE_DIR/bin/systemctl"
    unset MOCK_CURL_FAIL MOCK_IMAGE_LS_FAIL MOCK_RM_FAIL_ID MOCK_FLOCK_FAIL
}

add_record() {
    local number="$1" full_sha id tag
    full_sha="$(sha "$number")"; id="$(image_id "$number")"; tag="$(tag_for "$full_sha")"
    printf '%s\t%s\t%s\t2026-01-%02dT00:00:00Z\n' "$full_sha" "$id" "$tag" "$number" >>"$CASE_DIR/state/ledger.tsv"
    printf 'kamooni-staging-circles\t%s\t%s\t["%s"]\n' "${full_sha:0:8}" "$id" "$tag" >>"$CASE_DIR/state/images.tsv"
}

set_current() {
    export MOCK_CURRENT_SHA="$(sha "$1")"
    export MOCK_CURRENT_ID="$(image_id "$1")"
    export MOCK_CURRENT_TAG="$(tag_for "$MOCK_CURRENT_SHA")"
}

make_mocks retention
for n in 1 2 3 4 5; do add_record "$n"; done
set_current 5
"$MAINTAIN" --dry-run >"$CASE_DIR/out"
assert_contains "$CASE_DIR/out" "$(image_id 1)"
assert_contains "$CASE_DIR/out" "$(image_id 2)"
assert_not_contains "$CASE_DIR/out" "$(image_id 3)"
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "dry run retains current plus two previous verified images and mutates nothing"

make_mocks execute
for n in 1 2 3 4; do add_record "$n"; done
set_current 4
"$MAINTAIN" --execute >"$CASE_DIR/out"
assert_contains "$CASE_DIR/commands.log" "docker image rm $(image_id 1)"
assert_contains "$CASE_DIR/commands.log" "docker image prune --force --filter dangling=true --filter until=168h"
assert_not_contains "$CASE_DIR/commands.log" "volume"
assert_not_contains "$CASE_DIR/commands.log" "container rm"
assert_not_contains "$CASE_DIR/commands.log" "network"
pass "execute removes only verified obsolete images then performs legacy dangling prune"

make_mocks bootstrap
for n in 1 2; do add_record "$n"; done
set_current 2
"$MAINTAIN" --execute >"$CASE_DIR/out"
assert_contains "$CASE_DIR/out" "Bootstrap mode"
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
pass "ledger bootstrap preserves all application images"

make_mocks malformed
printf 'broken-ledger\n' >"$CASE_DIR/state/ledger.tsv"
set_current 1
if "$MAINTAIN" --execute >"$CASE_DIR/out" 2>&1; then echo "FAIL: malformed ledger succeeded" >&2; exit 1; fi
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "malformed ledger prevents all cleanup"

make_mocks ownership
for n in 1 2 3 4; do add_record "$n"; done
set_current 4
python3 - "$CASE_DIR/state/images.tsv" "$(tag_for "$(sha 1)")" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
owned = '["' + sys.argv[2] + '"]'
foreign = '["' + sys.argv[2] + '","foreign/repository:tag"]'
p.write_text(p.read_text().replace(owned, foreign, 1))
PY
if "$MAINTAIN" --execute >"$CASE_DIR/out" 2>&1; then echo "FAIL: foreign image ownership succeeded" >&2; exit 1; fi
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "foreign image ownership prevents all cleanup"

make_mocks stopped_reference
for n in 1 2 3 4; do add_record "$n"; done
set_current 4
printf '%s\tstopped-container\n' "$(image_id 1)" >"$CASE_DIR/state/references.tsv"
if "$MAINTAIN" --execute >"$CASE_DIR/out" 2>&1; then echo "FAIL: stopped reference succeeded" >&2; exit 1; fi
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "stopped-container references prevent all cleanup"

make_mocks failure
for n in 1 2 3 4; do add_record "$n"; done
set_current 4
export MOCK_IMAGE_LS_FAIL=1
if "$MAINTAIN" --execute >"$CASE_DIR/out" 2>&1; then echo "FAIL: Docker failure succeeded" >&2; exit 1; fi
assert_not_contains "$CASE_DIR/commands.log" "docker image rm"
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "Docker inspection failure prevents all cleanup"

make_mocks removal_failure
for n in 1 2 3 4; do add_record "$n"; done
set_current 4
export MOCK_RM_FAIL_ID="$(image_id 1)"
if "$MAINTAIN" --execute >"$CASE_DIR/out" 2>&1; then echo "FAIL: failed image removal succeeded" >&2; exit 1; fi
assert_not_contains "$CASE_DIR/commands.log" "docker image prune"
pass "image-removal failure prevents dangling-image pruning"

make_mocks installer_success
for n in 1 2 3; do add_record "$n"; done
set_current 3
"$MANAGE" install >"$CASE_DIR/out"
dry_line="$(grep -n 'docker ps -aq' "$CASE_DIR/commands.log" | head -1 | cut -d: -f1)"
enable_line="$(grep -n 'systemctl enable --now' "$CASE_DIR/commands.log" | cut -d: -f1)"
[[ "$dry_line" -lt "$enable_line" && -f "$CASE_DIR/systemd/kamooni-staging-docker-maintenance.timer" ]]
pass "installer validates with a successful dry run before enabling timer"

make_mocks installer_failure
printf 'broken\n' >"$CASE_DIR/state/ledger.tsv"
set_current 1
if "$MANAGE" install >"$CASE_DIR/out" 2>&1; then echo "FAIL: unsafe installer succeeded" >&2; exit 1; fi
[[ ! -e "$CASE_DIR/systemd/kamooni-staging-docker-maintenance.timer" ]]
assert_not_contains "$CASE_DIR/commands.log" "systemctl enable --now"
pass "failed installer validation leaves systemd untouched"

make_mocks lifecycle
for n in 1 2 3; do add_record "$n"; done
set_current 3
"$MANAGE" install >/dev/null
"$MANAGE" status >/dev/null
"$MANAGE" remove >/dev/null
[[ ! -e "$CASE_DIR/systemd/kamooni-staging-docker-maintenance.timer" && ! -e "$CASE_DIR/systemd/kamooni-staging-docker-maintenance.service" ]]
assert_contains "$CASE_DIR/commands.log" "systemctl disable --now kamooni-staging-docker-maintenance.timer"
pass "installer status and remove manage only maintenance units"

make_mocks locking
for n in 1 2 3; do add_record "$n"; done
set_current 3
cat >"$CASE_DIR/bin/flock" <<'PY'
#!/usr/bin/python3
import fcntl, os, sys
fcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX)
with open(os.environ["MOCK_LOG"], "a", encoding="utf-8") as handle:
    handle.write(f"flock-acquired {os.getppid()}\n")
PY
chmod +x "$CASE_DIR/bin/flock"
touch "$CASE_DIR/curl.wait"
export MOCK_CURL_WAIT_FILE="$CASE_DIR/curl.wait"
"$MAINTAIN" --dry-run >"$CASE_DIR/maintenance.out" 2>&1 &
maintenance_pid=$!
for ignored in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    grep -F 'curl -fsSL' "$CASE_DIR/commands.log" >/dev/null && break
    sleep 0.05
done
grep -F 'curl -fsSL' "$CASE_DIR/commands.log" >/dev/null
KAMOONI_STAGING_LOCK_FILE="$KAMOONI_STAGING_LOCK_FILE" "$DEPLOY" main >"$CASE_DIR/deploy.out" 2>&1 &
deploy_pid=$!
sleep 0.2
[[ "$(grep -c '^flock-acquired ' "$CASE_DIR/commands.log")" -eq 1 ]]
rm -f "$CASE_DIR/curl.wait"
wait "$maintenance_pid"
if wait "$deploy_pid"; then echo "FAIL: test deployment unexpectedly succeeded" >&2; exit 1; fi
[[ "$(grep -c '^flock-acquired ' "$CASE_DIR/commands.log")" -eq 2 ]]
unset MOCK_CURL_WAIT_FILE
pass "deployment waits for maintenance to release the shared exclusive lock"

deploy_lock="$(grep '^MAINTENANCE_LOCK=' "$DEPLOY" | head -1)"
maintain_lock="$(grep '^LOCK_FILE=' "$MAINTAIN" | head -1)"
[[ "$deploy_lock" == *'/run/lock/kamooni-staging-docker.lock'* && "$maintain_lock" == *'/run/lock/kamooni-staging-docker.lock'* ]]
grep -F 'flock -x 9' "$DEPLOY" >/dev/null
grep -F 'flock -x 9' "$MAINTAIN" >/dev/null
grep -F 'ExecStart=/home/ubuntu/kamooni/circles/scripts/maintain-staging-docker.sh --execute' "$REPO_DIR/systemd/kamooni-staging-docker-maintenance.service" >/dev/null
pass "deployment, maintenance, and timer use the same exclusive lock path"

version_line="$(grep -n 'Version check passed for exact target' "$DEPLOY" | cut -d: -f1)"
ledger_line="$(grep -n 'Recorded verified deployment' "$DEPLOY" | cut -d: -f1)"
[[ "$version_line" -lt "$ledger_line" ]]
grep -F 'json.loads(sys.argv[1]).get("gitSha") == sys.argv[2]' "$DEPLOY" >/dev/null
grep -F '[[ "$DEPLOY_CONTAINER_IMAGE_ID" == "$DEPLOY_IMAGE_ID" ]]' "$DEPLOY" >/dev/null
pass "deployment records the ledger only inside the successful exact-version branch"

for forbidden in 'docker volume rm' 'docker container rm' 'docker network rm' 'docker system prune'; do
    ! grep -F "$forbidden" "$MAINTAIN" "$MANAGE" "$REPO_DIR/systemd/"* >/dev/null
done
pass "maintenance implementation contains no volume, container, network, or system prune operation"

echo "1..$PASS"
