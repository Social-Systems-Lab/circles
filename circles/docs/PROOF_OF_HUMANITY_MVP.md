# Proof of Humanity MVP

## Purpose

Proof of Humanity allows members to publicly verify that another profile represents a real human, helping reduce fake accounts and making trust visible.

## Verification levels

- `real_person`: "I confirm this is a real person"
- `met_in_real_life`: "I have met this person in real life"

The `met_in_real_life` level is the stronger claim.

## Public visibility

Verifications are public.

Anyone who can view the profile can see who verified whom.

## Profile UI behavior

- the profile header shows `✓ Human` when the profile has at least one active verification
- if the current viewer can verify the profile and there are no verifications yet, the header shows `Verify Human`
- the `Proof of Humanity` panel appears in the profile sidebar below `Verified Contributions`
- the panel shows a compact summary such as `1 real person · 1 met in real life`
- the `Verifications` dropdown reveals:
  - the public verifier list
  - the current viewer's own verification state
  - verify/update/remove actions
- clicking the header Human button links to `#proof-of-humanity` and opens the panel

## Rules

- users cannot verify themselves
- one active verification is allowed per verifier/subject pair
- users can update their own verification level
- users can remove/revoke their own verification
- removed verifications are retained using `revokedAt` rather than hard-deleted

## Data model

Mongo collection:

- `humanityVerifications`

Important fields:

- `verifierDid`
- `subjectDid`
- `level`
- `note` optional
- `createdAt`
- `updatedAt`
- `revokedAt` optional

Model intent:

- explicit
- public
- one active record per verifier/subject pair
- revocation-friendly

## Notification behavior

- a bell notification is sent to the verified profile owner on new verification
- a bell notification is sent when a verification is upgraded from `real_person` to `met_in_real_life`
- no notification is sent when a verification is removed
- no notification is sent to the verifier

## Current MVP limitations

- no trust score
- no cluster analysis
- no avatar badge
- no reviews or endorsements
- no admin moderation UI

## Future notes

This area can later broaden into a wider trust/public-validation zone for:

- reviews
- endorsements
- verified contributions
- other social proof

Performance cleanup note for a future round:

- the profile `/home` route currently fetches the Proof of Humanity summary twice, once for the header/layout and once for the sidebar/About page
- this is acceptable for MVP and deploy-safe, but should be optimised later
