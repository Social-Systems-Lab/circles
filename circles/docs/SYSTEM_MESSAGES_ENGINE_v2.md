
# SYSTEM_MESSAGES_ENGINE.md
Circles / Kamooni — System Message Engine

## Purpose
System messages allow the platform to create structured chat events automatically.

Examples:
- welcome messages
- group membership changes
- admin announcements
- platform broadcasts

They are stored in chatMessageDocs but rendered differently in the UI.

## Message Structure

Example:

{
  conversationId: "...",
  senderDid: "system",
  systemType: "group_chat_joined",
  content: "...",
  createdAt: Date
}

## Supported System Types

welcome

group_chat_joined

group_chat_left

group_chat_member_added

group_chat_member_removed

group_chat_admin_promoted

announcement

platform_broadcast

## Rendering Modes

Normal Message
Standard user chat message.

System Event Row
Example:
"Tim joined the group"

Announcement Block
Styled message used for announcements and broadcasts.

## Platform Broadcast Flow

Admin creates broadcast in:

/admin → System Messages → Platform Broadcast

Stored via:

platform-broadcasts.ts

Injected via:

syncPlatformBroadcastsForUser(userDid)

Process:

Admin message
→ broadcast stored
→ syncPlatformBroadcastsForUser
→ announcement conversation created

Conversation properties:

type: "announcement"
handle: PLATFORM_ANNOUNCEMENT_HANDLE

Each user receives a personal:

Platform Announcements

chat thread.

## Safety Rules

- broadcast threads are read‑only
- authored by admin
- visible to all users
