
# Kamooni System Architecture (Mongo Native) — v11

Last updated: 2026‑03‑07

This document describes the current production architecture of the Kamooni / Circles platform after the Mongo‑native chat migration and the GHCR‑based fast deployment pipeline.

---

# 1. High‑Level Architecture

Active runtime components:

Browser
↓
NGINX reverse proxy
↓
Next.js application (Node runtime)
↓
MongoDB (primary database)
↓
MinIO (object storage)
↓
Qdrant (vector search)

Legacy components (disabled by default):

Synapse (Matrix server)
Postgres (Matrix dependency)

These services remain only for compatibility or historical reasons and are disabled using Docker profiles.

They are **not part of the active runtime path**.

---

# 2. Core Runtime Services

## Next.js Application

The main application runs as a standalone Next.js server container.

Responsibilities:

- UI rendering
- API routes
- chat backend
- user identity management
- notifications
- search orchestration
- media handling

Runtime environment:

Node 18
Next.js standalone build
Docker container

---

## MongoDB

Primary data store.

Used for:

- users
- circles
- chat messages
- chat conversations
- memberships
- notifications
- activity feeds

Chat is now **fully Mongo‑native**.

---

## MinIO

Object storage for:

- user avatars
- post images
- attachments
- other uploaded media

Accessed via the `/storage/*` proxy route.

---

## Qdrant

Vector search engine used for:

- semantic discovery
- recommendation features
- embedding‑based search

---

# 3. Chat Architecture

The platform previously used Matrix.

Chat is now implemented entirely using MongoDB collections:

chatConversations
chatMessages
chatRoomMembers

Capabilities:

- direct messages
- group chats
- read receipts
- message ordering
- membership control

Matrix runtime code has been removed.

Some legacy fields remain in the database for compatibility:

matrixRoomId
matrixNotificationsRoomId
matrixUsername
fullMatrixName

These fields are no longer used by the runtime chat system.

They can be removed in a future migration.

---

# 4. Media Pipeline

Uploads → Next.js API → MinIO storage

Images are referenced using URLs written to Mongo at upload time.

Image optimization is handled by Next.js using Sharp inside the runtime container.

---

# 5. Deployment Architecture

Production server:

DigitalOcean droplet  
Circles‑Genesis2

Containers are managed with Docker Compose.

Images are built **locally** and pushed to GitHub Container Registry (GHCR).

The production server **never builds application images**.

---

# 6. Deployment Pipeline

Local machine:

docker buildx build --platform linux/amd64 \
  --build-arg GIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t ghcr.io/social-systems-lab/circles:latest \
  -t ghcr.io/social-systems-lab/circles:$(git rev-parse --short HEAD) \
  --push .

Server (Genesis2):

docker compose pull circles
docker compose up -d circles

Typical deployment time:

20–30 seconds

---

# 7. Deployment Verification

Deployment health is verified using:

/api/version

Example response:

{
  "version": "0.8.15",
  "gitSha": "cf937b0",
  "buildTime": "2026‑03‑07T08:53:19Z"
}

This confirms:

- image version
- deployed git SHA
- build timestamp

---

# 8. Rollback System

Rollback is image‑based.

Each deployment pushes a SHA‑tagged image to GHCR.

Example:

rollbackkamooni cf937b0

Rollback steps:

1. pull previous image
2. update container
3. restart service

Rollback time:

~5 seconds

---

# 9. Development Workflow

Standard workflow:

feature branch
↓
local testing
↓
merge to main
↓
deploykamooni
↓
production deploy

Deploy script automatically:

- builds image
- tags SHA
- pushes to GHCR
- deploys on Genesis2

---

# 10. Remaining Future Improvements

Potential future cleanup:

Remove legacy Matrix schema fields
Improve group chat membership cleanup
Performance tuning for large chat lists
Expand vector search features
Infrastructure automation improvements

---

# 11. Current System Status

Chat backend: Mongo‑native
Deployment: GHCR container images
Deploy speed: ~30 seconds
Rollback: SHA‑based image rollback
Production stack: stable
