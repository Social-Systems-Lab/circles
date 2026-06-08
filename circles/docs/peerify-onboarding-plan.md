# Peerify Onboarding Plan

## Goal

Design a Peerify-specific onboarding layer on top of the existing Circles/Kamooni auth model without renaming or disturbing core Circles concepts.

Core principle for Phase 1:

- Login account = human user
- User circle/profile = that human's base personal profile
- Additional artist / venue / host entities come later as separate circles or profile-like entities owned by that human login

## Current Flow Summary

### Current signup routes

- `src/app/(auth)/signup/pilot/page.tsx`
  - Renders `PilotSignupForm`
  - This is now the recommended Peerify MVP signup path
- `src/app/(auth)/signup/page.tsx`
  - Renders `OnboardingSignupFlow`
  - This is the richer multi-step signup flow
- `src/app/(auth)/login/page.tsx`
  - Renders `LoginForm`

### What happens when a new account is created

The main server action is `src/components/forms/signup/actions.ts`:

- Normalizes handle/email
- Calls `createUserAccount(...)`
- Creates a user session immediately
- Optionally writes `skills`, `interests`, and `metadata` onto the same user record
- Creates a welcome chat message/thread
- Returns the authenticated private user

The underlying account creation happens in `src/lib/auth/auth.ts#createUserAccount(...)`:

- Creates auth keys and filesystem credentials for the user DID
- Inserts one `Circle` record with `circleType: "user"`
- That same record functions as both login-owned user profile and the user's personal circle/profile
- Sets defaults like picture, hero image, modules, access rules, and `publishStatus`
- Adds the user as a member/admin of their own user circle
- Does **not** currently add the user to the platform default circle

### Redirect behavior after signup

- Pilot signup (`src/app/(auth)/signup/pilot/page.tsx`)
  - Creates the account with a lighter form
  - Redirects to `/signup/pilot/check-email?...`
  - That screen continues to `redirectTo`, `/onboarding/peerify?intent=...`, or `/circles/{handle}`
- Legacy/simple signup form (`src/components/forms/signup/signup-form.tsx`)
  - Redirects to `searchParams.redirectTo` or `/circles/{handle}`
- Multi-step signup (`src/components/forms/signup/onboarding-signup-flow.tsx`)
  - Creates the account partway through the wizard
  - Continues with profile/donation steps client-side
  - Final redirect goes to `/circles/{handle}/home`

### Existing onboarding/profile-completion surfaces

- `src/components/forms/signup/pilot-signup-form.tsx`
  - Lightweight Peerify MVP signup path
- `src/components/forms/signup/onboarding-signup-flow.tsx`
  - Full signup wizard: welcome, account, skills, interests, profile, support
  - Still contains Kamooni language and should be rebranded later or bypassed for Peerify MVP
- `src/components/onboarding/onboarding.tsx`
  - Older global post-login onboarding modal mounted in `src/app/layout.tsx`
  - Uses `completedOnboardingSteps`
  - Auto-skips when `user.metadata.onboardingFlow` is `"v2-signup"`
- `src/app/welcome/page.tsx`
  - Public landing page, not an authenticated post-signup onboarding page

## Safe Extension Points For Peerify

### 1. Post-signup "What would you like to do first?" page

Safest insertion point:

- Add a new lightweight authenticated route after account creation:
  - `/onboarding/peerify`

Recommendation:

- Do **not** overload existing `/welcome`
  - It is already a public landing page
- Do **not** try to reuse the old global onboarding modal for Peerify role selection
  - It is broad Kamooni onboarding and mounted globally in the app shell

### 2. Passing CTA intent from landing pages

Recommended pattern:

- Landing CTAs link to:
  - `/signup/pilot?intent=fan`
  - `/signup/pilot?intent=artist`
  - `/signup/pilot?intent=host`

Then:

- `src/components/forms/signup/pilot-signup-form.tsx`
  - Reads `searchParams`
  - Carries intent into the check-email step
- `src/app/(auth)/signup/pilot/check-email/page.tsx`
  - Uses intent to choose the continue destination when `redirectTo` is absent
- `src/components/forms/signup/onboarding-signup-flow.tsx`
  - Reads `searchParams`
  - Can preserve `intent` through account creation
- The same value can be forwarded into the post-signup page:
  - `/onboarding/peerify?intent=artist`

