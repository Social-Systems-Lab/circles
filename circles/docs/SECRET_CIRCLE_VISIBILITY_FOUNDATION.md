# Secret circle visibility foundation

Circle `visibility` is separate from the existing policies:

- `visibility` (`public` or `secret`) controls whether a viewer may discover or read a circle. Missing values are `public` for backward compatibility.
- `isPublic` continues to control immediate versus approval-based admission.
- `moderationStatus` controls lifecycle availability.
- `accessRules` and member groups control module and action permissions.

Secret visibility requires a canonical `Members` record. Circle member counts, creator status, chat membership, groups, and ordinary superadmin status do not grant read access. User/profile circles always behave as public.

Initially, only an authenticated superadmin may create or transition a normal circle or project to secret visibility. Phase 1 adds the policy and entitlement foundation only. Secret circles must not be enabled in production until route, metadata, discovery, derived-content, chat, contribution, and private-upload integration is complete.
