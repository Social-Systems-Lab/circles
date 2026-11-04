# Onboarding final readiness audit

Audited 2026-11-04 against application commit `1ee05f2996fa1765f6938bf7b8a1fca487fddada` and the separately deployed staging-infrastructure baseline reported by the operator.

## Decision

The implementation is ready for a controlled staging test window after the code hardening in this review is deployed. It is not ready for public activation. The remaining blockers are operational validation in staging, an approved reconciliation exercise, and an explicit decision about retaining or removing synthetic permanent accounts.

Pending registration must remain disabled and routing must remain `legacy` until every staging acceptance item below passes.

## Reviewed controls

- Verification tokens and continuation secrets are 256-bit random values. Only purpose-scoped HMAC hashes are stored. Email tokens and verified continuations expire after 30 minutes, are atomically consumed, and are removed from the browser URL by a 303 redirect. Pending records expire after 48 hours until identity reservation; completed records retain correlation for seven days.
- Pending-registration hashing now requires `PENDING_REGISTRATION_TOKEN_HMAC_KEY`; it no longer falls back to the signup-form key. Missing configuration fails closed.
- The initial continuation is held in an HttpOnly cookie and permits only resume, resend, and correction. Resend has a one-minute cooldown and a distributed three-per-hour limit. Correction is limited to three per day, rechecks permanent-account conflicts, rotates the email token, and relies on unique normalized-email storage.
- Start is protected by one-use ALTCHA challenges, challenge request limiting, per-IP and per-email start limits, generic enumeration-resistant responses, strict server input validation, and same-origin checks on mutations.
- Normalized email and requested handle are unique in pending storage. Provisioning uses distributed email/handle locks, permanent-account checks, unique pending-account correlation, a durable non-transferable claim, a persistent unique DID reservation, and exact DID/public-key validation. A reserved DID is never replaced automatically.
- Provisioning consumes the verified continuation before account creation. Permanent finalization precedes session issuance. Lost sessions use normal login; authenticated login can repair only an exactly correlated claimed account.
- Interrupted work before DID reservation can resume only through a fresh verification. Work after durable claim or DID reservation fails closed for reconciliation. Pending records with reserved DIDs lose TTL eligibility.
- The mobile cards use responsive single-column layouts, 48px primary controls, explicit errors/status text, and safe links between signup, check-email, password creation, login, and resumable onboarding. Verification on another device is supported because the email token establishes the verified cookie on the device opening the link.
- The existing signup remains selected unless both pending flags are true and Mongo routing is `pending` with the exact deployment ID. The legacy action independently requires `legacy`; pending start and provisioning independently require `pending`.
- Staging Mailpit configuration is fail closed: the deployment role must be staging, Postmark credentials must be blank, SMTP must resolve to internal service `mailpit:1025`, `CIRCLES_URL` must be `https://staging.kamooni.org`, and only the two verification routes are accepted in captured messages. Production rejects Mailpit.
- Existing-account login, password recovery, and `/verify-email` remain separate. Mailpit explicitly supports the existing-account verification route without widening the allowed template or URL set.

## Local evidence

- Pending-registration unit, routing, reconciliation, signup security, ALTCHA, existing-email verification/recovery, password-card, preview, resumable-onboarding, profile-readiness, location-privacy, and email-transport suites passed.
- The disposable MongoDB/filesystem crash suite passed all 29 cases, including concurrent completion, process restart, DID uniqueness, claim fencing, session ordering, and login repair.
- The disposable loopback MongoDB/MinIO onboarding suite passed persistence, owner authorization, upload, failed-write cleanup, and media isolation. Both containers used size-limited tmpfs and were removed after the run.
- TypeScript and the production build passed. Lint passed with pre-existing repository warnings and no errors. Staging Compose/environment validation passed.

## Remaining blockers and risks

1. No browser-level pending journey has run against the current staging application, Mailpit, MongoDB, credential volume, and reverse proxy. This is the principal activation blocker.
2. The fail-closed reconciliation path intentionally has no automatic repair for orphan credentials or a reserved DID without one exact account. The read-only inspection output must be demonstrated during the controlled test, and an operator must be available to stop the test if it reports manual review.
3. There is no generic safe deletion tool for permanent synthetic accounts spanning MongoDB, credential files, memberships, chats, media, and DID reservations. Do not delete test identities manually. Use uniquely labelled staging-only identities, inventory every artifact, retain them by default, and require a separately reviewed cleanup plan before deletion.
4. Email delivery failure is intentionally hidden behind a generic response. The test operator must verify both the audit event and Mailpit absence/presence rather than infer delivery from the UI.
5. Rate-limit testing consumes real staging counters for the chosen IP and identity. Use a dedicated test window and unique addresses; do not clear counters in the database.
6. Mapbox behavior, real mobile keyboards, assistive technology, and actual Proof-of-Humanity attestations are service-level checks and are not fully represented by isolated tests.

