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
read -r -p 'Onboarding operator alert email: ' ONBOARDING_ALERT_EMAIL
printf 'ONBOARDING_ALERT_EMAIL=%s\n' "$ONBOARDING_ALERT_EMAIL" >> activation.env
unset REGISTRATION_DEPLOYMENT_ID
unset ONBOARDING_ALERT_EMAIL
chmod 600 activation.env
```

The deployment ID must use:

```text
production-onboarding-YYYYMMDD-<approved-sha-prefix>-<sequence>
```

The HMAC key must be independent of ALTCHA, JWT, cron, Mongo, MinIO, and routing-operator
credentials. Never print the file, copy it into the application `.env`, commit it, or pass it as a
command argument. `ONBOARDING_ALERT_EMAIL` must be a dedicated operator-controlled mailbox. It is
not a secret, but alerts contain only sanitized reason codes and never contain identities,
credentials, tokens, or user contact data.

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
configuration, non-empty `CRON_SECRET`, external file permissions, operator image, Compose overlays,
routing `legacy`, and read-only activation readiness. It does not create
indexes, change routing, restart services, or write registration data. Secret values are never
printed.

Activation readiness permits only untouched `pending_email` records: zero provisioning attempts,
explicitly null identity/claim/lease/verification-completion fields, a valid expiry, no DID reservation
or correlated account (including canonical email or requested-handle conflicts with legacy accounts),
and no reconciliation marker. Missing fields, other unfinished states, retained
provisioning/finalization locks (including expired or malformed locks), or more than 100 unfinished
records fail closed. Completed accounts and their durable DID reservations are preserved.

`pendingRegistrations` counts all retained unfinished records, including expired ones. MongoDB's
`expiresAt` TTL index performs asynchronous cleanup; expiry does not prove deletion and the read-only
check never deletes or repairs records. Claims and DID reservation remove expiry to preserve identity
evidence. `reconciliationRequired` counts non-null markers regardless of whether `provisionedAt` is
null, absent, or populated; ordinary email-only pending records have a null marker and are not
reconciliation failures.

Inspect current state without mutation:

```bash
./circles/scripts/production-onboarding-control.sh status
./circles/scripts/production-onboarding-control.sh inspect
```

## Pre-activation Postmark canary

After the reviewed candidate is deployed in legacy mode with both pending flags false and activation
readiness established, test the production Postmark credentials, `email-verification` template and
production-equivalent template model without activating registration:

```bash
cd /root/circles/circles
./circles/scripts/production-onboarding-control.sh postmark-canary
```

The command requires the checkout and deployed image to match `origin/main`, routing to remain
`legacy`, the default-off runtime configuration, read-only activation readiness and exact
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

## Watchdog alert canary

In legacy mode, verify the actual watchdog alert template and sanitized payload without changing
registration routing:

```bash
cd /root/circles/circles
./circles/scripts/production-onboarding-control.sh watchdog-alert-canary
```

The command requires the clean checkout and immutable application image to match `origin/main`,
routing to remain `legacy`, both pending-registration flags to be disabled, and activation readiness
with no retained locks or reconciliation evidence. It reads `ONBOARDING_ALERT_EMAIL` from the protected
activation file and requires the confirmation phrase `SEND_WATCHDOG_ALERT_CANARY`.

It sends exactly one message through the production Postmark transport using the same
`notification-reminder` template model builder as the live watchdog. The canary reports only
provider acceptance, template alias and MessageID presence. It does not print the recipient, token,
sender, provider response body or message ID. Runtime credentials and the recipient are supplied to
the one-off container over stdin rather than environment variables or command arguments. The
container has no database credentials, production volumes, Docker socket or routing operator
credential.

This canary makes no MongoDB, account, DID, credential-file, pending-registration or MinIO changes.
Confirm inbox delivery, sender authentication and Postmark Activity independently.

There is intentionally no production mode that injects a synthetic critical monitoring state or
forces the live cron watchdog to pause routing. That would require a persistent diagnostic bypass
or arbitrary metric override. Automatic `pending -> paused` behavior therefore remains covered by
the disposable policy, CAS and fault-injection tests until a separately reviewed single-use
canary design is approved.

## Supervised pilot approval and responsibilities

The production Postmark verification-email canary has passed. MongoDB restoration completed with
16,253 restored documents, and the identity/credential-volume restoration covered 1,976 files.

For this controlled pilot, the same approved operator is explicitly assigned as:

- activation operator
- rollback operator
- initial monitoring owner

This single-person assignment authorizes only a short, actively supervised pilot. It does not
authorize unattended, overnight or general public rollout. Public rollout still requires a named
fallback/rollback operator and monitoring arrangement that works when the primary operator is
unavailable.

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
then inspect pending operations again (untouched email-only records may remain):

```bash
./circles/scripts/production-onboarding-control.sh status
```

While routing remains `paused`, recreate the application with the validated activation overlay:

```bash
./circles/scripts/production-onboarding-control.sh activate-services
```

The command rechecks activation readiness before recreating services.

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

## Deploy while routing is paused

Use this procedure only to deploy an exact, reviewed `origin/main` commit while registration routing
must remain `paused`. It preserves the activated onboarding runtime and unfinished `pending_email`
records, but it never changes routing, activates registrations, resumes the journey, or rolls back to
legacy.

Before starting:

- After a separately authorized pause, wait at least five minutes before deploying. Confirm routing
  is exactly `paused`, reconciliation-required is zero, and both active
  provisioning-lock and finalization-lock counts are zero. An unfinished `pending_email` record is
  allowed.
- Confirm the protected activation environment and routing-operator verifier still exist with their
  required ownership and modes. The command validates the HMAC key, alert recipient, and deployment
  ID without printing their values, and requires the HMAC and deployment ID to match the currently
  running activation container.
- Confirm the production application has a non-empty `CRON_SECRET`; the command checks presence
  without printing the value and performs an authenticated watchdog call after recreating cron.
- Confirm the running application uses the activated overlay, one immutable production image, its
  production role marker, and an internal `/api/version` response matching `/app/VERSION`.
- Confirm the reviewed release is on `origin/main` and its Build Check and Production Isolation
  checks passed.
- Ensure a verified MongoDB backup and the applicable `circles_users`/MinIO recovery material exist.
  Do not start this deployment to repair a missing backup.

Before each paused deployment or offline recovery, put the reviewed deployment tool itself on the
production checkout. Set `APPROVED_FULL_SHA` to the full commit authorized for this release. Use a
clean `main` checkout and an exact fast-forward while holding the shared maintenance lock. This
updates source files without building or restarting containers.

```bash
(
  cd /root/circles/circles &&
  exec 9>/run/lock/circles-production-docker.lock &&
  flock -w 120 9 &&
  test "$(git branch --show-current)" = main &&
  test -z "$(git status --porcelain --untracked-files=all)" &&
  git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main &&
  test "$(git rev-parse refs/remotes/origin/main)" = "$APPROVED_FULL_SHA" &&
  git merge --ff-only "$APPROVED_FULL_SHA"
)
```

Run the deployment from the production repository root:

```bash
cd /root/circles/circles
./circles/scripts/production-onboarding-control.sh deploy-paused-services "$APPROVED_FULL_SHA"
```

The command requires the exact confirmation phrase `DEPLOY_PAUSED_ONBOARDING_SERVICES`. It acquires
the shared production maintenance lock and requires the checkout to start at the approved SHA. It
fetches `origin/main` again and verifies the SHA still matches. It also verifies the existing
activation image is a known ancestor, checks the local `kamooniorg` Docker daemon and default system
socket, and uses the explicit production Compose project, files, and environment. An explicit Docker
context or host override blocks execution.

The tool compares the existing application, candidate, and registration operator MongoDB settings,
including the logical database name. All must use the same local `db` service URI for `circles`. It
uses that verified URI for preflight, routing, lock checks, and migration. The existing activation
HMAC, deployment ID, JWT secret, and cron secret must match the candidate before cutover. Mismatches
are reported without secret values.

The tool verifies the MongoDB pause timestamp is at least five minutes old and checks active locks
and reconciliation before cutover. It waits up to 75 seconds for NGINX to shut down gracefully.
If requests are still draining, the tool aborts before stopping the application and leaves those
requests time to finish. It rechecks routing, the pause timestamp, and idle operations before stopping
or replacing `circles`. If a verification response was lost before its cookie arrived, the existing
email recovery flow can issue a new link after separately approved reactivation.

It retains the verified running application image locally under a rollback tag before building
`circles` and `cron`, so the previous image stays available if a build moves `latest`. The new application image's Git SHA,
immutable image ID, and production role marker are validated before any running application is
replaced. A failed build or validation does not prevent a retry: the running old container is
validated through its own immutable image ID rather than the mutable `circles-circles:latest` tag. The
existing Messaging Stage 1A preflight, chat read-state migration/verification, and MongoDB URI
resolution remain mandatory.

Before replacing `circles`, the command stops NGINX and confirms it is no longer running. The paused
deployment applies `docker-compose.production-maintenance.yml`, which removes the application's
host-port publication while retaining `circles_webnet` connectivity for NGINX and cron. It starts
exactly one new `circles` container with the validated activation overlay, while routing remains
`paused`, and verifies before reopening public access:

- the running container uses the newly built immutable image;
- the maintenance container publishes no host port;
- the activation flags, reserved production network, Postmark/ALTCHA/URL policy, and existing
  deployment ID and HMAC are correct;
- `/app/VERSION`, the container's internal `/api/version`, and the approved Git SHA agree;
- registration routing is still `paused`; and
- cron contains all existing schedules and an authenticated watchdog invocation succeeds.

The internal readiness check retries slow startup within a bounded window. Only then does the tool
recreate NGINX, verify the public `/api/version` with per-request deadlines, and recheck paused
routing. If the public check fails or the process receives HUP, INT, or TERM before public
verification finishes, the tool closes NGINX. After a host failure or an uncatchable process kill,
independently confirm NGINX and application state before continuing. The tool does not run `route-set`, automatically enter `legacy` or `pending`, release locks, delete pending
records, change DID reservations, or modify credential files.

Before the maintenance window, the current application remains running. Once migration or
replacement begins, a failure keeps NGINX closed. A new application that completed all runtime,
image, SHA, and deployment-ID checks may remain private for diagnosis and retry; an unverified
application is stopped. After replacement, routing drift stops both NGINX and the application. If
drift is detected before replacement, NGINX is closed while the current application is left running
so any in-flight identity work can finish. Any failure after attempting to restore NGINX stops it
again and confirms it is not running. Do not reopen NGINX manually.

After a failure:

1. Run `status` and inspect only sanitized aggregates and fixed failure codes. A verified running
   image at an ancestor SHA is accepted by read-only `status`. Activation and routing changes retain
   their exact-SHA checks. If the operator image build failed before the target image existed, status
   requires the approved operator image to be available first.
2. Confirm routing is `paused`. If it drifted, stop and investigate before using an authenticated
   transition with its own approval.
3. If the old application is still running, or the verified candidate remains private after a
   public verification failure, correct the failed prerequisite and rerun `deploy-paused-services`.
4. If migration, its verifier, or candidate startup left the application stopped, use the offline
   recovery procedure below.

### Offline recovery while registration stays paused

Keep NGINX and the application stopped, retain the stopped application container for identity and
configuration checks, and preserve the verified database backup. After migration has started, an
older application can write incompatible chat read state. The retained image provides a reference
for diagnosis and recovery approval. Consult the
[V2 maintenance-window rules](PRODUCTION_DEPLOYMENT.md#v2-maintenance-window-and-failure-rules)
before attempting any image rollback.

Investigate the migration or verification failure and correct the prerequisite under its own
approval. Keep the same database, credentials, HMAC, and deployment ID. Prepare the exact approved
checkout as above, then run from the production repository root:

```bash
./circles/scripts/production-onboarding-control.sh recover-paused-services "$APPROVED_FULL_SHA"
```

Confirm with `RECOVER_PAUSED_ONBOARDING_SERVICES`. Recovery requires one stopped production
activation container, NGINX stopped, verified paused routing and drain, and the approved SHA still
at `origin/main`. It rebuilds the approved candidate, runs the same read-only preflight, resumes
idempotent migration if the completion marker is absent, and runs the V2 verifier. It restores the
activation overlay only after migration verification succeeds. A continued error leaves NGINX
closed. A missing stopped container, missing image metadata, or unresolved database inconsistency
requires an independently reviewed recovery plan.

Independently confirm the migration marker and verifier result, exact running and public Git SHA,
authenticated cron, and paused routing. Confirm the retained pending-registration and identity
aggregates against the pre-deployment record. Production email delivery, the canary, and explicit
registration reactivation approval are separate gates.

`recover-default-services` and `deactivate-services` restore the default runtime. Their use after a
paused deployment requires a verified compatible chat schema and their documented prerequisites.
`activate-services` permits unfinished `pending_email` records only when activation readiness
classifies every unfinished record as untouched and there is no retained lock or reconciliation
evidence. An `email_verified` record has already received a continuation and can block initial
activation. Use the paused recovery command to restore the activation overlay for existing journeys
without clearing either type of record. Avoid ad-hoc container recreation or data restoration over
production; any live data repair needs separate approval.

## Controlled canary

After the paused-to-pending transition:

1. Confirm `/signup` renders pending registration and `/signup/pilot` redirects to `/signup`.
2. Confirm existing login, password reset, DID-backed accounts, and profile access remain unchanged.
3. Wait for one five-minute watchdog invocation and confirm `status` reports
   `watchdogHeartbeat.status=current` for the active deployment.
4. Complete one synthetic signup to an operator-controlled Postmark inbox.
5. Verify the token-free continuation URL, account provisioning, DID uniqueness, onboarding arrival,
   logout, and login again.
6. Do not delete or rewrite a DID. Preserve any interrupted record for reconciliation.
7. Watch `status`, `inspect`, audit events, Postmark failures, duplicate-key errors, and
   reconciliation-required records throughout the canary.

## Monitoring

The production cron service evaluates onboarding health every five minutes. In `pending` mode the
watchdog can automatically change routing only from `pending` to `paused` after a confirmed critical
condition. It cannot activate, resume, enter legacy mode, restart services, clear locks, retry
provisioning, or modify identity data.

The watchdog reports one of:

- `healthy`: no alert and no routing change.
- `warning`: sanitized operator alert only.
- `critical`: alert and, when the runtime deployment ID still matches the pending routing record,
  the protected `pending -> paused` CAS transition. The CAS filter includes the expected pending mode
  and deployment ID so a concurrently replaced deployment cannot be paused accidentally.
- `monitoring_unavailable`: never treated as healthy. One bounded/unavailable sample alerts the
  operator; a second consecutive sample pauses registration. A monitoring query exception returns
  HTTP 503, records a durable failed heartbeat, sends a sanitized fallback alert through the same
  bounded queue, and pauses on the second consecutive exception when deployment scope can be proven.

Alerts are deduplicated through durable `onboardingWatchdogState` data. Alert delivery is attempted
after containment and cannot prevent the automatic pause. If Postmark is also failing, the
registration path pauses and the cron command reports a nonzero result. Up to six alert attempts
are retried every five minutes for at most 30 minutes while routing is paused. Retrying an alert
never resumes registration. An old deployment's counters, lock history and alert state are discarded
when the pending deployment ID changes or when unversioned state is encountered.

The watchdog evaluates:

- deployment ID and runtime/routing consistency
- manual-review identity classifications
- provisioning/pickup lock persistence across separate five-minute samples
- provisioning age over ten minutes
- email-failure bursts and provisioning-interruption bursts
- more than 25 unfinished registrations
- bounded monitoring scans that cannot safely produce an answer

The manual-review scanner correlates active provisioning/finalization locks to the exact pending or
account record. Incomplete credentials seen during a legitimate operation under ten minutes old are
reported separately as `transientActiveProvisioning` rather than confirmed manual review. Unrelated
locks do not suppress another record's manual-review incident.

Legacy mode does not access or create watchdog state. Paused mode never changes routing; it may
retry an already-pending deployment-scoped alert or clear an exhausted alert record. Staging and
development images, identified by the immutable deployment-role marker, also no-op.

`status` includes a sanitized watchdog heartbeat:

- `current`: the current deployment completed a monitoring sample within ten minutes.
- `stale`: the last successful sample is older than ten minutes.
- `missing`: no versioned heartbeat exists for the current deployment.
- `monitoring_failed`: the latest attempt did not complete successfully.
- `not_applicable`: routing is legacy or paused.

The heartbeat timestamp is stored in MongoDB and survives application restarts. After deployment,
the normal deployment script performs one authenticated legacy-mode watchdog request, and the
activation preflight requires a non-empty `CRON_SECRET`.

There is no separate external scheduler service. The operator must independently run `status` at
least daily and investigate `stale`, `missing` or `monitoring_failed`. This manual status check can
detect a stopped watchdog or cron container, but it is not an automatic external liveness monitor.
The cron container also logs failed requests to `/var/log/cron.log`. If the application or MongoDB
is unavailable, watchdog containment may also be unavailable, although pending registration cannot
mutate identity data without the database.

Manual monitoring remains available. Run:

```bash
./circles/scripts/production-onboarding-control.sh status
```

`status` is read-only and reports:

- pending counts plus oldest created and last-updated ages by lifecycle status
- active provisioning/finalization lock counts and remaining lease time
- reconciliation, aggregated manual-review and recoverable-finalization counts
- successful-email, email-failure and provisioning-interruption audit counts for 15 and 60 minutes
- live runtime flags, deployment ID and credential-presence booleans
- routing/runtime consistency
- sanitized watchdog heartbeat status, age and whether an alert retry is pending

Some metrics are deliberately unavailable rather than unbounded:

- Lock documents do not store acquisition time, so lock age is unavailable; use repeated samples.
- Status aggregation is skipped above 1,000 unfinished registrations or 5,000 retained records.
- Manual-review aggregation is skipped above 100 unfinished registrations, 500 retained pending
  records or 500 DID reservations.
- Audit aggregation is skipped above 20,000 retained audit documents.

When a metric is unavailable, use `inspect` and application logs without removing data.

Run `status` every five minutes during the controlled canary and the first two hours, every 15
minutes through the first 24 hours, and at least once daily after the watchdog is proven stable.
Automated pause limits exposure but does not establish 24/7 operational readiness.

Inspect an individual problem record without printing or sharing unrelated identities:

```bash
./circles/scripts/production-onboarding-control.sh inspect PENDING_REGISTRATION_ID
```

For aggregate classifications without identity identifiers:

```bash
./circles/scripts/production-onboarding-control.sh inspect |
python3 -c 'import collections,json,sys; d=json.load(sys.stdin); r=d.get("results",[]); print(json.dumps({"count":d.get("count",0),"byClassification":dict(collections.Counter(x.get("classification","unknown") for x in r))},sort_keys=True))'
```

Verify one completed pending-registration-v1 account while default services are running and routing is
`legacy` or `paused` with no deployment ID (including the paused rollback state):

```bash
./circles/scripts/production-onboarding-control.sh verify-provisioned-account
```

While routing remains `pending` and activation services are running, select activation verification explicitly:

```bash
./circles/scripts/production-onboarding-control.sh verify-provisioned-account activation
```

Both modes are read-only and leave routing and services unchanged. Activation verification validates the
protected activation configuration and requires routing and the live application to match its approved
deployment ID. Runtime, image identity and routing are checked before the handle prompt and again before
account verification; mismatches stop the command. The operator receives no pending-registration HMAC.

The command prompts for the current account handle on `/dev/tty` without echoing it and passes the
handle to the read-only operator container over standard input. The handle, account ID, DID,
pending-registration ID, email address, public keys, hashes and credential paths are never printed
or included in command arguments. Output contains only `PASS` or `FAIL`, boolean checks and fixed
failure codes.

The verifier requires the exact deployed SHA and production role, validates the default production
Compose configuration and immutable operator image, and uses the existing read-only users-volume
mount. It requires exactly one account for the current handle, DID and persistent pending-ID
reference; one matching DID reservation; a credential directory containing the four expected
regular, non-symlink files; and both MongoDB and `publicKey.pem` SHA-256 values to equal the account
DID. It reads no salt, IV or encrypted-private-key content and performs no password reset,
authentication or credential decryption.

Completed pending records are retained for seven days. If the record has expired, the command
reports `pendingRecordRetained: false` and verifies the durable account metadata and DID reservation
instead. A retained record must still be `provisioned`, match the account ID and DID, have no active
claim or reconciliation marker, and have no active provisioning or finalization lock.

Review sanitized Postmark delivery failures on the production application:

```bash
cd /root/circles/circles/circles
docker compose --project-name circles -f docker-compose.yml logs --since 15m --no-color circles 2>&1 |
grep -F 'Email delivery failed'
```

Also inspect Postmark Activity for delivered, bounced or rejected messages.

### Monitoring thresholds

Stop new registrations and investigate immediately when any of these occurs:

- routing/runtime consistency is false
- watchdog heartbeat is `missing`, `stale`, or `monitoring_failed` while routing is `pending`
- the deployed role or application SHA differs, or an image-identity check fails
- `manualReviewMetrics.manualReview` is greater than zero
- duplicate correlated accounts, duplicate DIDs or identity-field mismatches are reported
- Postmark reports an authentication/configuration failure
- three consecutive email-delivery failures or more than 10% failures in 15 minutes
- an active provisioning or finalization lock remains across two five-minute checks
- `oldestUpdatedAgeSecondsByStatus.provisioning` or `.provisioning_claimed` exceeds ten minutes

Treat these as warnings:

- `reconciliationRequired` is present while at least one provisioning or finalization lock exists
  and no `provisioning`/`provisioning_claimed` updated age exceeds ten minutes
- `pending_email` is older than 25 minutes; verification links expire at 30 minutes
- `email_verified` is older than 25 minutes; the verified continuation expires at 30 minutes
- one isolated Postmark failure or delayed delivery
- more than ten unfinished registrations, or rapid growth without successful-email activity or
  corresponding count turnover

For the pilot, stop new signups if unfinished registrations exceed 25 or continue growing while no
successful-email activity or pending-count turnover is occurring. Re-baseline these count thresholds
after the supervised canary.

The following are expected and are not integrity failures by themselves:

- unfinished `pending_email` records waiting for users
- `recoverablePendingRegistrations` in recovery status
- `unsafePendingRegistrations`, which includes ordinary unfinished email-only records
- expired records remaining until MongoDB's TTL monitor runs, normally within about one minute

Never delete pending records or credentials, clear locks, release DID reservations or infer lock age
from expiry time.

### Containment

For an immediate stop while keeping data and support services intact, transition routing back to
`paused`:

```bash
./circles/scripts/production-onboarding-control.sh route-set pending paused none ROLLBACK_OPERATOR
```

Then:

1. Run `status`.
2. Run the aggregated classification review.
3. Inspect only affected pending-registration IDs with `inspect`.
4. Preserve MongoDB, MinIO, credential files, audit events and all identity records.
5. Do not run `deactivate-services` while active locks or reconciliation-required records remain.

The operator may resume the supervised pilot only after the cause is understood and another
read-only status check is consistent. An automatic pause is never resumed automatically. The
operator must inspect the alert, run `status` and the aggregate reconciliation review, resolve the
cause, and use the normal authenticated `paused -> pending` transition only after another clean
sample. No automatic retry, legacy rollback or service recovery is authorized.

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

The rehearsal creates a fake application, disposable authenticated MongoDB, synthetic TLS NGINX,
fake credentials, and synthetic `pending_email`, DID reservation and account records. Its Git
`origin` is rewritten to a local bare repository, and Git transport is restricted to `file`, so the
real `deploy-genesis2.sh main --paused-onboarding APPROVED_FULL_SHA` path cannot contact the GitHub remote. It maps
`kamooni.org` only to the local synthetic TLS endpoint and never includes a real Postmark client or
production application code.

The rehearsal additionally exercises:

- successful paused application replacement using the real deployment script and maintenance Compose
  override;
- absence of a published application host port;
- NGINX remaining unavailable while the new application is started and internally verified;
- stale deployment tooling, a Docker context override, insufficient drain, and mismatched database
  configuration rejected before service interruption;
- image-validation failure before application replacement and a successful retry with slow startup;
- application startup failure followed by `recover-default-services`;
- partial chat migration, migration-verifier failure, and offline recovery with the activation overlay;
- NGINX startup failure and interruption during the bounded public check, followed by a successful
  paused-deployment retry; and
- preservation of the synthetic `pending_email` record, DID reservation, account, activation HMAC
  and deployment ID throughout every success and failure path.

Run the manually gated GitHub rehearsal after pushing the candidate branch:

```bash
gh workflow run production-onboarding-rehearsal.yml \
  --repo Social-Systems-Lab/circles \
  --ref codex/paused-onboarding-deploy
