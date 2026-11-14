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

Production SSH access is `root@kamooniorg`. This is the production server, not the dedicated staging VM. Staging uses the `ubuntu` account at `188.95.227.109`, a separate SSH identity, separate checkouts, separate data, and a separate deployment script. See [Staging deployment](STAGING_DEPLOYMENT.md) before performing any staging operation.

Do not use ad-hoc `docker compose build` or `docker compose up` commands for normal deployments. The deployment script performs the required build, container recreation, and version check.

Production deployment requires an approved release from `origin/main` after successful local checks and staging integration/browser validation. Production Compose hard-selects Postmark and builds an image with an immutable production role marker; runtime email validation rejects Mailpit for that image. Mailpit services and staging transport configuration must not be present in production Compose. The required `Production Isolation / production-isolation` check and the deployment script enforce these contracts.

## Registration-mode boundary

An ordinary production deployment remains in legacy registration mode. The default production Compose
keeps `PENDING_REGISTRATION_ENABLED=false`, `PENDING_REGISTRATION_JOURNEY_READY=false`, the
pending-registration HMAC empty, and no pending deployment ID. Deploying this document's normal workflow
does not activate the new signup journey.

Index preparation, paused routing, activation, canary verification and rollback are separate,
explicitly approved operations. Use [Production pending-registration activation](PRODUCTION_ONBOARDING_ACTIVATION.md)
for those steps.

## Production layout

- Server and SSH target: `root@kamooniorg`
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
git rev-parse HEAD
git rev-parse origin/main
```

Confirm:

- `pwd` is `/root/circles/circles`
- the working tree is clean
- the commit intended for deployment is on `origin/main`
- the release has been approved after all required checks passed
- production email transport is hard-selected as Postmark, and the image role defaults to production
- Mailpit service/configuration is absent from production Compose
- the required production-isolation and build checks succeeded for the exact release commit
- production has not been hot-edited
- required CI checks have not been bypassed

The script also refuses to deploy if the working tree is dirty.

Confirm the public and image build identities before changing production:

```bash
cd /root/circles/circles/circles
expected_sha="$(git rev-parse HEAD)"
curl -fsSL https://kamooni.org/api/version
docker compose exec -T circles sed -n 's/^gitSha=//p' /app/VERSION
printf 'checkout=%s\n' "$expected_sha"
```

The `/api/version` response and `/app/VERSION` must both report `expected_sha`.

Validate Compose without printing its resolved secret environment:

```bash
docker compose config --quiet
docker compose config --services
```

The service list must not contain Mailpit. Check the runtime-visible, non-secret configuration:

```bash
docker compose exec -T circles sh -lc '
  test "$CIRCLES_URL" = "https://kamooni.org" &&
  test "$EMAIL_TRANSPORT" = "postmark" &&
  test -n "$ALTCHA_HMAC_KEY" &&
  test -n "$POSTMARK_API_TOKEN" &&
  test -n "$POSTMARK_SENDER_EMAIL" &&
  test "$PENDING_REGISTRATION_ENABLED" = "false" &&
  test "$PENDING_REGISTRATION_JOURNEY_READY" = "false" &&
  test -z "${PENDING_REGISTRATION_TOKEN_HMAC_KEY:-}" &&
  test -z "${REGISTRATION_DEPLOYMENT_ID:-}" &&
  printf "CIRCLES_URL=%s\nALTCHA=configured\nPOSTMARK=configured\n" "$CIRCLES_URL" &&
  printf "PENDING_REGISTRATION_ENABLED=false\n"
