# Release Note: Proof of Humanity MVP

## User-facing summary

Proof of Humanity lets members publicly verify that another profile represents a real human.

This is an MVP trust feature intended to make fake accounts harder to hide and make social trust more visible on profile pages.

Two verification levels are supported:

- `real_person`: "I confirm this is a real person"
- `met_in_real_life`: "I have met this person in real life"

The second level is stronger.

## UI summary

On user profiles:

- the profile header shows `✓ Human` when the profile has at least one active verification
- if the current viewer can verify the profile and there are no verifications yet, the header shows `Verify Human`
- the profile sidebar shows a `Proof of Humanity` panel below `Verified Contributions`
- the panel shows a compact summary such as `1 real person · 1 met in real life`
- the `Verifications` dropdown reveals the public verifier list, the viewer's own verification state, and verify/update/remove actions
- clicking the header Human button links to `#proof-of-humanity` and opens the panel

## Rules and behavior

- users cannot verify themselves
- one active verification is allowed per verifier/subject pair
- users can update their own verification level
- users can remove/revoke their own verification
- revoked verifications are retained with `revokedAt` rather than hard-deleted

## Data and model notes

This MVP adds a new Mongo collection:

- `humanityVerifications`

Important fields:

- `verifierDid`
- `subjectDid`
- `level`
- `note` optional
- `createdAt`
- `updatedAt`
- `revokedAt` optional

## Notification behavior

- a bell notification is sent to the verified profile owner on new verification
- a bell notification is sent on upgrade from `real_person` to `met_in_real_life`
- no notification is sent on removal
- no notification is sent to the verifier

## Known MVP limitations

- no trust score yet
- no cluster analysis yet
- no avatar badge
- no reviews or endorsements yet
- no admin moderation UI yet

## Forward note

This area could later broaden into a wider trust/public-validation zone for:

- reviews
- endorsements
- verified contributions
- other social proof

Current MVP performance note:

- the profile `/home` route currently fetches the Proof of Humanity summary twice, once for the header/layout and once for the sidebar/About page
- this is acceptable for MVP but should be optimised in a future cleanup round
