
# CHAT_DEBUG_PLAYBOOK.md
Circles / Kamooni — Chat Debugging Playbook

This document provides a fast workflow for diagnosing and fixing common chat issues
in the Mongo-native chat system.

------------------------------------------------------------

# 1. Quick Diagnostic Checklist

When chat behaves incorrectly, check these in order:

1. Conversation exists in `chatConversations`
2. User visibility rules allow the conversation
3. Messages exist in `chatMessageDocs`
4. Conversation access logic allows entry
5. Read state and ordering behave correctly

Most chat bugs fall into one of these categories.

------------------------------------------------------------

# 2. Sidebar Shows Conversation But Cannot Open

Symptom:

• conversation appears in sidebar
• clicking it returns `/unauthorized`

Likely cause:

Conversation type not included in access check.

Example fix:

Allow additional types in visibility logic:

```ts
if (conversation.type === "dm" || conversation.type === "announcement") return true;
```

Common location:

```
src/lib/data/mongo-chat.ts
src/components/modules/chat/mongo-actions.ts
```

------------------------------------------------------------

# 3. Conversation Missing From Sidebar

Check:

```
chatConversations
```

Verify fields:

```
type
participants
updatedAt
```

Then inspect:

```
listConversationsForUser(userDid)
```

Rules:

DM → participants must include userDid

Group → membership row must exist

Announcement → always visible

------------------------------------------------------------

# 4. Messages Not Appearing

Check collection:

```
chatMessageDocs
```

Verify:

```
conversationId
createdAt
```

Ensure message creation updates ordering:

```
chatConversations.updatedAt = now
```

Without this, sidebar ordering may hide active conversations.

------------------------------------------------------------

# 5. Unread Counter Incorrect

Unread counts depend on:

```
chatReadStates
```

Fields:

```
conversationId
userDid
lastReadMessageId
```

If counters are incorrect:

• verify read state row exists
• verify message IDs are ordered correctly

------------------------------------------------------------

# 6. Announcement Conversations

Announcement chats:

```
type: "announcement"
```

Properties:

• membership not required
• visible to all users
• read-only

Common issue:

Authorization logic assumes only:

```
dm
group
```

Fix by allowing:

```
announcement
```

------------------------------------------------------------

# 7. Platform Broadcast Issues

Broadcast messages originate from:

```
src/lib/data/platform-broadcasts.ts
```

Injected into chat using:

```
syncPlatformBroadcastsForUser(userDid)
```

Verify:

1. broadcast active
2. conversation created
3. message inserted
4. access logic allows announcement type

------------------------------------------------------------

# 8. Production vs Local Differences

Mongo may return documents in non-deterministic order.

Always sort conversations:

```
.sort({ updatedAt: -1 })
```

Failure to sort may produce empty or inconsistent chat lists in production.

------------------------------------------------------------

# 9. Debug Commands

Find conversations:

```
db.chatConversations.find().pretty()
```

Find messages:

```
db.chatMessageDocs.find({ conversationId: ObjectId("...") })
```

Find membership:

```
db.chatRoomMembers.find({ userDid: "..." })
```

------------------------------------------------------------

# 10. Golden Rules

1. Mongo is the single source of truth
2. Conversations define visibility
3. Messages define activity
4. Read states define unread counters
5. Announcement chats bypass membership checks

------------------------------------------------------------

# 11. Future Improvements

Planned debugging improvements:

• chat health endpoint
• admin chat inspector
• automatic broadcast validation
• message integrity checks

These tools will further reduce debugging time.