'
```

This verifies presence without displaying the ALTCHA or Postmark credentials.

Check MongoDB and routing through the application's resolved `MONGODB_URI`. The URI is passed over
standard input and is never printed:

```bash
(
  set -o pipefail
  docker compose exec -T circles printenv MONGODB_URI |
    docker compose exec -T db sh -lc '
      IFS= read -r MONGODB_URI || exit 1
      [ -n "$MONGODB_URI" ] || exit 1
      mongosh "$MONGODB_URI" --quiet --eval "
        const app = db.getSiblingDB(\"circles\");
        const routing = app.registrationRouting.findOne({_id: \"registration-routing\"});
        print(\"mongo=\" + db.adminCommand({ping: 1}).ok);
        print(\"routing=\" + (routing?.mode || \"legacy\"));
      "
    '
)
```

Before an ordinary deployment, routing must report `legacy`. `MONGO_INITDB_ROOT_USERNAME` and
`MONGO_INITDB_ROOT_PASSWORD` only initialize a new Mongo volume and may be stale for an existing
volume. The application service's `MONGODB_URI` is authoritative for connectivity, migration,
backup and verification.

## MongoDB backup and restore validation

Take a backup before any deployment that can change database data, and before starting pending-registration
activation. Use the database container's existing `mongodump` tool and the application's current
credentials:

```bash
cd /root/circles/circles/circles
backup_dir="/root/circles/backups/mongo-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir"

(
  set -o pipefail
  docker compose exec -T circles printenv MONGODB_URI |
    docker compose exec -T db sh -lc '
      IFS= read -r MONGODB_URI || exit 1
      [ -n "$MONGODB_URI" ] || exit 1
      export MONGODB_URI
      mongosh "$MONGODB_URI" --quiet --eval "
        const app = db.getSiblingDB(\"circles\");
        print(EJSON.stringify({
          accounts: app.circles.countDocuments({}),
          events: app.events.countDocuments({}),
          pendingRegistrations: app.pendingRegistrations.countDocuments({}),
          didReservations: app.pendingRegistrationDidReservations.countDocuments({})
        }));
      "
    '
) > "$backup_dir/source-counts.json"
cat "$backup_dir/source-counts.json"

(
  set -o pipefail
  docker compose exec -T circles printenv MONGODB_URI |
    docker compose exec -T db sh -lc '
      IFS= read -r MONGODB_URI || exit 1
      [ -n "$MONGODB_URI" ] || exit 1
      export MONGODB_URI
      mongodump --uri="$MONGODB_URI" --archive --gzip
    '
) > "$backup_dir/mongo.archive.gz"
```

Verify the complete compressed stream, decompress it once, and record and check its checksum:

```bash
gzip -t "$backup_dir/mongo.archive.gz"
gzip -dc "$backup_dir/mongo.archive.gz" >/dev/null
(
  cd "$backup_dir"
  sha256sum mongo.archive.gz > SHA256SUMS
  sha256sum -c SHA256SUMS
)
chmod 600 "$backup_dir/mongo.archive.gz" "$backup_dir/SHA256SUMS" \
  "$backup_dir/source-counts.json"
printf 'backup=%s\n' "$backup_dir"
```

These checks verify the gzip stream and archive bytes; they do not prove that MongoDB can restore
the archive. Test that separately in a disposable Mongo container with no network and a read-only
mount of the backup:

```bash
restore_container="kamooni-mongo-restore-check-$$"
docker run --detach --rm --name "$restore_container" --network none \
  --mount "type=bind,src=$backup_dir,dst=/backup,readonly" \
  mongo:7.0 --bind_ip_all >/dev/null
trap 'docker rm -f "$restore_container" >/dev/null 2>&1 || true' EXIT

ready=false
for _ in $(seq 1 30); do
  if docker exec "$restore_container" mongosh --quiet \
    --eval 'quit(db.adminCommand({ping: 1}).ok ? 0 : 1)' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true

docker exec -T "$restore_container" \
  mongorestore --archive=/backup/mongo.archive.gz --gzip
docker exec -T "$restore_container" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
  const app = db.getSiblingDB("circles");
  printjson({
    accounts: app.circles.countDocuments({}),
    events: app.events.countDocuments({}),
    pendingRegistrations: app.pendingRegistrations.countDocuments({}),
    didReservations: app.pendingRegistrationDidReservations.countDocuments({})
  });
'

docker rm -f "$restore_container" >/dev/null
trap - EXIT
```

Compare these counts and collection presence with `source-counts.json`, captured immediately before
the backup. The isolated restore is the recoverability test; a clean checksum alone is insufficient.

Do not use `mongorestore --dryRun` as proof of full recoverability. It can stop consuming an archive
before the producer has finished; in a pipeline that can cause the upstream producer to receive
`SIGPIPE`. That signal is not evidence that the archive is corrupt, and a dry run does not replace
an isolated restore with expected collection and count checks.

## Deploy

Normal releases deploy only from the approved `origin/main` branch:

```bash
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
```

The `deploykamooni` shell command is not installed and must not be used or documented as the deployment method.

The deployment script accepts only the explicit argument `main`. Emergency fixes must first be reviewed and promoted to
`origin/main`; arbitrary feature, staging, tag, or detached-commit deployments are refused.

The script:

- confirms it is running from `/root/circles/circles`
- acquires `/run/lock/circles-production-docker.lock` with a 120-second bound, shared with onboarding operations
- confirms the configured `origin` is the `Social-Systems-Lab/circles` GitHub repository
- reads MongoDB registration routing before Git synchronization and refuses to continue unless it is `legacy`
- fetches only `origin/main`
- checks out `main` and fast-forwards it to `origin/main` with `git merge --ff-only`; it does not reset or clean the checkout
- verifies the local branch and full commit identity against `origin/main`
- runs the production staging-isolation guard before building or accessing application services or data
- exports the deployed `GIT_SHA` and `BUILD_TIME`
- runs the Kamooni branding guard
- builds the exact-SHA read-only registration operator and refuses normal deployment unless registration routing is `legacy`
- builds the `circles` Docker Compose service
- reads the migration completion status before stopping the current application and accepts only `0` or `1`
- for status `1`, verifies the completed migration while the current application remains running, then replaces it
- for status `0`, stops every old `circles` service instance, confirms none is running, migrates, verifies, and starts the new application
- aborts before stopping the application if URI resolution, authentication, or the status query fails
- verifies there are no legacy/incomplete rows or duplicate logical `chatReadStates` keys
- creates/verifies the required unique `chatTopicReadStates` identity index
- starts only the newly built V2 `circles` image
- confirms the service is running and checks that `https://kamooni.org/api/version` reports the expected full Git SHA

Successful verification writes the `schemaMigrations/chat-read-state-v2` completion marker. Later deployments skip the
one-time offline migration window, run the safe idempotent verifier while the current V2 app remains live, and then follow
the normal replacement flow. Duplicate or malformed state, and a missing required unique index, still prevent replacement.

Migration authentication uses the authoritative `MONGODB_URI` from the Compose `circles` service, including while that
service is stopped. The URI is transferred to the database container over standard input rather than process arguments.
Migration and verification JavaScript is executed by `mongosh --file` so the deployment cannot remain attached to an
interactive shell after a script finishes. URI resolution, authentication, and the migration-status query must succeed
before the currently running application is stopped.

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

This check is independent and mandatory even though the deployment script also verifies the endpoint.

You can confirm the deployed commit on `kamooniorg` with:

```bash
cd /root/circles/circles
git rev-parse HEAD
```

Optional runtime verification from the application directory:

```bash
cd /root/circles/circles/circles
docker compose exec -T circles cat /app/VERSION
```

The `gitSha` in `/app/VERSION` should also match the deployed commit.

Pending-registration activation, deactivation, index preparation, and routing changes use the
separate [production onboarding runbook](PRODUCTION_ONBOARDING_ACTIVATION.md). Do not bypass the
normal deployment routing guard with ad-hoc Compose commands.

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
