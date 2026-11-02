# Milestone 4A — Resumable Onboarding Foundation

## State model

Personal profiles may store an optional `onboardingState` object in the existing MongoDB `circles` document:

- `version`: current schema version (`1`).
- `currentCard`: one of the server-defined onboarding card IDs.
- `startedAt` and `lastSeenAt`: timestamps for resumption and product support.
- `skippedCards`: explicit navigation skips; skipping never satisfies a requirement.
- `completionAcknowledgedAt`: when the member dismissed the current onboarding sequence.

The field is optional, so no backfill or migration is required. Existing `completedOnboardingSteps` values are preserved and are not treated as the source of new participation or profile readiness. Completion status is derived from canonical profile fields and active Proof of Humanity attestations. No readiness booleans are copied into onboarding state.

## Navigation contract

`/onboarding` requires an authenticated personal-profile DID. An optional `?card=<id>` selects an incomplete card. Invalid card IDs return to the base route; completed steps resolve to the next incomplete step. The state is persisted on the personal profile, so refreshes, logout/login, and another device resume the same card.

Server actions accept only a card ID, derive the profile DID from the authenticated session, and update only the corresponding `circleType: "user"` profile. Skip records the selected ID and advances navigation; it does not set profile fields. A skipped incomplete card can still be opened directly later. The acknowledgement is a dismissal marker, not proof of participation readiness.

The shell provides progress/navigation controls and hosts the functional profile editors described in [ONBOARDING_MILESTONE_4B_FUNCTIONAL_CARDS.md](./ONBOARDING_MILESTONE_4B_FUNCTIONAL_CARDS.md). Navigation state remains separate from their canonical profile data.

## Requirement categories

Participation readiness is derived using the existing `getParticipationReadiness()` policy: verified email, introduction (`description` or legacy `content`), and accepted Community Guidelines. The shell presents these as the three required participation steps. Skipping introduction or guidelines permits browsing; existing server-side `canParticipate()` checks continue to restrict participation.

Photo, location, and a qualifying `real_person` attestation are shown as optional profile improvements. None is required to participate in Phase 1. Proof of Humanity enforcement is not changed.

## Compatibility and access

- The legacy onboarding modal and its `completedOnboardingSteps` markers are unchanged.
- The new state is not added to shared/discovery DTO projections; the owner route fetches a narrow profile projection.
- No change is made to DID, credentials, email verification, map eligibility, or pending-registration feature flags.
- Successful pending-registration completion defaults to `/onboarding` when no safe redirect was provided; validated internal destinations remain preserved.
- No database index or migration is required.
