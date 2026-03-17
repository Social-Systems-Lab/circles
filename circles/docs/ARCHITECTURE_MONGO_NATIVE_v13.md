# Circles / Kamooni — Mongo-Native Architecture v13

Last updated: 2026-03-11
Status: Production-aligned snapshot after Platform Announcements deployment
Primary repo: `~/circles/circles`
Production server: `Circles-Genesis2`
Production path: `/root/circles/circles`
Primary deploy command: `deploykamooni`

---

## 1. Purpose of this document

This document is the current working architecture snapshot for the Kamooni / Circles platform after the Mongo-native chat migration and the first production rollout of Platform Announcements.

It is intended to help future debugging, Codex prompts, onboarding, and production-safe iteration.

The platform is a live production system. Changes should be:

- small
- reversible
- verified locally first
- committed to GitHub main
- deployed from `origin/main`
- verified via runtime version checks

---

## 2. High-level runtime architecture

Browser
↓
NGINX
↓
Next.js app
↓
MongoDB
MinIO
Qdrant

Legacy components still present for compatibility:

- Synapse
- Postgres

These legacy components should not be used for new feature work unless explicitly required.

Mongo is now the authoritative backend for the active chat system.

---

## 3. Repository and deployment layout

Repository root:

`~/circles`

Main application repo:

`~/circles/circles`

Important production path:

`/root/circles/circles`

Main application code:

`src/`

Key areas:

- Chat backend: `src/lib/data/mongo-chat.ts`
- Chat actions: `src/components/modules/chat/actions.ts`
- Mongo chat access helpers: `src/components/modules/chat/mongo-actions.ts`
- System chat logic: `src/lib/chat/`
- Platform broadcasts: `src/lib/data/platform-broadcasts.ts`
- Admin system message UI: `src/components/modules/admin/`
- Storage / image URL behavior: MinIO via `/storage/*`

---

## 4. Development workflow rules

Preferred workflow:

1. Investigate first
2. Make the smallest safe fix
3. Test locally
4. Commit locally
5. Push to GitHub main
6. Pull / deploy on Genesis2
7. Verify deployed runtime version

Permanent workflow rule:

All AI-generated code changes must end in the main repo at:

`~/circles/circles`

They must not be left only inside Codex worktrees.

Before finishing a task, verify with:

```bash
cd ~/circles/circles && git status --short
```

Production safety rules:

- never hot-edit production without syncing back to Git
- never deploy without runtime version verification
- never bypass `origin/main`
- never mutate DID identity model casually
- prefer narrow patches over refactors

---

## 5. Mongo chat architecture

Mongo is the authoritative chat backend.

Core collections:

- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Critical rule:

`chatConversations.updatedAt` must be updated on every message.

This controls sidebar ordering and recency behavior.

### Conversation types currently relevant

- `dm`
- `group`
- `announcement`

### Access model

#### DM conversations

Authorized via `participants` on the conversation.

#### Group conversations

Authorized via active membership in `chatRoomMembers`.

#### Announcement conversations

Authorized via `participants` on the conversation, like a DM.

This is important.

Announcement conversations must **not** depend on `chatRoomMembers`.

This was the root cause of the final Platform Announcements bug: the sidebar showed the conversation, unread counts existed, messages were stored, but opening the thread failed because announcement conversations were being forced through group membership validation.

The production fix was to treat:

- `dm`
- `announcement`

as participant-authorized conversation types in `resolveMongoConversationAccess()`.

---

## 6. Platform Announcements system

Platform Announcements are now implemented using the Mongo-native chat system.

### Admin entry point

Admins create or update a platform-wide chat broadcast from:

`/admin → System Messages → Platform Broadcast (Chat)`

### Backend flow

Admin UI
→ `src/lib/data/platform-broadcasts.ts`
→ Mongo persistence in platform broadcast records
→ `syncPlatformBroadcastsForUser(userDid)`
→ injects message docs into a special announcement conversation for that user

### Conversation shape

Announcement conversation:

- `type: "announcement"`
- handle: `kamooni-announcements`

The system gives each user a personal read-only announcement thread.

### Current live behavior

Working:

- admin panel save
- preview to self
- broadcast persistence
- sync into user inbox/chat
- sidebar visibility
- unread counts
- user access to open thread
- production deployment verified

### Current architectural rule

Announcement chats behave like DM-style system chats:

- authorized by `participants`
- visible in chat list without group membership checks
- intended to be read-only for normal users

### Recommended hardening

Even if replies are disabled in metadata/UI, add an explicit server-side send guard so normal users cannot reply to `announcement` conversations.

Recommended rule:

- if `conversation.type === "announcement"`, reject user send attempts unless explicitly allowed for system/admin behavior

---

## 7. Welcome messages and system sender direction

Current UX direction:

- Welcome message and Platform Announcements should visually feel like they come from the same system sender
- the avatar should use the Kamooni logo consistently
- future refinement may merge the first welcome message and later announcements into one long-lived system channel

Proposed long-term pattern:

1. user receives a welcome message in the system channel
2. later platform broadcasts arrive in the same channel
3. all system-origin messages share sender identity and avatar styling

