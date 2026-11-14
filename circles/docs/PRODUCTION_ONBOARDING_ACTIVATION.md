# Production Pending-Registration Activation

This runbook prepares and controls the production pending-registration rollout. The tooling is
disabled by default and does not authorize an activation by itself. Do not run any mutating command
without separate production approval, a named activation operator, a named rollback operator, and a
verified backup.

## Fixed production layout

- Server: `root@kamooniorg`
- Git checkout: `/root/circles/circles`
- Compose directory: `/root/circles/circles/circles`
- Compose project: `circles`
- Application URL: `https://kamooni.org`
- Shared maintenance lock: `/run/lock/circles-production-docker.lock`
- External operator secrets: `/root/circles/onboarding-secrets`

The activation environment and routing verifier must remain outside the Git checkout and Docker
build context.

Confirm that `flock`, `python3`, Docker Compose, `curl`, and OpenSSL are installed before beginning.
The operator wrapper intentionally refuses to run outside this exact production layout.

## Secret preparation

Create the external secret directory once:

```bash
install -d -m 700 -o root -g root /root/circles/onboarding-secrets
```

Create the activation environment without printing its values:

```bash
cd /root/circles/onboarding-secrets
umask 077
read -r -p 'Approved production deployment ID: ' REGISTRATION_DEPLOYMENT_ID
printf 'PENDING_REGISTRATION_TOKEN_HMAC_KEY=' > activation.env
openssl rand -hex 32 >> activation.env
printf '\nREGISTRATION_DEPLOYMENT_ID=%s\n' "$REGISTRATION_DEPLOYMENT_ID" >> activation.env
unset REGISTRATION_DEPLOYMENT_ID
chmod 600 activation.env
```

The deployment ID must use:

```text
production-onboarding-YYYYMMDD-<approved-sha-prefix>-<sequence>
```

The HMAC key must be independent of ALTCHA, JWT, cron, Mongo, MinIO, and routing-operator
credentials. Never print the file, copy it into the application `.env`, commit it, or pass it as a
command argument.

The raw routing operator token remains only in the approved password manager. Install only its
SHA-256 verifier:

```bash
cd /root/circles/onboarding-secrets
umask 077
read -r -s -p 'Routing operator token from the approved password manager: ' ROUTING_OPERATOR_TOKEN
printf '\n'
printf '%s' "$ROUTING_OPERATOR_TOKEN" | sha256sum | awk '{print $1}' > routing-operator.sha256
unset ROUTING_OPERATOR_TOKEN
chmod 600 routing-operator.sha256
```

Both external files must be regular root-owned files with mode `600`. The control script validates
these properties and never prints either file's contents.

To rotate the routing operator token, create the replacement in the password manager and write its
new verifier through a temporary mode-600 file, then atomically rename it:

```bash
cd /root/circles/onboarding-secrets
umask 077
read -r -s -p 'Replacement routing operator token: ' ROUTING_OPERATOR_TOKEN
printf '\n'
printf '%s' "$ROUTING_OPERATOR_TOKEN" | sha256sum | awk '{print $1}' > .routing-operator.sha256.new
unset ROUTING_OPERATOR_TOKEN
chmod 600 .routing-operator.sha256.new
mv .routing-operator.sha256.new routing-operator.sha256
```

The application and MongoDB do not need restarting for operator-token rotation. Never rotate the
pending-registration HMAC while live pending records exist without a separate reconciliation review.
The activation transition also compares the routing token and pending-registration HMAC in memory and
rejects identical values. Neither value is printed or placed in Docker arguments or environment
metadata.

## Before activation

