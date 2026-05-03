# Circle hierarchy and repositioning

Updated: 2026-05-02

## Summary

Kamooni currently supports two main circle positioning modes:

- **Profile child circles**: standard circles created under a user/profile circle.
- **Independent / top-level circles**: standard circles that stand on their own and are not attached to a profile parent.

Stage 1 of circle repositioning allows an eligible profile-child circle to become an independent/top-level circle.

## Stage 1: profile-child circle → independent circle

A standard circle that currently sits under a user/profile circle can be converted into an independent circle.

This is intentionally narrow. It is not a general “move circle” feature.

### What changes

The converted circle is updated structurally:

```ts
circleLevel = "top_level"
parentCircleId = unset
```

### What does not change

The conversion does not move, copy, or delete related content.

The following should remain attached to the converted circle:

- members
- admins
- posts
- tasks
- events
- pages
- offers and needs
- funding asks
- enabled modules
- child circles

Child circles remain attached because their own `parentCircleId` values are not changed.

## Eligibility rules

A circle can be converted only when all of the following are true:

1. The requester is authenticated.
2. The requester is a verified member / member (`user.isMember === true`).
3. The target circle exists.
4. The target circle is a standard circle (`circleType === "circle"`).
5. The target circle is currently a profile-child circle (`circleLevel === "profile_child"`).
6. The target circle has a parent circle.
7. The parent circle is a user/profile circle (`parentCircle.circleType === "user"`).
8. The requester has the existing `settings.edit_about` authorization for the circle.
9. The requester is explicitly an admin member of that circle.
10. The circle has at least one admin.

The server action enforces these checks. The UI is only a convenience layer and must not be treated as the source of truth.

## Non-goals for Stage 1

Stage 1 does not support:

- converting actual user/profile circles
- detaching child circles from independent/community parent circles
- moving a circle from one parent to another
- changing DID identity behavior
- changing handles or URL structure
- member voting or governance-based detachment
- migrating child-circle records

## UI behavior

The conversion card appears on the circle About settings page only when the current viewer is eligible and the circle is structurally eligible.

The confirmation copy should make clear that:

- the circle will become independent
- it will no longer sit under the personal/profile circle
- existing child circles will remain attached
- existing members and content will remain

## Backend behavior

The conversion uses a direct MongoDB update with `$set` and `$unset` so the parent reference is reliably removed:

```ts
await Circles.updateOne(
  { _id: new ObjectId(circleId) },
  {
    $set: { circleLevel: "top_level" },
    $unset: { parentCircleId: "" },
  },
);
```

Do not use `updateCircle({ parentCircleId: undefined })` for this operation. The general `updateCircle()` helper uses `$set`, and `undefined` is not a reliable way to remove a MongoDB field.

## Related creation rule

Creating new independent/top-level circles is also limited to verified members / members (`user.isMember === true`).

Admins and superadmins should not bypass this rule unless they also satisfy the member requirement.

## Manual verification checklist

For a non-member/non-verified user who is admin of a profile-child circle:

- The independent-circle creation option should not be selectable.
- The profile-child → independent conversion card should not appear.
- A direct server-action bypass should be rejected.

For a verified member who is admin of a profile-child circle:

- The conversion card should appear.
- The confirmation dialog should open.
- Conversion should succeed.
- The circle should become top-level.
- Child circles should remain attached.
- Existing content and members should remain.

For ineligible circle types:

- Actual user/profile circles should not show the conversion card.
- Child circles under independent/community parents should not show the conversion card.
