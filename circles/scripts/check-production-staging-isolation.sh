#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--root APPLICATION_ROOT]" >&2
  exit 2
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APPLICATION_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

if [[ "$#" -gt 0 ]]; then
  [[ "$#" -eq 2 && "$1" == "--root" && -n "$2" ]] || usage
  APPLICATION_ROOT="$(cd -- "$2" 2>/dev/null && pwd -P)" || {
    echo "PRODUCTION ISOLATION FAIL: application root is missing or unreadable: $2" >&2
    exit 1
  }
fi

if [[ ! -d "$APPLICATION_ROOT/src" || ! -r "$APPLICATION_ROOT/src" ]]; then
  echo "PRODUCTION ISOLATION FAIL: required source directory is missing or unreadable: $APPLICATION_ROOT/src" >&2
  exit 1
fi

forbidden_paths=(
  "src/app/admin/emails"
  "src/lib/email/capture-config.ts"
  "src/lib/email/captured-email-storage.ts"
  "src/lib/email/captured-emails.ts"
  "src/lib/email/captured-emails-admin.ts"
)

failures=0
for relative_path in "${forbidden_paths[@]}"; do
  if [[ -e "$APPLICATION_ROOT/$relative_path" ]]; then
    echo "PRODUCTION ISOLATION FAIL: staging-only runtime artifact exists: $relative_path" >&2
    failures=1
  fi
done

SOURCE_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/kamooni-production-source.XXXXXX")" || {
  echo "PRODUCTION ISOLATION FAIL: could not create the source manifest." >&2
  exit 1
}
trap 'rm -f -- "$SOURCE_MANIFEST"' EXIT
if ! find "$APPLICATION_ROOT/src" -type f -print0 >"$SOURCE_MANIFEST"; then
  echo "PRODUCTION ISOLATION FAIL: application source traversal failed." >&2
  exit 1
fi

scan_files=()
while IFS= read -r -d '' file; do
  scan_files+=("$file")
done <"$SOURCE_MANIFEST"

if [[ "${#scan_files[@]}" -eq 0 ]]; then
  echo "PRODUCTION ISOLATION FAIL: no application source files were found." >&2
  exit 1
fi

for relative_path in Dockerfile Dockerfile.cron docker-compose.yml docker-entrypoint.sh next.config.mjs; do
  if [[ -e "$APPLICATION_ROOT/$relative_path" ]]; then
    if [[ ! -f "$APPLICATION_ROOT/$relative_path" || ! -r "$APPLICATION_ROOT/$relative_path" ]]; then
      echo "PRODUCTION ISOLATION FAIL: runtime file is unreadable: $relative_path" >&2
      failures=1
    else
      scan_files+=("$APPLICATION_ROOT/$relative_path")
    fi
  fi
done

forbidden_identifiers=(
  "EMAIL_CAPTURE_ENABLED"
  "KAMOONI_DEPLOYMENT_ENV"
  "stagingCapturedEmails"
  "storeCapturedEmail"
  "requireCaptureConfiguration"
  "getCaptureConfiguration"
  "mayLogSensitiveDevelopmentEmailLinks"
  "/admin/emails"
)

for identifier in "${forbidden_identifiers[@]}"; do
  matches=""
  grep_status=0
  matches="$(LC_ALL=C grep -F -n -H -- "$identifier" "${scan_files[@]}" 2>&1)" || grep_status=$?
  if [[ "$grep_status" -eq 0 ]]; then
    while IFS= read -r match; do
      relative_match="${match#"$APPLICATION_ROOT/"}"
      echo "PRODUCTION ISOLATION FAIL: staging-only runtime identifier '$identifier': $relative_match" >&2
    done <<<"$matches"
    failures=1
  elif [[ "$grep_status" -ne 1 ]]; then
    echo "PRODUCTION ISOLATION FAIL: source scan failed while checking '$identifier': $matches" >&2
    exit 1
  fi
done

