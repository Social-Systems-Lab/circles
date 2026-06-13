#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <kamooni|peerify>" >&2
  exit 2
fi

case "$TARGET" in
  kamooni)
    files=(
      "src/app/page.tsx"
      "src/app/welcome/page.tsx"
      "src/app/layout.tsx"
      "src/app/not-found.tsx"
      "src/components/layout/global-nav.tsx"
      "src/components/layout/global-nav-items.tsx"
      "src/components/forms/signup/onboarding-signup-flow.tsx"
      "src/components/modules/feeds/feed.tsx"
    )
    forbidden_strings=(
      "Peerify"
      "peerify"
      "/peerify/"
      "peerify-landing-page"
    )
    ;;
  peerify)
    files=(
      "src/app/page.tsx"
      "src/app/welcome/page.tsx"
      "src/app/layout.tsx"
      "src/app/not-found.tsx"
      "src/components/layout/global-nav.tsx"
      "src/components/layout/global-nav-items.tsx"
      "src/components/forms/signup/onboarding-signup-flow.tsx"
      "src/components/modules/feeds/feed.tsx"
      "src/app/onboarding/peerify/page.tsx"
    )
    forbidden_strings=(
      "Kamooni"
      "kamooni"
      "/images/landing/kamooni"
      "kamooni-landing-page"
    )
    ;;
  *)
    echo "Error: unsupported branding target '$TARGET'. Expected 'kamooni' or 'peerify'." >&2
    exit 2
    ;;
esac

failures=0

for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "BRANDING GUARD FAIL [$TARGET] missing file: $file" >&2
    failures=1
    continue
  fi

  for forbidden in "${forbidden_strings[@]}"; do
    while IFS=: read -r line_number _; do
      [[ -n "$line_number" ]] || continue
      echo "BRANDING GUARD FAIL [$TARGET] $file:$line_number contains forbidden string: $forbidden" >&2
      failures=1
    done < <(LC_ALL=C grep -F -n -- "$forbidden" "$file" || true)
  done
done

if [[ "$failures" -ne 0 ]]; then
  echo "Branding guard failed for target '$TARGET'." >&2
  exit 1
fi

echo "Branding guard OK for target '$TARGET'."
