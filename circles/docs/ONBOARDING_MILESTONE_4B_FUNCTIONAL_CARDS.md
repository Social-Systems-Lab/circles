# Milestone 4B — Functional Onboarding Cards

The authenticated `/onboarding` route retains the Milestone 4A resumable shell and now hosts functional editors for introduction, Community Guidelines, location, profile photo, and Proof of Humanity. Card navigation/skips remain navigation state; completion is derived from canonical profile fields and the existing attestation store.

## Cards and canonical behavior

- **Introduction:** `saveOnboardingIntroductionAction` trims input, accepts any non-whitespace text, and writes `Circle.description`. Existing `content` is shown when `description` is empty and continues to satisfy the legacy introduction/readiness helper. Saving does not overwrite `content` or `completedOnboardingSteps`.
- **Community Guidelines:** displays the rules from `COMMUNITY_GUIDELINE_RULES` in a scrollable region. The unchecked agreement control is outside that region and does not require scrolling to the bottom. Acceptance writes the structured `communityGuidelinesAcceptance` record for each principle. Valid existing per-principle timestamps are preserved; missing/invalid records receive the new acceptance time. The existing aggregate accepted-at field is preserved if already set. A single boolean is not used as canonical acceptance.
- **Location:** lazy-loads the existing Mapbox `LocationPicker`, which supports place search and manual map selection. Personal-profile editors hide precision controls and explain that the chosen public pin should be a nearby public place. “Find My Current Area” requires browser geolocation permission and only recenters the map; it does not set or persist the device coordinates. A separately selected place/pin is saved with precision `4`, making that public pin visible on the member map. Existing personal locations and their precision are preserved unless the member explicitly changes or clears the pin. Non-personal location editors retain their precision controls and behavior.
- **Profile photo:** uses the established `updateCircleField` profile-image action and its existing storage/validation path. The default placeholder is not considered a genuine image. Photo and location remain optional for Phase 1 participation, while both remain map-profile requirements under existing map eligibility.
- **Proof of Humanity:** displays owner-scoped counts from the existing verification summary and links to the current profile verification interface. `real_person` and `met_in_real_life` remain distinct. The card adds no new verification or enforcement workflow.

The card actions derive the DID from the authenticated session and verify that the target is that member's personal profile. The existing image action retains its own authorization and storage checks. Save errors are shown to the member. The shell warns before discarding dirty card input and prevents step navigation while a save is pending. Skipping never writes canonical completion data.

## Compatibility and policy

- Phase 1 participation remains verified email, non-empty introduction (`description` or legacy `content`), and accepted Community Guidelines, enforced by existing `canParticipate()` callers.
- Profile photo, location, and Proof of Humanity remain optional for participation.
- Map eligibility requirements are unchanged; ordinary search remains independent. Public search, bookmarks, and related client DTOs now consistently project location fields according to the stored precision, preventing exact coordinates and finer place data from leaking through bookmark responses.
- Existing account/profile data, legacy onboarding markers, DIDs, credentials, and registration flows are unchanged.
- No database migration or backfill is required.

## Limitations and follow-up

- The Proof of Humanity card links to the existing profile verification section because this card does not add a separate secure request action.
- A separate private map-centre preference is not implemented. It could later let members choose a private discovery/map centre independently from their public profile pin.
- Existing personal locations with precision below `4` keep their stored values and remain redacted in public projections; because those projections omit coordinates, they will not be placeable on the public member map until the member explicitly selects and saves a new pin.
- Location map tiles and place search depend on the existing Mapbox configuration and network availability.
- Automated tests cover card policies, owner authorization, location privacy and public DTOs. An opt-in isolated integration suite exercises MongoDB introduction/guideline/location persistence, MinIO photo upload, unauthorized updates, and failed-write media cleanup. It passed locally using empty, loopback-only disposable MongoDB and MinIO containers backed by tmpfs; it does not use real member data, credentials, project storage, staging, or production services.
- Mapbox network behavior and actual Proof of Humanity attestation creation are not simulated by the isolated suite. They remain service-level staging checks.
- Local browser review passed for the functional card flow and responsive mobile layout, including the 393px viewport review. Repeat keyboard and assistive-technology checks during release validation.
- Profile-owner progress indicators with direct links into these editors remain a separate work item; this milestone does not add progress panels.

## Validation and release gates

- No database migration or data backfill is required.
- Before release, verify the five cards against a dedicated staging member and staging media storage, including Mapbox place search/manual selection, profile photo replacement, and existing-profile compatibility. Do not use production accounts for these checks.
- Pending registration remains disabled by default and is not enabled by this milestone. Any future registration activation still requires its separately approved end-to-end staging procedure and routing/deployment safety checks.
- No production or staging environment variables were changed for this milestone.

## Local review

Run the normal local application and sign in with a development account, then open `/onboarding`. Test each card with disposable profile data. Verify Mapbox and image upload only against local/test services; do not point tests at production or staging databases. The isolated database/media test is opt-in with `ONBOARDING_INTEGRATION_TEST=1` and requires the safety-checked containers and environment described in `src/lib/onboarding/cards.integration.test.ts`. The navigation state is persisted to the authenticated member's own profile, so use a dedicated test account for browser persistence checks.
