# Persistent Topic Unread State Architecture

This document is the authoritative design for topic and conversation unread state in Circles. It defines the storage
model, counting rules, migration requirements, UI contract, and deployment safeguards that every Circles instance must
preserve.

## Purpose

The original topic UI had two independent sources of read state:

- conversation read state was persisted in MongoDB
- topic read state was stored in browser `localStorage`

Those sources could disagree. The global Messages badge and conversation row could show zero while old topic cards showed
large historical unread counts. Browser changes, cleared storage, or a different device could also make previously read
topics appear unread again.

The current architecture removes browser-local authority. MongoDB is the persistent source of truth for both conversation
and topic cursors. Client state may display, cache, or optimistically refresh server results, but it must not independently
decide what is read. Do not reintroduce `localStorage` or another per-browser topic-read authority.

## Authoritative read state

### `chatReadStates`

There is one logical row per `(userDid, conversationId)`. Relevant V2 fields are:

- `readStateVersion`: `2` for migrated or native V2 state
- `legacyLastReadMessageId`: cursor for loose legacy/non-topic messages
- `topicFallbackMessageId`: immutable inherited boundary for topics without an explicit topic row
- `readStateMigratedAt`: time at which the V2 state was initialized
- `updatedAt`: last conversation-level read-state update
- `lastReadMessageId`: retained for V1 compatibility and migration; V2 unread calculations do not use it as the active
  loose-message cursor

`topicFallbackMessageId` is frozen during V2 initialization. Later conversation reads advance only
`legacyLastReadMessageId` and cannot move the fallback.

### `chatTopicReadStates`

There is one logical row per user, conversation, and topic:

- `userDid`
- `conversationId`
- `topicId`
- `lastReadMessageId`
- `updatedAt`

The required identity index is unique:

```javascript
{ userDid: 1, conversationId: 1, topicId: 1 }
```

An existing topic row is explicit state, including an explicit null cursor. It permanently overrides the conversation's
migration fallback for that topic.

## Core semantics

- A topic starter is a message, not merely topic metadata.
- A starter created by another user is unread until that topic is read, even when it has zero replies.
- A user's own starter is never unread for that user.
- Replies from other users remain unread until that topic is read.
- Opening a conversation does not mark topic starters or replies read.
- Opening a topic advances only that topic's cursor.
- Loose legacy/non-topic messages use `legacyLastReadMessageId`.
- A user's own messages never increase that user's unread counts.

These rules allow an open conversation to remain unread. Merely being on `/chat/<conversation>` is not evidence that the
user opened every topic within it.

## Required invariants

For the complete authoritative snapshot of a conversation:

```text
topic unread > 0  => parent conversation unread > 0
conversation unread = 0 => every topic in that conversation has unread = 0
```

A deliberately topic-filtered internal query is not a complete conversation snapshot and must not be presented as one.
Normal sidebar and global Messages counts use all topics.

Additional invariants:

- Opening Topic A cannot modify Topic B's cursor.
- Opening a conversation cannot mark unopened topic content read.
- Cursor writes cannot move a valid cursor backward.
- Persisted state survives reloads, browser restarts, browser changes, and device changes for the same user.
- A new incoming message after the applicable cursor is unread.

## Conversation unread calculation

The conversation count is conceptually:

```text
unread loose legacy messages
+ unread topic starters
+ unread topic replies
```

The partitions are disjoint:

- loose legacy messages have neither `thread` nor `threadId`
- a topic starter has `thread` metadata and its own `_id` is the topic id
- a topic reply has `threadId` equal to its starter's id

The topic aggregation groups a starter under its own id and replies under `threadId`. The legacy query explicitly excludes
both topic forms. All partitions exclude `senderDid == current user`, so each eligible incoming message contributes at most
once.

## Topic cursor rules

Topic ids and persisted cursor ids use canonical lowercase, 24-character Mongo ObjectId hexadecimal strings. Fixed-length
normalized strings preserve ObjectId byte ordering, which permits monotonic `$max` updates.

The server validates every browser-submitted topic boundary before writing it. The referenced message must:

- be a valid ObjectId
- exist in `chatMessageDocs`
- belong to the supplied conversation
- be either the supplied topic's starter or a reply whose `threadId` is that topic id

Malformed, fabricated, nonexistent, future, cross-conversation, and cross-topic ids are rejected without changing the
cursor. Valid topic cursor writes use MongoDB `$max`; stale requests therefore cannot regress a newer boundary.

## Opening a topic

The client fetches the topic replies and chooses the greatest valid ObjectId among the starter and replies actually
returned to that topic view. It submits that id to the validated server action.

The server must not replace this boundary with the globally latest topic message. A reply inserted after the fetch was not
part of what the user saw and must remain unread. Conversely, using the greatest fetched ObjectId ensures every visible
message up to the accepted cursor is covered even if `createdAt` order differs from ObjectId order. A starter-only topic
uses the starter itself as its legitimate boundary.

## UI and shared snapshot model

Topic cards, conversation rows, and the global Messages badge are views of the same server-authoritative model. They must
not maintain separate definitions of unread state.

Conversation listings receive server-computed unread counts. A complete response replaces the shared client snapshot so
rooms that became read do not remain indefinitely through merge-only client state. Topic-local refreshes update topic
counts and the corresponding authoritative parent count. Latest-response protection prevents an older request from
restoring stale values.

Example:

```text
Topic A is open and read.
Topic B is closed.
Another user replies in Topic B.

Topic A unread:       0
Topic B unread:       1
Conversation unread:  1
Messages:              reflects the unread conversation
```

No active-conversation optimization may force that conversation to zero.

## Polling and refresh

Same-tab events cannot announce a message created in another user's browser. Circles therefore combines:

- periodic authoritative conversation/unread polling
- refresh on window focus and document visibility
- notification refresh events after relevant same-tab actions
- latest-only/coalesced request handling and stale-response rejection

Intervals are an implementation detail, not an unread-semantics contract. Polling and event listeners must be cleaned up
when their components or authenticated user context change.

## V1 to V2 migration

Existing users had conversation-wide `chatReadStates.lastReadMessageId` values but no per-topic rows. V2 must preserve that
historical meaning without allowing the compatibility cursor to drift into future topic state.

### Old non-null row

A valid V1 `lastReadMessageId` is normalized and frozen into both `topicFallbackMessageId` and the initial
`legacyLastReadMessageId`.

### Old null row

Under V1, an existing row with `lastReadMessageId: null` meant the conversation was treated as fully read. Treating it as
"read nothing" would resurrect historical content. Migration instead finds the newest eligible conversation message that
existed at or before the row's historical `updatedAt`, using both the timestamp boundary and ObjectId time, and freezes that
message as the fallback and initial legacy boundary. Messages after that historical moment remain unread.

Migration must fail rather than guess if the V1 row lacks a usable `updatedAt`.

### Native V2 state

A newly created V2 row with `topicFallbackMessageId: null` means there is no inherited historical topic boundary. This is
intentionally different from the old V1 null-row meaning.

### Explicit topic state

If a `(userDid, conversationId, topicId)` row exists in `chatTopicReadStates`, its cursor is authoritative for that topic.
Fallback resolution checks the existence of the explicit field, so even an explicit null cursor does not fall back to the
migration boundary. Conversation reads never update topic rows.

The migration operation uses a compare-and-set filter over the row id, V1 version, compatibility cursor, and `updatedAt`.
It initializes V2 fields once. Re-running the migration skips V2 rows and does not change their frozen values.

## First-rollout deployment safety

Testing found a mixed-version deployment race: an old application process could write its topic-inclusive compatibility
cursor while V2 initialization was retrying. V2 could then freeze the old writer's newer value and hide unread topic
content. Compare-and-set alone cannot distinguish a legitimate historical V1 cursor from one advanced by an overlapping
old binary.

The first migration must therefore run offline:

```text
build new image
-> stop every old Circles writer
-> confirm all old writers are stopped
-> run the V2 migration
-> verify migrated state and required indexes
-> record the completion marker
-> start only the V2 application
-> verify the deployed Git SHA
```

Do not:

- run the first migration while any old application writer is active
- attempt a mixed-version, zero-downtime V1-to-V2 migration
- automatically restart or roll back to the old application binary after migration begins

The old binary retains incompatible topic-inclusive `lastReadMessageId` write semantics. The canonical operational flow is
implemented by `deploy-genesis2.sh` and described in [Production deployment](PRODUCTION_DEPLOYMENT.md). After successful
verification records the completion marker, later V2 deployments use the normal replacement path with the idempotent
verifier.

## Migration verification

`scripts/verify-chat-read-state-v2.mongo.js` fails deployment if it finds:

- remaining V1 rows
- incomplete V2 rows
- malformed V2 fallback or legacy cursor strings
- duplicate logical `(userDid, conversationId)` rows in `chatReadStates`
- duplicate logical topic-read rows
- failure to create or verify the required unique `chatTopicReadStates` identity index

Duplicate conversation read-state rows are reported, not repaired. Verification must fail rather than guess which row is
authoritative. Only after all checks and required index creation succeed does the verifier write the
`schemaMigrations/chat-read-state-v2` completion marker.

## Startup index gate

The V2 application also enforces the required unique topic-read-state index during Node startup:

- `src/instrumentation.ts` conditionally loads Node instrumentation only in the Node.js runtime
- `src/instrumentation-node.ts` awaits `ensureRequiredChatIndexes()`
- index failure terminates startup instead of allowing the server to operate without the uniqueness guarantee

Mongo initialization must remain Node-only. Do not statically import MongoDB into runtime-neutral instrumentation or
weaken startup failure into a warning.

## Required regression coverage

Future changes must preserve tests for at least:

- another user's zero-reply topic is unread
- the current user's starter is not unread
- opening a starter-only topic persists it as read
- persisted state survives reload, browser, and device changes
- a new reply in Topic B does not alter Topic A
- a closed-topic reply makes its parent conversation unread
- opening a conversation does not clear closed-topic replies
- own replies do not count
- complete topic and conversation totals agree
- stale cursor writes cannot regress a cursor
- malformed, fabricated, cross-conversation, and cross-topic cursors are rejected
- V1 null and non-null rows migrate without historical resurrection
- migration is idempotent and frozen fallbacks remain immutable
- duplicate logical read-state rows fail verification
- the unique topic-read index is enforced before safe startup

Relevant focused tests live under `src/lib/chat/*.test.ts`, including read-state migration, cursor validation, topic
semantics, and shared unread snapshot coverage.

## Design principle

Unread state follows one hierarchy:

```text
message
-> topic
-> conversation
-> Messages
```

Every layer is derived from persistent MongoDB state beneath it. A second browser-local or UI-specific source of truth can
break the hierarchy and must not be introduced.
