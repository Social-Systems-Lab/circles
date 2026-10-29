#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY_SCRIPT="$SCRIPT_DIR/../deploy-genesis2.sh"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-git-sync-test.XXXXXX")"
trap 'rm -rf -- "$TMP_ROOT"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
expect_rejected() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label (expected $expected, got $actual)"
}

# Check the ordered locations of production operations, not only their presence.
previous_line=0
for required in \
  'if [[ "$#" -ne 1 || "$1" != "main" ]]' \
  'if [[ "$CURRENT_DIR" != "$EXPECTED_DIR" ]]' \
  'if [[ "$(git branch --show-current)" != "main" ]]' \
  'if ! require_clean_worktree; then' \
  'ORIGIN_URL="$(git remote get-url origin' \
  'git fetch --no-tags origin "refs/heads/main:refs/remotes/origin/main"' \
  'if ! require_clean_worktree; then' \
  'git merge-base --is-ancestor HEAD refs/remotes/origin/main' \
  'git merge --ff-only refs/remotes/origin/main' \
  'if ! require_clean_worktree; then' \
  'LOCAL_SHA="$(git rev-parse HEAD)"' \
  'ISOLATION_GUARD="$APP_DIR/scripts/check-production-staging-isolation.sh"' \
  'docker compose build circles cron'; do
  line="$(rg -n -F -- "$required" "$DEPLOY_SCRIPT" | awk -F: -v after="$previous_line" '$1 > after { print $1; exit }')"
  [[ -n "$line" ]] || fail "deploy implementation drifted or is out of order near: $required"
  (( line > previous_line )) || fail "deployment operation order changed near: $required"
  previous_line="$line"
done
grep -q 'ORIGIN_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"' "$DEPLOY_SCRIPT" || fail "missing origin/main SHA validation"
grep -q 'git branch --show-current' "$DEPLOY_SCRIPT" || fail "missing final branch validation"
if rg -n 'git reset --hard' "$DEPLOY_SCRIPT"; then fail "production deployment uses destructive reset"; fi

# Invalid-argument tests execute the real script; its argument check exits before
# production-directory validation, Git, Docker, database, or service operations.
for argument_case in missing non_main extra; do
  output="$TMP_ROOT/argument-$argument_case.out"
  case "$argument_case" in
    missing) if "$DEPLOY_SCRIPT" >"$output" 2>&1; then fail "missing argument was accepted"; else status=$?; fi ;;
    non_main) if "$DEPLOY_SCRIPT" feature/test >"$output" 2>&1; then fail "non-main argument was accepted"; else status=$?; fi ;;
    extra) if "$DEPLOY_SCRIPT" main extra >"$output" 2>&1; then fail "extra argument was accepted"; else status=$?; fi ;;
  esac
  [[ "$status" -eq 2 ]] || fail "$argument_case argument returned $status instead of 2"
  grep -Fq 'Error: production deployment requires the explicit branch argument: main' "$output" || fail "$argument_case argument returned unexpected message"
done
if rg -n 'git reset --hard' "$DEPLOY_SCRIPT"; then fail "production deployment uses destructive reset"; fi

create_fixture() {
  local name="$1"
  local bare="$TMP_ROOT/$name-origin.git" repo="$TMP_ROOT/$name-repo"
  git init --bare -q "$bare"
  git init -q -b main "$repo"
  git -C "$repo" config user.name Fixture
  git -C "$repo" config user.email fixture@example.test
  printf 'base\n' >"$repo/tracked.txt"
  git -C "$repo" add tracked.txt
  git -C "$repo" commit -qm base
  git -C "$repo" remote add origin "$bare"
  git -C "$repo" push -qu origin main
  git --git-dir="$bare" symbolic-ref HEAD refs/heads/main
  printf '%s\n' "$repo"
}

sync_fixture() {
  local repo="$1"
  [[ "$(git -C "$repo" branch --show-current)" == main ]] || return 20
  [[ -z "$(git -C "$repo" status --porcelain --untracked-files=all)" ]] || return 21
  case "$(git -C "$repo" remote get-url origin)" in
    https://github.com/Social-Systems-Lab/circles.git|git@github.com:Social-Systems-Lab/circles.git|ssh://git@github.com/Social-Systems-Lab/circles.git|"$TMP_ROOT"/*-origin.git) ;;
    *) return 22 ;;
  esac
  git -C "$repo" fetch --no-tags origin 'refs/heads/main:refs/remotes/origin/main' || return
  [[ -z "$(git -C "$repo" status --porcelain --untracked-files=all)" ]] || return 23
  git -C "$repo" merge-base --is-ancestor HEAD refs/remotes/origin/main || return 24
  git -C "$repo" merge --ff-only refs/remotes/origin/main || return
  [[ -z "$(git -C "$repo" status --porcelain --untracked-files=all)" ]] || return 25
  [[ "$(git -C "$repo" branch --show-current)" == main ]] || return 26
  [[ "$(git -C "$repo" rev-parse HEAD)" == "$(git -C "$repo" rev-parse refs/remotes/origin/main)" ]] || return 27
}

# These fixtures simulate the synchronization sequence in disposable repositories;
# they do not execute the production block. Ordered source assertions above guard drift.

repo="$(create_fixture fast-forward)"
git -C "$repo" checkout -qb upstream-main
printf 'advance\n' >>"$repo/tracked.txt"
git -C "$repo" commit -qam advance
git -C "$repo" push -qu origin HEAD:main
git -C "$repo" checkout -q main
sync_fixture "$repo" || fail "clean fast-forward failed"

repo="$(create_fixture up-to-date)"
sync_fixture "$repo" || fail "already-up-to-date sync failed"

for dirty_kind in tracked untracked; do
  repo="$(create_fixture "dirty-$dirty_kind")"
  before="$(git -C "$repo" rev-parse HEAD)"
  if [[ "$dirty_kind" == tracked ]]; then printf 'local edit\n' >>"$repo/tracked.txt"; else printf 'keep me\n' >"$repo/local-untracked.txt"; fi
  if sync_fixture "$repo"; then fail "$dirty_kind dirt was accepted"; fi
  [[ "$(git -C "$repo" rev-parse HEAD)" == "$before" ]] || fail "$dirty_kind rejection changed HEAD"
  if [[ "$dirty_kind" == untracked ]]; then [[ -f "$repo/local-untracked.txt" ]] || fail "untracked file was removed"; else rg -q 'local edit' "$repo/tracked.txt" || fail "tracked edit was overwritten"; fi
done

repo="$(create_fixture diverged)"
git -C "$repo" checkout -qb upstream-main
printf 'remote\n' >>"$repo/tracked.txt"
git -C "$repo" commit -qam remote
git -C "$repo" push -qu origin HEAD:main
git -C "$repo" checkout -q main
printf 'local\n' >>"$repo/tracked.txt"
git -C "$repo" commit -qam local
before="$(git -C "$repo" rev-parse HEAD)"
if sync_fixture "$repo"; then fail "divergent branch was accepted"; fi
[[ "$(git -C "$repo" rev-parse HEAD)" == "$before" ]] || fail "divergence rejection changed local HEAD"

repo="$(create_fixture wrong-branch)"
git -C "$repo" checkout -qb feature/test
if sync_fixture "$repo"; then fail "non-main checkout was accepted"; fi

repo="$(create_fixture wrong-origin)"
git -C "$repo" remote set-url origin https://example.invalid/repo.git
if sync_fixture "$repo"; then fail "wrong origin was accepted"; fi

echo "Disposable production Git synchronization tests passed."
