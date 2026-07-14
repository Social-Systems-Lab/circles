# Kamooni Chat System Architecture

Canonical developer architecture overview for the Mongo-native chat and notification-adjacent messaging model.

---

# 1. Purpose

Kamooni uses a Mongo-native chat backend. Matrix is not the authoritative chat backend for current chat, DM, unread, or conversation-ordering behavior.

The chat system supports:

- direct messages
- group conversations
- announcement/system conversations

The goal of this document is to explain how chat data is stored, normalized, authorized, rendered, and how unread messaging now relates to the Mail/Notifications split.

Postgres and Synapse still appear in Docker Compose under Matrix-era configuration. In production Compose they are behind the `matrix` profile. Treat them as legacy compatibility components unless a task explicitly says otherwise.

---

# 2. Core chat model

Authoritative MongoDB collections:

- chatConversations
- chatRoomMembers
- chatMessageDocs
- chatReadStates

Purpose of each:

chatConversations  
Stores conversation-level metadata.

chatMessageDocs  
Stores individual messages.

chatRoomMembers  
Stores group membership and membership status. Current code keys these records by `chatRoomId`, which points at the Mongo conversation id.

chatReadStates  
Stores read state / last-read tracking.

Important notes:

- DMs and announcement conversations rely on `participants`.
- Groups rely on active records in `chatRoomMembers`.
- Legacy `chatRooms`, `chatMessages`, Matrix ids, and Matrix-shaped message fields may still appear in models or compatibility wrappers, but the current runtime chat source of truth is the four collections above.

---

# 3. Conversation types

Supported conversation types:

- dm
- group
- announcement

Meaning:

dm  
Two-party direct conversation. Access is controlled by participants.

group  
Multi-user conversation. Access is controlled by membership.

announcement  
System-managed conversation. Access is controlled by participants, but replies are disabled.

Important invariant:

announcement conversations should behave like DM-style system threads, not like membership-controlled groups.

---

# 4. Conversation schema essentials

Stable fields used by chat conversations include:

- _id
- type
- participants
- circleId
- handle
- name
- description
- picture
- metadata
- createdAt
- updatedAt

These are contract-level fields between storage, normalization, and UI layers. They should not be casually renamed, removed, or restructured.

---

# 5. Message schema essentials

Stable fields used by chat messages include:

- _id
- conversationId
- senderDid
- body
- format
- source
- version
- system
- createdAt

System messages may include system metadata and may use markdown format.

---

# 6. Conversation normalization

Raw Mongo conversations are normalized before they reach the UI.

Relevant file:

- src/lib/data/mongo-chat.ts

Normalization maps Mongo records into `ChatRoomDisplay` objects used by the frontend.

Important top-level flags exposed to the UI include:

- conversationType
- repliesDisabled
- isDirect
- unreadCount

These flags matter because the UI should rely on stable normalized fields rather than parsing metadata ad hoc.

---

# 7. Authorization model

Access behavior differs by conversation type:

DM:  
authorized by participants list.

Announcement:  
authorized by participants list.

Group:  
authorized by membership records in `chatRoomMembers`, with inactive/removed/left memberships denied.

Relevant files:

- src/components/modules/chat/mongo-actions.ts
- src/lib/data/mongo-chat.ts

Important note:  
This distinction is intentional. Do not route DM or announcement access through group membership checks.

---

# 8. Membership model

Group membership is enforced through `chatRoomMembers`.

Membership states such as `removed`, `left`, or inactive records should not grant access.

DM conversations do not depend on `chatRoomMembers`.

Incorrect membership assumptions can hide valid chats or expose chats that should be inaccessible.

---

# 9. Chat list rendering

`listConversationsForUser` performs conversation retrieval and display shaping.

Important behavior:

- conversation sync may run before list rendering
- DMs are visible based on participants
- announcements are visible based on participants
- groups are filtered by active membership
- ordering depends on updatedAt

Important invariant:

`chatConversations.updatedAt` must be updated whenever a message is sent so sidebar ordering remains correct.

This is a critical system rule. `createMessage`, `createThread`, and `createThreadReply` all update the parent conversation timestamp; new send paths must preserve the same behavior.

---

# 10. Message send pipeline

Relevant file:

- src/components/modules/chat/mongo-actions.ts

High-level direct-message flow:

- `findOrCreateDMConversationAction` resolves the recipient and calls `findOrCreateDmConversation`
- `findOrCreateDmConversation` creates or reuses a `type: "dm"` conversation with sorted participant DIDs
- `sendMongoMessageAction` authenticates the sender, checks participation requirements, resolves conversation access, validates replies, writes the message, and sends PM notifications where applicable

High-level group-chat flow:

- `createMongoGroupChatAction` creates a `type: "group"` conversation with participants
- it upserts active `chatRoomMembers` rows for every participant
- group access is checked through active membership records
- membership changes in `actions.ts` emit Mongo-native system messages for join/leave/member changes

