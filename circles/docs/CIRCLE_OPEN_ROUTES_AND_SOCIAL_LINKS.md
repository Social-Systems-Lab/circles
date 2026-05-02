# Kamooni Developer Note: Safe Circle Open Routes and Social Link Validation

Updated: 2026-05-01

## Purpose

This note documents two related safety lessons from production:

1. Circle Open actions should navigate to concrete enabled module routes.
2. Social links must be validated and rendered defensively.

## 1. Circle Open Routing

### Rule

Do not send users to a bare circle route from Open buttons when a concrete module route is available.

Prefer:

```text
/circles/<handle>/home
```

when `home` is enabled.

Fallback order:

1. `/circles/<handle>/home` if `enabledModules` includes `home`
2. `/circles/<handle>/<first-enabled-module>`
3. `/circles/<handle>/home`

### Why

Bare routes like:

```text
/circles/<handle>
```

depend on redirect logic. In Explore / preview contexts, stale URL state or query params can cause invalid module state such as:

```text
/circles/<handle>?module=feed
```

If the circle does not have `feed` enabled, users may be sent to the circle-specific not-found page.

### Helper

Use the shared helper introduced in:

```text
src/lib/utils/circle-routes.ts
```

Expected behavior:

```ts
getCircleDefaultRoute(circle)
```

should resolve a concrete valid route for the circle.

### Entry Points That Should Use Concrete Routes

Known Open/navigation surfaces:

```text
src/components/layout/content-preview.tsx
src/components/modules/circles/circle-swipe-card.tsx
src/components/modules/circles/circles-list.tsx
src/components/layout/user-toolbox.tsx
src/components/layout/circle-menu.tsx
src/app/circles/[handle]/page.tsx
src/app/circles/[handle]/not-found/page.tsx
```

## 2. Circle-Specific Not Found Behavior

### Rule

A circle-specific not-found page should not strand the user.

When the route has enough circle context, the CTA should point to a concrete resolved route such as:

```text
/circles/<handle>/home
```

not merely:

```text
/circles/<handle>
```

This avoids re-entering invalid routing state.

## 3. Social Links Validation

### Incident Pattern

A page crashed when a social link had a URL but no platform:

```js
{
  url: "https://www.youtube.com/@example"
}
```

Frontend code attempted:

```ts
platform.toLowerCase()
```

and crashed because `platform` was undefined.

### Rendering Rule

Rendering social links must be defensive:

- Skip entries without a valid `url`.
- Skip or infer entries without a valid `platform`.
- Never call string methods on possibly undefined values.
- Unknown platforms should render as a generic external link or be ignored.

Example defensive pattern:

```ts
const platform = link.platform?.toLowerCase();

if (!link.url || !platform) {
  return null;
}
```

### Saving Rule

Forms should prevent malformed social links from being written to MongoDB.

Minimum validation:

- `url` is required.
- `platform` is required.
- Platform must be from an allowed list.
- URL should match the selected platform domain where practical.

### Product Recommendation

If the product intent is “profile/page links only”, then validation should reject or warn on non-profile links.

Examples:

Accepted:

```text
https://www.facebook.com/groups/example
https://www.facebook.com/example-page
https://www.youtube.com/@example
https://www.instagram.com/example
https://www.linkedin.com/company/example
```

Potentially rejected or warned:

```text
Facebook video URLs
YouTube individual video URLs
Temporary share links
Shortened links
```

This is a product decision. The backend should not crash either way.

## 4. Recommended Follow-Up Codex Task

Suggested prompt:

```text
Investigate social link creation/editing and rendering. Implement the smallest safe fix so social links cannot crash circle/profile pages when platform is missing or invalid. Add validation in the save path where socialLinks are accepted, and add defensive rendering in SocialLinks. Prefer inferring platform from known domains only if safe. Do not change routing. Do not deploy.
```

## 5. Production Debug Commands

Find malformed social links:

```bash
cd /root/circles/circles/circles && docker compose exec -T db sh -lc 'mongosh "$MONGODB_URI" --quiet <<'"'"'JS'"'"'
const d = db.getSiblingDB("circles");

const docs = d.getCollection("circles").find({
  socialLinks: {
    $elemMatch: {
      $or: [
        { platform: { $exists: false } },
        { platform: null },
        { platform: "" },
        { url: { $exists: false } },
        { url: null },
        { url: "" }
      ]
    }
  }
}, { name: 1, handle: 1, socialLinks: 1 }).toArray();

print("MATCHES=" + docs.length);
docs.forEach(doc => printjson(doc));
JS'
```

Check a circle’s enabled modules:

```bash
cd /root/circles/circles/circles && docker compose exec -T db sh -lc 'mongosh "$MONGODB_URI" --quiet <<'"'"'JS'"'"'
const d = db.getSiblingDB("circles");
printjson(d.getCollection("circles").findOne(
  { handle: "bygggruppen" },
  { name: 1, handle: 1, enabledModules: 1, isPublic: 1 }
));
JS'
```

Check route response:

```bash
curl -i -sS https://kamooni.org/circles/bygggruppen | head -80
curl -i -sS https://kamooni.org/circles/bygggruppen/home | head -80
```
