# Security Review Report

Report date: 2026-06-06

Scope: best-effort whole-system review of the Circles Next.js application, API routes, dependency surface, Docker runtime, and security test coverage in this workspace.

Important limitation: the Codex Security repository-wide workflow requires explicit subagent authorization for a true exhaustive file-by-file scan. That authorization was not available in this run, so this report does not claim exhaustive Codex Security coverage. It records a manual whole-system review, validated hardening changes, automated security checks, and remaining risk areas.

## Executive Summary

- `npm audit --omit=dev --package-lock=false --legacy-peer-deps` now reports 0 vulnerabilities.
- Next.js is upgraded to `16.2.7`.
- React and React DOM are upgraded to `19.2.7`.
- TypeScript latest dist-tag was confirmed as `6.0.3`, and the project is using `typescript@6.0.3`.
- Donorbox webhook verification was hardened with timestamped HMAC validation and constant-time comparison.
- Cron route bearer-token checks were hardened with constant-time comparison.
- Next image optimization no longer allows arbitrary remote hosts, reducing SSRF/image-proxy abuse risk.
- Baseline security headers are configured globally.
- Unit and Playwright security tests were added and are passing.
- k6 load-test coverage was added for 1000 virtual users, but k6 is not installed locally, so the stress test was not executed here.

## Fixed Findings

### Donorbox Webhook Signature Validation

Risk: webhook signatures were compared directly and replay resistance was weak.

Change:
- Added `src/lib/security/donorbox.ts`.
- Validates `timestamp,signature` headers.
- Uses HMAC-SHA256 over `timestamp.body`.
- Rejects stale signatures using a 60 second default tolerance.
- Uses constant-time equality.
- Returns `400` for malformed JSON.
- Avoids logging full webhook payloads.

Tests:
- `src/lib/security/donorbox.test.ts`

### Cron Bearer Tokens

Risk: route authorization used plain string comparison.

Change:
- Added `src/lib/security/request-auth.ts`.
- Updated cron routes to use constant-time bearer validation.

Affected routes:
- `src/app/api/cron/message-reminders/route.ts`
- `src/app/api/cron/email-reminders/route.ts`
- `src/app/api/cron/message-reminders/manual/route.ts`

Tests:
- `src/lib/security/request-auth.test.ts`

### Remote Image Optimizer SSRF Surface

Risk: `next.config.mjs` allowed wildcard `http` and `https` remote image hosts. That lets the image optimizer fetch arbitrary remote URLs.

Change:
- Removed wildcard image remote patterns.
- Allows Kamooni production origins, configured app origins, optional comma-separated `NEXT_IMAGE_REMOTE_HOSTS`, and local dev origins only outside production.

Tests:
- `tests/unit/next-config-security.test.ts`
- `tests/playwright/security-smoke.pw.ts`

### Security Headers

Change:
- Added global headers:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(self)`

Tests:
- `tests/unit/next-config-security.test.ts`
- `tests/playwright/security-smoke.pw.ts`

## Remaining Risk Register

### Full Exhaustive Scan Deferred

Severity: process risk

The exhaustive Codex Security scan was not run because repository-wide scans require explicit subagent authorization. This run still performed a best-effort whole-system review and added automated tests, but it is not a substitute for the full scan workflow.

### `/uploads/[...path]` SVG Delivery

Severity: medium

If user-controlled SVG uploads are allowed and served same-origin as `image/svg+xml`, stored SVG can become an XSS vector. Confirm upload validation blocks SVG, or serve uploaded SVG as attachment with a restrictive content type/CSP.

### `/api/access` Caller-Supplied Identity

Severity: medium

Review direct API access to ensure authorization decisions are derived from the authenticated session/server context, not caller-supplied identity values such as `userDid` in request bodies.

### Build-Time Debug Logging

Severity: low

The production build prints DB/auth debug details such as fallback hosts and app paths. These logs are not secrets in the observed output, but production build/deploy logs should avoid unnecessary environment disclosure.

### Next/Turbopack Trace Warning

Severity: low

`next build` completes successfully but reports a Turbopack NFT trace warning involving `next.config.mjs` and `/api/version`. This should be monitored after future Next upgrades.

### Dependency Major Migrations Deferred

Severity: process risk

Several packages have newer major versions but require functional regression work, including MongoDB 7, Tailwind 4, Zod 4, Recharts 3, React Day Picker 10, and Framer Motion stable 12.x. These are tracked in the dependency risk report.