1. Obtain approval for the exact `origin/main` commit and production activation window.
2. Confirm the production checkout is clean and exactly matches `origin/main`.
3. Confirm `/api/version` and `/app/VERSION` report that exact full Git SHA.
4. Confirm exactly one `circles` container is running and record its immutable image ID.
5. Complete and independently restore-test the MongoDB backup using the canonical
   [production backup procedure](PRODUCTION_DEPLOYMENT.md#mongodb-backup-and-restore-validation).
   Record the backup path and verified collection counts. Back up the `circles_users` volume and
   MinIO where the approved recovery policy requires it.
6. Confirm Postmark, ALTCHA, `CIRCLES_URL=https://kamooni.org`, and existing login/password recovery
   are operational.
7. Deploy the reviewed safety-tooling release through the normal production deployment procedure.
   Routing must still be `legacy`, both pending flags must be false, and no HMAC may be present.

Back up the credential volume separately without exposing its contents:

```bash
cd /root/circles/circles/circles
backup_parent="/root/circles/backups"
install -d -m 700 "$backup_parent"
backup_dir="$(mktemp -d "$backup_parent/onboarding-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
chmod 700 "$backup_dir"
users_volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/circles/users"}}{{.Name}}{{end}}{{end}}' \
  "$(docker compose --project-name circles -f docker-compose.yml ps -q circles)")"
test -n "$users_volume"
docker run --rm --read-only --pull never \
  --mount "type=volume,src=$users_volume,dst=/source,readonly" \
  --mount "type=bind,src=$backup_dir,dst=/backup" \
  alpine:3.19 tar -C /source -czf /backup/circles-users.tar.gz .
tar -tzf "$backup_dir/circles-users.tar.gz" >/dev/null
(
  cd "$backup_dir"
  sha256sum circles-users.tar.gz > circles-users.SHA256SUMS
  sha256sum -c circles-users.SHA256SUMS
)
chmod 600 "$backup_dir/circles-users.tar.gz" "$backup_dir/circles-users.SHA256SUMS"
printf 'users_backup=%s\n' "$backup_dir"
```

Do not continue unless the Mongo archive passed checksum, gzip and isolated restoration validation.
Never restore over production as part of activation.

The production deployment script now builds the read-only operator image and refuses a normal
deployment unless routing is `legacy`.

If the reviewed tooling commit was deployed by the previous deployment script, build its read-only
operator image once with the new wrapper:

```bash
./circles/scripts/production-onboarding-control.sh build-operator
```

### Operator image file permissions

The November 14 production activation attempt exposed a build-context permission dependency. The
operator image runs as non-root `node` UID 1000. A production checkout with a restrictive umask
provided root-owned mode-`600` TypeScript sources, Docker preserved those modes during `COPY`, and
the container could not read `/app/scripts/pending-registration-ops.ts`, failing safely with
`EACCES` before the application was rebuilt or restarted. The earlier rehearsal copied fixture
sources before applying its restrictive secret umask, so those sources remained mode `0644`.

`Dockerfile.registration-ops` now normalizes only non-secret copied operator sources and package
metadata to runtime-readable permissions inside the image. The image remains non-root and host
permissions are unchanged. `scripts/test-pending-registration-ops-image.sh` rebuilds from explicitly
mode-`600` fixture sources and verifies every copied source as the image's actual runtime user.

Run the read-only preflight:

```bash
cd /root/circles/circles
./circles/scripts/production-onboarding-control.sh preflight
```

Preflight validates the exact SHA, one production application, default-off environment, Postmark
configuration, external file permissions, operator image, Compose overlays, routing `legacy`, and
zero unfinished or reconciliation-required operations. It does not create indexes, change routing,
restart services, or write registration data.

Inspect current state without mutation:

```bash
./circles/scripts/production-onboarding-control.sh status
./circles/scripts/production-onboarding-control.sh inspect
```

## Pre-activation Postmark canary

After the reviewed candidate is deployed in legacy mode with both pending flags false and zero
pending operations, test the production Postmark credentials, `email-verification` template and
production-equivalent template model without activating registration:

```bash
cd /root/circles/circles
./circles/scripts/production-onboarding-control.sh postmark-canary
```

The command requires the checkout and deployed image to match `origin/main`, routing to remain
`legacy`, the default-off runtime configuration, an idle pending-registration state and exact
confirmation phrase `SEND_POSTMARK_VERIFICATION_CANARY`. It prompts for an approved recipient without
echoing the address. It does not read or require the pending-registration HMAC or deployment ID.

Use a dedicated operator-controlled mailbox or plus-address on an owned domain. Do not use a public
temporary-email service. The command sends exactly one email and does not retry.

The one-off request runs from the exact deployed application image with only the production Postmark
transport settings, a bridge network connection, a read-only filesystem, dropped capabilities and no
database credentials, production volumes or Docker socket. It generates an inert verification token
in memory, calls the actual Postmark `email-verification` template once and does not invoke signup,
MongoDB writes, pending-registration records or DID reservation.

The command reports only whether Postmark accepted the request and whether it returned a MessageID.
It never prints the recipient, API token, generated token, action URL or provider message.

Confirm the canary through all of these independent checks:

1. The message arrives at the controlled mailbox with the expected sender and verification-template
   content.
2. The rendered action link uses `https://kamooni.org/signup/verify?token=…`.
3. SPF, DKIM and DMARC pass in the received message headers.
4. Postmark Activity shows the message as delivered rather than bounced or rejected.
5. Opening the link while routing remains `legacy` returns the safe unavailable/invalid state and
   creates no registration, account or DID.
6. The rendered email is usable on desktop and mobile without exposing the raw token in logs or
   evidence screenshots.

Provider acceptance is not proof of inbox delivery. A failed canary must be investigated before any
new send; do not add automatic retries.

This pre-activation canary proves production provider, sender, template and rendering behavior only.
It does not replace the full Postmark signup canary after a separately approved transition to
pending routing.

## Index preparation

Index preparation is idempotent and requires the routing operator token plus an explicit
confirmation. It runs while routing is still `legacy`. It creates only the pending-registration,
lock, and account-correlation indexes, backfills DID reservations from existing pending records, and
preserves all pending records, accounts, and DIDs:

```bash
./circles/scripts/production-onboarding-control.sh prepare-indexes
```

The command prompts for the routing operator token and requires the exact confirmation phrase
`PREPARE_PENDING_REGISTRATION_INDEXES`.

The command fails before creating the account-correlation index if duplicate pending-registration
correlations exist.

## Pause and activate the application

Transition `legacy` to `paused`:

```bash
./circles/scripts/production-onboarding-control.sh route-set legacy paused none PRODUCTION_RELEASE_OPERATOR
```

Confirm both `/signup` and `/signup/pilot` display the unavailable state. Wait at least five minutes,
then verify zero pending operations again:

```bash
./circles/scripts/production-onboarding-control.sh status
```

While routing remains `paused`, recreate the application with the validated activation overlay:

```bash
./circles/scripts/production-onboarding-control.sh activate-services
```

This stops NGINX before recreating `circles`, verifies one production application with the exact SHA,
production image role, Postmark, `https://kamooni.org`, both pending flags, the HMAC presence without
displaying it, the approved deployment ID, and the reserved network. It then refreshes NGINX and
verifies the external version endpoint. Registration remains unavailable because routing is paused.

Transition `paused` to `pending`:

```bash
./circles/scripts/production-onboarding-control.sh route-set paused pending activation PRODUCTION_RELEASE_OPERATOR
```

Before changing routing, the wrapper revalidates the live activation environment and exact SHA. The
routing change is compare-and-set.

## Controlled canary

After the paused-to-pending transition:

1. Confirm `/signup` renders pending registration and `/signup/pilot` redirects to `/signup`.
2. Confirm existing login, password reset, DID-backed accounts, and profile access remain unchanged.
3. Complete one synthetic signup to an operator-controlled Postmark inbox.
4. Verify the token-free continuation URL, account provisioning, DID uniqueness, onboarding arrival,
   logout, and login again.
5. Do not delete or rewrite a DID. Preserve any interrupted record for reconciliation.
6. Watch `status`, `inspect`, audit events, Postmark failures, duplicate-key errors, and
   reconciliation-required records throughout the canary.

## Monitoring

Run:

```bash
./circles/scripts/production-onboarding-control.sh status
./circles/scripts/production-onboarding-control.sh inspect
```

Alert on:

- `reconciliationRequiredAt` without `provisionedAt`
- `provisioning_interrupted` audit events
- stale provisioning or finalization locks
- Postmark delivery failures
- duplicate email, handle, DID, account-correlation, or lock errors
- deployment-ID mismatch
- ALTCHA failures, replays, or rate-limit saturation
- unexpected account, DID, membership, or chat side effects

Never print verification tokens, continuation secrets, passwords, encrypted keys, connection URIs,
HMAC keys, or the routing operator token.

## Rollback

Rollback changes routing and runtime configuration only. It does not restore or delete data.

1. Compare-and-set `pending` to `paused`:

```bash
./circles/scripts/production-onboarding-control.sh route-set pending paused none PRODUCTION_ROLLBACK_OPERATOR
```

2. Confirm registration is unavailable.
3. Wait at least five minutes and inspect unfinished registrations, locks, and reconciliation state.
   `deactivate-services` rechecks immediately before the application mutation and refuses to continue
   while provisioning/finalization locks or reconciliation work remain. Email-only unfinished records
   may remain; they do not block deactivation.
4. Recreate the application with normal production Compose:

```bash
./circles/scripts/production-onboarding-control.sh deactivate-services
```

5. Confirm both pending flags are false, the HMAC is absent, the exact SHA is unchanged, existing
   login works, and registration remains unavailable.
6. After the pending path is drained, compare-and-set `paused` to `legacy`:

```bash
./circles/scripts/production-onboarding-control.sh route-set paused legacy none PRODUCTION_ROLLBACK_OPERATOR
```

7. Confirm `/signup` and `/signup/pilot` render legacy signup.
8. Preserve all pending registrations, accounts, DIDs, credential files, audit events, and backups.

If routing or application state is uncertain, stop NGINX and the application; leave Mongo, MinIO,
support services, and volumes intact. Do not clear claims, release DID reservations, guess routing
state, or edit MongoDB records directly.

### Recovering after a failed activation

If `activate-services` fails after stopping NGINX and leaves the application stopped or absent,
retry activation after correcting the failure. If normal deactivation cannot be used because no
application container is running, use the explicit recovery command while routing remains `paused`:

```bash
./circles/scripts/production-onboarding-control.sh recover-default-services
```

The command requires:

- Exact routing mode `paused`.
- Zero active provisioning and finalization locks.
- Zero records requiring reconciliation.
- A clean production checkout.
- The exact-SHA operator image.
- A stopped/absent application container whose image, if present, matches the verified
  `circles-circles:latest` image.
- `/app/VERSION` in that immutable application image to match the deployed checkout SHA.
- The immutable image's role marker to be `production`.
- Safe default Compose with both pending flags false and no HMAC.
- The explicit confirmation phrase `RECOVER_DEFAULT_SERVICES`.

Recovery starts and verifies the ordinary application before recreating NGINX. Registration routing
is rechecked as `paused` before and after each public-service transition. The command does not fetch
Git, rebuild an image, change routing, or modify pending registrations, accounts, DIDs, credentials,
MongoDB, or MinIO.

Rollback and read-only diagnostics remain available if `origin/main` has advanced, provided the
checkout is clean, the running application and exact-SHA operator image are verified, and the
operation is one of `status`, `inspect`, `pending -> paused`, `paused -> legacy`, or
`deactivate-services`, or `recover-default-services`. Build and activation operations still require
the checkout to exactly match `origin/main`.

Both deployment and operator commands wait at most 120 seconds for the shared maintenance lock. A
timeout fails with an operator-facing error instead of waiting indefinitely.

## Disposable orchestration rehearsal

The manually triggered `Production Onboarding Rehearsal` GitHub workflow exercises the unmodified
production wrapper against synthetic infrastructure on a GitHub-hosted runner. It uses the exact
production paths intentionally, but only after proving:

- The OS is disposable Linux.
- The runner is GitHub-hosted or an explicitly marked dedicated VM.
- The selected Docker daemon ID matches the runner-provided identity.
- No containers, production project, production-named volumes, `circles_webnet`, production images,
  `/root/circles`, maintenance lock, or `kamooni.org` host override already exist.

The rehearsal creates a fake application, disposable MongoDB, synthetic TLS NGINX, fake credentials,
and synthetic DID/account records. It maps `kamooni.org` only to the local synthetic TLS endpoint and
never includes a real Postmark client or production application code.

The complete rehearsal passed at commit
[`4540cabe082a41959ae20567dd07a6a93ef1e447`](https://github.com/akrobatim/kamooni-onboarding-rehearsal/actions/runs/43482980000).
It fault-injected application failure after NGINX stopped, verified the application remained safely
stopped, verified synthetic data and identities were preserved, and exercised
`recover-default-services` before returning routing to legacy.

This result proves isolated orchestration behavior only. It does not replace the production Postmark
canary, production backup restore test, monitoring approval or activation-operator approval.

## Known activation blockers

- The production Postmark pre-activation delivery/template canary has not yet been executed.
- The full pending-registration Postmark end-to-end canary remains required after approved activation.
- The production activation and rollback operators have not yet been named and approved.
- Production backup restoration has not yet been independently demonstrated for this operation.
- Monitoring ownership and alert thresholds must be agreed before public rollout.
