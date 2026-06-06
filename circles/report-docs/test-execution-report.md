# Test Execution Report

Report date: 2026-06-06

## Passing Gates

### Unit Security Tests

Command:

```powershell
bun run test:unit
```

Result:

- `7 pass`
- `0 fail`
- `21 expect() calls`

Covered:

- Donorbox webhook signature parsing and validation.
- HMAC tamper rejection.
- Stale timestamp rejection.
- Bearer token constant-time validation.
- Next image remote host policy.
- Baseline security headers.

### TypeScript

Command:

```powershell
bun run check:chat-actions
```

Result:

- Passed.

### Lint

Command:

```powershell
bun run lint
```

Result:

- Passed.

Notes:

- `next lint` is no longer suitable after the Next upgrade, so lint now runs `eslint . --quiet`.
- ESLint is pinned to `9.39.4` because `eslint@10.4.1` failed with the current Next/TypeScript lint stack.
- React Compiler migration-only lint rules were disabled to avoid turning this security pass into a large unrelated React refactor.

### Production Build

Command:

```powershell
bun run build
```

Result:

- Passed on `Next.js 16.2.7`.

Build warning:

- Turbopack reported an NFT trace warning involving `next.config.mjs` and `/api/version`. The build completed successfully.

### Playwright Security Smoke

Command:

```powershell
bun run test:playwright
```

Result:

- `3 passed`

Covered:

- `/api/version` returns build metadata and no-cache headers.
- Public API response includes baseline security headers.
- `/_next/image` rejects unconfigured remote origins such as metadata-service style hosts.

Note:

- Playwright prints a `dev exited with code 1` line after the test run because it shuts down the temporary Next dev server. The tests themselves passed.

### Dependency Audit

Command:

```powershell
npm audit --omit=dev --json --package-lock=false --legacy-peer-deps
```

Result:

- `0` vulnerabilities.

## Not Executed

### k6 Stress Test

Reason:

- `k6` is not installed on this machine.

Added script:

- `tests/k6/kamooni-1000-vus.js`

Configured npm script:

- `bun run test:k6`

Default target:

- `http://localhost:3000`

Production or staging runs must set `BASE_URL` explicitly.

