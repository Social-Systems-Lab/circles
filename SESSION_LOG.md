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

## Session 005 — 2026-05-02

### What we did
- Fixed auto-scroll fighting user scroll: removed entire userHasScrolledUp state system,
  replaced with ref-only approach
- Fixed topic starters not appearing in chat: fetchTopicStartersAction fetches all topic
  starters regardless of the 50-message recency limit, merges into message list on load
- Fixed reply preview bar too wide: overflow-hidden on input bar container, max-w-full on
  reply preview div
- Fixed reply preview text truncation: truncate → line-clamp-3
- Fixed content scrolling behind input bar: z-10 on fixed input bar container
- Fixed chat not opening at last message on room switch: reset hasInitiallyScrolledRef on
  roomId change
- Fixed mobile scroll container padding: paddingBottom now accounts for 72px mobile nav
- Added CSS scroll anchoring (overflowAnchor: auto) to scroll containers so topic reply
  loads don't jump the viewport
- Restored onTopicLoaded callbacks to re-fire scrollToBottom after each topic loads replies
- Restored auto-scroll on send: userHasScrolledUpRef (ref only, no state/button) tracks
  whether user has scrolled up; sending always scrolls to bottom; new incoming messages
  scroll to bottom only if user is already there
- Removed broken visualViewport effect (was corrupted to markdown hyperlink by Claude UI)

### Decisions made
- No scroll-to-bottom button for now — removed entirely, can re-add cleanly later
- Topic layout unchanged — opens downward, jumpiness on load acceptable for now
- Smooth scroll animation on send is a nice UX win — consider for page loads in future

### Files changed
- circles/src/components/modules/chat/chat-room.tsx
- circles/src/lib/data/mongo-chat.ts

### Deployed?
Yes — deployed to Cleura, confirmed working on prod

### Known issues / future tasks
- Occasional missed scroll to latest message on first load (low priority)
- Topic reply load jumpiness on initial page load (acceptable for now)
- Smooth scroll animation on page load (future session)
- Mobile reply panel keyboard viewport fix (removed broken version, not yet replaced)
- Down arrow scroll button (removed, can be re-added cleanly)
- Group chat topic notifications not yet implemented
- LiveKit video meeting integration pending
- Dependabot: 59 vulnerabilities (3 critical, 19 high)

### What's next (candidates for session 006)
- Mobile UX review
- Re-add scroll-to-bottom button cleanly
- Group chat topic notifications
- LiveKit integration
- Altruistic Wallet feature work

## Session 006a — 2026-05-10 to 2026-05-11

### What we did
- Added platform account lifecycle: `accountStatus` (pending_verification |
  active | rejected), `signupOrder`, `verifiedAt`, `verifiedBy`
- Added Founding member fields: `isFoundingMember`, `foundingMemberNumber`,
  `foundingMemberGrantedAt`
- New `platformSettings` collection with `foundingMemberWindowOpen` (default
  true), `foundingMemberCap` (default 1000), and atomic counters
  `signupOrderCounter` and `foundingMemberCounter`
- Signup flow assigns pending status + signupOrder atomically (race-safe
  via $inc on counter doc)
- New admin actions: verifyAccount, rejectAccount, grantFoundingMember,
  revokeFoundingMember
- New `lib/data/account-lifecycle.ts` with shared `activateUserAccount`
  helper — used by both Users-tab Verify and Verification Requests Approve
  flows so they stay in lock-step
- Admin users tab: status filter dropdown, accountStatus / signupOrder /
  founding-member badges, Verify / Reject / Grant Founding / Revoke
  Founding action buttons
- Removed legacy "Verify User" button — superseded by Verify Account
- Stripe + Donorbox webhooks: auto-activate pending accounts on payment;
  set verifiedBy: "system:payment" when transitioning from pending to
  active; do not overwrite on renewals
- New `lib/auth/perks.ts`: hasContributorPerks (active + isMember OR
  isFoundingMember OR manualMember), canInteract (active OR admin),
  canSeeFoundingBadge (self-only visibility rule)
- Permission gates in 4 files now route through hasContributorPerks
- Migration script: idempotent, dry-run by default, backfills lifecycle
  fields, assigns founding numbers in createdAt order, initialises
  counters via $set, initialises window/cap defaults via $setOnInsert

### Decisions made
- Founding-member status is admin-only operational metadata: invisible to
  other users; founding member sees their own badge only as a quiet
  reminder that perks depend on staying active
- "Supporter" is the only user-visible perk tier; paid, founding, and
  manual-override users all render identically (relabel pass scheduled
  for session 007)
