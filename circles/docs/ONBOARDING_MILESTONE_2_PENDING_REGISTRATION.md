# Onboarding Milestone 2: Secure Pending Registration

Milestone 2 adds an inactive server-side pending-registration backend. The existing pilot signup action and pages remain the active flow.

## Rollout boundary

The backend has no route or server action in this milestone. Its guarded entry point, `beginPendingRegistration()`, returns `{ enabled: false }` unless the server-only environment variable below is exactly `true`:

```text
PENDING_REGISTRATION_ENABLED=true
```

Token hashing also requires a distinct server secret:

```text
PENDING_REGISTRATION_TOKEN_HMAC_KEY=<independent random secret>
```

`SIGNUP_FORM_HMAC_KEY` is a compatibility fallback for non-production development, but staging and production should configure the dedicated key. Neither setting is exposed through `NEXT_PUBLIC_*` variables.

Setting `PENDING_REGISTRATION_ENABLED=false` or removing it disables the guarded backend immediately and does not affect pending records or existing accounts. Because no public endpoint exists yet, guessed URLs cannot enter this flow.

## Lifecycle

```text
pending_email
  -> email_verified
  -> provisioning (short database lease)
  -> provisioning_claimed (durable, non-expiring owner)
  -> provisioned
```

- A pending record contains name, normalized email, requested handle, redirect, hashed capabilities, timestamps, state and (once provisioning starts) the reserved DID. It never contains a password or private-key material.
- The initial continuation secret authorizes resume, resend and email correction.
- Email verification consumes a purpose-specific hashed token atomically and issues a separate 30-minute verified continuation secret.
- The password is accepted only with the verified continuation. Permanent provisioning then calls the existing RSA/DID/password-encryption machinery with `emailAlreadyVerified` and a pending-registration idempotency marker.
- After acquiring email/handle locks, the current lease owner atomically converts the lease into a durable claim before key generation, DID reservation, credential-directory creation, or account insertion.
- The durable claim has no expiry and is not transferred by ordinary retries. A process restart preserves it. Interruptions with no exact, credential-complete permanent account remain closed for operator reconciliation; a proven account can complete secondary finalization after the member passes ordinary password login.
- Required finalization effects now run under the durable claim and an owner-fenced finalization lock. The status transition to `provisioned` is compare-and-set against that claim, and a session is issued only after exactly one record matches.
- A crash after account insertion can be repaired when the member later completes ordinary password login. Login first verifies the password, exact account correlation, DID reservation and public-key identity; the repair path itself never issues a session. If finalization completed but the response/session was lost, ordinary login proceeds without replaying the consumed continuation.

Pending records expire after 48 hours until a DID is reserved or a durable claim is acquired. Both actions remove TTL eligibility. Successfully provisioned records become TTL-eligible after a seven-day operational review window. Email-verification and verified-continuation capabilities expire after 30 minutes. Resend has a one-minute cooldown.

## MongoDB collections and indexes

### `pendingRegistrations`

- TTL: `{ expiresAt: 1 }`. Records with a reserved, unfinished DID intentionally omit `expiresAt`.
- Unique: `{ verificationTokenHash: 1 }`, sparse.
- Unique: `{ normalizedEmail: 1 }`.
- Unique: `{ requestedHandle: 1 }`.
- Unique partial: `{ accountId: 1 }` for string account ids.

The atomic lease-to-claim update sets `status: provisioning_claimed`, a purpose-hashed `provisioningClaimHash` and `provisioningClaimedAt`, and removes both the temporary lease and `expiresAt`. Only then may the worker generate the keypair. `reservedDid` and its unique registry entry are recorded under the durable claim before the account credential directory is created. Once set, neither the claim nor DID can be replaced by an ordinary retry.

### `pendingRegistrationRateLimits`

- Atomic counters keyed by purpose-scoped HMAC hashes.
- TTL: `{ expiresAt: 1 }`.

Scopes cover start IP/email, resend and correction. The same helper is available for challenge-issuance throttling when Milestone 3 adds the endpoint.

### `pendingRegistrationProvisioningLocks`

- Unique `_id` records derived separately from normalized email and handle.
- TTL: `{ expiresAt: 1 }`.
- Acquired across instances before permanent account creation and released afterward.

### `pendingRegistrationAuditEvents`

