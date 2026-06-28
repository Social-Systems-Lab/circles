# Kamooni / Circles production notes

Last updated: 2026-06-28

## Current repository model

Social-Systems-Lab/circles is now the Kamooni/Circles production repository.

The main branch is the production branch for Kamooni. It should remain Kamooni/Circles-specific.

Peerify has moved to its own repository and should not be reintroduced into this repository.

Avoid adding Peerify-specific pages, colours, onboarding flows, signup copy, deployment scripts, or product assumptions to Social-Systems-Lab/circles.

## Production server

Kamooni production runs from:

    /home/ubuntu/circles/circles

Production URL:

    https://kamooni.org

The app is deployed with Docker Compose.

Main service:

    circles

Main container:

    circles-circles-1

## Deployment

Run Git commands as the ubuntu user, not root.

From the production working tree:

    cd /home/ubuntu/circles/circles
    git switch main
    git pull --ff-only origin main

Build and restart:

    GIT_SHA="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" sudo -E docker compose build circles
    GIT_SHA="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" sudo -E docker compose up -d --no-deps --force-recreate circles

Verify after deploy:

    curl -fsSL https://kamooni.org/api/version && echo
    curl -fsSL https://kamooni.org/api/altcha/challenge | head -c 300 && echo
    curl -I https://kamooni.org/signup/pilot

The SHA from /api/version should match:

    git rev-parse --short HEAD

## Environment

Docker Compose expects an .env file in the production app directory.

On production, .env is currently a symlink to:

    /home/ubuntu/migration-export/.env

Important environment variables include:

    CIRCLES_URL
    POSTMARK_API_TOKEN
    POSTMARK_SENDER_EMAIL
    ALTCHA_HMAC_KEY

ALTCHA_HMAC_KEY must be present for signup verification to work.

## Git access

The repo remote uses SSH:

    git@github.com:Social-Systems-Lab/circles.git

The ubuntu user has a repository deploy key configured for this repo:

    ~/.ssh/kamooni_circles_deploy
    ~/.ssh/kamooni_circles_deploy.pub

Test GitHub SSH access with:

    ssh -T git@github.com

## Recent cleanup

On 2026-06-27/28:

- main was reset to the clean Kamooni branch.
- obsolete product/kamooni and product/peerify branches were removed.
- Peerify was archived separately and now lives in its own repository.
- ALTCHA signup verification was confirmed working on production.
- the noticeboard post deletion permissions fix was manually extracted and committed cleanly to main.
- Git access was switched from HTTPS token prompts to an SSH deploy key for the ubuntu user.
