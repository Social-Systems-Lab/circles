# Production Deployment

This is the canonical normal production deployment workflow for Kamooni / Circles.

Source of truth: [`../deploy-genesis2.sh`](../deploy-genesis2.sh). The filename is legacy and retained for compatibility; do not rename it as part of routine deployment work.

The persistent topic-unread rollout includes a one-time, idempotent chat read-state V2 migration. The new image is built
while the current application remains available. If the migration is already complete, it is verified while the current
application remains live before that application is replaced. If the migration is incomplete, the deployment enters a
maintenance window to stop every `circles` application container, confirm no old writer remains, migrate and verify Mongo,
and start only the new V2 image. Invalid migration status or authentication failure aborts before production is stopped.
Never run this migration while an old application process can still write `chatReadStates`.

## Scope

Use this workflow for normal Kamooni production deployments on the Cleura host `kamooniorg`.

Do not use ad-hoc `docker compose build` or `docker compose up` commands for normal deployments. The deployment script performs the required build, container recreation, and version check.

## Production layout

- Server: Cleura host `kamooniorg`
- Repository root and deployment start directory: `/root/circles/circles`
- Application and Docker Compose directory: `/root/circles/circles/circles`
- Compose service rebuilt by the script: `circles`

The deployment script must be started from `/root/circles/circles`.

## Pre-deployment checks

From `kamooniorg`:

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
- production has not been hot-edited
- required CI checks have not been bypassed

The script also refuses to deploy if the working tree is dirty.

## Deploy

Normal releases deploy only from the approved `origin/main` branch:

```bash
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
```

The `deploykamooni` shell command is not installed and must not be used or documented as the deployment method.

For a separately authorized emergency release, the same script accepts the approved remote branch as its explicit argument.
This does not change the default production policy: normal releases still deploy from approved `origin/main`.

The script:

- confirms it is running from `/root/circles/circles`
- fetches the requested remote branch (`main` for normal releases)
- checks out the requested branch
- resets the server checkout to the requested `origin/<branch>`
- exports the deployed `GIT_SHA` and `BUILD_TIME`
- runs the Kamooni branding guard
- builds the `circles` Docker Compose service
- reads the migration completion status before stopping the current application and accepts only `0` or `1`
- for status `1`, verifies the completed migration while the current application remains running, then replaces it
- for status `0`, stops every old `circles` service instance, confirms none is running, migrates, verifies, and starts the new application
- aborts before stopping the application if URI resolution, authentication, or the status query fails
- verifies there are no legacy/incomplete rows or duplicate logical `chatReadStates` keys
- creates/verifies the required unique `chatTopicReadStates` identity index
- starts only the newly built V2 `circles` image
- confirms the service is running and checks that `https://kamooni.org/api/version` reports the expected Git SHA

Successful verification writes the `schemaMigrations/chat-read-state-v2` completion marker. Later deployments skip the
one-time offline migration window, run the safe idempotent verifier while the current V2 app remains live, and then follow
the normal replacement flow. Duplicate or malformed state, and a missing required unique index, still prevent replacement.

Migration authentication uses the resolved `MONGODB_URI` from the Compose `circles` service, including while that service
is stopped. Mongo's `MONGO_INITDB_ROOT_*` environment values are initialization settings and may no longer match the
credentials of an existing database volume. The URI is transferred to the database container over standard input rather
than process arguments. Migration and verification JavaScript is executed by `mongosh --file` so the deployment cannot
remain attached to an interactive shell after a script finishes. URI resolution, authentication, and the migration-status
query must succeed before the currently running application is stopped.

## V2 maintenance-window and failure rules

Only the `circles` Next.js service imports the chat read-state write functions. The `cron` container calls an email-reminder
HTTP endpoint and does not connect to Mongo; while `circles` is stopped it cannot cause a chat read-state write. Mongo,
nginx, MinIO, Qdrant, Watchtower, and the optional Matrix services do not contain chat read-state write paths.

When the completion count is `0`, the offline window covers migration, verification, new-container startup, and
health/version confirmation. Migration is linear in the number of remaining non-V2 `chatReadStates` rows, including one
historical-message lookup and one guarded update per row. Verification scans read states for legacy, malformed, and
duplicate logical keys. Production duration therefore depends on row count and Mongo performance; do not promise a fixed
duration. When the count is `1`, verification runs before the current application is replaced, so there is no migration
maintenance window.

Failure behavior:

- If the old container cannot be stopped, migration does not begin. Resolve the stop failure before retrying.
- If migration or verification fails, `circles` remains offline. Inspect Mongo output and correct the cause before rerunning
  the same deployment with the V2 image.
- If the new container fails to start or its version/health check fails, inspect its logs and repair/start the new V2 image.
- Do not automatically restart or roll back to the old image after migration begins. Its topic-inclusive
  `lastReadMessageId` writes are incompatible with the frozen V2 boundary and can damage unread semantics.

The verifier reports up to 20 duplicate `(userDid, conversationId)` keys from `chatReadStates`. It does not deduplicate
them or create a unique index. If any are reported, keep the application offline and investigate which row is authoritative;
do not guess or delete rows during deployment.

## Post-deployment verification

After the deploy completes, verify the public version endpoint:

```bash
curl -sS https://kamooni.org/api/version && echo
```

The returned `gitSha` must match the deployed commit.

You can confirm the deployed commit on `kamooniorg` with:

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
