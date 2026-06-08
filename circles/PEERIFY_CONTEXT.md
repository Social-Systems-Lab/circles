
---

## 2026-06-08 Working MVP checkpoint

The Peerify server is currently running a working MVP/pilot flow on:

- Server: `tim@65.21.91.96`
- App path: `~/apps/peerify/circles`
- Public URL: `http://65.21.91.96:3000`
- PM2 process: `peerify`

Current working flow:

- `/` renders the new dark/orange Peerify landing page.
- `/signup/pilot` renders the Peerify pilot signup form.
- Signup creates a personal account first, not a permanent role-specific account type.
- `/signup/pilot/check-email` shows the email confirmation page.
- “Continue for now” now sends users to their personal circle/home page first.
- `/onboarding/peerify?intent=fan|artist|host` exists as the first role-choice onboarding screen.
- Login/session now works on the HTTP pilot server.

Important auth/session note:

Because the MVP is currently served over plain HTTP, production secure cookies had to be disabled with:

```env
CIRCLES_COOKIE_SECURE=false
```

When Peerify moves behind HTTPS, this should be changed back to:

```env
CIRCLES_COOKIE_SECURE=true
```

Current visual direction:

- Landing page: dark/near-black with orange accent.
- Main orange: `#e8720c`
- Hover/light orange: `#ff8c2a`
- Old mustard values should gradually be replaced where still visible.
- Pilot signup, check-email, onboarding, error, and not-found pages have been moved toward the orange palette.

Current assets:

- Peerify assets live in `public/peerify/`.
- Main logo path: `/peerify/logo-mark.png`
- Favicon path: `/peerify/favicon.ico`
- Landing images currently include:
  - `everyone.jpg`
  - `fans.jpg`
  - `artist.jpg`
  - `hosts.jpg`
  - `about.jpg`
  - `contact.jpg`
  - `involved.jpg`

Current landing page implementation:

- `src/app/page.tsx`
- `src/app/welcome/page.tsx`
- `src/components/pages/peerify-landing-page.tsx`
- `src/components/pages/peerify-landing-page.css`

The landing page currently uses a temporary fixed overlay CSS approach to bypass the inherited Circles app shell on public routes. This works visually, but a future cleanup should split public pages from app-shell pages properly.

Current snapshots:

```text
~/peerify-snapshots/peerify-onboarding-auth-working-20260608-0916.tar.gz
```

A later landing-page snapshot was also created before landing cleanup work.