This is a UX choice, not yet a hard architectural requirement.

For now, consistency of sender identity and avatar is the next useful improvement.

---

## 8. Admin System Messages panel

Current panel already supports:

- welcome template
- platform broadcast
- banner settings

Requested next UI improvements:

### Platform Broadcast actions

Desired buttons:

- Save
- Preview to self
- Broadcast (Send)

This is preferable to overloading “Save” with both draft persistence and publication semantics.

### Markdown usability

Nice-to-have improvement:

A lightweight markdown helper / mini editor so system messages are easier to compose without requiring raw markdown knowledge.

This does not need to be a full rich text editor. A small pragmatic toolbar would likely be enough.

---

## 9. Image and avatar architecture

Images are stored in MinIO.

URLs are written into MongoDB at upload time using `CIRCLES_URL`.

Example:

`https://kamooni.org/storage/<owner>/<filename>`

Important rule:

If `CIRCLES_URL` is wrong at upload time, broken URLs are permanently written to MongoDB and later require data repair.

### Current system-message avatar requirement

For system-origin chat messages:

- avatar should resolve to the Kamooni logo
- welcome and broadcast avatars should match
- sender identity should be visually consistent

This is mainly a data-shaping / presentation consistency issue, not a storage-system issue.

---

## 10. Deployment workflow

Preferred production deployment:

```bash
cd /root/circles/circles
./deploy-genesis2.sh main
```

Shortcut:

```bash
deploykamooni
```

### What `deploy-genesis2.sh` does

- confirms working directory
- refuses dirty working tree
- fetches the target branch from origin
- checks out / resets hard to `origin/<branch>`
- exports `GIT_SHA` and `BUILD_TIME`
- builds the `circles` image
- recreates the `circles` container
- checks `/api/version`

### Production verification rule

Always verify deployed runtime version after deployment.

Primary check:

```bash
curl -sS https://kamooni.org/api/version && echo
```

Expected result:

- returned `gitSha` matches deployed commit

Optional internal checks:

```bash
docker compose exec -T circles cat /app/VERSION
```

and

```bash
curl -sS http://localhost:3000/api/version && echo
```

---

## 11. `/api/version` behavior

This is important and should be remembered during production debugging.

The version route reads from:

1. `/app/VERSION` (preferred)
2. environment fallbacks: `GIT_SHA`, `BUILD_TIME`

Relevant file:

`src/app/api/version/route.ts`

Docker build path:

- `Dockerfile` writes `/app/VERSION`
- `docker-compose.yml` passes `GIT_SHA` and `BUILD_TIME`
- `deploy-genesis2.sh` exports those values before build

### Important debugging lesson

A mismatch can exist temporarily between:

- public `https://kamooni.org/api/version`
- local container `http://localhost:3000/api/version`
- `/app/VERSION`

If public and container values differ:

1. verify repo SHA on server
2. verify `/app/VERSION` inside the running container
3. verify local app port 3000 response
4. then inspect NGINX / proxy path before assuming deploy failure

This prevents false alarms when the app is already correctly deployed but the public path appears stale.

---

## 12. NGINX role

NGINX terminates HTTPS and proxies requests to the Next.js container.

Important current roles:

- proxy all main app traffic to `circles:3000`
- expose `/storage/` from MinIO
- support Next.js image optimizer path rewriting for storage URLs

Relevant config:

`nginx/nginx.conf`

During the Platform Announcements deployment verification, public `/api/version` briefly appeared stale while the app container was already correct. This reinforced the need to separately verify:

- public route
- local app route
- in-container version file

---

## 13. Known next improvements

These are the next sensible, low-risk improvements.

### 13.1 Disable replies to announcement threads

Add explicit server-side enforcement so users cannot send messages to announcement conversations.

### 13.2 Normalize sender identity across welcome + broadcast

- same sender identity
- same Kamooni avatar
- same visual origin

### 13.3 Improve System Messages admin UX

Add clearer action separation:

- Save
- Preview to self
- Broadcast (Send)

### 13.4 Add lightweight markdown helper UI

A small toolbar for bold, italic, links, lists, and line breaks would improve operator usability.

### 13.5 Consider future unified system channel

Potential future behavior:

- first welcome message starts the channel
- later broadcasts continue in same thread

This is optional and should only be done if it simplifies user experience without complicating the data model too much.

---

## 14. Recommended Codex prompt style for this codebase

When using Codex for Kamooni / Circles:

- inspect first
- make the smallest safe fix
- avoid broad refactors
- apply changes locally in `~/circles/circles`
- commit locally
- push to GitHub main
- pull / deploy on Genesis2
- verify `/api/version`
- verify `git status --short`

Good fixes are usually:

- 1 to 10 line patches
- narrow condition updates
- minimal surface area
- production-verifiable

---

## 15. Snapshot of current production milestone

As of v13:

- Mongo-native chat is the active chat backend
- Platform Announcements are working in production
- users can open and read announcement threads
- announcement access bug is fixed
- deployment verification path is documented
- version verification method is now clearer

This is a meaningful stabilization point for the Mongo-native messaging system.

