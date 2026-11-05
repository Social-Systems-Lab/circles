# Controlled onboarding staging test plan

Prepared 2026-11-05. This is a preparation and read-only assessment. No staging configuration, service, routing record, database record, account, secret, or environment file was changed.

## Decision

**NO-GO until the two implementation PRs are reviewed, merged in order, deployed under separate authorization, and the staging-only secrets are installed.** The deployed application and live baseline are suitable for continued preparation. This plan now includes the implementation that resolves the original two blockers, but this development task does not change the running host:

1. The staging Compose override forcibly supplies both `PENDING_REGISTRATION_ENABLED=false` and `PENDING_REGISTRATION_JOURNEY_READY=false`. It does not distribute `PENDING_REGISTRATION_TOKEN_HMAC_KEY` or `REGISTRATION_DEPLOYMENT_ID`. Editing `.env.staging` alone therefore cannot activate the journey or supply the two new settings.
2. The supported operator CLI is not runnable on staging. Neither checkout has `node_modules/.bin/tsx`, and the standalone application image contains neither `scripts/pending-registration-ops.ts` nor an equivalent compiled command. Consequently, the documented read-only reconciliation and compare-and-set routing commands do not currently have a supported execution path.

The application PR packages the existing operator logic in a private, non-listening container. The dependent infrastructure PR adds an explicit activation overlay, private operator service, validators, and a lock-aware control script. Activation may be reconsidered only after those changes are deployed and this preflight is repeated. Public or production activation remains out of scope.

## Read-only preflight evidence

Observed on `kamooni-staging` at 2026-11-05 04:43–04:55 UTC:

| Check | Result |
|---|---|
| Application worktree and `/api/version` | `f36199379501cb83e957873cfe72bbb7bf3d7776`; version `0.8.15`; build time `2026-11-04T18:25:29Z` |
| Infrastructure checkout | `59af721b3c4790f32ada675497e4143f6ff39aad`, branch `infra/kamooni-staging` |
| Running application image | tag `kamooni-staging-circles:f3619937`; immutable ID and digest `sha256:adf570c08c885fd7e5adc82949cb58bd8248e38034541491daeb2d0d094e8099`; ledger entry matches |
| Services | Exactly six expected containers are running: `circles`, `db`, `minio`, `mailpit`, `mailpit_ui_proxy`, `nginx`; application restart count zero; Mailpit reports healthy |
| MongoDB | Authenticated application-client ping returned `1` |
| MinIO | Internal `/minio/health/live` returned HTTP 200 |
| Mailpit SMTP | Application-network connection to `mailpit:1025` returned SMTP `220` |
| Mailpit UI | `127.0.0.1:8025` returned HTTP 200; host listener is loopback only; public `/api/v1/info` and `/mailpit` resolve to application 404s |
| Effective email configuration | `mailpit:1025`, `CIRCLES_URL=https://staging.kamooni.org`, blank Postmark token and sender |
| Pending flags | Both effective values are `false` |
| Routing | No `registrationRouting` record; application safe default is `legacy` with no deployment ID |
| Pending state | 0 pending registrations, 0 records with reserved DIDs, 0 reconciliation-required records, 0 DID reservations, 0 provisioning locks, 0 finalization locks, 0 rate-limit rows |
| Host bindings | NGINX only on public 80/443; Mailpit UI proxy only on `127.0.0.1:8025`; SMTP 1025 has no host binding |
| Docker networks | Mailpit network is internal; UI bridge has IP masquerading disabled; only the UI proxy joins that bridge |
| Persistent volumes | Expected `circles`, `circles_users`, `db`, and `storage` staging volumes are present |
| Backup | `/home/ubuntu/staging-mongodb-20261104-044804.archive.gz`, 26,537 bytes, gzip stream valid, SHA-256 `a24f6ee34f70cf4afd7d5059b6c88c9a66e642d1e43d840a50a9994fe0646a1a` |
| Capacity | Root filesystem 94 GB total, 24 GB available, 74% used; 42.25 GB unused build cache is reclaimable if separately needed |