Message send flow:

- resolve access
- validate reply target if present
- reject disallowed conversation types (announcement replies)
- create message
- update `chatConversations.updatedAt`
- send notification records where applicable

Note:  
announcement replies are blocked server-side even if a UI path regresses.

There is no current Matrix force-join, room-restoration, or archived-room recovery flow in the Mongo send path.

---

# 11. Reply handling

Reply behavior by type:

- DM and group chats can reply
- announcement chats cannot reply
- UI hides reply controls for announcement threads
- server also blocks replies to announcement conversations

Relevant files:

- src/components/modules/chat/chat-room.tsx
- src/components/modules/chat/mongo-actions.ts

This is defense-in-depth: UI guidance plus server enforcement.

---

# 12. Read state and unread counts

Unread state is tracked through `chatReadStates` and message ids.

Relevant concepts:

- unread counts
- last-read timestamps
- read state updates when opening or reading conversations

Implementation:

- `getUnreadCountsForUser` reads `chatReadStates`, then counts `chatMessageDocs` from other senders after the last read message id
- `markConversationRead` upserts the `chatReadStates` record
- `markConversationReadAction` verifies access, resolves the latest message when needed, and calls `markConversationRead`
- `useMongoChat` marks the latest loaded or polled message read
- `ChatRoomComponent` clears local unread state when messages are viewed

Unread behavior is now split intentionally at the UI level:

**Mail icon**
- owns unread message activity
- DMs
- group unread
- help/contact thread unread

**Bell icon**
- does not own message unread
- owns non-message notifications only

This separation is intentional and should be preserved unless product direction changes.

---

# 13. Chat and notifications relationship

Chat and notifications are now related but distinct systems.

Chat remains the source of message content and message unread state.

Notifications are now stored separately in Mongo-backed notification records and surfaced through the Bell UI.

Important current behavior:

- PM-style notifications can be generated by chat events
- Bell excludes message notifications for launch
- message unread belongs to Mail, not Bell

This keeps Kamooni’s communication model high-signal and avoids duplicate alert surfaces.

---

# 14. Mentions

Current launch behavior:

- chat mentions are enabled and working
- non-chat mentions in posts/comments/discussions are intentionally disabled for launch

Reason:

Non-chat mention behavior was not stable enough for launch and should be rebuilt later using the working chat mention path as the implementation reference.

This is a deliberate launch tradeoff, not an accidental omission.

---

# 15. System messages inside chat

System messages are delivered through the same Mongo-native chat model.

Examples include:

- welcome messages
- platform broadcasts
- announcement threads

System messages are not a separate transport system; they are built on top of Mongo chat primitives.

---

# 16. Key files

src/lib/data/mongo-chat.ts  
Mongo conversation and message data helpers, collection indexes, normalization, list rendering, message creation, read state, unread counts, conversation ordering.

src/components/modules/chat/mongo-actions.ts  
Server-side conversation actions, access checks, send pipeline, unread count and read-state actions, DM and group creation.

src/components/modules/chat/actions.ts  
Compatibility wrapper exporting the Mongo-native actions to existing callers; group membership join/leave actions also emit Mongo-native system messages.

src/components/modules/chat/chat-room.tsx  
Primary chat UI, reply handling, working chat mention implementation.

src/components/modules/chat/useMongoChat.ts  
Client hook for initial message load, polling, and read-state updates.

src/components/modules/chat/chat-list.tsx  
Sidebar list rendering and unread badges.

src/lib/chat/mongo-types.ts  
Type definitions for Mongo conversations, messages, read states, attachments, reactions, and thread metadata.

src/lib/data/db.ts  
Mongo collection initialization and exports for `chatConversations`, `chatRoomMembers`, `chatMessageDocs`, and `chatReadStates`.

src/components/layout/profile-menu.tsx  
Mail vs Bell unread UI split.

src/components/layout/notifications.tsx  
Bell notification UI backed by Mongo notification endpoints.

src/lib/data/notifications.ts  
Mongo-backed notification persistence and helpers.

src/app/api/notifications/route.ts  
Notification feed endpoint.

src/app/api/notifications/unread-count/route.ts  
Bell unread count endpoint.

src/app/api/notifications/mark-all-read/route.ts  
Bulk mark-read endpoint.

---

# 17. Launch notes

Communication behavior at launch:

- Mail = messages
- Bell = non-message activity
- chat mentions work
- non-chat mentions are disabled
- notifications are in-app only for now
- notification settings are currently per circle/profile entity, not global
- notification settings currently control Bell-owned non-message activity only
- task/goal/proposal/issue notifications are role-relevant, not broadcast to everyone in a circle
- the notification settings MVP now reflects saved state immediately and no longer fabricates enabled defaults when settings are missing

Deferred work:

- simplify launch-facing notification categories
- web push delivery
- email fallback
- rebuilt non-chat mentions outside chat