### 3. Storing lightweight onboarding intent/status

There is already a safe place to store this:

- `Circle.metadata`
  - Defined in `src/models/models.ts` as an open-ended record

Phase 1 recommendation:

- Do **not** add metadata writes yet
- Keep the first implementation stateless apart from the query param and redirect destination

## Proposed Peerify Flow

1. User lands on Peerify marketing page
2. CTA optionally passes `?intent=fan|artist|host`
3. User creates a normal personal account
4. Immediately after account creation, user sees:
   - "What would you like to do first?"
5. User picks one path
6. App sends user to the relevant next step

### Phase 1 path mapping

- `fan`
  - Route to `/explore`
- `artist`
  - Route to existing user profile settings for now
- `host`
  - Route to existing user profile settings for now

## Files/Routes Likely To Change

### Phase 1 implementation files

- `src/app/(auth)/signup/pilot/page.tsx`
- `src/app/(auth)/signup/pilot/check-email/page.tsx`
- `src/components/forms/signup/pilot-signup-form.tsx`
- `src/app/onboarding/peerify/page.tsx`
- `src/components/forms/signup/onboarding-signup-flow.tsx`
- `docs/peerify-onboarding-plan.md`

## Minimal Data Model Additions

- None in this pass

## Risks

- The codebase currently treats the user record as both auth account and personal public profile
  - That is acceptable for Phase 1, but future multi-entity UX must stay clear about "human login" vs "owned profile"
- Redirect behavior is spread across multiple signup surfaces
  - Peerify MVP should use the lighter pilot signup path first
  - The rich signup flow still contains Kamooni-specific language and a long wizard that should be rebranded later or bypassed
- Existing global onboarding modal may still appear because this pass does not write Peerify-specific onboarding metadata

## Recommended Phase 1 Implementation

1. Keep current account creation exactly as-is
2. Use `/signup/pilot?intent=...` as the Peerify MVP signup path
3. Add `/onboarding/peerify`
4. Redirect pilot signup to `/onboarding/peerify?intent=...` only when a valid `intent` is present and `redirectTo` is absent
5. Keep `redirectTo` behavior unchanged and higher priority than Peerify intent
6. Keep artist/host actions minimal by routing into existing profile settings

## Build/Test Commands

Run from: `/Users/timmidnightmac/Projects/peerify-circles/circles`

```bash
npm run dev
```

```bash
npm run build
```

## Implemented In This Pass

- Added Peerify MVP pilot signup flow:
  - `src/app/(auth)/signup/pilot/page.tsx`
  - `src/components/forms/signup/pilot-signup-form.tsx`
  - `src/app/(auth)/signup/pilot/check-email/page.tsx`
- Pilot signup now:
  - Reads `?intent=fan|artist|host`
  - Preserves existing `redirectTo`
  - Continues to `/onboarding/peerify?intent=...` only when `redirectTo` is absent and `intent` is valid
  - Falls back to `/circles/{handle}` when no override is present
- Added authenticated route:
  - `src/app/onboarding/peerify/page.tsx`
- The new page:
  - Supports `?intent=fan|artist|host`
  - Uses Peerify colors
  - Explains that the choice is only the first role and more roles can be added later
  - Routes:
    - `fan` -> `/explore`
    - `artist` -> `/circles/{handle}/settings/about?peerifyIntent=artist`
    - `host` -> `/circles/{handle}/settings/about?peerifyIntent=host`
  - Redirects unauthenticated users to login with `redirectTo=/onboarding/peerify...`

- Updated rich signup flow in `src/components/forms/signup/onboarding-signup-flow.tsx`
  - Preserves existing `redirectTo` behavior
  - Only redirects to `/onboarding/peerify?intent=...` when the signup URL includes a valid `intent`
  - Otherwise preserves the existing default redirect to `/circles/{handle}/home`
  - Rich signup still contains Kamooni onboarding copy and should not be the preferred Peerify MVP path

## Still Remaining

- Persisting Peerify onboarding choice into `user.metadata` or another lightweight status field
- Dedicated artist onboarding flow
- Dedicated venue/host onboarding flow
- Verification gating for artist/venue publication
- Multi-profile management and role switching
- Peerify-specific CTA wiring on landing pages that should pass `?intent=fan|artist|host`
