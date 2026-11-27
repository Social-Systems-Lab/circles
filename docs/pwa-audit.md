# Kamooni PWA & Web Push Audit

**Branch:** `feat/pwa-web-push` (branched from `main` at `00cd6a38`)  
**Date:** 2026-11-27

---

## 1. Repository Audit (Verified Files & Symbols)

### Frontend Framework & Build
- **App root:** `circles/` inside the repository root (`circles/package.json`, `circles/next.config.mjs`).
- **Framework:** Next.js `15.5.28` (App Router, `output: "standalone"`), React `19.0.0-rc`, TypeScript `5.8.3`, Tailwind CSS `3.4.17`, Radix UI / Shadcn, Jotai (`userAtom`, `authInfoAtom`, `notificationUnreadCountAtom`).
- **Build & runtime:** Built with Bun (`bun install --frozen-lockfile`, `NODE_OPTIONS=--max-old-space-size=3072 bun run build` in `imbios/bun-node:1.3.1-20.19.5-slim`) and run on Node `20.19.5-bookworm-slim` (`CMD ["node", "server.js"]`) with explicit `sharp@0.35.5` install (`circles/Dockerfile`).
- **Root layout & rendering:** `RootLayout` and `generateMetadata` in `circles/src/app/layout.tsx` set `dynamic = "force-dynamic"`, `fetchCache = "force-no-store"`, `revalidate = 0`.

### Authenticated Origin & Routing
- **Production origin:** `https://kamooni.org` (`CIRCLES_URL`). Both public landing (`/`, `Home` in `circles/src/app/page.tsx`) and authenticated app routes (`/chat/*`, `/circles/[handle]/*`, `/explore`, `/foryou`, `/bookmarks`, `/admin`, `/secret-invitations/[invitationId]`) share this single origin root.
- **Staging origin:** `https://staging.kamooni.org` (`circles/nginx/nginx.staging.conf`, `circles/docker-compose.staging.yml`).
- **Origin-split note:** In `circles/nginx/nginx.conf`, port 80 redirects to `https://kamooni.org$request_uri`, while port 443 serves `server_name kamooni.org www.kamooni.org` without redirecting `www.kamooni.org` to `kamooni.org`. Production `www` canonicalization is deferred per MVP decision (not needed for staging).

### Asset Paths, Icons, Middleware & CSP
- **Public assets:** `circles/public/` is copied verbatim into the runtime container (`circles/Dockerfile`).
- **Existing branding assets:** `circles/src/app/icon.svg` (222x222 SVG), `circles/public/images/kamooni-logo.png` (215x215), `circles/public/images/landing/kamooni-emblem-yellow.png` (1912x1872 transparent golden emblem), `circles/public/apple-app-site-association`.
- **Brand colors:** Primary action green `#346f4c` (`--button-primary: 145 36% 32%` in `circles/src/app/globals.css`), app canvas `#fbfbfb` (`circles/src/app/layout.tsx`), warm Kamooni ink `#221710` (`circles/src/components/pages/public-home-page.css`).
- **Middleware exclusions:** `config.matcher` in `circles/src/middleware.ts` already excludes `.js`, `.webmanifest`, `.png`, `.svg`, `.ico`, and `/api`, so `/sw.js`, `/manifest.webmanifest`, and `/icons/*` bypass auth and maintenance redirects.
- **CSP headers:** `circles/nginx/nginx.conf` and `circles/nginx.staging.conf` set `worker-src 'self' blob:` and `connect-src 'self' https: wss:`, which permits same-origin `/sw.js` without weakening CSP.

### Existing Service Worker & Client Cache Behavior
- **Existing SW:** None prior to Phase 1. No Workbox or `next-pwa` packages in `circles/package.json`.
- **Version check script:** `circles/src/app/layout.tsx` (`<Script id="version-check">`) reloads when `localStorage.app_version` changes. Service worker updates must not call `skipWaiting()` unconditionally so they do not conflict or loop with page reloads.

