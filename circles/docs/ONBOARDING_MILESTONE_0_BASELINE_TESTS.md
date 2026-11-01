# Onboarding Milestone 0: Baseline Tests

This document records the characterization-test boundary before the onboarding redesign. Runtime behavior is intentionally unchanged.

## Covered behavior

- Current participation readiness: verified email, genuine profile image, non-empty `description` or legacy `content`, complete structured Community Guidelines acceptance, administrator bypass, failure precedence, and user-facing block messages.
- Current map boundary: personal profiles require current derived profile completion, default images fail, rejected accounts fail, server approval is required by the client, and location is not currently part of the eligibility helper.
- Search remains independent from map readiness and excludes rejected personal accounts while retaining existing privacy and lifecycle filtering.
- Email verification: hashed 24-hour tokens, expiry, single use, already-verified handling, resend rotation, resend cooldown, provider failure, and legacy records with no last-sent timestamp.
- ALTCHA: missing, malformed, incomplete, tampered, wrongly signed, and valid signed/solved payloads.
- Registration/authentication source contracts: RSA/DID creation, password-encrypted key files, permanent resource creation before verification, server-side ALTCHA use, current unverified-login behavior, and password-reset DID preservation.
- Existing profiles: legacy long-form `content`, existing onboarding markers, and previously verified accounts remain governed by derived readiness rather than marker strings.

## Known runtime/documentation differences

- Signup creates the permanent DID, credential directory, Mongo profile, self-membership, authenticated session, and welcome-chat attempt before email verification.
- Login's email-verification rejection is commented out, so an existing unverified account can authenticate. Participation remains restricted separately.
- Verification success currently links to subscription/email-verification settings rather than a dedicated resumable onboarding flow.
- Current participation and map derivation require a genuine profile image. Location is not checked by `isServerDerivedMapVisibleCircle`, even though a usable marker needs coordinates later in the map UI.
- Password reset preserves the DID. If no plaintext private key is recoverable, the current fallback generates replacement key material under that DID; this is a cryptographic compatibility risk, not a Milestone 0 change.

## Participation enforcement inventory

Direct server-side `canParticipate()` checks exist in feed actions, Mongo chat actions, circle creation, task actions, event actions, home/contact actions, Proof of Humanity verification, global-create actions, and the shared server authorization path in `lib/auth/auth.ts`. Client authorization mirrors the shared rule in `lib/auth/client-auth.ts`.

Potential gaps to review in later milestones:

- `lib/auth/verification.ts` retains older `isVerified`/`isHuman` helpers. Any caller using those helpers instead of `canParticipate()` may apply a different policy.
- Some UI components use client-side readiness only. Their underlying mutation must continue to be checked independently; UI hiding is not authorization.
- Not every mutation contains a direct `canParticipate()` call because many rely on shared `isAuthorized()` plus the historical `needsToBeVerified` feature flag. The feature matrix and shared authorization helper therefore remain security-critical.
- Draft creation and preservation are not authorization boundaries. Restored drafts will need fresh server-side checks when implemented.

## Not yet covered

- A full signup integration test with real MongoDB, Postmark, filesystem rollback, membership, session cookies, and welcome-chat orchestration.
- Browser-level signup, verification-link, resend, correction, login, and recovery journeys.
- Crash recovery between individual permanent-account provisioning steps.
- Production rate limiting, challenge replay storage, and abandoned-account cleanup; these capabilities do not currently exist.
- Cross-device draft restoration, which does not currently exist.

## Expected Milestone 1 changes

Milestone 1 is expected to remove the profile-image requirement from participation readiness while preserving it for the future explicit map policy. It should introduce separate participation and map derivations without changing existing credentials, DIDs, guideline records, onboarding markers, or search eligibility.
