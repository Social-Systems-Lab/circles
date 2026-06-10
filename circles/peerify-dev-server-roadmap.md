
---

## 2026-06-08 deployment notes and current baseline

Current deployment target:

```text
Server: tim@65.21.91.96
Path: ~/apps/peerify/circles
PM2 process: peerify
URL: http://65.21.91.96:3000
```

Current known-good state:

- Next.js build succeeds.
- PM2 standalone server runs.
- Landing page renders.
- Pilot signup works.
- Login works on HTTP after setting `CIRCLES_COOKIE_SECURE=false`.
- Pilot check-email page works.
- “Continue for now” now routes to the user’s personal circle/home page first.
- Peerify onboarding screen exists and can be reached after login.

Required deploy sequence after each build:

```bash
cd ~/apps/peerify/circles

rm -rf .next
npm run build && \
mkdir -p .next/standalone/.next && \
rm -rf .next/standalone/.next/static && \
cp -r .next/static .next/standalone/.next/static && \
rm -rf .next/standalone/public && \
cp -r public .next/standalone/public && \
pm2 restart peerify --update-env
```

Important PM2/env note:

If `.env.local` changes, especially auth/session variables, restart PM2 by explicitly loading env:

```bash
cd ~/apps/peerify/circles

pm2 delete peerify

set -a
. ./.env.local
set +a

PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js --name peerify --update-env
pm2 save
```

Important HTTP cookie note:

For the current HTTP pilot server:

```env
CIRCLES_COOKIE_SECURE=false
```

For future HTTPS deployment:

```env
CIRCLES_COOKIE_SECURE=true
```

Known non-blocking warnings/issues:

- Postmark is not configured, so real email delivery may not work yet.
- OpenAI embedding generation complains if `OPENAI_API_KEY` is missing.
- Qdrant connection may timeout if Qdrant is not running.
- These do not currently block the visual landing page or pilot signup/login flow.

Future cleanup tasks:

1. Replace the temporary landing-page overlay with a proper public-layout/app-shell split.
2. Wire landing page stats to real platform data instead of hardcoded values.
3. Continue orange visual pass across remaining auth/app screens.
4. Decide final post-signup journey:
   - personal profile/home first,
   - then role onboarding,
   - then artist/host/fan-specific setup.
5. Add a deploy script so the standalone asset copy sequence is not manual.
6. Move to HTTPS and set `CIRCLES_COOKIE_SECURE=true`.

## 2026-06-10 layout split attempt note

A first attempt was made to split the public pages from the inherited Circles app shell by moving the main app routes into an `(app)` route group.

Result:
- Build could be made to pass after import-path updates.
- Public/app routes returned 200.
- However, the landing page visuals broke, especially image placement and sizing.
- The attempt was rolled back to `main`.

Decision:
- Do not move the full app route tree yet.
- Next attempt should be smaller:
  1. preserve the current working landing page,
  2. isolate only the public landing/signup surfaces where possible,
  3. avoid large route-folder moves until visual regressions are better understood.

Current dev URL:
- http://65.21.91.96:3000

## 2026-06-10 HTTPS pilot domain checkpoint

Peerify pilot domain is now live:

- Public pilot URL: https://peerify.one
- www URL: https://www.peerify.one
- DNS:
  - peerify.one -> 65.21.91.96
  - www.peerify.one -> 65.21.91.96
- Nginx proxies peerify.one and www.peerify.one to the app on localhost:3000.
- Certbot / Let's Encrypt HTTPS is active.
- HTTP redirects to HTTPS.
- `.env.local` was updated on the server:
  - NEXT_PUBLIC_APP_URL=https://peerify.one
  - CIRCLES_COOKIE_SECURE=true

Direct IP dev access may still load at http://65.21.91.96:3000, but secure-cookie login/session testing should now be done through https://peerify.one.

## 2026-06-10 protected route /error fix

After enabling HTTPS and setting secure cookies, signup/login worked, and `/onboarding/peerify?intent=artist` remained logged in. However, the post-signup personal profile route redirected to `/error`:

- `/circles/<handle>/home` -> `/error`

Cause:
- Production middleware calls the internal access API using `CIRCLES_HOST` and `CIRCLES_PORT`.
- These values were missing from `.env.local`, so protected `/circles/...` routes could not complete their access check.

Fix added to server `.env.local`:

```env
CIRCLES_HOST=127.0.0.1
CIRCLES_PORT=3000

PM2 was restarted with .env.local explicitly loaded.

Result:

/circles/<handle>/home returns 200 OK.
/onboarding/peerify?intent=artist returns 200 OK.
Secure-cookie login/session works through https://peerify.one.
