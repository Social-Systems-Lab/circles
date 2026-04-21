# Kamooni Deployment Guide

_Last updated: 2026-04-21_

This is the current production deployment workflow for Kamooni / Circles.

It replaces older Genesis2-only notes and reflects the current production setup and the lessons from recent deploys.

---

## 1. Current production context

Production currently runs from the server repo at:

```bash
/root/circles/circles/circles
```

Deploys are done **on the production server**, from the checked-out `main` branch in that directory.

Important:

- You must **pull latest `origin/main` on the server before building**
- If you rebuild without pulling first, Docker may rebuild **stale code**
- This already caused a false “deploy succeeded but bug is still there” situation

---

## 2. Golden rules

### Always

- deploy from `origin/main`
- update the server repo first
- rebuild from the current server checkout
- verify the running site after deployment
- use a `screen` session for long builds
- keep local repo, GitHub, and production in sync

### Never

- rebuild production without first pulling latest `main`
- hot-edit production code without syncing back to Git
- assume a fast rebuild means new code was deployed
- rely only on container restart as proof of deployment
- deploy from an old local branch or an unmerged feature branch

---

## 3. Standard deployment workflow

### Step 1 — Merge to `main` locally

On your local Mac:

```bash
cd ~/circles/circles
git checkout main
git pull --ff-only origin main
git merge --ff-only dev
git push origin main
```

If you are merging a feature branch into `dev` first:

```bash
cd ~/circles/circles
git checkout dev
git pull --ff-only origin dev
git merge --ff-only feature/your-branch-name
git push origin dev
```

Then test on dev/localhost before promoting to `main`.

---

### Step 2 — Open a screen session on production

On the production server:

```bash
sudo -i
cd /root/circles/circles/circles
screen -S rebuild
```

If you are already root and already in the correct directory, you can just run:

```bash
screen -S rebuild
```

---

### Step 3 — Pull latest code on the server

Inside the screen session, always do this first:

```bash
cd /root/circles/circles/circles
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
git log -1 --oneline
```

This confirms the server repo is actually on the latest production commit.

#### Why this matters

A Docker rebuild only uses the code currently checked out on the server.

If the server repo is still on an old commit, the rebuild will successfully produce an image from stale code.

That is exactly what happened in a recent deployment:
- GitHub/main had the fix
- production server still had an older commit
- Docker rebuilt old code
- the app restarted successfully, but the bug remained

---

### Step 4 — Build and restart the app

Still inside the screen session:

```bash
cd /root/circles/circles/circles
docker compose build circles
docker compose up -d --no-deps --force-recreate circles
```

This rebuilds the app image and recreates the `circles` container only.

Use this for normal app deploys.

---

### Step 5 — Verify the deploy

After the rebuild:

```bash
cd /root/circles/circles/circles
docker compose ps
echo
curl -sS https://kamooni.org/api/version && echo
```

Optional additional check:

```bash
cd /root/circles/circles/circles
git rev-parse --short HEAD
git log -1 --oneline
```

---

## 4. Current verification reality on production

At the moment, production may return:

```json
{"version":"0.8.15","gitSha":"unknown","buildTime":"unknown"}
```

from:

```bash
curl -sS https://kamooni.org/api/version
```

So currently:

- `/api/version` confirms the site is live and responding
- but it may **not** confirm the exact deployed commit SHA

Because of that, the current source of truth for “what code was deployed” is:

```bash
cd /root/circles/circles/circles
git rev-parse --short HEAD
git log -1 --oneline
```

paired with a successful rebuild and container restart.

### Important note

Until build metadata is restored properly, do **not** assume `/api/version` proves the exact commit on production.

---

## 5. Full copy-paste deployment block

This is the safest standard production deploy sequence.

On the production server:

```bash
sudo -i
cd /root/circles/circles/circles
screen -S rebuild
```

Then inside the screen session:

```bash
cd /root/circles/circles/circles
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
git log -1 --oneline
docker compose build circles
docker compose up -d --no-deps --force-recreate circles
docker compose ps
echo
curl -sS https://kamooni.org/api/version && echo
```

---

## 6. Fast verification checklist

