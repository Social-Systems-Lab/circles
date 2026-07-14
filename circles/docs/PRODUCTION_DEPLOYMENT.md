# Production Deployment

This is the canonical normal production deployment workflow for Kamooni / Circles.

Source of truth: [`../deploy-genesis2.sh`](../deploy-genesis2.sh).

## Scope

Use this workflow for normal Kamooni production deployments on Genesis2.

Do not use ad-hoc `docker compose build` or `docker compose up` commands for normal deployments. The deployment script performs the required build, container recreation, and version check.

## Production layout

- Server: Genesis2
- Repository root and deployment start directory: `/root/circles/circles`
- Application and Docker Compose directory: `/root/circles/circles/circles`
- Compose service rebuilt by the script: `circles`

The deployment script must be started from `/root/circles/circles`.

## Pre-deployment checks

From Genesis2:

```bash
cd /root/circles/circles
pwd
git branch --show-current
git status --short
git fetch origin main
git rev-parse --short HEAD
git rev-parse --short origin/main
```

Confirm:

- `pwd` is `/root/circles/circles`
- the working tree is clean
- the commit intended for deployment is on `origin/main`

The script also refuses to deploy if the working tree is dirty.

## Deploy

Deploy only from `origin/main`:

```bash
./circles/deploy-genesis2.sh main
```

The script:

- confirms it is running from `/root/circles/circles`
- fetches `origin/main`
- checks out `main`
- resets the server checkout to `origin/main`
- exports the deployed `GIT_SHA` and `BUILD_TIME`
- runs the Kamooni branding guard
- builds the `circles` Docker Compose service
- recreates the `circles` service
- checks `https://kamooni.org/api/version`

## Post-deployment verification

After the deploy completes, verify the public version endpoint:

```bash
curl -sS https://kamooni.org/api/version && echo
```

The returned `gitSha` must match the deployed commit.

You can confirm the deployed commit on Genesis2 with:

```bash
cd /root/circles/circles
git rev-parse --short HEAD
```

Optional runtime verification from the application directory:

```bash
cd /root/circles/circles/circles
docker compose exec -T circles cat /app/VERSION
```

The `gitSha` in `/app/VERSION` should also match the deployed commit.

## Historical deployment references

Older documents may mention GHCR, Docker Hub, a `dev` branch deployment flow, Ubuntu home-directory paths, or direct `docker compose` deployment commands. Treat those as historical references unless this document is updated to say otherwise.

Examples of historical deployment references include:

- [`../../docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md)
- [`../../docs/cleura_deployment.md`](../../docs/cleura_deployment.md)
- [`../../docs/circles-deployment.md`](../../docs/circles-deployment.md)
- [`../../docs/circles-registry-deployment.md`](../../docs/circles-registry-deployment.md)
- [`DEPLOYMENT_ARCHITECTURE.md`](DEPLOYMENT_ARCHITECTURE.md)
- [`DEPLOYMENT_BUILD_AND_RESTART.md`](DEPLOYMENT_BUILD_AND_RESTART.md)
- [`AI_DEVELOPER_CONTEXT.md`](AI_DEVELOPER_CONTEXT.md)
- [`ARCHITECTURE_MONGO_NATIVE_v11.md`](ARCHITECTURE_MONGO_NATIVE_v11.md)
- [`kamooni-production-notes.md`](kamooni-production-notes.md)
