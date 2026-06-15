# Test Review Report

Report date: 2026-06-15
Reviewed branch: `codex/tailwind-4-migration`
App version: `0.8.15` (Next.js `16.2.7`, React `19.2.7`, Bun `1.3.7`)

This report is a full review of the automated-test surface for the Circles / Kamooni
app: what exists, what currently passes, how it is wired, where the gaps are, and
recommended next steps.

---

## 1. Summary

| Gate | Command | Result |
| --- | --- | --- |
| Unit tests | `bun run test:unit` | **PASS** — 7 pass / 0 fail / 21 `expect()` calls (3 files) |
| TypeScript | `bun run check:chat-actions` | **PASS** (after regenerating Next route types — see §5) |
| Lint | `bun run lint` | **PASS** — `eslint . --quiet`, 0 errors |
| Production build | `bun run build` | **PASS** — `next build`, standalone output |
| Playwright smoke | `bun run test:playwright` | **PASS** — 3 passed (chromium) |
| k6 load test | `bun run test:k6` | **NOT RUN** — `k6` binary not installed on this machine |

Overall: every gate that can run on this machine is green. The suite is small,
fast (unit suite < 0.5s, smoke suite ~11.5s), and deliberately focused on
**security regressions** rather than broad feature coverage.

---

## 2. Test inventory

### Unit tests (`bun test`, runtime `bun:test`)

| File | Tests | What it locks down |
| --- | --- | --- |
| `tests/unit/next-config-security.test.ts` | 2 | No wildcard (`**`) image remote host; `kamooni.org` is allowed; baseline security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) are present in `next.config.mjs`. |
| `src/lib/security/donorbox.test.ts` | 3 | Donorbox webhook signature header parsing; valid timestamped HMAC accepted; tampered body / bad signature / stale timestamp rejected. |
| `src/lib/security/request-auth.test.ts` | 2 | Bearer-token matching (scheme + value); constant-time string compare rejects empty / different-length strings. |

Unit tests are colocated two ways: a dedicated `tests/unit/` folder and
`*.test.ts` files next to the code under `src/lib/security/`. `bun test`
discovers both.

### End-to-end / API smoke (`tests/playwright/security-smoke.pw.ts`, 3 tests)

- `/api/version` returns `version` / `gitSha` / `buildTime` and `Cache-Control: no-store`.
- Public API responses carry the baseline security headers.
- `/_next/image` rejects unconfigured remote origins (e.g. a `169.254.169.254`
  metadata-service style host) with `400`/`403` — an SSRF guard.

### Load test (`tests/k6/kamooni-1000-vus.js`)

- Constant 1000 VUs for 5m against public read endpoints (`/api/version`, `/`,
  `/explore`, `/circles`).
- Thresholds: `http_req_failed < 5%`, `p95 < 1500ms`.
- Target via `BASE_URL` env (defaults to `http://localhost:3000`).

---

## 3. How the suite is wired

- `package.json` scripts:
  - `test` → `test:unit` → `bun test`
  - `test:playwright` → `playwright test`
  - `test:security` → unit **then** playwright (the intended "security gate")
  - `test:k6` → `k6 run tests/k6/kamooni-1000-vus.js`
- `playwright.config.ts`:
  - `testDir: ./tests/playwright`, `testMatch: **/*.pw.ts`
  - Auto-starts a Next dev server (`reuseExistingServer: true`) and waits on the
    `/api/version` health URL, unless `PLAYWRIGHT_BASE_URL` is set.
  - `trace: retain-on-failure`; HTML report under `reports/playwright-html`.
- `tsconfig.json` `check:chat-actions` typecheck includes generated Next route
  types (`.next/types` and `.next/dev/types`) — relevant to §5.

---

## 4. Coverage assessment

**Strengths**

- The security-critical surfaces have real, meaningful assertions: webhook
  signature verification (HMAC + replay window), constant-time auth comparison,
  image-optimizer SSRF protection, and security headers. These are exactly the
  things that cause incidents if they silently regress.
- Tests are deterministic and dependency-light (no DB/network needed for unit;
  the smoke suite only hits `/api/version` and `/_next/image`).
- Fast feedback loop; suitable for a pre-push / CI gate.

**Gaps (by risk)**

1. **No coverage of core domain logic.** Chat ordering
   (`chatConversations.updatedAt`, called out as CRITICAL in `AGENTS.md`),
   circle membership/access rules, Stripe checkout/portal sessions, and the
   VibeID credential flows have no automated tests.
2. **No component/UI tests.** A large React surface (circles, map explorer,
   onboarding, calendar) has zero rendering or interaction tests.
3. **Smoke suite is single-browser, unauthenticated.** Only chromium; no
   logged-in journeys (login, signup, posting, DMs).
4. **k6 is defined but never executed in this environment** — it is effectively
   documentation until `k6` is installed and pointed at a staging target.
5. **No coverage gate / reporting.** `bun test --coverage` is available but not
   wired; there is no enforced threshold.
6. **No CI workflow found in this checkout** to run `test:security` on PRs, so
   the gates rely on a human running them locally (consistent with `AGENTS.md`).

---

## 5. Notable finding: typecheck depends on freshly generated route types

On first run, `bun run check:chat-actions` failed with ~30 errors — but **all of
them originated in generated files**, not source:

```
.next/dev/types/routes.d.ts(88,...): error TS1005: ';' expected.
.next/dev/types/validator.ts(...): error TS1128: Declaration or statement expected.
```

`.next/dev/types/routes.d.ts` line 88 was truncated/corrupted (a route-union
declaration missing its left-hand side), a stale artifact from an interrupted
`next dev`. `tsconfig.json` includes `.next/dev/types/**/*.ts` in the typecheck,
so a corrupt dev artifact fails the gate even though the source is clean.

Resolution applied during this review: removed the stale `.next/dev` directory,
ran a clean `bun run build` (regenerates `.next/types`), and re-ran the
typecheck — **it then passed with exit code 0**.

Recommendation: treat `check:chat-actions` as "run after a fresh build", or run
it in an environment without a half-written `.next/dev`. Optionally drop the
`.next/dev/types` include from the typecheck `tsconfig` so transient dev
artifacts cannot break the gate.

---

## 6. Recommendations (prioritized)

1. **Wire a CI workflow** that runs `bun run test:security` (+ typecheck + build)
   on every PR so the gates are enforced, not just available.
2. **Harden the typecheck gate** against stale `.next/dev` artifacts (see §5).
3. **Add domain tests for the documented CRITICAL invariant**: every chat message
   bumps `chatConversations.updatedAt`. This is the highest-value missing test.
4. **Add at least one authenticated Playwright journey** (login → land on
   `/foryou` or a circle) to catch auth/session regressions.
5. **Install `k6` in CI/staging** and run `test:k6` against staging on a schedule
   so the load thresholds actually mean something.
6. **Add a coverage report** (`bun test --coverage`) to make the (currently
   narrow) coverage visible over time.

---

## 7. Reproduction

```powershell
# from circles/circles
bun run test:unit            # unit suite
bun run lint                 # eslint
bun run build                # regenerates .next/types
bun run check:chat-actions   # typecheck (run after build)
bun run test:playwright      # security smoke (auto-starts dev server)
# k6 (requires k6 installed + a running target):
# $env:BASE_URL="https://staging.example"; bun run test:k6
```