- `{ pendingRegistrationId: 1, occurredAt: -1 }`.
- TTL: `{ expiresAt: 1 }`, currently retaining events for 180 days.
- Events never contain passwords, raw tokens, ALTCHA payloads or continuation secrets.

### Existing `circles`

- Unique partial index on `metadata.pendingRegistrationId`.
- The marker provides trustworthy recovery after a crash between permanent account insertion and pending-state finalization.
- Permanent-account insertion is preceded by a durable-claim ownership check. The claim cannot expire or be replaced, so lease expiry cannot authorize a competing insert.

## Security properties

- Tokens and continuation capabilities use purpose-separated HMAC-SHA-256 hashes.
- Verification is expiring, atomic and single-use.
- Email correction atomically rotates the token, invalidating previous links.
- Public start, resend and correction responses are generic.
- Duplicate permanent emails/handles return the same public start response.
- Redirects must be relative same-site paths; absolute, protocol-relative and backslash-containing values are discarded.
- Rate limits and provisioning locks live in MongoDB and work across application instances.
- A short-lived verified continuation authorizes the initial attempt. The lease-to-claim transition is atomic; after it, only the non-expiring claim owner may perform provisioning mutations.
- Account and credential writes that cannot share a MongoDB transaction are serialized under the non-expiring claim. If the process crashes, the claim is retained and no ordinary request can take over based on elapsed time.
- Passwords are passed directly into existing permanent key encryption and are never persisted in pending state or audit records.
- The durable claim precedes key generation and DID reservation. The DID registry is unique by DID and pending-registration ID; a registry write interrupted before the pending record update is retained and visible to reconciliation.
- Credential directories are created without overwrite semantics. Partial files are retained; an existing directory causes the attempt to fail closed.

## Provisioning failure matrix

| Failure boundary                                      | Durable state                                            | Retry/recovery behavior                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Before durable claim                                  | Pending record and temporary provisioning lease          | After lease expiry, fresh email verification can authorize another attempt.                                            |
| After claim, before DID generation/reservation        | Non-expiring `provisioning_claimed`; no DID              | Ordinary retry is blocked; preserve the claim for operator review.                                                     |
| After DID registry insert, before pending DID update  | Claim and registry-only DID ownership                    | Reconciliation reports it; never delete or reuse the registry entry automatically.                                     |
| After DID reservation, before credential files        | Claim, reserved DID, no account                          | Fail closed; preserve the identity for operator review.                                                                |
| During credential writes, before Mongo account insert | Claim, reserved DID and partial credential directory     | Fail closed; preserve all files for reconciliation.                                                                    |
| After Mongo account insertion                         | Claim and exactly correlated permanent account           | Member must authenticate normally; login repairs idempotent effects without issuing a session from the repair routine. |
| During membership/profile/welcome finalization        | Claim and some effects may exist                         | Authenticated login repairs effects; identity mismatch or incomplete credentials require operator review.              |
| After `provisioned`, before session issuance/response | Durable completed account; session may not reach browser | Ordinary login; completion credential remains consumed.                                                                |

## Failure recovery

- Failed email delivery leaves the pending registration resumable and auditable.
- A short lease prevents concurrent pre-claim work. The durable claim prevents competing provisioning attempts after claim acquisition and survives process restarts.
- Expired pre-claim leases can be reclaimed only while no durable claim exists and no DID is reserved. After claim acquisition, no ordinary retry or timestamp-based process transfers ownership.
- Account correlation requires exact pending id, reserved DID, unique account DID, public-key/DID match, canonical handle, normalized email and recorded identity evidence. Reconciliation labels absent or inconsistent evidence for manual review.
- Reconciliation also reports self-membership, members-chat membership, profile member count, profile initialization (including the durable finalization version marker), welcome conversation and welcome-message state independently. That account marker preserves the completed state after the pending record's seven-day TTL cleanup.
- Self-membership and members-chat membership use deterministic ObjectIds for insertion so concurrent repair upserts converge without adding collection indexes; an existing membership row does not imply the chat row or count was completed. Welcome conversations and messages use deterministic identities plus the existing idempotent submission key. Profile initialization is an idempotent update filtered by the exact account identity and pending marker.
- A successful completion response implies the pending record is durably `provisioned`. A zero-match transition cannot issue a session. Login-time repair returns only a readiness result; the login action issues a session only after ordinary password authentication and successful repair.
- A crash after claim acquisition can strand even a claim with no DID. Reconciliation now lists this state; it must not be reset merely because it is old.