- `manualMember` bypasses the accountStatus guard in hasContributorPerks
  (existing admin override; semantics preserved)
- Founding number issuance uses atomic $inc counter; cap check uses live
  countDocuments — different semantics on purpose (numbers never reused,
  revocations free up slots for future grants)
- Re-grant after revoke restores the original foundingMemberNumber; does
  not claim a new one
- Payment paths auto-verify (verifiedBy: "system:payment") but do not
  auto-grant founding — founding remains admin-only
- KYC pipeline will slot into the existing verificationStatus field when
  needed; no structural change required from this session

### Files changed
- circles/src/models/models.ts
- circles/src/lib/data/platform-settings.ts (new)
- circles/src/lib/data/account-lifecycle.ts (new — shared activation)
- circles/src/lib/auth/auth.ts
- circles/src/lib/auth/perks.ts (new)
- circles/src/components/modules/admin/actions.ts
- circles/src/components/modules/admin/tabs/users-tab.tsx
- circles/src/lib/data/verification-workflow.ts (Approve flow refactor)
- circles/src/app/api/stripe/webhook/route.ts
- circles/src/app/api/donorbox/route.ts
- circles/src/lib/data/membership.ts
- circles/src/app/circles/[handle]/settings/about/page.tsx
- circles/src/app/circles/[handle]/settings/about/actions.ts
- circles/src/components/circle-wizard/actions.ts
- circles/src/components/circle-wizard/basic-info-step.tsx
- circles/scripts/migrate-account-lifecycle.ts (new)

### Bugs found and fixed mid-session
- Partial settings document caused `getPlatformSettings()` to return
  `foundingMemberWindowOpen: undefined` (whole-doc default never fired).
  Fixed with per-field fallback and `$setOnInsert` in migration.
- Two verify buttons on admin row ("Verify User" legacy and "Verify
  Account" new) — confusing and dangerous. Legacy button removed.
- Verification Requests "Approve" called a separate code path that only
  set isVerified, not accountStatus / founding. Fixed by extracting
  `activateUserAccount` used by both paths.

### Surprises and notes for future readers
- Two functions named `approveVerificationRequest` exist in the codebase
  (admin/actions.ts:889 and lib/data/verification-workflow.ts). Different
  signatures, only the workflow one is called. The actions.ts version is
  unused — candidate for deletion in a future cleanup session.
- Local dev DB was lost mid-session after a Mac freeze and Docker
  restart: `.env.local` has MONGO_ROOT_USERNAME/PASSWORD empty while
  MONGODB_URI has credentials inline. docker-compose reads the empty
  vars on container init, so a fresh-volume init goes wrong. Tighten in
  a future cleanup by populating both or switching to one source.
- Stale Next.js bundle nearly led to misdiagnosing a fixed bug as still
  broken. After any session 006a-style refactor, `rm -rf .next && bun
  dev` before smoke-testing.

### Deployed?
[Fill in once Cleura deployment is done]
Local migration applied and verified. Cleura deployment pending — needs
a fresh dry-run against Cleura DB before --apply, plus manual review of
any test/inactive accounts that shouldn't claim founding numbers.

### Known issues / future tasks
- **Interaction-gate audit needed.** Several features still check
  `isVerified` / `verificationStatus === "verified"` directly rather
  than `canInteract` or `hasContributorPerks`. Pending users can
  currently trigger some features they shouldn't (e.g. "Verify Human"
  flow surfaced during testing). Needs a dedicated audit pass.
- **Admin documentation panel needed.** Current admin row has many
  badges (Admin, Active, Verified, Manual, Founder, signupOrder) and
  many buttons. New admins won't know what each does. Plan: collapsible
  help panel above the user list, scheduled for session 007 alongside
  the Member → Supporter terminology rename.
- **Legacy `toggleUserVerification` action** in admin/actions.ts has no
  UI callers anymore; can be deleted in a cleanup pass.
- **Duplicate `approveVerificationRequest`** in admin/actions.ts:889
  is unused; can be deleted in the same cleanup pass.

### What's next
- 006a Cleura deployment (next)
- Session 006b: invite credits + accountInvites collection +
  queue-skip flow (priority verification for invitees)
- Session 007: UI string relabelling Member → Supporter, plus admin
  documentation panel
- Session 008: Follow vs Join split for circles
- Session 009 (proposed): Inactivity lifecycle (3-month email, fade on
  map, archive after 1 year)
- Session 010 (proposed): Interaction gate audit + contact-restriction
  privacy setting (only contributing members can contact me)