```

The complete rehearsal passed at commit
[`4540cabe082a41959ae20567dd07a6a93ef1e447`](https://github.com/akrobatim/kamooni-onboarding-rehearsal/actions/runs/43482980000).
It fault-injected application failure after NGINX stopped, verified the application remained safely
stopped, verified synthetic data and identities were preserved, and exercised
`recover-default-services` before returning routing to legacy.

That earlier run predates the paused-deployment extension and does not prove the new rehearsal.
Record a new successful run for the final candidate commit before production execution.

This result proves isolated orchestration behavior only. It does not replace the production Postmark
canary, production backup restore test, monitoring approval or activation-operator approval.

## Known activation blockers

- The watchdog and its disposable fault-injection test must be reviewed and deployed in legacy mode
  before pending registration is enabled.
- Alert delivery must be confirmed independently; an automatic pause protects containment but does
  not prove that the operator will notice an outage.
- The alert-only watchdog canary can confirm production delivery in legacy mode, but there is no
  production-safe full cron-to-CAS canary. Automatic pause must not be represented as live-tested
  until that separate design is reviewed.
- No external scheduler-liveness service is added. Sustained cron death is detected through the
  sanitized status heartbeat and the required operator review, not by an automatic pager.
- A fallback/rollback operator or another explicit out-of-hours response arrangement is still
  recommended before sustained 24/7 public use.
- The safe signup error-message improvements and completed-account DID/credential correlation check
  remain separate release-review items.
