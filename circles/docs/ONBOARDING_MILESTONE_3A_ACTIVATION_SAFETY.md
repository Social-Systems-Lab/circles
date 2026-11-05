# Onboarding Milestone 3A: Registration Activation Safety

Milestone 3A does not expose pending registration. It adds operator inspection, durable reconciliation retention and a coordinated server-side routing gate.

## Registration routing

The `registrationRouting` collection contains one `_id: "registration-routing"` record with three possible modes:

- `legacy`: only the existing immediate signup action is allowed.
- `paused`: both creation paths reject new work.
- `pending`: only pending-registration start and permanent provisioning are allowed.

No record is the fail-safe equivalent of `legacy`. Pending mode additionally requires `REGISTRATION_DEPLOYMENT_ID` on the application instance to exactly match `registrationRouting.deploymentId`. A missing or mismatched deployment id fails closed. `PENDING_REGISTRATION_ENABLED=true` remains independently required; routing alone cannot expose the backend.

The active legacy action checks the routing record before ALTCHA and account creation. Pending start checks routing before ALTCHA or pending-record creation. Pending permanent provisioning checks routing again before acquiring its locks. This prevents verified pending records from provisioning after rollback.

Pending finalization also uses a Mongo-backed per-account lease. Concurrent retries cannot simultaneously create self-membership or welcome-message side effects. A crashed lease expires after five minutes; subsequent finalization checks for existing membership before adding it.

Old application versions do not know about this gate. Production activation must therefore drain old instances before changing the record. Do not run old and new images together during the switch.

## Safe activation sequence

Activation remains blocked until Milestone 3 provides reviewed public actions and the staging checks below pass.

1. Deploy the activation-capable build everywhere with routing still `legacy`, `PENDING_REGISTRATION_ENABLED` unset/false, and a deployment-specific `REGISTRATION_DEPLOYMENT_ID`.
2. Verify every running instance reports the same Git SHA. Drain and remove all older instances.
3. Inspect routing with the packaged operator image. Staging supplies the exact
   Compose command in its activation runbook; do not install `tsx` on the host
   or expose an operator HTTP endpoint:

    ```bash
    docker run --rm OPERATOR_IMAGE route-status
    ```

4. Compare-and-set `legacy` to `paused`:

    ```bash
    printf '%s\n' "$REGISTRATION_ROUTING_OPERATOR_TOKEN" | docker run --rm -i -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256 OPERATOR_IMAGE route-set --expected legacy --to paused --deployment-id none --actor OPERATOR --confirm SET_REGISTRATION_ROUTE
    ```

5. Wait at least five minutes, verify signup email reservations and provisioning locks are empty/expired, and confirm both registration paths reject new work.
6. Configure the dedicated token HMAC secret and `PENDING_REGISTRATION_ENABLED=true` consistently on every new instance. Do not use a `NEXT_PUBLIC_*` variable.
7. Restart all instances, verify identical Git SHA and `REGISTRATION_DEPLOYMENT_ID`, then compare-and-set `paused` to `pending` with the exact deployment id.
8. Monitor pending starts, ALTCHA failures, rate limits, email delivery, provisioning interruptions, reconciliation-required records and duplicate-key errors.

The `route-status`, `operations-status`, and `inspect` commands use a dedicated
Mongo client and are read-only; they do not initialize application indexes.
The route-set command reads the raw `REGISTRATION_ROUTING_OPERATOR_TOKEN` only
from closed standard input, compares its hash to
`REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256`, and requires an explicit
confirmation phrase. The raw token must never be placed in container
environment or argv metadata. Store it outside source control and shell history.
Authorization is checked before the routing record is initialized. The
transition is compare-and-set, only `legacy -> paused -> pending -> paused ->
legacy` transitions are supported, and a stale expected mode is rejected.
Transitioning to `pending` additionally requires the supplied deployment ID to
exactly match `REGISTRATION_DEPLOYMENT_ID` in the operator container. No
operator token should be added to application environment configuration.

## Rollback

1. Compare-and-set `pending` to `paused`.
2. Disable `PENDING_REGISTRATION_ENABLED` consistently and restart all instances.
3. Leave existing pending records and credential material untouched.
4. Inspect all records with `reservedDid`; reconcile any interrupted provisioning.
5. After the pending path is fully drained and every instance runs a gate-aware build, compare-and-set `paused` to `legacy` with `--deployment-id none`.

