# Kamooni Chat System Architecture

Developer architecture overview for the Mongo-native chat system.

---

# 1. Purpose

Kamooni uses a Mongo-native chat backend.

The chat system supports:

- direct messages
- group conversations
- announcement/system conversations

The goal of this document is to explain how chat data is stored, normalized, authorized, and rendered.

---

# 2. Core chat model

Main collections:

- chatConversations
- chatMessageDocs
- chatRoomMembers
- chatReadStates

Purpose of each:

chatConversations  
Stores conversation-level metadata.

chatMessageDocs  
Stores individual messages.

chatRoomMembers  
Stores group membership and membership status.

chatReadStates  
Stores read state / last-read tracking.

Important note:  
DMs and announcement conversations rely on participants lists.  
Groups additionally rely on membership records.

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
This distinction was critical for fixing announcement thread access.

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
- announcements are visible like DMs
- groups are filtered by active membership
- ordering depends on updatedAt

Important invariant:

`chatConversations.updatedAt` must be updated on message send so sidebar ordering remains correct.

This is a critical system rule.

---

# 10. Message send pipeline

Relevant file:

- src/components/modules/chat/mongo-actions.ts

High-level send flow:

- resolve access
- validate reply target if present
- reject disallowed conversation types (announcement replies)
- create message
- update conversation timestamps and related state

Note:  
announcement replies are blocked server-side even if a UI path regresses.

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

Unread state is tracked through read-state primitives and conversation/message timestamps.

Relevant concepts:

- unread counts
- last-read timestamps
- read state updates when opening or reading conversations

Unread behavior is part of the normalized chat-room experience and should remain consistent across conversation types.

---

# 13. System messages inside chat

System messages are delivered through the same Mongo-native chat model.

Examples include:

- welcome messages
- platform broadcasts
- announcement threads

Reference:

- SYSTEM_MESSAGES_ENGINE.md

System messages are not a separate transport system; they are built on top of Mongo chat primitives.

---

# 14. Key files

src/lib/data/mongo-chat.ts  
Mongo conversation and message data helpers, normalization, list rendering.

src/components/modules/chat/mongo-actions.ts  
Server-side chat actions, access checks, send logic.

src/components/modules/chat/chat-room.tsx  
Main chat UI, reply controls, composer behavior.

src/lib/chat/system-messages.ts  
System message metadata helpers.

src/lib/data/platform-broadcasts.ts  
Broadcast synchronization into announcement conversations.

---

# 15. Guardrails for future AI changes

- Do not mutate chat schema casually. Preserve stable fields and contract shape unless a migration is intentional and validated.
- Do not treat announcement conversations like groups. They are participant-authorized threads.
- Do not rely on hidden metadata when stable normalized flags exist. Use normalized top-level flags.
- Do not break `updatedAt` refresh on message send. Sidebar recency depends on it.
- Do not remove server-side enforcement just because the UI hides controls. Keep defense-in-depth.

These guardrails prevent regressions in access, ordering, and system-message reliability.

---

# 16. Summary

Kamooni chat is a Mongo-native system where all conversation types share core primitives, but authorization and UI behavior differ by conversation type.  
Normalization and stable top-level fields are essential for a reliable frontend.  
System messaging is implemented as a specialized chat layer, not a separate messaging system.

Implementation version

Mongo-native chat architecture  
Kamooni v0.8+
