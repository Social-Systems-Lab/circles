# Kamooni Production Incident Note: Circle Open Routing + Malformed Social Link

Date: 2026-05-01  
Status: Resolved in production  
Related commit: `6fc2b88` — `Fix circle open default module routing`

## Summary

Two production issues were investigated around circle pages:

1. **Hästekasen Farm page crash**
   - The page failed because a `socialLinks` entry had a URL but no `platform`.
   - The renderer attempted to call `.toLowerCase()` on an undefined `platform`.
   - Immediate production data repair removed the malformed YouTube social link from the affected circle record.

2. **Bygg-gruppen Open routing issue**
   - The Explore / preview Open flow could lead to:
     `/circles/bygggruppen/not-found?redirectTo=%2Fcircles%2Fbygggruppen&module=feed`
   - The circle did not have `feed` enabled.
   - The correct route was:
     `/circles/bygggruppen/home`

## Root Causes

### Hästekasen Farm

The `socialLinks` array contained an incomplete entry:

```js
{
  url: "https://www.youtube.com/@hastekasen1adventure2nature"
}
```

The missing `platform` caused a render crash where frontend code expected every social link to have a defined platform.

### Bygg-gruppen

Some Open entry points navigated to the bare circle route:

```ts
/circles/<handle>
```

Under certain Explore / preview state conditions, this could preserve or generate an invalid module query such as `module=feed`, causing users to land on a circle-specific not-found route.

## Production Data Repair Applied

For Hästekasen Farm, the malformed YouTube social link was removed from MongoDB:

```js
db.getCollection("circles").updateOne(
  { _id: ObjectId("69f0f92285031b0aa6b17aeb") },
  {
    $pull: {
      socialLinks: {
        url: "https://www.youtube.com/@hastekasen1adventure2nature"
      }
    }
  }
);
```

Result:

```js
socialLinks: [
  {
    platform: "facebook",
    url: "https://www.facebook.com/groups/hastekasen"
  }
]
```

## Code Fix Applied

Commit:

```text
6fc2b88 Fix circle open default module routing
```

Changed files:

```text
src/lib/utils/circle-routes.ts
src/app/circles/[handle]/page.tsx
src/app/circles/[handle]/not-found/page.tsx
src/components/layout/content-preview.tsx
src/components/modules/circles/circle-swipe-card.tsx
src/components/modules/circles/circles-list.tsx
src/components/layout/user-toolbox.tsx
src/components/layout/circle-menu.tsx
```

## New Routing Behavior

Circle Open actions now navigate directly to a concrete valid module route:

1. Prefer `/circles/<handle>/home` when `home` is enabled.
2. Otherwise use the first enabled module.
3. If no enabled modules exist, fall back to `/circles/<handle>/home`.

The circle-specific not-found page now includes a CTA to the resolved concrete default route so users are not stranded.

## Verification

Local:

```bash
npm run lint
npm run build
```

Production:

- Deployed commit `6fc2b88`
- Browser-tested production
- Confirmed Bygg-gruppen opens correctly on prod

Recommended final verification command:

```bash
curl -sS https://kamooni.org/api/version && echo
```

Note: On Cleura, `gitSha` / `buildTime` may sometimes show `unknown`, depending on the deployment build context and env wiring.

## Follow-up Recommendation

The routing fix is complete. A separate small follow-up should harden social link handling:

- Validate social links before saving.
- Infer platform from URL where safe.
- Ignore malformed entries during rendering instead of crashing.
- Restrict platform links to profile/page/channel URLs where product policy requires it.