The backup passed transport-level integrity (`gzip -t`), not a restore rehearsal. No `mongorestore` binary is installed on the host and no restore was attempted. A restore proof must use an isolated disposable database and requires separate authorization.

The direct Mailpit API request from the application received HTTP 403 because Mailpit enforces the reviewed Host policy; SMTP succeeded internally and the hardened localhost proxy returned 200, which is the intended topology.

## Implementation/documentation review

The deployed readiness audit was written against application `1ee05f2996fa1765f6938bf7b8a1fca487fddada`; staging runs the later networking fix `f36199379501cb83e957873cfe72bbb7bf3d7776`. The reviewed lifecycle remains present: 256-bit random capabilities; purpose-scoped HMAC storage; 30-minute verification and verified-continuation lifetimes; 48-hour pre-reservation TTL; seven-day provisioned correlation retention; one-minute resend cooldown; three resends/hour; three corrections/day; single-use ALTCHA; unique normalized email/handle; five-minute distributed provisioning/finalization locks; durable claim and DID reservation; finalization before session issuance; and fail-closed reconciliation after DID reservation.

The registration route is a Mongo compare-and-set state machine: `legacy`, `paused`, or `pending`. Absence of its singleton record is equivalent to `legacy`. `pending` additionally requires the record's deployment ID to exactly match every application's `REGISTRATION_DEPLOYMENT_ID`. Legacy signup, pending start, and pending provisioning each check routing independently. Both feature flags must also be true to present the pending journey.

The mobile journey supports another-device verification and removes the token from the URL via a 303 redirect into a Secure, HttpOnly, SameSite=Strict continuation cookie. Phase-1 participation requires verified email, a non-empty introduction, and structured guidelines acceptance. Photo, location, and Proof of Humanity are optional; location/photo remain relevant to map eligibility. A real mobile keyboard, Mapbox behavior, assistive technology, and external Proof-of-Humanity services require explicit browser/service testing.

Discrepancies requiring correction before activation:

- `docs/STAGING_DEPLOYMENT.md` still contains historical statements that Mailpit had not yet been deployed; it is now deployed and verified.
- The activation document shows production checkout paths, not the staging worktree/infra split.
- The operator commands assume an installed `tsx` toolchain. That assumption is false on staging.
- The staging template and Compose contract do not define the HMAC key or deployment ID and deliberately force both flags false.
- The current application container has no Docker healthcheck. Availability is proven by internal and external probes, but the service list cannot report application health as `healthy`.
- The backup ledger proves image identity; backup semantic restore integrity has not been rehearsed.

## Secret and deployment identity requirements

`PENDING_REGISTRATION_TOKEN_HMAC_KEY` is a server-only, staging-only secret. The implementation has no fallback: absence fails closed. Generate at least 32 random bytes, encode them for environment storage, keep the value distinct from JWT, ALTCHA, routing-operator, signup-form, and production keys, never prefix it `NEXT_PUBLIC_`, and never print it in a command, log, ticket, screenshot, or manifest. At the separately authorized installation step, generate directly on the staging host with restrictive `umask`, place it only in the approved root-readable/staging secrets source, and inject it into every application instance. A suitable generation operation is `openssl rand -base64 32`, but its stdout must be redirected directly into the approved secret store by the reviewed installation mechanism rather than displayed. The present `.env.staging` workflow does not yet provide that reviewed mechanism.

`REGISTRATION_DEPLOYMENT_ID` is a non-secret release coordination identifier. It must be non-empty, immutable for the test deployment, identical on every serving application instance, and identical to the ID used in the `paused -> pending` route transition. Recommended format:

```text
staging-onboarding-20261105-f3619937-01
```

