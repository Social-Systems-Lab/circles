# Architecture Overview

Canonical first-day system overview for Kamooni / Circles.

Kamooni is a Next.js application backed by MongoDB, MinIO, and Qdrant. Production is containerized with Docker Compose and served through nginx.

## Request Path

Primary production request path:

```text
Browser -> nginx -> Next.js app -> MongoDB / MinIO / Qdrant
```

The exact backend dependency depends on the feature:

- MongoDB stores application data, chat, notifications, memberships, settings, and most domain records.
- MinIO stores uploaded files and media.
- Qdrant supports vector and semantic search features when those paths are enabled.

## Core Services

### Next.js

The `circles` service is the main web application. It provides pages, API routes, server actions, authentication flows, admin tools, chat UI, uploads, and feature workflows.

In local development, the app normally runs on the host with `bun run dev`. Supporting services run through `circles/docker-compose.local.yml`.

In production, the app runs as the `circles` Docker Compose service from `circles/docker-compose.yml`.

### MongoDB

MongoDB is the authoritative application datastore. The app initializes Mongo collections in `circles/src/lib/data/db.ts`.

MongoDB stores users/circles, memberships, posts, tasks, goals, issues, events, notifications, chat, and related state.

### MinIO

MinIO is S3-compatible object storage for uploaded files and media.

Files are stored in MinIO. The application may write absolute media URLs into MongoDB at upload time using `CIRCLES_URL`. If `CIRCLES_URL` is wrong when uploads happen, broken URLs can be persisted and may require MongoDB data repair.

See [Image storage architecture](../circles/docs/IMAGE_STORAGE.md) for the detailed media path.

### Qdrant

Qdrant stores vectors for semantic/search features. `circles/src/lib/data/vdb.ts` creates the Qdrant client when vector paths run.

The app can start without Qdrant, but vector/search functions require a reachable Qdrant service unless vector features are disabled through environment configuration.

### nginx

Production nginx terminates public HTTP/HTTPS routing and proxies traffic to the app and storage paths. The production Compose file includes an `nginx` service with ports `80` and `443`.

Local development usually does not need nginx for the normal `bun run dev` loop.

### Docker Compose

Docker Compose defines the production and local service topology:

- `circles/docker-compose.yml` for production services.
- `circles/docker-compose.local.yml` for local supporting services.

Normal local development starts only `db`, `minio`, and `qdrant`. The first-day production architecture includes the `circles` app, `db` (MongoDB), `minio`, `qdrant`, `nginx`, and `cron` for scheduled jobs.

## Chat Architecture

MongoDB is the authoritative chat backend. Matrix is not the current chat backend.

Authoritative chat collections:

- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Critical invariant:

`chatConversations.updatedAt` must be updated whenever a message is sent. Sidebar ordering depends on this timestamp.

The current source updates this timestamp in the Mongo-native message paths, including topic opening messages and topic replies. New chat write paths must preserve that behavior.

See [Mongo-native chat architecture](../circles/docs/CHAT_SYSTEM_ARCHITECTURE.md) for details.

## Legacy Matrix Components

Postgres and Synapse still appear in Compose for legacy Matrix compatibility:

- In production Compose, `postgres` and `synapse` are behind the `matrix` profile.
- In local Compose, `postgres` and `synapse` are present but are not part of normal local development.

Treat Matrix, Synapse, and Postgres as legacy/profile-only infrastructure unless a task explicitly targets historical Matrix compatibility.

## Production Deployment

Normal production deployments run on Genesis2 and are managed by `circles/deploy-genesis2.sh`. The script fetches and resets to `origin/main`, builds the `circles` service, recreates it, and verifies `/api/version`.

Do not duplicate deployment commands here. Use the canonical deployment guide:

- [Production deployment](../circles/docs/PRODUCTION_DEPLOYMENT.md)

## Deeper Docs

- [Local development](LOCAL_DEVELOPMENT.md)
- [Environment variables](ENVIRONMENT.md)
- [Codex project map](../circles/docs/CODEX_PROJECT_MAP.md)
- [Mongo-native chat architecture](../circles/docs/CHAT_SYSTEM_ARCHITECTURE.md)
- [Image storage architecture](../circles/docs/IMAGE_STORAGE.md)
- [Production deployment](../circles/docs/PRODUCTION_DEPLOYMENT.md)

## Status

This file is the concise canonical system overview for new developers. Use the linked active documents for implementation details.
