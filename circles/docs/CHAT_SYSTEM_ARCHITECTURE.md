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

# 12. Topic-first messages

As of 2026-07-17, messages use topics as the primary discussion model.

Current behavior:

- users create a topic or reply inside a topic
- the general loose-message composer is no longer rendered
- topic opening messages and topic replies remain stored in `chatMessageDocs`
- `chatConversations.updatedAt` must update for every topic opening message and every reply
- topics display inline in a vertically scrollable list
- topics are ordered by latest activity ascending: oldest activity at the top, newest activity at the bottom
- multiple topics can remain expanded at the same time
- topic titles, opening messages, replies, attachments, reactions, editing, and deletion retain their existing behavior
- the first topic title is prefilled with `Hello` but remains editable

Relevant files:

- src/components/modules/chat/chat-room.tsx
- src/components/modules/chat/mongo-actions.ts
- src/lib/data/mongo-chat.ts

---

# 13. Earlier messages

Historical non-topic messages were not deleted or migrated.

They are exposed above the topic list through a collapsed, read-only `Earlier messages` section.

Current behavior:

- the initial view fetches only whether legacy messages exist and their count
- full legacy history loads lazily when the section is expanded
- legacy messages are selected from the same conversation where `threadId` is absent, `thread` is absent, and system/broadcast records are excluded
- legacy messages render chronologically
- no composer, reply, edit, delete, or reaction controls are available in the section
- expanding the section does not update `chatConversations.updatedAt`
- expanding the section does not alter topic expansion state

Relevant files:

- src/components/modules/chat/chat-room.tsx
- src/components/modules/chat/mongo-actions.ts
- src/lib/chat/legacy-messages.ts

---

# 14. Responsive new-topic behavior

Desktop behavior:

- the fixed green `New topic` control remains available

Mobile behavior:

- there is no fixed bottom `New topic` control
- a compact `New topic` action appears in the conversation header
- a full-width `New topic` button appears after the topic list
- the controls avoid overlapping `Earlier messages` and bottom navigation

Relevant file:

- src/components/modules/chat/chat-room.tsx

---

# 15. Topic loading state

The first-topic empty state is gated by successful topic loading.

Current behavior:

- the empty state appears only after topic loading completes successfully and confirms zero topics
- conversation switching resets topic loading state
- stale requests from a previously selected room are ignored

Relevant file:

- src/components/modules/chat/chat-room.tsx

---

# 16. Notification responsiveness

Notification and chat-count components still use polling as fallback.

Additional responsiveness behavior:

- the shared browser event `kamooni:notifications-changed` triggers immediate refresh after relevant local actions
- counts refresh on window focus
- counts refresh when the document becomes visible
- the general notification bell intentionally excludes `pm_received` notifications
- Telegram dispatch remains fire-and-forget after in-app notification insertion

Relevant files:

- src/app/chat/layout.tsx
- src/components/layout/profile-menu.tsx
- src/components/layout/notifications.tsx
- src/components/layout/user-toolbox.tsx
- src/lib/client/notification-events.ts
- src/lib/notifications/bell-filter.ts
- src/lib/data/notifications.ts

---

# 17. Unread badge race fix

Confirmed race:

- an older `listChatRoomsAction` request could return after a room was marked read
- the newer refresh could be dropped while the older request was still in flight
- the stale response could restore an old unread number
- `ChatList` also used `mongoUnread || atomUnread || 0`, causing a valid server value of `0` to fall back to stale client state

Fix:

- server unread value `0` is treated as authoritative
- sidebar, envelope, and toolbox chat refreshes use latest-only/coalesced async refresh handling
- stale responses are discarded
- a refresh requested during an in-flight request causes one final fresh request afterward

Relevant files:

- src/components/modules/chat/chat-list.tsx
- src/app/chat/layout.tsx
- src/components/layout/profile-menu.tsx
- src/components/layout/user-toolbox.tsx
- src/lib/client/latest-async-runner.ts

---

# 18. Read state and unread counts

Unread state is tracked through `chatReadStates` and message ids.

Relevant concepts:

- unread counts
- last-read timestamps
- read state updates when opening or reading conversations

Implementation:

- `getUnreadCountsForUser` reads `chatReadStates`, then counts `chatMessageDocs` from other senders after the last read message id
- `markConversationRead` upserts the `chatReadStates` record
- `markConversationReadAction` verifies access, resolves the true latest `chatMessageDocs` message id across the conversation, including topic replies, and calls `markConversationRead`
- `useMongoChat` marks the latest loaded or polled message read
- `ChatRoomComponent` clears local unread state when messages are viewed

