# Deployment

This document describes the current deployment workflow for Kamooni.

## Overview

Kamooni uses a local-first workflow:

1. Make changes locally.
2. Commit on a feature branch.
3. Merge locally into `main`.
4. Test on localhost.
5. Push to GitHub.
6. Pull on the production server.
7. Rebuild and restart inside a `screen` session.
8. Verify the deployed version.

## Core workflow rules

A few rules should always be followed:

* Make the smallest safe change.
* Keep final code changes in the main repo, not in temporary worktrees.
* Test locally before pushing.
* Run long production rebuilds inside `screen`.
* Verify the deployed version after each release.

## Local development and release flow

Typical release flow:

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

## Production repo path

The production repo should live in the main server path, for example:

```bash
/root/circles/circles
```

Do not leave final production changes in temporary worktree directories.

## Production deploy steps

SSH into the production server and run:

```bash
cd /root/circles/circles
git checkout main
git pull --ff-only origin main
```

Then start a `screen` session for the rebuild:

```bash
screen -S rebuild
```

Inside the screen session, rebuild and restart the app:

```bash
docker compose up -d --build
```

Detach from screen with:

```text
Ctrl+A then D
```

## Verify deployment

After the rebuild completes, verify the deployment with:

```bash
curl -s https://kamooni.org/api/version
```

Expected response includes fields such as:

* `version`
* `gitSha`
* `buildTime`

## Version tracking

Kamooni exposes deployment version information through `/api/version`.

This is useful for confirming that the live server is actually running the expected commit and build.

## Environment and secrets

Production secrets should remain on the server and out of git.

Important checks before or after deploy:

* correct `.env` is present
* public URL is correct
* storage configuration is correct
* database connection is correct
* email and other integrations still work

## Notes for production operators

A few habits are recommended:

* use `screen` for long-running builds because SSH sessions can disconnect
* verify the current branch before deploying
* use `git status --short` before and after important changes
* keep a rollback path available for major infra changes
* test anything involving uploads, storage, or auth after deploy

## Current infrastructure note

The hosting provider may change over time, but the deployment workflow should remain mostly the same once the server is provisioned correctly.

The goal is to keep ongoing deploys simple even if infrastructure changes underneath.

## Status of this document

This file is intended to reflect the real Kamooni deployment workflow and should be kept in sync with current production practice.
