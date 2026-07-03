# Circle affiliations

Updated: 2026-07-03

## Conceptual model

Each circle still has one primary structural home, represented by `parentCircleId` and `circleLevel`.

Affiliations are separate from that hierarchy. They let a circle appear aligned with, or visible under, another umbrella circle without changing where the circle structurally lives.

Affiliations do not imply:

- ownership
- parent/child hierarchy
- governance rights
- permission inheritance
- membership inheritance

## Data model

The affiliated circle stores the umbrella circle IDs in `affiliatedCircleIds`.

Example: if circle A is affiliated under umbrella circle B, then `B._id` is stored in `A.affiliatedCircleIds`.

```ts
circleA.affiliatedCircleIds = [circleB._id]
```

Do not store the inverse relationship on B as the source of truth.

## UI surfaces

- An umbrella circle's Communities tab can show affiliated circles under Affiliates.
- Circle admins can add or remove affiliations from circle settings/about.

## Current MVP limitations

- Affiliations are visibility/alignment only.
- There is no request, approval, or invitation workflow yet.
- Adding an affiliation is currently an admin action from the umbrella circle settings, using the affiliated circle handle.
- Affiliations do not grant access to private content, admin tools, governance, or child-circle permissions.

## Future request/approval workflow

A later workflow may let umbrella circles request, approve, reject, or remove affiliations. That should be modeled as an explicit request/approval state, not by changing structural circle fields.

## Important warning

Do not change `parentCircleId` or `circleLevel` when adding, removing, or displaying affiliations.

Those fields define the circle's structural hierarchy. Affiliations belong only in `affiliatedCircleIds`.
