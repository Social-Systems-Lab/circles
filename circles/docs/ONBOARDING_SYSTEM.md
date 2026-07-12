# Kamooni Onboarding, Profile Completion, and Participation Readiness

Implementation reference: verified against commit `0204b7fe`

This document is the canonical developer reference for the current Kamooni onboarding/profile-completion architecture.

## Scope

This describes behavior that is live in the codebase now:

- email/password pilot signup
- derived personal profile completion
- participation readiness
- map/search separation
- profile-completion welcome/supporter card
- personal profile settings wording

Do not treat planned or older verification-onboarding behavior as active unless the code paths are explicitly re-enabled.

## Profile Completion

`profileComplete` is a derived concept. It is not persisted as a boolean.

Canonical implementation:

- `src/lib/profile-completion.ts`

A personal profile is complete only when all of the following are true:

- `circle.circleType === "user"`
- the personal profile has a real profile image
- the personal profile has About text
- the Kamooni community guidelines / Code of Conduct agreement is complete

About text is satisfied by either:

- non-empty `description`
- non-empty `content`

The profile image check uses `circle.picture?.url`. Missing or blank URLs do not count.

Known default image paths do not count as real profile images:

- `/images/default-user-picture.png`
- `/images/default-picture.png`

Absolute URLs are normalized by pathname, so a URL such as `https://kamooni.org/images/default-user-picture.png` is still treated as a default image.

The rules requirement uses the existing canonical community-guidelines completion logic rather than a second definition.

## Profile Completion Is Not Verification

These concepts are intentionally separate.

### Email Verification

Email verification is the current confirmed account contact/recovery method for email/password users.

Current field:

- `isEmailVerified`

Email verification is not part of `isProfileComplete`.

### Profile Completion

Profile completion is:

- image
- About text
- Kamooni rules / community guidelines agreement

It is a participation-readiness requirement, but it is not account/profile verification.

### Account/Profile Verification

The historical account/profile verification architecture remains in the codebase:

- `isVerified`
- `verificationStatus`
- verification request/review workflow
- admin verification workflows

Account/profile verification is currently paused as an onboarding requirement.

### Proof of Humanity

Proof of Humanity is a separate `humanityVerifications` architecture.

It supports verification levels such as:

- `real_person`
- `met_in_real_life`

Proof of Humanity does not define `profileComplete`.

### `isHuman`

`isHuman` is a separate legacy/lightweight human signal.

Do not treat `isHuman` as profile completion or participation readiness.

## Participation Readiness

Canonical helper:

- `canParticipate(user)` in `src/lib/profile-completion.ts`

Current normal-user rule:

```ts
hasConfirmedAccountContactMethod(user) && isProfileComplete(user)
```

The current confirmed account contact method is verified email:

- `hasConfirmedAccountContactMethod(user)`
- `isEmailVerified === true`

Admins retain the existing bypass through the shared helper.

This separation intentionally leaves room for a future confirmed account/contact/recovery method, such as VibeID, passkeys, or another identity path, without redefining `profileComplete`.

## Allowed And Restricted Behavior

Users who are incomplete or otherwise not participation-ready may:

- browse/view
- search
- appear in search
- like/react
- follow
- bookmark/pin

Active participation requires `canParticipate(user)`.

Important gated surfaces include:

- posts
- comments
- chat messages and attachments
- starting direct messages
- group chat creation/contact flows
- contact requests
- circle creation
- task creation, task claims, task moves, shift joining, and restricted task actions
- event creation, event comments, RSVP, and restricted event actions
- goals/issues/proposals restricted actions
- proposal voting
- Proof of Humanity verification of another person

Read-only actions are not broadly gated by participation readiness.

### Historical Feature Flag Name

The feature matrix still uses the historical property name:

- `needsToBeVerified`

Do not assume that this name means active account/profile verification is required. Restricted participation now flows through the shared authorization path and `canParticipate(user)`.

Key files:

- `src/lib/auth/auth.ts`
- `src/lib/auth/client-auth.ts`
- `src/lib/data/constants.ts`

## Map And Search Separation

Incomplete personal profiles may appear in normal Kamooni search.

Incomplete personal profiles must not appear on the map.

Normal non-user circles keep their own map/search visibility behavior and are not subjected to profile completion.

