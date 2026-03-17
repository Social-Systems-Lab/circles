
# CHAT_SYSTEM_ARCHITECTURE.md
Circles / Kamooni — Mongo Chat System Architecture

## Core Principle
MongoDB is the authoritative chat backend. No Matrix dependency remains in the runtime chat system.

## Core Collections
chatConversations
- _id
- type: "dm" | "group" | "announcement"
- participants: [did]
- handle
- circleId
- createdAt
- updatedAt

chatRoomMembers
- conversationId
- userDid
- role: "admin" | "member"

chatMessageDocs
- conversationId
- senderDid
- content
- systemType
- createdAt

chatReadStates
- conversationId
- userDid
- lastReadMessageId

## Conversation Types

DM
Visible when:
participants includes userDid

Group
Visible when:
membership exists in chatRoomMembers

Announcement
System conversations such as platform announcements.
Visible when:
conversation.type === "announcement"
No membership rows required.

Announcement chats are read‑only for normal users.

## Message Flow

User action
→ Server Action
→ createMessage()
→ chatMessageDocs.insertOne()
→ chatConversations.updatedAt updated
→ sidebar ordering refreshes

## System Message Types

- welcome
- group_chat_joined
- group_chat_left
- group_chat_member_added
- group_chat_member_removed
- group_chat_admin_promoted
- announcement
- platform_broadcast

## Read‑only Enforcement

Announcement conversations use:

repliesDisabled = true

UI hides the message input for non‑admins.

## Future Improvements

- reactions
- mentions
- typing indicators
- remove remaining Matrix compatibility helpers
