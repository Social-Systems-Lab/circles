# Kamooni Deployment Architecture

## Overview

Production runs on a DigitalOcean droplet (Circles-Genesis2) using Docker Compose.

Images are built locally and pushed to GitHub Container Registry (GHCR).

The server never builds application images.

Typical deploy time: ~20–30 seconds.

---

## Deploy pipeline

Local machine

docker buildx build --platform linux/amd64 \
  --build-arg GIT_SHA=\$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=\$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t ghcr.io/social-systems-lab/circles:latest \
  -t ghcr.io/social-systems-lab/circles:\$(git rev-parse --short HEAD) \
  --push .

Server (Genesis2)

docker compose pull circles  
docker compose up -d circles

---

## Rollback

Rollback is image-based using tagged SHA images.

Example:

rollbackkamooni cf937b0

This pulls the specified image and restarts the service.