### Map Visibility

Relevant files:

- `src/lib/map-visibility.ts`
- `src/lib/data/circle.ts`
- `src/components/modules/circles/map-explorer.tsx`

Map profile eligibility is derived server-side.

`getSwipeCircles()` derives personal-profile completion server-side for map discovery. Fields needed for derivation, including `content` and `communityGuidelinesAcceptance`, are stripped before map discovery data is returned to the client.

Complete personal profiles are marked with transient:

- `mapEligibility.profileComplete = true`

`mapEligibility` is not persisted.

Search-result user profiles can become map markers only when their identity matches the server-approved map-eligible user set. This prevents sparse search result objects from re-deriving profile completion on the client with missing private fields.

### Search Visibility

Relevant files:

- `src/lib/data/search.ts`
- `src/lib/data/search-visibility.ts`

User profiles no longer require `isVerified === true` or `isMember === true` merely to appear in search.

Search must not require `profileComplete`.

Normal circle/project discovery rules remain separate from personal-profile completion.

## Current Email/Password Pilot Signup Flow

The current email/password pilot signup journey is:

```text
signup
-> Check your email
-> verify email
-> successful verify-email page routes to /circles/{handle}
-> own profile
-> profile-completion checklist
```

The Check your email page no longer offers:

- Go to login
- continue for now

The three profile-completion steps are:

1. Add a profile image
2. Introduce yourself
3. Agree to the Kamooni rules

Rules use the simple one-page `CodeOfConductAgreement` in `profileCompletion` context.

The older multi-screen `CommunityGuidelinesAgreementFlow` remains available for preserved verification context, but it is not the active profile-completion path.

Visible Request Verification entry points have been removed from normal onboarding/profile UX.

Verification backend/data/admin architecture remains preserved.

## Profile Completion Welcome And Supporter Card

When profile completion becomes complete, the user sees a one-time completion welcome/supporter card.

Theme/copy:

- `You're ready! Welcome to Kamooni`
- the user can now take part across Kamooni
- optional invitation to support Kamooni as a not-for-profit, ad-free platform

Existing monthly supporter tiers are reused:

- `€1/month`
- `€2/month`
- `€5/month`
- `€10/month`

Existing Stripe subscription checkout is reused.

The existing `/donate` route is used for one-time donations.

Support is optional and has no effect on:

- `profileComplete`
- `canParticipate`
- email verification
- account/profile verification
- Proof of Humanity

### Maybe Later

`Maybe later` saves the existing `donationIntent` skipped state and hides the funding ask.

It does not acknowledge or dismiss the completion welcome card.

### Start Kamoonying

`Start Kamoonying` records the one-time onboarding marker:

- `profileCompletionWelcomeSeen`

The marker is stored in:

- `completedOnboardingSteps`

The server action derives the authenticated user's own profile ID server-side. It does not accept or trust a client-supplied profile/circle ID for this acknowledgement.

After acknowledgement, the card stays hidden across refreshes.

Old `donationIntent.updatedAt` values do not count as having seen the profile-completion welcome.

Active/trialing supporters may still see the completion confirmation if not acknowledged, but the funding ask is omitted.

## Personal Profile Settings

The shared About settings form is still shared between personal profiles and normal circles.

For `circle.circleType === "user"`, the UI uses personal-profile wording:

- Profile settings
- Short introduction
- What brings me here?
- About me
- Profile images
- Profile image
- Additional profile images
- Your location

Personal profiles do not show the shared Visibility card.

Normal circles retain their existing wording and visibility controls.

The underlying schema and save field names remain unchanged.

## Focused Tests

Focused tests for this area:

- `src/lib/profile-completion.test.ts`
- `src/lib/data/search.test.ts`

## Key Implementation Files

- `src/lib/profile-completion.ts`
- `src/lib/profile-completion-checklist.ts`
- `src/lib/map-visibility.ts`
- `src/lib/data/search-visibility.ts`
- `src/components/profile-completion/profile-completion-checklist.tsx`
- `src/components/auth/code-of-conduct-agreement.tsx`
- `src/components/onboarding/actions.ts`
- `src/lib/auth/auth.ts`
- `src/lib/auth/client-auth.ts`