It should be committed or supplied by the reviewed deployment mechanism, not independently typed into multiple containers. A mixed or missing value fails pending routing closed and is a stop condition. The route record stores this ID in Mongo; changing the application value without a coordinated route transition makes pending registration unavailable.

The routing-operator token is a third, separate operator-only secret. It must not be placed in application or container environment configuration and must never appear in Docker argv. The control script reads it silently from the operator terminal, sends the raw token only over closed standard input, and passes only its SHA-256 verifier in ephemeral container metadata.

The verifier is an independent authentication anchor, installed after separate authorization as one lowercase SHA-256 line in the mode-600, untracked `.registration-routing-operator.sha256` file. The control script must read this stored verifier; it must never calculate the expected verifier from the token supplied for the same routing operation. Retain the raw token only in the approved operator password manager.

## Required changes before activation

The focused implementation PRs provide the following; reviewers must confirm each item before merge:

1. Adds a staging activation overlay or equivalent explicit Compose mode that supplies the HMAC key and one deployment ID to `circles`, and permits both flags to be true only when that overlay is deliberately selected. The default staging deployment must continue to force both flags false.
2. Extends environment and rendered-Compose validation to require a >=32-byte staging-only HMAC key, non-empty deployment ID, matching activation flags, Mailpit-only transport, blank Postmark values, and staging URL when activation mode is selected. Validators must report presence/length, never the key.
3. Packages a pinned, reviewable operator runner containing the exact deployed source and dependencies. It must support read-only `route-status` and `inspect`, and authenticated compare-and-set `route-set`, while mounting `kamooni_staging_circles_users` read-only for inspection and joining only the required staging DB network. It must not install packages dynamically.
4. Adds staging-specific commands and tests for the runner, including proof that `inspect` cannot mutate Mongo or credential files and that route authorization is checked before record initialization.
5. Updates the stale staging and activation documentation and adds an application healthcheck or documents the accepted probe-based substitute.
6. Optionally rehearses the Mongo backup into an isolated disposable database; never restore over persistent staging.

## Synthetic identity manifest

Use Mailpit-only `.invalid` addresses. Recommended labels are `onb-YYYYMMDD-window-case-sequence@staging.kamooni.invalid` and handles `onb_YYYYMMDD_case_sequence`. Confirm that the deployed email validator accepts the chosen `.invalid` syntax before the window; do not weaken validation merely for testing.

| Test case | Synthetic email | Handle | Browser/device | Mailpit message ID | Expected account/DID behavior | Lifecycle state | Actual result | Evidence location |
|---|---|---|---|---|---|---|---|---|
| A happy path/cross-device | `onb-YYYYMMDD-w01-a01@staging.kamooni.invalid` | `onb_YYYYMMDD_a01` | Desktop A -> mobile B | Record ID only; never token | Exactly one account, one stable DID | started/verified/provisioned | Pending | `evidence/YYYYMMDD/a01/` |
| B duplicate email | `onb-YYYYMMDD-w01-a01@staging.kamooni.invalid` | `onb_YYYYMMDD_b01` | Desktop B | Record ID if any | No second account or DID | rejected/generic | Pending | `evidence/YYYYMMDD/b01/` |
| C duplicate handle | `onb-YYYYMMDD-w01-c01@staging.kamooni.invalid` | `onb_YYYYMMDD_a01` | Desktop B | Record ID if any | No second account or DID | rejected/generic | Pending | `evidence/YYYYMMDD/c01/` |
| D interruption before reservation | unique `.invalid` | unique handle | isolated fixture only | Record ID | Fresh verification; one eventual DID | recovery | Pending | isolated evidence |
| E interruption after reservation | unique `.invalid` | unique handle | local/isolated fixture only | Record ID | Same DID retained; fail closed | reconciliation required | Pending | isolated evidence |

The manifest must also record timestamp, named tester, application SHA, infrastructure SHA, image digest, deployment ID, pending ID, final account ID, final DID, session/logout/login result, and relevant audit-event IDs. Never record passwords, raw email tokens, continuation cookies, ALTCHA payloads, private/encrypted keys, or secret values.

