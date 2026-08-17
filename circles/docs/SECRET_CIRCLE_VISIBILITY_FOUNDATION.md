# Secret circle visibility foundation

Circle `visibility` is separate from the existing policies:

- `visibility` (`public` or `secret`) controls whether a viewer may discover or read a circle. Missing values are `public` for backward compatibility.
- `isPublic` continues to control immediate versus approval-based admission.
- `moderationStatus` controls lifecycle availability.
- `accessRules` and member groups control module and action permissions.

Secret visibility requires a canonical `Members` record. Circle member counts, creator status, chat membership, groups, and ordinary superadmin status do not grant read access. User/profile circles always behave as public.

Initially, only an authenticated superadmin may create or transition a normal circle or project to secret visibility. Phase 2 protects direct circle routes, circle metadata, and circle-owned private media through the central read policy. Phase 3A1 protects direct Mongo discovery through maps, deterministic search, circle/project lists and pickers, bookmarks and pins, structural summaries, and anonymous public counts.

Phase 3A2 excludes secret ordinary circles and projects from the public Qdrant collection. Public-to-secret transitions delete and verify the public vector before committing visibility, then reconcile it again afterward; secret-to-public transitions commit public visibility before indexing. Full rebuilds purge stale secret Circle vectors before public upserts, and a manual server-side reconciliation helper is available without automatic startup deletion.

Phase 3B0 applies the same public-only storage rule to posts, tasks/shifts, events, goals, issues, and proposals. Canonical resource and owner records are checked before and after publication. Circle transitions purge affected derived vectors both before and after becoming secret, ownership changes and deletions reconcile synchronously, and full/manual reconciliation removes secret-owned and deleted-resource orphan points across all six public collections. No private vector collection is introduced.

User-facing derived-resource authorization, upload selection, chat, notification, and admission surfaces remain incomplete release blockers, so Secret Circles must not be enabled in production yet.
