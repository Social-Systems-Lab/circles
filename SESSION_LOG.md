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