Permanent synthetic identities are retained by default. Maintain an append-only inventory under the approved evidence location with every Mongo/account/DID/membership/chat/media artifact discovered. Do not manually delete accounts, DID reservations, credential directories, memberships, chats, or MinIO objects. Cleanup requires a separate reviewed cross-store procedure and authorization.

## Operator roles and prerequisites

- **Release operator:** verifies revisions/images, installs approved configuration, restarts all application instances, and performs routing CAS operations.
- **Safety/rollback operator:** independently reads the baseline, watches stop conditions, and owns `pending -> paused` authority.
- **Test operator:** performs the browser/device matrix and records sanitized evidence.
- **Evidence reviewer:** verifies expected database/audit outcomes without handling raw tokens.

Prerequisites: approved activation/ops-runner change deployed; named roles; approved test window; separate authorization for configuration changes, restarts, routing mutation, and synthetic data creation; private evidence directory; SSH tunnel for Mailpit; stable rollback image ledger; baseline backup; one deployment ID; and a tested `pending -> paused -> legacy` command path.

## Controlled activation runbook (future; do not execute now)

All routing and reconciliation operations use the packaged runner through:

```bash
cd /home/ubuntu/kamooni/circles && ./scripts/staging-onboarding-control.sh COMMAND
```

Do not substitute ad-hoc `npx`, install dependencies, run raw Mongo updates, or expose an operator endpoint.

Run all remote commands on **the staging VM** after connecting from the **local Mac terminal**:

```bash
ssh -i ~/.ssh/kamooni_staging -o IdentitiesOnly=yes ubuntu@188.95.227.109
```

Set non-secret window metadata in the staging shell:

```bash
export EXPECTED_APP_SHA=f36199379501cb83e957873cfe72bbb7bf3d7776 EXPECTED_INFRA_SHA=59af721b3c4790f32ada675497e4143f6ff39aad EXPECTED_IMAGE_ID=sha256:adf570c08c885fd7e5adc82949cb58bd8248e38034541491daeb2d0d094e8099 REGISTRATION_DEPLOYMENT_ID=staging-onboarding-YYYYMMDD-f3619937-01
```

Baseline acceptance must show the expected SHAs/image, both flags false, route `legacy`, and zero pending/reconciliation/lock conditions. Use `/api/version`, Docker inspect, the reviewed redacted-config check, `./scripts/staging-onboarding-control.sh status`, and `./scripts/staging-onboarding-control.sh inspect`.

### AUTHORIZATION CHECKPOINT

**Stop here.** Obtain explicit authorization covering all of: staging secret/configuration installation, route mutations, application recreation/restart, enabling both flags, and creation of synthetic staging accounts/data. Authorization to test does not authorize image rollback, database repair, record deletion, merge, production changes, or deployment to production.

After authorization, CAS `legacy -> paused` with the packaged runner. The control script prompts for the separate operator token without echoing it:

```bash
./scripts/staging-onboarding-control.sh route-set legacy paused none STAGING_RELEASE_OPERATOR
```

Expected: a routing record with mode `paused`, null deployment ID, and the named actor. Immediately verify both legacy and pending starts fail closed. Wait at least five minutes without starting new registrations:

```bash
sleep 300
```

Run `route-status` and read-only reconciliation again; require zero active locks and no unexpected reconciliation condition.

Install the HMAC key and deployment ID in mode-600 `.env.staging.activation` through the reviewed secret procedure. Enable both flags and recreate every application instance with `./scripts/staging-onboarding-control.sh activate-services`. This step validates the complete activated Compose model before changing services. Do not hand-edit the running container. Verify every instance has the expected full SHA/image, both flags true, HMAC present with acceptable length (value redacted), and the identical deployment ID.

CAS `paused -> pending`:

