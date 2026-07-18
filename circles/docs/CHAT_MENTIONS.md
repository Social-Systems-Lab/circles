# Kamooni Chat Mentions

Concise architecture note for diagnosing mentions in normal chat and topic replies.

---

# 1. Purpose

Kamooni chat mentions work in both normal chat messages and topic replies.

They provide:

- clickable mention links in rendered message text
- targeted `chat_mention` notifications for mentioned conversation participants
- navigation back to the relevant conversation through `/chat/<roomId>`

This document covers chat mentions only. Non-chat mentions may use different feature-specific paths.

---

# 2. Canonical stored format

The canonical stored mention format is:

```md
[Display Name](/circles/id-or-handle)
```

The `react-mentions` markup template is:

```txt
[__display__](/circles/__id__)
```

Important rules:

- Store the markup value, not `plainTextValue`.
- Do not assume `event.target.value` contains the markup in every `react-mentions` version or callback path.
- Stripping the markup prevents both link rendering and notification detection.
- Preserve this format unless a coordinated migration updates storage, rendering, and notification parsing together.

---

# 3. Composer architecture

Chat composers use `react-mentions`:

- `MentionsInput` holds the editable text.
- `Mention` defines the `@` trigger, suggestion source, display transform, and markup template.
- The `Mention` markup prop is `[__display__](/circles/__id__)`.
- The display transform returns the display name so the editor remains readable.

The topic reply composer stores the `react-mentions` `newValue`, which is the markup-bearing value.

Topic replies also keep `replyTextRef` synchronized with `replyText`. The send handler reads from `replyTextRef.current` so the latest markup-bearing value is submitted even if React state has not flushed after mention selection.

Mention candidates come from conversation participants, not global arbitrary search. The suggestion id is the best available profile route identifier, typically handle first, then DID, then object id.

Mobile topic suggestions are forced above the cursor to keep the popup usable near the bottom composer. Reply autofocus is separate from mention handling; focusing the textarea after selecting a reply target must not alter mention storage.

---

# 4. Persistence path

Topic reply flow:

```txt
MentionsInput
-> replyText / replyTextRef
-> sendThreadReplyAction
-> sendThreadReply
-> ChatMessageDocs insert
```

Topic replies are stored in Mongo with a top-level `body` field, not `content.body`.

On fetch:

- `fetchThreadRepliesAction` returns `body`.
- `TopicCard` maps `reply.body` into `message.content.body`.
- `MessageRenderer` renders `message.content.body`.

The Mongo insert path must receive and store the raw markup string unchanged.

---

# 5. Rendering

Rendered chat messages flow through `MessageRenderer` and `renderFormattedChatBody`.

`renderFormattedChatBody` detects markdown-style mention links and parses them with the existing markdown rendering path. Mention links are identified by `/circles/` hrefs.

Current mention link styling:

- inline text
- semibold
- dark green
- subtle hover underline / darker green
- visible keyboard focus outline

Normal markdown links keep their separate styling.

Resolved July 18, 2026 rendering bug:

`getImageMessageBodyText` previously called `renderMentionsAsDisplayText` on all message bodies before rendering. That converted:

```md
[Second user](/circles/second-user)
```

into:

```txt
Second user
```

before the link renderer saw it.

Correction:

- preserve `rawBody` for normal text rendering
- compute `displayBody` only when comparing an image attachment filename
- return `rawBody` unless the body is just the image attachment name

---

# 6. Notification flow

`extractChatMentionIds` parses mention ids from the stored markup.

Recipient resolution:

- resolve each mention id by handle, DID, or ObjectId
- only current conversation participants are eligible
- the sender is excluded
- duplicate recipients are removed

Notification behavior:

- mentioned participants receive `chat_mention`
- mentioned DM/contact recipients receive `chat_mention`, not only `pm_received`
- non-mentioned DM/contact recipients may still receive `pm_received`

`chat_mention` is:

- a valid `NotificationType`
- not excluded from the bell
- grouped by `roomId`
- routed to `/chat/<roomId>`
- part of the visible notification experience

`pm_received` remains excluded from the general bell notification list.

---

# 7. Safety and privacy rules

- Never notify users who are not conversation participants.
- Never trust arbitrary `/circles/` links as notification targets.
- Never notify the sender about their own mention.
- Preserve the existing markup format.
- Avoid database migrations unless the stored markup format changes.

---

# 8. Debugging checklist

## A. Composer

- Confirm selecting a mention produces markup.
- Inspect `react-mentions` `newValue`, not only visible text.

## B. Before send

- Confirm the exact body passed to `sendThreadReplyAction`.

## C. Mongo

- Inspect the topic reply's top-level `body` field.

## D. Fetch

- Confirm `fetchThreadRepliesAction` returns `body` unchanged.

## E. Rendering

- Confirm `content.body` receives raw markup.
- Check that no helper calls `renderMentionsAsDisplayText` before `renderFormattedChatBody`.

## F. Notifications

- Confirm `extractChatMentionIds` finds the intended ids.
- Confirm each target resolves to a DID.
- Confirm the DID is in `conversation.participants`.
- Confirm `chat_mention` records exist.
- Confirm the bell filter does not exclude `chat_mention`.
- Confirm clicking routes to `/chat/<roomId>`.

---

# 9. Regression tests

Relevant checks:

- `src/lib/chat/mention-markup.test.ts`
- `src/lib/notifications/bell-filter.test.ts`
- `src/components/modules/chat/chat-topic-utils.test.ts`
- `npm run check:chat-actions`

---

# 10. Resolved incident summary

On July 18, 2026, topic mentions were investigated end to end.

Observed behavior:

- suggestions appeared correctly
- selected mentions initially degraded to plain names after send
- mentioned users did not receive visible mention notifications

The investigation traced client composer state, server action input, Mongo insertion, fetch output, rendering, and notifications separately.

Confirmed facts:

- the topic composer submitted markup correctly
- `sendThreadReplyAction` received markup correctly
- Mongo stored markup correctly in the topic reply `body`
- `fetchThreadRepliesAction` returned markup unchanged

Final root causes:

- premature display-text conversion in `getImageMessageBodyText`
- absence of a dedicated visible chat mention notification path

Fixes:

- raw markup is preserved through rendering
- `chat_mention` notifications are generated for mentioned conversation participants
- `chat_mention` is visible in the bell and routes back to the chat conversation
