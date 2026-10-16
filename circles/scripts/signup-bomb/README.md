# Signup-bomb cleanup (one-off)

This directory contains a one-off incident cleanup tool for the reviewed September–October 2026 signup bomb. It is not a general user-deletion facility. The heuristic exists only in `inventory.ts`; cleanup operates only on an exact, SHA-256-pinned manifest containing exactly 303 reviewed accounts.

## Completed incident

The incident closed on 2026-10-16. This tooling removed and verified the 303 accounts in the fixed, manifest-pinned candidate set. Two additional accounts outside that manifest were then individually audited and removed, including their automatic chat artifacts and per-user credential directories. The final incident total was 305 removed accounts: 303 handled by this tooling and 2 handled through separately reviewed individual cleanup.

Production application code was not redeployed during this data remediation and remained on `gitSha bbb3ea47`.

These scripts are incident-specific historical tooling, not a supported general account-deletion mechanism. They must not be reused for another candidate set without a fresh review and code change. Manifests, reports, ledgers, database backups, credential archives, identifiers, hashes of private artifacts, and other production artifacts are private production data and must never be committed.

See the sanitized [incident record](../../docs/INCIDENT_2026-10-16_SIGNUP_BOMB.md) for the completed outcome and follow-up work.

The scripts default to read-only behavior. They require `MONGODB_URI`, refuse any database other than `circles`, never call the application admin deletion functions, never alter DIDs or historical signup/founding counters, and do not use transactions (production MongoDB is standalone). MinIO, Qdrant, and user-filesystem objects are reported as pending external cleanup and are not deleted.

Inventory does not treat email verification, `accountStatus`, or `verificationStatus` as activity. Strong activity is field-aware: authored or initiated content, external memberships and followers, relationship edges, non-automatic chat participation, reactions, RSVPs, task participation, outgoing invitations (or acting on an incoming invitation), rankings, verification messages, uploads, external notification connections, and governance actions exclude a profile. Own-profile self-membership, received notifications, pending incoming invitations, read states, and transient signup records remain disposable. Chat cleanup is limited to exact candidate-owned signup welcome, current or reviewed-legacy platform announcement, and empty own-profile conversation signatures; each whole conversation and only its exact conversation-ID dependents are removed. Shared, authored, contradictory, or substantive chat state stops the cleanup, and global platform broadcast definitions are never cascaded. A humanity-verification record is strong when the candidate is the verifier; a candidate who is only the subject is treated as received evidence and is listed in report `policyNotes` before its MongoDB row can be removed. Unknown field semantics stop both inventory and cleanup.

## Local tests

Run from the repository root on the local Mac:

```bash
bun test scripts/signup-bomb/cleanup.test.ts
```

The tests use in-memory disposable fixtures and do not connect to MongoDB. The `--allow-non-circles-local-tests` escape hatch is accepted only when `MONGODB_URI` names localhost; it must never be used in production.

## Production prerequisites

Before execute mode, make and independently validate a current MongoDB backup. Save its receipt to a file. Establish a production write freeze by stopping `circles`, cron, and watchtower. The script cannot establish or verify that freeze itself. Keep those services stopped through cleanup and verification.

Run every command from `/root/circles/circles` on the `kamooniorg` production server. Use the exact manifest path and SHA printed by inventory in every subsequent command.

## Historical/recovery procedure for the fixed 303-account manifest

The sequence below is retained as the safety and recovery procedure used for the fixed 303-account tooling manifest. The tooling count of 303 is not the final incident total of 305.

First generate the read-only inventory:

```bash
bun scripts/signup-bomb/inventory.ts
```

Then run cleanup in its default dry-run mode:

```bash
bun scripts/signup-bomb/cleanup.ts --manifest artifacts/signup-bomb/manifest-TIMESTAMP.json --manifest-sha256 SHA256 --backup-receipt /ABSOLUTE/PATH/TO/BACKUP-RECEIPT
```

After reviewing the dry-run report and confirming the write freeze is still active, execute:

```bash
bun scripts/signup-bomb/cleanup.ts --execute --manifest artifacts/signup-bomb/manifest-TIMESTAMP.json --manifest-sha256 SHA256 --backup-receipt /ABSOLUTE/PATH/TO/BACKUP-RECEIPT
```

Finally verify using the mutation report printed by execute mode:

```bash
bun scripts/signup-bomb/verify.ts --manifest artifacts/signup-bomb/manifest-TIMESTAMP.json --manifest-sha256 SHA256 --mutation-report artifacts/signup-bomb/cleanup-mutation-TIMESTAMP.json
```

Do not restart production writers if verification reports MongoDB failures. A successful MongoDB verification can still report pending external assets; in that case the incident cleanup is explicitly incomplete until those assets are handled by a separately reviewed procedure.
