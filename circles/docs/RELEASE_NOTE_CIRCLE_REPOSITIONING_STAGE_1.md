# Release note: Circle repositioning Stage 1

Updated: 2026-05-02

## What changed

Kamooni now supports Stage 1 of circle repositioning:

> Eligible profile-child circles can be converted into independent/top-level circles.

This allows a project or community that began under a personal/profile circle to stand on its own once it is ready.

## Access rule

Only verified members / members can create or upgrade independent circles.

This applies to both:

- creating a new independent circle
- converting a profile-child circle into an independent circle

Being an admin of a circle is not enough by itself. The user must also satisfy the member requirement.

## Conversion behavior

When a profile-child circle is converted:

- it becomes a top-level independent circle
- its parent profile reference is removed
- child circles remain attached
- members and admins remain
- content remains
- tasks, events, pages, funding asks, and modules remain

## Safety constraints

The first version is intentionally limited.

It does not allow:

- converting actual user/profile circles
- detaching child circles from independent/community parents
- moving circles between arbitrary parents
- changing DID identity behavior
- changing handles or URL structure

## Files changed in implementation

Main implementation files:

- `src/app/circles/[handle]/settings/about/actions.ts`
- `src/app/circles/[handle]/settings/about/page.tsx`
- `src/app/circles/[handle]/settings/about/convert-profile-child-circle-card.tsx`

Related independent-circle creation gate:

- `src/components/circle-wizard/actions.ts`
- `src/components/circle-wizard/basic-info-step.tsx`

## Production deployment notes

Deployed after:

- local test
- push to `main`
- pull on Cleura production
- Docker image rebuild
- `circles` container recreation
- `/api/version` check

Current Cleura `/api/version` may still report:

```json
{"gitSha":"unknown","buildTime":"unknown"}
```

This is expected for the current Cleura build/version setup.