Filesystem creation, Mongo account insertion and secondary effects are not one transaction. The non-expiring claim prevents another application worker from taking over while the original worker could resume; this trades automatic availability for identity integrity. A crash may leave partial credentials or a correlated account under a retained claim. No operator transfer command exists. Any future claim recovery must be audited and prove the prior process cohort is stopped/fenced, verify all identity evidence, and must not grant a session without ordinary authentication. Exact, complete credential/account states can repair membership, profile and welcome effects on password-authenticated login; orphan credentials, incomplete credentials and inconsistent correlations remain operator-only.

### Operator reconciliation procedure

1. Keep the feature disabled for the affected registration and preserve the pending record, audit events and credential directory.
2. Locate the pending record by id and record its `reservedDid` (if any), claim state, status, lease timestamps and verification expiry. Never use an email-only match as proof of ownership.
3. If the record has `provisioning_claimed` but no DID, do not release it based on age. Establish that all workers that could hold the attempt are stopped before any separately reviewed recovery decision.
4. Query `circles.metadata.pendingRegistrationId` for the same pending id.
    - If exactly one account exists and all identity evidence matches, the member can use ordinary password login to repair membership/finalization. The repair helper does not issue a session.
    - If the account exists but the DID differs, stop: this is an identity-integrity incident requiring engineering review.
5. If no account exists and a DID is recorded, inspect `users/<reservedDid>` without modifying it. Record which expected files exist (`salt`, IV, public key and encrypted private key), and confirm the public key hashes to `reservedDid`.
6. Preserve complete or partial key material. Do not delete the directory, clear a reservation, release a claim, or issue a replacement identity automatically. Completing the Mongo account from an orphan directory requires a reviewed recovery tool because the legacy account creator does not expose a safe import operation.
7. A reserved DID with no directory is also a hard stop by default. Abandoning it and issuing a new identity requires an explicit operator decision, an audit entry and confirmation that no matching account or files exist.

No automatic cleanup acts on user credential directories. Reserved, unfinished records are excluded from Mongo TTL cleanup and remain until explicit reconciliation. Successful records retain their correlation metadata for seven days.

### Legacy/new-flow uniqueness boundary

The pending flow uses Mongo provisioning locks and unique pending email/handle indexes, but the active legacy signup does not acquire those locks. The permanent `circles` collection also does not currently enforce global unique normalized-email and handle indexes because legacy data has not been audited for conflicts. Consequently, simultaneous legacy and pending provisioning could pass their separate preflight checks and create duplicates.

Milestone 3 must make one coordinated server-side routing switch: once the pending path accepts production submissions, the legacy creation action must stop accepting new registrations. The switch must be reversible for the whole registration entry point, not independently selectable per application instance. Mixed-version instances must be drained or configured consistently. Existing login, verification and recovery routes remain available throughout.

## Staging verification

1. Configure a staging-only `PENDING_REGISTRATION_TOKEN_HMAC_KEY` and set `PENDING_REGISTRATION_ENABLED=true` in the staging server environment.
2. Run the focused pending-registration, signup-security, authentication, email-verification and type-check suites.
3. Exercise the service through an internal, non-public staging harness added with Milestone 3; this milestone intentionally exposes no route.
4. Confirm no `circles`, membership, user credential directory or welcome chat exists before email verification and password submission.
5. Test resend, correction, expired links, concurrent provisioning and process interruption.
6. Disable by removing `PENDING_REGISTRATION_ENABLED` and restart the staging application. Existing accounts and the current signup flow remain unchanged.

## Activation blockers for Milestone 3

- Add the UI/server-action boundary and challenge-issuance endpoint with the provided distributed rate-limit helper.
- Build and review an operator-only orphan inspection/import tool before production activation; Milestone 2 intentionally fails closed instead of deleting or replacing key material.
- Pending-registration verification emails use `/signup/verify`, which consumes the `token` query parameter.
- Ensure rollout atomically switches the active signup action rather than running legacy and pending provisioning concurrently for the same address or across mixed-version instances.
- Add monitoring for expired pending records with `reservedDid` before TTL cleanup removes their correlation record.