```bash
./scripts/staging-onboarding-control.sh route-set paused pending activation STAGING_RELEASE_OPERATOR
```

Expected: mode `pending` with the exact deployment ID. Confirm a legacy signup attempt is blocked before ALTCHA/account creation and `/signup` presents the email-first journey. Do not use a real identity for either probe.

## End-to-end test matrix

| Area/test | Expected result | Scope |
|---|---|---|
| Start registration + ALTCHA | Generic success; one pending record/message; challenge consumed once | Shared staging |
| Mailpit capture | One approved template, staging origin, `/signup/verify`, no external delivery | Shared staging |
| Early resend | No message before 60 seconds | Shared staging |
| Resend after cooldown | New message/token; prior token invalid; <=3/hour | Shared staging; consumes counters |
| Email correction | New unique `.invalid` destination; prior token invalid; <=3/day | Shared staging |
| Expired/replayed token | Safe failure; no session/account duplication | Expiry shared; accelerated time local-only |
| Cross-browser/device verification | Clean `/signup/continue` URL; secure continuation cookie on opening device | Shared staging, real device |
| Duplicate email/handle | Generic response; no duplicate permanent identity | Shared staging with manifest identities |
| ALTCHA replay | Rejected; no pending record/message | Shared staging, limited attempts |
| Password creation | Policy enforced; password absent from storage/logs | Shared staging |
| Exactly one account/DID | One correlated account, one DID reservation, stable DID/public-key hash | Shared staging, read-only evidence |
| Session/finalization | Session only after durable finalization; logout/login returns same DID | Shared staging |
| Interruption before DID reservation | Fresh verification required; retry yields one account | Isolated fixture or local crash suite only |
| Interruption after claim/reservation | Fail closed, same DID retained, reconciliation report appears | Isolated disposable DB/credential volume or local-only |
| Reconciliation inspection | Read-only, redacted classification; no file/DB mutation | Shared only for natural state; injected failures isolated |
| Narrow viewport/layout | Single-column, 48px primary controls, no clipped actions | Shared staging browser |
| Real mobile keyboard | Inputs usable; password manager/autofill behavior acceptable | Shared staging real phone |
| Introduction | Canonical non-empty description/content drives readiness | Shared staging |
| Guidelines | Structured per-principle acceptance persisted | Shared staging |
| Photo | Optional; upload/replace works through staging MinIO | Shared staging synthetic media |
| Location/privacy | Optional public nearby pin, precision 4; device coordinate not persisted by recenter | Shared only if approved staging Mapbox token exists; otherwise local |
| Resume after interruption | Card/navigation state resumes after logout/device change | Shared staging |
| Participation readiness | Requires verified email + introduction + guidelines only | Shared staging |
| Proof of Humanity | Links work; `real_person` and `met_in_real_life` distinct; no forced attestation | Link shared; external attestation deferred/local mock |
| Existing login | Existing synthetic staging account signs in unchanged | Shared staging |
| Password recovery | Mailpit capture; same account and DID | Shared staging synthetic account |
| Existing email verification | Approved `/verify-email` capture; same DID | Shared staging synthetic account |
| Production behavior | No production config, traffic, identity, or email touched | Static/config review only; never test production |
| Rate-limit boundary/time manipulation | Correct counters without database clearing | Limited shared test; exhaustive local/isolated |
| Process kill/crash points | Exactly-once recovery across every checkpoint | Local/isolated only; never kill shared staging services |

Capture sanitized screenshots, `/api/version`, route status, redacted gate status, Mailpit message ID/metadata (not link/token/body), audit-event IDs/types, and read-only identity correlation. Store evidence in the named private location. Do not use shell tracing (`set -x`), browser HAR files containing tokens, or screenshots of verification URLs.

## Stop conditions

Immediately stop new work and CAS `pending -> paused` on any of:

- Any external email delivery or non-Mailpit transport.
- Mixed application SHA, image ID, or deployment ID; missing HMAC; inconsistent flags.
- Duplicate account, DID, pending correlation, membership, or welcome side effect.
- DID/public-key, account/email/handle, or reservation mismatch.
- Unexpected MongoDB/MinIO errors, duplicate-key errors outside the expected protected path, or credential filesystem errors.
- Any new `reconciliationRequiredAt` record on shared staging or any manual-review reconciliation classification.
- Public Mailpit UI/SMTP exposure or unexpected Mailpit external route.
- Routing/flag inconsistency or route CAS rejection.
- Application, NGINX, MongoDB, MinIO, or Mailpit connectivity failure.
- Raw credential/token/secret appearing in logs or evidence.

Preserve all state and evidence. Do not delete, retry destructively, generate a replacement DID, clear locks manually, restore the backup, or roll back an image until the incident is understood and separately authorized.

## Safe deactivation runbook (future; do not execute now)

1. CAS `pending -> paused` first using the packaged runner and exact actor/token pattern above.
2. Verify pending starts and permanent provisioning are blocked. Allow at least five minutes for already active operations/leases to drain; then run route status and read-only reconciliation.
3. Run `./scripts/staging-onboarding-control.sh deactivate-services`. This selects only the default staging Compose model, recreates every application instance with both flags false and no activation credentials, and verifies SHA/image and connectivity.
4. Preserve all pending records, accounts, DIDs, credential files, messages, and media. Investigate every reserved DID or reconciliation condition.
5. Only when active locks are zero, reconciliation is acceptable, and every instance is gate-aware, CAS `paused -> legacy` with deployment ID `none`:

```bash
./scripts/staging-onboarding-control.sh route-set paused legacy none STAGING_ROLLBACK_OPERATOR
```

6. Verify route `legacy`, both flags false, external `/api/version` equals the expected SHA, all six services/connectivity are healthy, and one authorized synthetic legacy registration smoke test succeeds without DID anomalies.

This is **routing rollback**, which keeps the current application image and only restores the registration path. **Application-image rollback** replaces `circles` with an earlier image from `verified-images.tsv`; it is a separate, higher-risk operation requiring separate authorization and a compatibility check. Image rollback must occur only after routing is `legacy`, both flags are false, and the chosen image/override email contract matches. It must preserve MongoDB, MinIO, users volume, backup, and ledger.

## Final verification checklist

- [ ] Reviewed activation/ops-runner PR deployed; default disabled behavior remains fail closed.
- [ ] Exact application SHA, infrastructure SHA, and image digest match the approved window.
- [ ] Backup checksum recorded; isolated restore rehearsal status explicitly known.
- [ ] All six services and internal/external probes pass; ports remain isolated.
- [ ] Baseline route is `legacy`; both flags false; pending/reconciliation/locks empty.
- [ ] Unique HMAC key installed without exposure; one deployment ID on all instances.
- [ ] Named release, rollback, test, and evidence roles present.
- [ ] Synthetic manifest/evidence location ready; no real identities.
- [ ] Explicit authorization recorded immediately before `legacy -> paused`.
- [ ] Activation matrix completed without stop conditions.
- [ ] Final account/DID/artifact inventory retained.
- [ ] Deactivation completed `pending -> paused -> legacy`; both flags false.
- [ ] Final version, routing, reconciliation, services, and legacy smoke test pass.

## Operations requiring explicit user approval

Every item below is excluded from this preparation and requires explicit approval: merging or deploying the prerequisite PR; generating/installing/rotating the HMAC or operator token; modifying any environment/secret/Compose file; changing either pending flag; creating the routing record or changing routing; restarting/recreating/stopping any container; creating synthetic accounts, pending records, sessions, emails, uploads, or profile data; running fault injection; restoring a backup; clearing Mailpit; reconciling/repairing/deleting any record or credential; application-image rollback; staging cleanup; production access/change; merge to `main`; or any production deployment.
