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

Phase 3B1a establishes `Post.feedId -> Feed.circleId -> Circle` as the base user-facing Post access boundary. Browser-facing Feed actions derive viewer identity from the signed session, global Feed IDs are filtered by visibility and lifecycle before Post pagination, and direct Post/Discussion/comment reads fail with neutral absence unless the owning Circle is readable. Public user-Feed lookup keeps its requested profile separate from the authenticated viewer. New Discussions store a canonical Feed ID; legacy Discussion records without resolvable Feed ownership fail closed.

Phase 3B1b1 adds a second read boundary for source-bound Posts. Task, Goal, Issue, Proposal, and system Funding noticeboard Posts require their canonical source Circle to be readable; Event discussion and noticeboard Posts require every canonical host Circle to be readable. Funding uses a dedicated server-controlled source marker outside the generic shadow `parentItemType`, with legacy noticeboard Posts recognized only through the canonical Funding Ask backlink. Missing or malformed trusted sources fail closed. Source-bound Posts are excluded by Mongo before Feed pagination, and direct Post resolution returns the same neutral absence as a missing Post.

Phase 3B1b2 shared-original, internal-preview, and Circle-mention authorization and Phase 3B1b3 source-specific write restrictions remain incomplete. Phase 3B1c Post interaction/notification hardening also remains incomplete. Other derived-resource authorization, public attachment URL/private upload selection, chat, notification, and admission surfaces remain release blockers, so Secret Circles must not be enabled in production yet.
