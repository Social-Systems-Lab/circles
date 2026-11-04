# Kamooni Production Incident: September–October 2026 Signup Bomb

- Incident closed: 2026-10-16
- Affected signup period: September–October 2026
- Status: Resolved
- Final outcome: 305 fake accounts removed

## Summary

Kamooni completed a controlled production data-remediation operation for fake accounts created during the September–October 2026 signup bomb. This was not an application deployment. Production application code remained on `gitSha bbb3ea47` throughout the remediation.

The incident-specific cleanup tooling removed and verified 303 accounts from an exact, SHA-256-pinned manifest. Two additional accounts outside that manifest were individually audited and removed. Those individual removals included their automatic chat artifacts and per-user credential directories. The final incident total was 305 removed accounts.

## Containment and safety controls

The remediation used the following controls:

- A production write freeze was established and retained through cleanup and verification.
- A frozen MongoDB backup was made and independently verified before mutation.
- The automated cleanup was restricted to an exact SHA-256-pinned manifest containing 303 reviewed accounts.
- A full dry run was reviewed before execute mode.
- Cleanup execution produced a mutation record for verification.
- Post-cleanup verification confirmed removal of the manifest-pinned accounts and their in-scope MongoDB references.
- The two accounts outside the manifest were individually audited before removal, including their automatic chat artifacts and per-user credential directories.

The tooling is incident-specific historical tooling. It is not a supported general account-deletion facility and must not be reused for another candidate set without a fresh review and code change.

## Private-data handling

This incident record is intentionally sanitized. Emails, DIDs, account IDs, manifests, database dumps, backup locations, credential material, private artifact hashes, and other private production data must never be committed to the repository. The same prohibition applies to cleanup reports, ledgers, credential archives, and any other production artifacts that could contain identifiers or sensitive operational data.

## Lessons and follow-up

The existing admin account-delete path was found to be incomplete. It must be audited and redesigned before the product or its documentation can claim comprehensive account deletion.

A future engineering issue should cover:

- enumerating every DID and account-ID reference across MongoDB;
- handling Mongo-native chat conversations and their dependent records;
- handling filesystem credentials and relevant external stores;
- defining explicit retention-versus-deletion policy for each data class;
- using safe mutation ordering and idempotent cleanup behavior;
- producing a post-deletion verification report;
- testing automatic chat-artifact cleanup and partial-failure recovery; and
- correcting misleading account-deletion UI text and code comments.
