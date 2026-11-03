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
  -> provisioned
```

- A pending record contains name, normalized email, requested handle, redirect, hashed capabilities, timestamps, state and (once provisioning starts) the reserved DID. It never contains a password or private-key material.
- The initial continuation secret authorizes resume, resend and email correction.
- Email verification consumes a purpose-specific hashed token atomically and issues a separate 30-minute verified continuation secret.
- The password is accepted only with the verified continuation. Permanent provisioning then calls the existing RSA/DID/password-encryption machinery with `emailAlreadyVerified` and a pending-registration idempotency marker.
- Finalization creates the session and reuses the existing idempotent welcome-message path. An interrupted finalization can be retried while the verified continuation remains valid.

Pending records expire after 48 hours until a DID is reserved. Reserving a DID removes TTL eligibility until reconciliation or successful provisioning. Successfully provisioned records become TTL-eligible after a seven-day operational review window. Email-verification and verified-continuation capabilities expire after 30 minutes. Resend has a one-minute cooldown.

## MongoDB collections and indexes

### `pendingRegistrations`

- TTL: `{ expiresAt: 1 }`. Records with a reserved, unfinished DID intentionally omit `expiresAt`.
- Unique: `{ verificationTokenHash: 1 }`, sparse.
- Unique: `{ normalizedEmail: 1 }`.
- Unique: `{ requestedHandle: 1 }`.
- Unique partial: `{ accountId: 1 }` for string account ids.

`reservedDid` is written atomically before the account credential directory is created. Once set, it cannot be replaced by a retry.

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

## Security properties

- Tokens and continuation capabilities use purpose-separated HMAC-SHA-256 hashes.
- Verification is expiring, atomic and single-use.
- Email correction atomically rotates the token, invalidating previous links.
- Public start, resend and correction responses are generic.
- Duplicate permanent emails/handles return the same public start response.
- Redirects must be relative same-site paths; absolute, protocol-relative and backslash-containing values are discarded.
- Rate limits and provisioning locks live in MongoDB and work across application instances.
- Provisioning requires the short-lived verified continuation even during recovery.
- Passwords are passed directly into existing permanent key encryption and are never persisted in pending state or audit records.
- The generated DID is reserved before the first credential-file write. If that attempt does not reach Mongo insertion, automatic retries fail closed rather than silently generating a different identity.

## Provisioning failure matrix

| Failure boundary                                   | Durable state                                                           | Retry behavior                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Before DID reservation                             | Pending record and provisioning lease only                              | Lease may expire and provisioning may retry.                                       |
| After DID reservation, before credential files     | `reservedDid`, no account                                               | Fails closed; operator review is required before abandoning the reserved identity. |
| After any credential write, before Mongo insertion | `reservedDid` and possibly a partial/full credential directory          | Fails closed; key material is preserved for reconciliation.                        |
| After Mongo insertion, before self-membership      | Exact account linked by `metadata.pendingRegistrationId`                | Retry recovers the same account/DID and ensures self-membership.                   |
| After self-membership, before pending finalization | Account and membership exist, pending state may still be `provisioning` | Retry recovers the same account/DID and repeats idempotent finalization.           |
| During welcome/session finalization                | Pending record may already be `provisioned`                             | Retry re-runs finalization for the correlated account.                             |

## Failure recovery

- Failed email delivery leaves the pending registration resumable and auditable.
- A provisioning lease prevents concurrent workers from creating multiple accounts.
- Expired leases can be reclaimed.
- If account insertion succeeded before interruption, the unique pending-registration marker recovers that exact account; recovery never guesses by email.
- Self-membership, session, profile and welcome finalization are retried for recovered accounts.
- If only a DID reservation or credential directory exists, retry refuses to create a replacement DID.

Filesystem creation, Mongo account insertion and the legacy membership helper are not one transaction. The idempotency marker handles interruption after Mongo insertion and finalization recreates a missing self-membership. A failure before Mongo insertion may leave an orphan credential directory; a failure after membership insertion but before its secondary chat/count updates may leave partial membership side effects.

### Operator reconciliation procedure

1. Keep the feature disabled for the affected registration and preserve the pending record, audit events and credential directory.
2. Locate the pending record by id and record its `reservedDid`, status, lease timestamps and verification expiry. Never use an email-only match as proof of ownership.
3. Query `circles.metadata.pendingRegistrationId` for the same pending id.
    - If exactly one account exists and its DID equals `reservedDid`, allow the authenticated retry path to repair membership/finalization.
    - If the account exists but the DID differs, stop: this is an identity-integrity incident requiring engineering review.
4. If no account exists, inspect `users/<reservedDid>` without modifying it. Record which expected files exist (`salt`, IV, public key and encrypted private key), and confirm the public key hashes to `reservedDid`.
5. Preserve complete or partial key material. Do not delete the directory, clear `reservedDid`, or issue a replacement identity automatically. Completing the Mongo account from an orphan directory requires a reviewed recovery tool because the legacy account creator does not expose a safe import operation.
6. A reserved DID with no directory is also a hard stop by default. Abandoning it and issuing a new identity requires an explicit operator decision, an audit entry and confirmation that no matching account or files exist.

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
