# Secret circle visibility foundation

Circle `visibility` is separate from the existing policies:

- `visibility` (`public` or `secret`) controls whether a viewer may discover or read a circle. Missing values are `public` for backward compatibility.
- `isPublic` continues to control immediate versus approval-based admission.
- `moderationStatus` controls lifecycle availability.
- `accessRules` and member groups control module and action permissions.

Secret visibility requires a canonical `Members` record. Circle member counts, creator status, chat membership, groups, and ordinary superadmin status do not grant read access. User/profile circles always behave as public.

Initially, only an authenticated superadmin may create or transition a normal circle or project to secret visibility. Phase 2 protects direct circle routes, circle metadata, and circle-owned private media through the central read policy. Phase 3A1 protects direct Mongo discovery through maps, deterministic search, circle/project lists and pickers, bookmarks and pins, structural summaries, and anonymous public counts.

Public Qdrant/vector publication and derived-resource surfaces remain unprotected release blockers, so Secret Circles must not be enabled in production yet.