### Authentication, Sessions, Logout & CSRF
- **Session model:** Stateless HS256 JWT stored in an `httpOnly`, `sameSite: "lax"` cookie (`token` in production, `circles_token` in dev; 90-day `maxAge`, `path: "/"`): `createSession`, `generateUserToken`, `verifyUserToken` (`circles/src/lib/auth/jwt.ts`); `AUTH_COOKIE_NAME`, `readAuthToken`, `getAuthCookieNamesForClearing` (`circles/src/lib/auth/cookie.ts`).
- **Server identity:** `getAuthenticatedUserDid()` (`circles/src/lib/auth/auth.ts`) resolves the user's immutable `did`.
- **Client hydration & logout:** `Authenticator` (`circles/src/components/auth/authenticator.tsx`) calls `checkAuth()` (`circles/src/components/auth/actions.ts`). `signOut()` in `circles/src/components/layout/user-toolbox.tsx` calls `logOut()` (`circles/src/components/auth/actions.ts`), which clears auth cookies and revalidates `/`. Because JWTs are stateless, push logout revocation must occur explicitly before clearing cookies.
- **Authorization & tenant boundaries:** Enforced by `middleware` -> `/api/access`, `isAuthorized()` (`circles/src/lib/auth/auth.ts`), and per-route server checks (`EventDetailPage`, `resolveMongoConversationAccess`, `inspectSecretCircleInvitation`).
- **CSRF gap:** Existing cookie-auth APIs rely on `sameSite: "lax"` and `readJsonBodyLimited` (`circles/src/lib/security/bounded-input.ts`). New `/api/push/*` and `/api/notification-preferences` mutating endpoints will enforce explicit `Origin` + `Sec-Fetch-Site: same-origin` checks and per-user rate limiting.

### Notification & Domain Event Code Paths
- **Central funnel:** `sendNotifications(type, recipients, payload, options)` in `circles/src/lib/data/notifications.ts` deduplicates recipients by `did`, filters muted conversations (`filterMutedConversationRecipients`), strips private fields (`shapeNotificationContent` in `circles/src/lib/data/notification-content.ts`), checks `UserNotificationSettings` / `DefaultNotificationSettings` (`isNotificationEnabledForRecipient`), persists to MongoDB `notifications` with optional deterministic `getNotificationIdempotencyId` (`circles/src/lib/data/notification-read.ts`), and calls `dispatchExternalNotifications` (`circles/src/lib/data/external-notifications.ts`).
- **Existing external channel:** Telegram forwarding for `pm_received` via `ExternalNotificationChannels` (`circles/src/lib/data/external-notification-channels.ts`), `circles/src/lib/integrations/telegram.ts`, and `TelegramNotificationsSettingsCard` (`circles/src/app/circles/[handle]/settings/subscription/telegram-notifications-card.tsx`).
- **Verified domain triggers:**
  - Events: `notifyEventInvitation`, `notifyEventOccurrenceInvitation` (`circles/src/lib/data/notifications.ts`); `notifyEventSubmittedForReview`, `notifyEventApproved`, `notifyEventStatusChanged` (`circles/src/lib/data/eventNotifications.ts`) called from `circles/src/app/circles/[handle]/events/actions.ts`.
  - Tasks: `notifyTaskAssigned` and sibling task/shift/claim helpers (`circles/src/lib/data/notifications.ts`) called from `circles/src/app/circles/[handle]/tasks/actions.ts`.
  - Messages & mentions: `sendConversationMessageNotifications` (`circles/src/components/modules/chat/mongo-actions.ts`) and lease-recovered `processFirstTopicNotifications` (`circles/src/lib/chat/first-topic-notifications.ts`). Note `BELL_EXCLUDED_NOTIFICATION_TYPES = ["pm_received"]` (`circles/src/lib/notifications/bell-filter.ts`).
  - Secret Circle invitations: `createSecretCircleInvitation` (`circles/src/lib/data/secret-circle-invitations.ts`) sends generic text `"You have received a private Circle invitation."` -> `/secret-invitations/<id>`.
- **Gaps identified:**
  1. `dispatchExternalNotifications` is fire-and-forget (`void ...`), not durable across restarts.
  2. `getNotificationHref` (`circles/src/components/layout/notifications.tsx`) lacks explicit cases for `event_status_changed`, `event_approved`, `event_submitted_for_review`; a shared server-side safe-route resolver is needed for push payloads.
  3. `notificationPauseConfig` on `Circles` user documents (`circles/src/lib/actions/notificationSettings.ts`) is not currently evaluated inside `sendNotifications` / external dispatch.

### Database, Scheduler, Email & Deployment Constraints
- **Database:** Single-node MongoDB `7.0` (`circles/docker-compose.yml`), official `mongodb ^6.16.0` driver (`circles/src/lib/data/db.ts`, `circles/src/models/models.ts`). Multi-document transactions are unavailable; use idempotent upserts + atomic single-doc `findOneAndUpdate` leases (`first-topic-notifications.ts`).
- **Scheduler:** Alpine `crond` container (`circles/Dockerfile.cron`, `circles/crontab`) curling `http://circles:3000/api/cron/*` with `Authorization: Bearer $CRON_SECRET` (`email-reminders`, `first-topic-notifications`, `onboarding-watchdog`). In `circles/docker-compose.staging.yml`, `cron` is gated behind `profiles: ["cron"]`.
- **Email:** Postmark in production, Mailpit in staging/dev (`circles/src/lib/data/email.ts`). `validatePendingVerificationMessage()` restricts Mailpit to `email-verification` only.
- **Deployment & guards:**
  - `circles/scripts/check-production-staging-isolation.sh` (`.github/workflows/production-staging-isolation.yml` and `circles/deploy-genesis2.sh`).
  - `circles/scripts/check-branding-guard.sh` (`circles/deploy-genesis2.sh`).
  - `circles/scripts/validate-staging-compose.py` (strict validation of `docker-compose.staging.yml`).
  - `recreate_and_verify_cron()` in `circles/deploy-genesis2.sh` verifies existing crontab entries.