capture_transport_pattern="EMAIL_TRANSPORT[[:space:]]*[:=][[:space:]]*['\"]?capture|transport[[:space:]]*:[[:space:]]*['\"]capture"
capture_transport_matches=""
capture_transport_status=0
capture_transport_matches="$(LC_ALL=C grep -E -n -H -- "$capture_transport_pattern" "${scan_files[@]}" 2>&1)" || capture_transport_status=$?
if [[ "$capture_transport_status" -eq 0 ]]; then
  while IFS= read -r match; do
    relative_match="${match#"$APPLICATION_ROOT/"}"
    echo "PRODUCTION ISOLATION FAIL: staging-only capture transport: $relative_match" >&2
  done <<<"$capture_transport_matches"
  failures=1
elif [[ "$capture_transport_status" -ne 1 ]]; then
  echo "PRODUCTION ISOLATION FAIL: capture transport scan failed: $capture_transport_matches" >&2
  exit 1
fi

PRODUCTION_COMPOSE="$APPLICATION_ROOT/docker-compose.yml"
PRODUCTION_DOCKERFILE="$APPLICATION_ROOT/Dockerfile"
if [[ ! -f "$PRODUCTION_COMPOSE" || ! -r "$PRODUCTION_COMPOSE" ]]; then
  echo "PRODUCTION ISOLATION FAIL: production Compose file is missing or unreadable." >&2
  failures=1
else
  if LC_ALL=C grep -Fqi -- 'mailpit' "$PRODUCTION_COMPOSE"; then
    echo "PRODUCTION ISOLATION FAIL: production Compose contains Mailpit configuration." >&2
    failures=1
  fi
  if LC_ALL=C grep -Fq -- 'EMAIL_TRANSPORT=mailpit' "$PRODUCTION_COMPOSE"; then
    echo "PRODUCTION ISOLATION FAIL: production email transport is Mailpit." >&2
    failures=1
  fi
fi

shared_email_router=false
router_status=0
LC_ALL=C grep -Fq -- "resolveEmailTransportConfiguration" "${scan_files[@]}" || router_status=$?
if [[ "$router_status" -eq 0 ]]; then
  shared_email_router=true
elif [[ "$router_status" -ne 1 ]]; then
  echo "PRODUCTION ISOLATION FAIL: could not inspect shared email transport policy." >&2
  exit 1
fi

if [[ "$shared_email_router" == true ]]; then
  EMAIL_ROUTER="$APPLICATION_ROOT/src/lib/data/email.ts"
  if [[ ! -f "$EMAIL_ROUTER" || ! -r "$EMAIL_ROUTER" ]] || \
    ! LC_ALL=C grep -Fq -- 'const DEPLOYMENT_ROLE_FILE = "/app/.kamooni-deployment-role"' "$EMAIL_ROUTER" || \
    ! LC_ALL=C grep -Fq -- 'readFileSync(DEPLOYMENT_ROLE_FILE' "$EMAIL_ROUTER"; then
    echo "PRODUCTION ISOLATION FAIL: runtime email policy does not read the baked deployment-role marker." >&2
    failures=1
  fi
  if [[ -f "$EMAIL_ROUTER" ]] && LC_ALL=C grep -Fq -- 'process.env.KAMOONI_DEPLOYMENT_ROLE' "$EMAIL_ROUTER"; then
    echo "PRODUCTION ISOLATION FAIL: runtime deployment role can be selected through an environment variable." >&2
    failures=1
  fi
  if ! LC_ALL=C grep -Fq -- 'EMAIL_TRANSPORT=postmark' "$PRODUCTION_COMPOSE"; then
    echo "PRODUCTION ISOLATION FAIL: production Compose does not hard-select Postmark." >&2
    failures=1
  fi
  if ! LC_ALL=C grep -Eq -- 'KAMOONI_DEPLOYMENT_ROLE:[[:space:]]*production' "$PRODUCTION_COMPOSE"; then
    echo "PRODUCTION ISOLATION FAIL: production image role is not explicitly set to production." >&2
    failures=1
  fi
  if [[ ! -f "$PRODUCTION_DOCKERFILE" ]] || ! LC_ALL=C grep -Fq -- 'ARG KAMOONI_DEPLOYMENT_ROLE=production' "$PRODUCTION_DOCKERFILE"; then
    echo "PRODUCTION ISOLATION FAIL: Dockerfile does not default the immutable image role to production." >&2
    failures=1
  fi
fi

if [[ "$failures" -ne 0 ]]; then
  echo "Production staging-isolation guard failed." >&2
  exit 1
fi

echo "Production staging-isolation guard passed."
