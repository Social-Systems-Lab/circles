# Cleura Deployment

This document describes the standard production deployment workflow for Kamooni on Cleura.

## Overview

Production now runs on the Cleura server instead of the old Genesis2 server.

The goal is to keep the day-to-day deployment process simple and consistent:

1. Make changes locally.
2. Commit on a feature branch.
3. Merge locally into `main`.
4. Test on localhost.
5. Push to GitHub.
6. SSH into the Cleura server.
7. Pull the latest `main`.
8. Rebuild and restart inside a `screen` session.
9. Verify the live site.

## Production server

Current production host:

- Hostname: `kamooniorg`

SSH access:

```bash
ssh ubuntu@<server-ip>
```

Then switch to root:

```bash
sudo -i
```

## Production repo path

The production repo currently lives at:

```bash
/root/circles/circles/circles
```

This is important.

There is also an outer repo wrapper path from the migration process, but the active production app and Docker Compose setup run from the inner path above.

Always confirm the working directory before deploying.

## Standard local workflow

Before deploying, use the normal local workflow:

```bash
git checkout -b my-feature-branch
# make changes
# test locally
git add .
git commit -m "describe change"
git checkout main
git merge --ff-only my-feature-branch
git push origin main
```

Rules to follow:

- make the smallest safe change
- test locally before pushing
- keep final changes in the main repo, not temporary worktrees
- avoid deploying unrelated infrastructure changes together with normal app changes

## Standard Cleura deploy workflow

SSH into the server:

```bash
ssh ubuntu@<server-ip>
sudo -i
cd /root/circles/circles/circles
```

Check the current state first:

```bash
git branch --show-current
git status --short
git rev-parse --short HEAD
```

Fetch and fast-forward `main`:

```bash
git fetch origin
git pull --ff-only origin main
```

## Rebuild inside screen

Long rebuilds should always run inside `screen` because SSH sessions can disconnect.

Start a screen session:

```bash
screen -S rebuild
```

Inside that screen session, run:

```bash
cd /root/circles/circles/circles
docker compose up -d --build circles nginx cron
```

Wait for the rebuild to finish.

Detach from screen with:

```text
Ctrl+A then D
```

To reattach later:

```bash
screen -r rebuild
```

## Verify the deployment

After the rebuild, check container state:

```bash
cd /root/circles/circles/circles
docker compose ps
```

Then verify the live site:

```bash
curl -I https://kamooni.org
curl -s https://kamooni.org/api/version
```

Note:

`/api/version` may currently show `gitSha` and `buildTime` as `unknown` on Cleura even when the deploy is correct. If that happens, verify by checking:

- the server repo commit with `git rev-parse --short HEAD`
- the expected live UI change
- successful container restart and healthy site response

## Service management

Useful commands:

Check running containers:

```bash
docker compose ps
```

Check app logs:

```bash
docker compose logs --tail=100 circles
```

Check nginx logs:

```bash
docker compose logs --tail=100 nginx
```

Restart only the web-facing services:

```bash
docker compose up -d --build circles nginx cron
```

Bring the whole stack up:

```bash
docker compose up -d
```

Stop the whole stack:

```bash
docker compose down
```

## Production data volumes

Production uses Docker volumes for persistent data.

Important named volumes include:

- `circles_mongo`
- `circles_minio`
- `circles_qdrant`
- `circles_circles_users`

These volumes contain the live database, object storage, vector data, and user auth credential data.

Do not delete these unless you explicitly intend to destroy production data.

## TLS and nginx

Production HTTPS is terminated through nginx.

The nginx config expects Let’s Encrypt certificate files for `kamooni.org` to exist on the server under paths such as:

```text
/etc/letsencrypt/live/kamooni.org/fullchain.pem
/etc/letsencrypt/live/kamooni.org/privkey.pem
```

If nginx enters a restart loop, check whether those certificate files are present.

## Current known deployment caveat

Because of the nested repo path created during migration, production currently runs from:

```bash
/root/circles/circles/circles
```

Do not accidentally deploy from the outer path:

```bash
/root/circles/circles
```

until the repository structure is cleaned up in a future maintenance pass.

## Recommended deployment checklist

Use this before each live deploy:

1. confirm local changes are merged into `main`
2. confirm local testing passed
3. SSH into Cleura
4. confirm working directory is `/root/circles/circles/circles`
5. confirm branch is `main`
6. `git pull --ff-only origin main`
7. rebuild inside `screen`
8. `docker compose ps`
9. verify `https://kamooni.org`
10. check logs if anything looks wrong

## Rollback note

If a deployment causes problems, the fastest first response is usually:

- inspect logs
- confirm the checked-out commit
- return to the previous known-good commit
- rebuild again inside `screen`

Do not make ad hoc production edits unless absolutely necessary.

## Status of this document

This file is intended to replace the older Genesis2-specific deployment notes and should be treated as the current production deployment reference for Kamooni on Cleura.

