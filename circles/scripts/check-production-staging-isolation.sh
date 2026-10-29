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
  "EMAIL_TRANSPORT"
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

capture_transport_pattern='EMAIL_TRANSPORT.{0,120}["'"'']capture["'"'']|["'"'']capture["'"''].{0,120}EMAIL_TRANSPORT|transport[[:space:]]*:[[:space:]]*["'"'']capture["'"'']'
transport_matches=""
transport_status=0
transport_matches="$(LC_ALL=C grep -E -n -H -- "$capture_transport_pattern" "${scan_files[@]}" 2>&1)" || transport_status=$?
if [[ "$transport_status" -eq 0 ]]; then
  while IFS= read -r match; do
    relative_match="${match#"$APPLICATION_ROOT/"}"
    echo "PRODUCTION ISOLATION FAIL: staging-only capture transport: $relative_match" >&2
  done <<<"$transport_matches"
  failures=1
elif [[ "$transport_status" -ne 1 ]]; then
  echo "PRODUCTION ISOLATION FAIL: capture transport scan failed: $transport_matches" >&2
  exit 1
fi

if [[ "$failures" -ne 0 ]]; then
  echo "Production staging-isolation guard failed." >&2
  exit 1
fi

echo "Production staging-isolation guard passed."