## Exact requirements before a controlled staging window

Obtain separate authorization to change staging configuration, restart staging, change routing, and create synthetic staging data. Then confirm:

1. The reviewed code commit and reviewed Mailpit infrastructure commit are deployed to staging; all application instances report the same application SHA.
2. Current routing is `legacy`; both pending flags are false; legacy signup succeeds before the window.
3. A staging-only random `PENDING_REGISTRATION_TOKEN_HMAC_KEY` of at least 32 bytes is stored server-side, distinct from every other key. `REGISTRATION_DEPLOYMENT_ID` is non-empty, identical on every instance, and chosen for this deployment.
4. Staging retains `EMAIL_TRANSPORT=mailpit`, internal `MAILPIT_SMTP_HOST=mailpit`, port `1025`, blank Postmark credentials, and `CIRCLES_URL=https://staging.kamooni.org`. Mailpit UI remains loopback-only through the reviewed proxy.
5. A named operator, rollback operator, test manifest, unique synthetic identity prefix, screenshots/log capture location, and stop conditions are agreed. Do not use real email addresses or production identities.
6. Read-only routing status and pending reconciliation inspection succeed before activation. There are no unexpected outstanding reconciliation records or live provisioning locks.
7. Transition routing by compare-and-set from `legacy` to `paused`; wait at least five minutes and confirm both registration paths reject new work and transient locks have expired.
8. Set both pending flags true consistently, restart every staging application instance, verify their deployment IDs and SHA, then compare-and-set `paused` to `pending` with the exact deployment ID.

Any mismatch, unexpected email egress, duplicate-key error, identity mismatch, reconciliation-required record, or mixed application SHA is an immediate stop condition: set routing to `paused` first and investigate without deleting state.

## Proposed end-to-end staging procedure

Use a manifest containing timestamp, tester, application SHA, infrastructure SHA, deployment ID, synthetic name/email/handle, browser/device, expected redirect, pending id, final account id/DID, and Mailpit message id. Do not record passwords or raw tokens.

1. Verify `/signup` shows the pending card on desktop and a narrow mobile viewport. Confirm direct access to check-email/continue without capabilities is safe, and external or protocol-relative `redirectTo` values are discarded.
2. Start identity A with a unique `.invalid` Mailpit-only address. Confirm one captured message, the staging origin, exactly `/signup/verify`, one encoded token parameter, no token in logs, and the expected audit events.
3. On the original browser, test an early resend (no new message), a resend after cooldown (old token invalid, new token valid), and email correction to a second unique address (old token invalid, new destination displayed and captured). Confirm generic responses do not disclose existing accounts.
4. Open the current identity-A link in a different browser/device. Confirm the resulting URL is `/signup/continue` with no token, the cookie is HttpOnly/Secure/SameSite=Strict, password validation works, completion creates one account/DID, and the authenticated session reaches `/onboarding` or the validated internal redirect.
5. Refresh and replay the verification URL and completion action. Confirm neither creates another account, DID, membership, welcome conversation, or session. Log out/in and verify the same DID and account are used.
6. Attempt duplicate email and duplicate handle registrations with identities B and C. Confirm generic UI behavior, no duplicate permanent identity, and no unintended Mailpit disclosure. Exercise Gmail normalization if that compatibility is in scope.
7. Exercise interruption before DID reservation with an approved fault-injection method on disposable staging data. After lease expiry and resend, require fresh verification and complete successfully. Never kill the shared database or alter persistent staging data directly.
8. Exercise one interruption after durable claim/DID reservation only if an isolated staging credential/database fixture is available. Confirm it fails closed, preserves the DID, appears in read-only reconciliation inspection, and never generates a replacement. If isolation is unavailable, this case remains satisfied only by the passed local crash suite and is not safe to force on shared staging.
9. Test existing-account compatibility: legacy account login, password recovery, existing `/verify-email`, and access to `/onboarding`. Confirm no DID changes. Verify Mailpit captures only approved verification messages.
10. Complete the onboarding cards on identity A at desktop and mobile widths: resume across logout/device, introduction, guidelines, public-location privacy, photo upload/replacement, skip behavior, navigation, and Proof-of-Humanity link. Verify participation readiness derives from canonical fields.
11. Inspect the final pending/account/DID/session/membership/welcome state read-only. Inventory synthetic artifacts. Retain accounts unless a separately reviewed cleanup procedure proves every cross-store artifact and preserves DID invariants.
12. End the window by compare-and-setting `pending` to `paused`, disabling both flags consistently, restarting all instances, and compare-and-setting to `legacy` only after pending work is drained and every instance is gate-aware. Re-run a legacy signup smoke test and confirm routing/flags are back at their recorded baseline.

Public activation requires a separate approval after this procedure passes, reconciliation output is clean, rollback has been rehearsed, and the resulting evidence is reviewed.
