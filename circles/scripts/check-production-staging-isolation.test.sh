#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_DIR="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
GUARD="$SCRIPT_DIR/check-production-staging-isolation.sh"
STAGING_CAPTURE_COMMIT="ded6b5c9e50a0006003235609d9765c0386919a6"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-production-isolation.XXXXXX")"
trap 'rm -rf -- "$TEMP_ROOT"' EXIT

new_fixture() {
  local name="$1"
  local root="$TEMP_ROOT/$name"
  mkdir -p "$root/src"
  printf 'export const safe = true;\n' >"$root/src/safe.ts"
  printf '%s\n' "$root"
}

expect_pass() {
  local label="$1"
  local root="$2"
  if ! "$GUARD" --root "$root" >"$TEMP_ROOT/output.log" 2>&1; then
    echo "FAIL: expected guard to allow $label" >&2
    cat "$TEMP_ROOT/output.log" >&2
    exit 1
  fi
}

expect_fail() {
  local label="$1"
  local root="$2"
  if "$GUARD" --root "$root" >"$TEMP_ROOT/output.log" 2>&1; then
    echo "FAIL: expected guard to reject $label" >&2
    exit 1
  fi
}

main_copy="$TEMP_ROOT/origin-main"
mkdir -p "$main_copy"
git -C "$REPO_DIR" archive origin/main:circles | tar -x -C "$main_copy"
expect_pass "a copy of origin/main" "$main_copy"

missing_source_fixture="$TEMP_ROOT/missing-source"
mkdir -p "$missing_source_fixture"
expect_fail "a missing source directory" "$missing_source_fixture"

empty_source_fixture="$TEMP_ROOT/empty-source"
mkdir -p "$empty_source_fixture/src"
expect_fail "an empty source directory" "$empty_source_fixture"

unreadable_fixture="$(new_fixture unreadable-source)"
chmod 000 "$unreadable_fixture/src/safe.ts"
expect_fail "an unreadable source file" "$unreadable_fixture"
chmod 600 "$unreadable_fixture/src/safe.ts"

for artifact in \
  src/app/admin/emails/page.tsx \
  src/lib/email/capture-config.ts \
  src/lib/email/captured-email-storage.ts \
  src/lib/email/captured-emails.ts \
  src/lib/email/captured-emails-admin.ts; do
  fixture="$(new_fixture "artifact-$(echo "$artifact" | tr '/.' '--')")"
  mkdir -p "$(dirname -- "$fixture/$artifact")"
  printf 'export const stagedOnly = true;\n' >"$fixture/$artifact"
  expect_fail "$artifact" "$fixture"
done

for signature in \
  EMAIL_CAPTURE_ENABLED \
  EMAIL_TRANSPORT \
  KAMOONI_DEPLOYMENT_ENV \
  stagingCapturedEmails \
  storeCapturedEmail \
  requireCaptureConfiguration \
  getCaptureConfiguration \
  mayLogSensitiveDevelopmentEmailLinks \
  /admin/emails \
  'EMAIL_TRANSPORT = "capture"' \
  'transport: "capture"'; do
  fixture="$(new_fixture "signature-$RANDOM")"
  printf '// %s\n' "$signature" >"$fixture/src/signature.ts"
  expect_fail "$signature" "$fixture"
done

allowed_fixture="$(new_fixture allowed-staging-material)"
mkdir -p "$allowed_fixture/docs"
printf 'EMAIL_CAPTURE_ENABLED and /admin/emails are documented staging concepts.\n' >"$allowed_fixture/docs/STAGING_EMAIL_CAPTURE.md"
printf 'services:\n  circles:\n    environment:\n      EMAIL_TRANSPORT: capture\n' >"$allowed_fixture/docker-compose.staging.yml"
printf 'EMAIL_CAPTURE_ENABLED=true\n' >"$allowed_fixture/.env.staging.example"
expect_pass "staging documentation, Compose, and examples" "$allowed_fixture"

staging_copy="$TEMP_ROOT/staging-capture-commit"
mkdir -p "$staging_copy"
git -C "$REPO_DIR" archive "$STAGING_CAPTURE_COMMIT:circles" | tar -x -C "$staging_copy"
expect_fail "a copy of staging capture commit $STAGING_CAPTURE_COMMIT" "$staging_copy"

echo "Production staging-isolation guard tests passed."