---

## 2. Approved MVP Decisions

1. **Provider:** Direct VAPID Web Push using `web-push` (no OneSignal).
2. **Scope & Rollout:** Implement Phases 0–4 and deploy to `https://staging.kamooni.org` first. Gate behind feature flags: enabled in staging for all signed-in users, disabled in production until separately approved.
3. **Icons & Colors:** Generated from existing Kamooni branding (`kamooni-emblem-yellow.png` on `#221710` warm ink) with `theme_color: "#346f4c"` and `background_color: "#fbfbfb"`.
4. **`www` Redirect:** Deferred (not needed for staging).
5. **Lock-screen Privacy:** Generic notification text by default; never include message bodies or private Circle names in push payloads.
6. **Phase 5 / Mailpit:** Out of MVP scope (revisit only if email fallback is added later).
7. **Devices & UX:** Available to all signed-in users on staging (no allowlist). Feature-detect laptops, desktops, Android, and iOS/iPadOS. Install is optional on desktop/Android; iOS/iPadOS 16.4+ requires Add to Home Screen before enabling push. Unsupported or denied browsers continue working normally.

---

## 3. Target Architecture & Phased Plan (Phases 0–4)

### Collections & Indexes (Additive, Idempotent)
- `pushSubscriptions`: `{ _id, userDid, endpoint, endpointHash (unique), keys: { p256dh, auth }, userAgentSummary, createdAt, lastSeenAt, revokedAt?, revokeReason? }` with TTL on `revokedAt` (30 days).
- `pushDeliveryJobs`: `{ _id, deliveryKey (unique), notificationId, userDid, subscriptionId, notificationType, payload, status, attempts, nextAttemptAt, leaseUntil?, processingToken?, expiresAt, lastStatusCode?, lastError?, createdAt, updatedAt, completedAt? }` with TTL on `completedAt` (14 days).
- Embedded `pushPreferences` on user `Circles` doc (optional, default enabled per category).

### API Surface (Phases 2–4)
- `GET /api/push/config` — feature availability + `vapidPublicKey`.
- `POST /api/push/subscriptions` — authenticated + CSRF + SSRF-checked upsert/rebind by `endpointHash`.
- `DELETE /api/push/subscriptions/[id]` — authenticated + CSRF ownership-checked revocation + pending job cancellation.
- `GET/PATCH /api/notification-preferences` — authenticated + CSRF read/update of push preferences.
- `POST /api/push/test` — authenticated + CSRF + rate-limited self-test push.
- `GET /api/cron/push-dispatch` — `Bearer $CRON_SECRET` lease-based dispatcher with 404/410 revocation and 429/5xx exponential backoff.

### Feature Flags & Rollback
- `WEB_PUSH_ENABLED` (default `"false"`), `WEB_PUSH_DISPATCH_ENABLED` (default `"false"`), `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`.
- Separate staging vs. production VAPID keypairs.
- Rollback: flip `WEB_PUSH_DISPATCH_ENABLED=false` (and `WEB_PUSH_ENABLED=false` if needed) without touching in-app notifications, Telegram, or email digests; retain additive collections; if SW removal is ever required, deploy a self-unregistering `/sw.js`.

### Phases
- **Phase 0:** Feature branch `feat/pwa-web-push`, `docs/pwa-audit.md`, baseline checks.
- **Phase 1:** Brand icons, `manifest.webmanifest`, `next.config.mjs` headers, `layout.tsx` metadata/viewport, minimal no-cache `public/sw.js`, URL allowlist sanitizer, client SW registration & `InstallAppCard`.
- **Phase 2:** `web-push`, MongoDB collections/indexes, SSRF/CSRF guards, `/api/push/*` & `/api/notification-preferences` endpoints behind flags.
- **Phase 3:** Push Notifications settings UI, iOS standalone guidance, `Authenticator` reconciliation, `signOut()` revocation.
- **Phase 4:** Durable `pushDeliveryJobs` enqueue from `sendNotifications()`, generic privacy-safe payload/route builder, lease-based dispatcher + `/api/cron/push-dispatch` + `crontab`, device-matrix verification on staging.