After every deploy, verify all of the following:

- server repo is on the expected commit
- `docker compose build circles` completed successfully
- `docker compose up -d --no-deps --force-recreate circles` completed successfully
- `docker compose ps` shows `circles` is up
- `https://kamooni.org` loads
- `https://kamooni.org/api/version` responds
- the actual changed feature works in the browser

### Do not stop at container status alone

A restarted container does **not** prove correct code is running.

Always verify the actual feature or bugfix in the browser.

---

## 7. Recommended post-deploy feature verification

After deployment, test the exact behavior you changed.

Examples:

- if you changed onboarding, test with real verified and unverified accounts
- if you changed profile UI, hard-refresh and inspect both self and other-user views
- if you changed permissions, test both allowed and blocked cases
- if you changed backend logic, verify the real frontend result too

---

## 8. Common failure modes

### A. Rebuilt stale code

#### Symptom

- build and restart succeed
- bug is still present on production
- no obvious errors

#### Cause

You rebuilt before pulling latest `origin/main` on the server.

#### Fix

Run:

```bash
cd /root/circles/circles/circles
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose build circles
docker compose up -d --no-deps --force-recreate circles
```

---

### B. `/api/version` shows `gitSha: unknown`

#### Symptom

```json
{"version":"0.8.15","gitSha":"unknown","buildTime":"unknown"}
```

#### Meaning

The app is live, but build metadata is not currently embedded in production.

#### Fix / workaround

Use the server repo state as the commit source of truth:

```bash
cd /root/circles/circles/circles
git rev-parse --short HEAD
git log -1 --oneline
```

---

### C. Build is suspiciously fast

#### Symptom

The rebuild finishes much faster than expected and behavior does not change.

#### Possible cause

Docker reused layers while building from an unchanged or stale server checkout.

#### Action

Immediately verify:

```bash
cd /root/circles/circles/circles
git rev-parse --short HEAD
git log -1 --oneline
```

If it is not on the expected commit, pull latest main and rebuild again.

---

### D. Browser still shows old behavior

#### Symptom

Production looks unchanged after a confirmed correct deploy.

#### Possible cause

Cached client assets or stale browser state.

#### Action

- hard refresh the page
- test in private/incognito window
- log out and back in if relevant
- verify with another account if the feature is role-specific

---

## 9. Emergency rollback approach

### Preferred rollback method

Create a Git revert on `main`, push it, then deploy the reverted `main`.

Local Mac:

```bash
cd ~/circles/circles
git checkout main
git pull --ff-only origin main
git revert --no-edit <bad_commit_sha>
git push origin main
```

Then on production server:

```bash
cd /root/circles/circles/circles
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose build circles
docker compose up -d --no-deps --force-recreate circles
```

### Why revert is preferred

- preserves history
- is safer than force-resetting public history
- makes rollback explicit and auditable

---

## 10. Local-to-production sync rule

These three locations must stay aligned:

- local repo
- GitHub repo
- production server repo

If a fix happens under pressure:

1. make the fix properly in Git
2. push to GitHub
3. pull it onto production
4. rebuild production
5. verify in browser
6. ensure local repo still matches GitHub

---

## 11. Minimal safe deployment checklist

Use this every time:

### Local
- [ ] change tested locally or on dev
- [ ] merged to `main`
- [ ] pushed to GitHub

### Production server
- [ ] `git fetch origin`
- [ ] `git checkout main`
- [ ] `git pull --ff-only origin main`
- [ ] `git rev-parse --short HEAD`
- [ ] `docker compose build circles`
- [ ] `docker compose up -d --no-deps --force-recreate circles`
- [ ] `docker compose ps`
- [ ] `curl -sS https://kamooni.org/api/version && echo`

### Browser
- [ ] hard refresh
- [ ] test the exact feature/fix
- [ ] test both allowed and blocked cases where relevant

---

## 12. Recommended future improvement

A future cleanup should restore proper build metadata so `/api/version` reports real values for:

- `gitSha`
- `buildTime`

Once that is fixed, deployment verification will be clearer and more reliable.

Until then, always treat the server repo HEAD plus successful rebuild as the best proof of what was deployed.