Rollback prevents new pending provisioning. It does not alter existing accounts, DIDs, passwords, verification records or credential files.

## Reconciliation inspection

The tool is read-only for pending registrations and credential material. It never prints password data, raw tokens, encrypted-private-key contents or private keys. It rejects invalid pending ids and does not follow credential-directory or credential-file symlinks.

Run on the host containing the authoritative `/circles/users` volume and application MongoDB configuration:

First confirm the authoritative volume mount point with `docker volume inspect circles_circles_users`. The commands below use the current production Compose volume name; stop if the reported mount point differs.

```bash
cd /root/circles/circles/circles && npx tsx scripts/pending-registration-ops.ts inspect --users-dir /var/lib/docker/volumes/circles_circles_users/_data
```

Inspect one record:

```bash
cd /root/circles/circles/circles && npx tsx scripts/pending-registration-ops.ts inspect --users-dir /var/lib/docker/volumes/circles_circles_users/_data --pending-id PENDING_OBJECT_ID
```

Classifications:

- `recoverable_finalize`: one exactly correlated account, matching DID/public key and complete credential files. Use the authenticated provisioning retry after confirming the report.
- `manual_review_orphan_credentials`: credential material exists but no correlated account. Preserve it; a reviewed import tool or engineering decision is required.
- `manual_review_missing_credentials`: the reserved DID has no complete credential directory. Confirm all volumes and backups before any identity-abandonment decision.
- `manual_review_invalid_public_key`: public key content does not hash to the reserved DID. Treat as an identity-integrity incident.
- `manual_review_account_mismatch`: the correlated account has another DID. Stop immediately.
- `manual_review_duplicate_accounts`: more than one correlated or DID-matching account exists. Stop immediately.

Never delete a credential directory, clear `reservedDid`, alter account correlation or generate a replacement DID from this report.

## Retention and cleanup

- Before DID reservation: pending records are TTL-eligible after 48 hours.
- Reserved and unfinished: `expiresAt` is removed atomically with `reservedDid`; the record remains indefinitely and has `reconciliationRequiredAt`.
- Successfully provisioned: reconciliation markers are cleared and `expiresAt` is set seven days ahead.
- Audit events retain their existing 180-day TTL.
- Credential directories have no automated deletion policy.

Operational monitoring must alert on `reconciliationRequiredAt` older than 15 minutes. Cleanup of a reserved record requires a reviewed runbook outcome, an audit record and independent confirmation that permanent-account and filesystem state are safe. Milestone 3A intentionally provides no deletion command.

## Integration testing

The opt-in integration test requires a disposable MongoDB database and creates credential fixtures only under a temporary directory:

```bash
PENDING_REGISTRATION_TEST_MONGODB_URI='mongodb://...' PENDING_REGISTRATION_TEST_DATABASE='circles_stage1a_test_pending_local' npx tsx src/lib/auth/pending-registration.integration.test.ts
```

The database name safety prefix is mandatory. The test drops only that disposable database and removes only its generated temporary directory. Without these variables it reports a skip instead of touching the default database.

Staging must additionally fault-inject real process termination after credential writes, Mongo insertion, membership insertion and pending finalization. Confirm one DID, one account, one self-membership, stable member counts and one welcome conversation after every retry.

## Logs and monitoring

Monitor:

- `pending_registration.provisioning_interrupted` audit events.
- Records with `reconciliationRequiredAt` and no `provisionedAt`.
- Duplicate-key errors on pending email, handle, account correlation and provisioning locks.
- Registration routing changes and deployment-id mismatches.
- ALTCHA failures/replays and rate-limit saturation.
- Email delivery failure events.
- Membership/chat finalization failures and unexpected member-count changes.

Do not log raw verification tokens, continuation secrets, ALTCHA payloads, passwords or encrypted/private-key file contents.

## Remaining activation blockers

- Milestone 3 public actions and UI do not exist.
- The email template and public verification URL remain unconfirmed.
- Real process-kill testing requires disposable staging MongoDB and credential volumes.
- The legacy membership helper is not transactional across membership, chat and member-count side effects. Staging must prove interruption recovery or a separate repair mechanism must be implemented before production activation.
- Orphan credentials without a Mongo account still require a reviewed import or explicit identity-abandonment decision; they intentionally fail closed.
