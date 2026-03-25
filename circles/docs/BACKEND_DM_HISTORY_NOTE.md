# Backend DM History Note

This note exists to prevent confusion between old Matrix DM behavior and the current live Kamooni chat system.

## Current live system

Kamooni is now using a Mongo-native chat system as the production source of truth.

Relevant collections include:

- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Relationship/contact state now lives separately in:

- `userRelationships`

## Current relationship layer

Sprint 2 established the working relationship/contact layer on top of the Mongo-native system.

That live behavior now includes:

- send contact request
- incoming request profile state
- accept/decline from profile
- refresh fix so notification/profile navigation shows the correct request controls
- Connections in toolbox
- pending requests in toolbox
- Respond control in Connections
- minimal bell notification for contact requests

## Important product rules

Current intended meaning:

- **Follow** = feed subscription
- **Contact / Connect** = relationship layer
- Follow is separate from Contact
- Existing DM history may still allow Message in specific legacy cases
- Accepted contacts should appear in Connections

## Legacy DM-only pairs

A small number of users had Mongo DM history but no corresponding `userRelationships` rows.

That caused these symptoms:

- profile showed **Add Contact** even though message history existed
- user did not appear in **Connections**

For these rare legacy cases, the preferred fix was manual Mongo backfill, not new migration code.

The manual backfill pattern used:

- create two `userRelationships` rows
- set `connectStatus: accepted`
- set `dmPermission: allowed`
- set `dmPermissionSource: contact`

This was used for a handful of existing Mongo-chat pairs only.

## Legacy Matrix note

There is an older DM note about Matrix-era send failures and force-join behavior.

That note is historical reference only.

It should not be treated as the current production DM architecture.

Current production work should use the Mongo-native chat and relationship model as the source of truth.

## Editing guidance

When working on chat or relationships in future:

- prefer current Mongo-native docs and code paths
- avoid reintroducing Matrix-era imports or assumptions
- keep relationship logic separate from follow logic
- prefer manual data cleanup over one-off code for tiny legacy edge cases
- verify production behavior through `/api/version` and real browser tests

## Related files

Useful current files include:

- `src/components/modules/home/actions.ts`
- `src/components/modules/home/message-button.tsx`
- `src/components/layout/user-toolbox.tsx`
- `src/components/layout/notifications.tsx`
- `src/lib/data/relationships.ts`
