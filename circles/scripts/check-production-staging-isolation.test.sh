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
  cat >"$root/docker-compose.yml" <<'YAML'
services:
  circles:
    build:
      args:
        KAMOONI_DEPLOYMENT_ROLE: production
    environment:
      - EMAIL_TRANSPORT=postmark
YAML
  printf 'ARG KAMOONI_DEPLOYMENT_ROLE=production\n' >"$root/Dockerfile"
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

shared_router_fixture="$(new_fixture shared-router-safe-production)"
mkdir -p "$shared_router_fixture/src/lib/data"
cat >"$shared_router_fixture/src/lib/data/email.ts" <<'TS'
import { readFileSync } from "node:fs";
const DEPLOYMENT_ROLE_FILE = "/app/.kamooni-deployment-role";
function runtimeDeploymentRole() { return readFileSync(DEPLOYMENT_ROLE_FILE, "utf8"); }
export function resolveEmailTransportConfiguration() { return runtimeDeploymentRole(); }
TS
expect_pass "shared email router with production-pinned Postmark" "$shared_router_fixture"

runtime_role_override_fixture="$(new_fixture runtime-role-environment-override)"
mkdir -p "$runtime_role_override_fixture/src/lib/data"
cat >"$runtime_role_override_fixture/src/lib/data/email.ts" <<'TS'
import { readFileSync } from "node:fs";
const DEPLOYMENT_ROLE_FILE = "/app/.kamooni-deployment-role";
function runtimeDeploymentRole() {
  return process.env.KAMOONI_DEPLOYMENT_ROLE || readFileSync(DEPLOYMENT_ROLE_FILE, "utf8");
}
export function resolveEmailTransportConfiguration() { return runtimeDeploymentRole(); }
TS
expect_fail "runtime environment override of the deployment role" "$runtime_role_override_fixture"

mailpit_production_fixture="$(new_fixture mailpit-production-compose)"
printf 'services:\n  circles:\n    environment:\n      - EMAIL_TRANSPORT=mailpit\n  mailpit:\n    image: axllent/mailpit:v1.33.0\n' >"$mailpit_production_fixture/docker-compose.yml"
printf 'export function resolveEmailTransportConfiguration() {}\n' >"$mailpit_production_fixture/src/email.ts"
expect_fail "Mailpit in production Compose" "$mailpit_production_fixture"

wrong_role_fixture="$(new_fixture wrong-production-image-role)"
printf 'export function resolveEmailTransportConfiguration() {}\n' >"$wrong_role_fixture/src/email.ts"
printf 'services:\n  circles:\n    environment:\n      - EMAIL_TRANSPORT=postmark\n' >"$wrong_role_fixture/docker-compose.yml"
printf 'ARG KAMOONI_DEPLOYMENT_ROLE=staging\n' >"$wrong_role_fixture/Dockerfile"
expect_fail "staging role in production image" "$wrong_role_fixture"

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