Conversation read marking no longer relies only on the latest root message or topic starter.

Topic-local seen state and conversation-level Mongo read state remain separate systems.

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

# 19. Chat and notifications relationship

Chat and notifications are now related but distinct systems.

Chat remains the source of message content and message unread state.

Notifications are now stored separately in Mongo-backed notification records and surfaced through the Bell UI.

Important current behavior:

- PM-style notifications can be generated by chat events
- Bell excludes message notifications for launch
- message unread belongs to Mail, not Bell
- the conversation sidebar badge, top Messages/envelope badge, topic-local unread badge, and general notification bell are intentionally not yet unified

This keeps Kamooni’s communication model high-signal and avoids duplicate alert surfaces.

Remaining mismatches between those indicators may be semantic rather than stale-state bugs because they use different data sources or meanings.

---

# 20. Mentions

Current launch behavior:

- chat mentions are enabled and working
- non-chat mentions in posts/comments/discussions are intentionally disabled for launch
- chat mention storage, topic reply handling, rendering, and `chat_mention` notification behavior are documented in
  [Chat mentions](CHAT_MENTIONS.md)

Reason:

Non-chat mention behavior was not stable enough for launch and should be rebuilt later using the working chat mention path as the implementation reference.

This is a deliberate launch tradeoff, not an accidental omission.

---

# 21. System messages inside chat

System messages are delivered through the same Mongo-native chat model.

Examples include:

- welcome messages
- platform broadcasts
- announcement threads

System messages are not a separate transport system; they are built on top of Mongo chat primitives.

---

# 22. Key files

- `src/lib/data/mongo-chat.ts` - Mongo conversation and message data helpers, collection indexes, normalization, list rendering, topic creation, topic replies, message creation, read state, unread counts, conversation ordering.

- `src/components/modules/chat/mongo-actions.ts` - Server-side conversation actions, access checks, send pipeline, topic and legacy-message actions, unread count and read-state actions, DM and group creation.

- `src/components/modules/chat/actions.ts` - Compatibility wrapper exporting the Mongo-native actions to existing callers; group membership join/leave actions also emit Mongo-native system messages.

- `src/components/modules/chat/chat-room.tsx` - Primary topic-first chat UI, earlier-message rendering, reply handling, topic controls, working chat mention implementation.

- `src/components/modules/chat/useMongoChat.ts` - Client hook for initial message load, polling, and read-state updates.

- `src/lib/chat/mention-markup.ts` - Chat mention markup parser used by notification recipient resolution.

- `src/components/modules/chat/chat-list.tsx` - Sidebar list rendering, unread badges, and latest-only/coalesced refresh behavior.

- `src/app/chat/layout.tsx` - Top chat layout and envelope count refresh behavior.

- `src/components/layout/profile-menu.tsx` - Mail/envelope unread UI split and count refresh behavior.

- `src/components/layout/notifications.tsx` - Bell notification UI backed by Mongo notification endpoints.

- `src/components/layout/user-toolbox.tsx` - Toolbox chat count refresh behavior.

- `src/lib/chat/mongo-types.ts` - Type definitions for Mongo conversations, messages, read states, attachments, reactions, and thread metadata.

- `src/lib/chat/legacy-messages.ts` - Legacy non-topic message query helpers for the read-only `Earlier messages` section.

- `src/lib/chat/conversation-read-state.ts` - Conversation-level read-state helpers that resolve the latest message across root messages and topic replies.

- `src/lib/chat/unread-counts.ts` - Unread count helpers for conversation-level message indicators.

- `src/lib/data/db.ts` - Mongo collection initialization and exports for `chatConversations`, `chatRoomMembers`, `chatMessageDocs`, and `chatReadStates`.

- `src/lib/data/notifications.ts` - Mongo-backed notification persistence and helpers.

- `src/lib/client/notification-events.ts` - Shared browser event helpers for `kamooni:notifications-changed`.

- `src/lib/client/latest-async-runner.ts` - Latest-only/coalesced async refresh helper used to avoid stale unread badge responses.

- `src/lib/notifications/bell-filter.ts` - Bell notification filtering, including intentional exclusion of `pm_received`.

- `src/app/api/notifications/route.ts` - Notification feed endpoint.

- `src/app/api/notifications/unread-count/route.ts` - Bell unread count endpoint.

- `src/app/api/notifications/mark-all-read/route.ts` - Bulk mark-read endpoint.

---

# 23. Launch notes

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
