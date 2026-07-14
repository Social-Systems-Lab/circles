# Local Development

This guide is for developers setting up Kamooni locally.

## Repository Layout

- Repository root: `~/circles`
- Application root: `~/circles/circles`

Run app, Docker Compose, package-manager, and environment-file commands from the application root unless a command explicitly says otherwise.

## Current Local Stack

Kamooni is a Next.js and TypeScript application backed by MongoDB, MinIO, and Qdrant.

For normal local development, start only these supporting Docker services:

- `db` - MongoDB
- `minio` - object storage
- `qdrant` - vector/search service

The current local Compose file also contains `postgres`, `synapse`, `nginx`, and `cron`. Treat `postgres` and `synapse` as legacy Matrix-era services for normal app development. Do not start them unless you are explicitly working on historical Matrix compatibility or local proxy behavior.

Kamooni's current main chat and DM system is Mongo-native.

## Prerequisites

Install these first:

- Git
- Docker and Docker Compose
- Node.js matching `circles/.nvmrc`
- Bun

The app root contains `bun.lock` and does not contain an npm, pnpm, or yarn lockfile, so use Bun for dependency installation.

## Minimal First Run

Choose one path.

### New Clone

Use this only when `~/circles` does not exist or is empty. Do not clone into a non-empty `~/circles` directory.

```bash
mkdir -p ~/circles
cd ~/circles
git clone https://github.com/Social-Systems-Lab/circles.git .
```

### Existing Checkout

Use this when the repository already exists at `~/circles`.

```bash
cd ~/circles
git status --short
git worktree prune
git fetch origin
git checkout main
git pull --ff-only origin main
```

Move into the application root:

```bash
cd ~/circles/circles
```

Create local environment files from the checked-in example:

```bash
cp .env.example .env
touch .env.local
```

Why both files exist:

- `docker-compose.local.yml` lists both `.env` and `.env.local` as service `env_file` inputs.
- Docker Compose variable interpolation for ports uses `.env`.
- Next.js also loads `.env` and `.env.local`; keep `.env.local` for local overrides.

For a minimal first run, edit `.env` and set:

- `CIRCLES_NODE_ENV=development`
- `CIRCLES_URL=http://localhost:3000`
- `MONGO_ROOT_PASSWORD` to a local password
- `MINIO_ROOT_PASSWORD` to a local password
- `MONGODB_URI` to match `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_HOST`, and `MONGO_PORT`
- `QDRANT_HOST=127.0.0.1` because the app runs on the host while Qdrant is exposed from Docker

Install dependencies:

```bash
bun install
```

Start the normal supporting services:

```bash
docker compose -f docker-compose.local.yml up -d db minio qdrant
```

Do not use bare `docker compose -f docker-compose.local.yml up -d` for normal local development. That starts every service in the file, including legacy Matrix-era and local proxy services.

Start the app:

```bash
bun run dev
```

The app usually runs at:

```text
http://localhost:3000
```

If port 3000 is already in use, use the port printed by the dev server.

## Verification

Confirm the supporting containers are running:

```bash
cd ~/circles/circles
docker compose -f docker-compose.local.yml ps db minio qdrant
```

Expected host ports from `docker-compose.local.yml` and `.env.example`:

- MongoDB: `127.0.0.1:27017`
- MinIO API: `127.0.0.1:9000`
- MinIO console: `127.0.0.1:9001`
- Qdrant HTTP: `127.0.0.1:6333`
- Qdrant gRPC: `127.0.0.1:6334`

Confirm the app started successfully by checking the `bun run dev` terminal output for a local URL, usually:

```text
http://localhost:3000
```

Confirm the local site responds:

```bash
curl -I http://127.0.0.1:3000/
```

Confirm the version endpoint responds:

```bash
curl -s http://127.0.0.1:3000/api/version && echo
```

## Local Development Notes

- Chat and direct messaging are Mongo-native.
- Matrix is not required for normal local development.
- `postgres` and `synapse` are present in the local Compose file for legacy Matrix-era setup.
- `nginx` and `cron` are also present in the local Compose file, but they are not required for the normal host-run `bun run dev` loop.
- Media and uploaded assets are handled through MinIO.
- Public URL settings still matter because some generated links and uploaded asset URLs use `CIRCLES_URL`.
- Some features depend on seeded data, existing accounts, API keys, or manually created test content.

## Stopping Local Services

Run from the application root:

```bash
cd ~/circles/circles
docker compose -f docker-compose.local.yml down
```

## Resetting Local State

This removes local Docker data for the local Compose stack. Use caution.

```bash
cd ~/circles/circles
docker compose -f docker-compose.local.yml down -v
```

Then restart the normal service subset:

```bash
docker compose -f docker-compose.local.yml up -d db minio qdrant
```

## Troubleshooting

### App Does Not Start

Check:

- you are in `~/circles/circles`
- dependencies were installed with `bun install`
- required environment files exist: `.env` and `.env.local`
- required local services are running
- the selected dev-server port is free

### Mongo Connection Issues

Check:

- `db` is running in Docker Compose
- `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, and `MONGODB_URI` agree
- `MONGODB_URI` includes `authSource=admin`

### Image Or Upload Issues

Check:

- `minio` is running
- `MINIO_HOST`, `MINIO_PORT`, `MINIO_ROOT_USERNAME`, and `MINIO_ROOT_PASSWORD` are set
- `CIRCLES_URL` points at your local app URL before creating upload test data

### Search Or Semantic Feature Issues

Check:

- `qdrant` is running
- `QDRANT_HOST=127.0.0.1` when the app is running on your host via `bun run dev`

## Status Of This Document

This file is intended to be the current local setup guide for Kamooni. If another document asks you to set up Matrix, Synapse, Postgres, Docker Hub images, or a `dev` branch for normal local development, treat that other document as historical unless a maintainer says otherwise.
