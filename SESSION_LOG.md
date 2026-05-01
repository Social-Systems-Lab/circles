# SESSION_LOG.md
# Kamooni / Circles — Session Log

Paste this file (along with CLAUDE_CONTEXT.md) at the start of each Claude session.
Update this file at the end of every session before closing.

---

## Current Status

Platform version: 0.8.15
Live at: https://kamooni.org
Last known stable deploy: 2026-04-28
Last commit: 383b30e (prod) — local has unpushed session 003 changes

---

## Production Environment

Production runs on Cleura, NOT Genesis2.
- SSH: ssh ubuntu@91.123.202.241 then sudo -i
- App path: /root/circles/circles/circles
- Deploy: git pull --ff-only origin main, then docker compose up -d --build circles nginx cron
- Verify: curl -I https://kamooni.org
- No screen session needed when deploying from Terminal

---

## Session 001 — 2026-04-27

### What we did
- Onboarded Claude to the Kamooni project
- Established AI-assisted development workflow
- Created CLAUDE_CONTEXT.md and SESSION_LOG.md
- Implemented chat bubble alignment (own right/blue, others left/white)

### Deployed?
Yes — commit 13204aa

---

## Session 002 — 2026-04-28

### What we did
- Built Topics feature: named inline sub-conversations with hashtags
- Inline expand/collapse with localStorage state persistence
- DM notifications for topic replies
- Renamed Threads → Topics, lightbulb icon
- Fixed React hooks order error in TopicCard

### Deployed?
Yes — commit 383b30e

---

## Session 003 — 2026-04-29

### What we did
- Author first name shown on topic replies (non-own messages, group chats)
- Unread reply count badge on collapsed topic card (blue number on lightbulb)
- Badge updates without refresh via useEffect watching thread.replyCount
- Edit support for topic replies (own messages only, inline textarea)
- Emoji reactions on topic replies (with correct keyed map format conversion)
- Attachment support in topics (threadId passed through sendAttachmentAction → createMessage)
- Action pill (edit/reply/emoji) on hover — matches main chat style
- Pill positioning: bottom-aligned, correct side per message owner
- Reply button in topic pill prefills input with @name
- Icon sizes matched to main chat (h-4 w-4)
- Bubble style unified with main chat (white bg, shadow-md, timestamp below bubble)
- Fixed reactions runtime error (Array.isArray guard on reactors)
- Fixed reaction display (raw [{emoji,userDid}] array converted to keyed map on load)
- Fixed authorName DID leak (filter screens out DID strings and system identifiers)

### Files changed
- circles/src/components/modules/chat/chat-room.tsx (major)
- circles/src/components/modules/chat/mongo-actions.ts

### Deployed?
NOT YET — changes are local only. Push and deploy at start of next session or now.

### Deploy commands (when ready)
On Mac terminal:
cd /Users/timmidnightmac/circles && git add . && git commit -m "Topics: author names, unread badge, edit, emoji reactions, attachments, unified bubble style" && git push origin main

On Cleura server:
ssh ubuntu@91.123.202.241
sudo -i
cd /root/circles/circles/circles
git pull --ff-only origin main
docker compose up -d --build circles nginx cron
curl -I https://kamooni.org

### Known issues / future tasks
- Author names not yet showing (enrichment runs but names may not be reaching render — investigate next session)
- Group chat topic notifications not yet implemented (sendConversationMessageNotifications only handles DMs)
- Topic attachments: threadId is passed but fetchThreadReplies may not return attachment messages — verify
- CLAUDE_CONTEXT.md still references Genesis2 — update to Cleura
- Dependabot: 59 vulnerabilities (3 critical, 19 high) — needs dedicated session
- Nested repo path on Cleura (/root/circles/circles/circles) — future cleanup

### What's next (candidates for session 004)
- Investigate and fix author names not showing in topic replies
- Verify topic attachments persist correctly on reload
- Group chat topic notifications
- Mobile UX review
- LiveKit video meeting integration
- Altruistic Wallet feature work
- Dependabot vulnerability review

---

## How to use this log

At the end of each session, append a new entry:

## Session NNN — YYYY-MM-DD

### What we did
### Decisions made
### Files changed
### Deployed?
### What's next

---

## Session 004 — 2026-05-01

### What we did
- Fixed scroll-to-bottom arrow button: changed from `absolute` to `fixed` positioning so it appears above the input bar on both mobile and desktop
- Added avatars to topic reply chains: shows avatar only on last message in a chain (matching main chat behaviour), with spacer div for non-last messages
- Topic reply chain polish: timestamps only on last in chain, tighter spacing, `isFirstInChain` and `isLastInChain` computed for replies
- Switched all timestamps to 24h clock (`hour12: false`) across main chat, topic replies, and `formatChatDate`
- Moved timestamps inside bubbles (WhatsApp style) — main chat and topic replies
- Timestamps always right-aligned inside bubble to avoid clash with reaction badges
- `formatChatDate` simplified to time-only (date handled by existing date pill)
- Fixed `sameAuthor()` to compare `createdBy` DID string instead of `author._id` ObjectId — this was preventing chain detection from working
- Main chat bubble corner rounding via inline `borderRadius` style (bypasses Tailwind JIT) — WhatsApp-style 12px uniform radius
- Topic reply bubble corner radius matched to main chat (12px uniform)
- Added emoji picker button to main chat input bar (matching Topic input bar)
- Reaction badges: hide count when only 1 of a kind
- Reaction badges: removed blue border, unified styling across main chat and topics
- Topic reply reactions moved inside bubble column, compact styling
- Updated CLAUDE_CONTEXT.md: replaced Genesis2 references with Cleura deployment details
- Updated AGENTS.md context: Cleura is now the production server

### Decisions made
- Uniform 12px border radius on all bubbles (not WhatsApp-style variable corners) — simpler and avoids Tailwind JIT issues
- Timestamps always right-aligned inside bubble regardless of sender
- Reaction count hidden when count is 1 (less noise)
- Topic reply avatars only on last in chain, matching main chat pattern
- Emoji picker in input bar (not hover toolbar) — more discoverable, works on mobile

### Files changed
- `circles/src/components/modules/chat/chat-room.tsx`
- `CLAUDE_CONTEXT.md`

### Deployed?
Yes — pushed to main, deployed to Cleura via `git pull` + `docker compose up -d --build circles nginx cron`
Commit: 19e72db

### Known issues / future tasks
- Topic reply reaction badge alignment: currently inside bubble (functional but not floating over bubble edge like main chat) — revisit in future session
- Dependabot: 59 vulnerabilities (3 critical, 19 high) — needs dedicated session
- Nested repo path on Cleura (/root/circles/circles/circles) — future cleanup
- Group chat topic notifications not yet implemented
- LiveKit video meeting integration pending

### What's next (candidates for session 005)
- Mobile UX review of all chat changes
- Topic reaction badge floating (WhatsApp style) — clean implementation
- Group chat topic notifications
- LiveKit video meeting integration
- Altruistic Wallet feature work
- Dependabot vulnerability review
