
# Circles / Kamooni Architecture v12

Developer-facing overview of the current stabilized architecture.

------------------------------------------------------------------------

# 1. Top-level system

Browser / UI
│
▼
NGINX (TLS + reverse proxy)
├── / → Next.js app
├── /_next/image → Next.js image optimizer
└── /storage/* → MinIO
│
▼
Next.js server (Circles app)
├── App Router UI
├── API routes
├── Server Actions
├── Mongo chat logic
└── image optimization
│
├── MongoDB → users, circles, chat, events
├── MinIO → uploaded files / images
├── Qdrant → vector search
├── Synapse → legacy Matrix dependency (being removed)
└── Postgres → Synapse dependency (temporary)

------------------------------------------------------------------------

# 2. Identity invariant

A user's DID is stable.

Password reset must NOT:

- generate a new DID
- rotate the RSA keypair
- rewrite identity directories

Password reset must only:

- update password hash
- update encrypted private key material

Why this matters:

- DM visibility depends on stable DID references
- chat membership rows reference DID
- posts / events / members may reference DID

------------------------------------------------------------------------

# 3. Mongo‑native chat

Mongo is the authoritative chat backend.

Authoritative collections:

- chatConversations
- chatRoomMembers
- chatMessageDocs
- chatReadStates

Conversation types:

- dm
- group
- announcement

Key runtime rules:

DM visible if:

participants contains userDid

Group visible if:

membership row exists
(or owner‑circle safety net applies)

Announcement visible if:

conversation.type === "announcement"

Announcement conversations bypass membership checks because they are
system‑generated broadcast channels.

On every message insert:

chatConversations.updatedAt = now

------------------------------------------------------------------------

# 4. Image pipeline

Images are stored in MinIO and absolute URLs are written into MongoDB at
upload time.

Flow:

1. user uploads image
2. backend stores object in MinIO
3. backend writes absolute URL into MongoDB using CIRCLES_URL
4. browser requests /storage/...
5. nginx proxies to MinIO
6. Next.js /_next/image + Sharp generate thumbnails

Critical consequence:

If CIRCLES_URL is wrong during upload, broken URLs are permanently
stored and require DB repair.

------------------------------------------------------------------------

# 5. Deployment verification

Production exposes:

GET /api/version

Returns:

- version
- gitSha
- buildTime

Docker builds generate a VERSION file embedded in the runtime image.

Useful checks:

curl https://kamooni.org/api/version

docker compose exec circles cat /app/VERSION

------------------------------------------------------------------------

# 6. CI safety layer

GitHub Actions runs:

1. dependency install
2. fast TypeScript check
3. production build

Purpose:

- catch TS errors before build
- block broken PRs before merge
- prevent broken deploys reaching prod

------------------------------------------------------------------------

# 7. Deployment workflow

Local:

1. update main
2. work on branch
3. push branch
4. open PR
5. merge to main

Genesis2:

1. git fetch origin
2. git checkout main
3. git reset --hard origin/main
4. ./deploy-genesis2.sh main
5. verify /api/version

------------------------------------------------------------------------

# 8. System Message Engine

The messaging layer now includes a normalized **system message engine**.

Supported systemType values:

- welcome
- group_chat_joined
- group_chat_left
- group_chat_member_added
- group_chat_member_removed
- group_chat_admin_promoted
- announcement
- platform_broadcast

Rendering modes:

1. activity row (membership events)
2. system message (welcome / announcements)
3. normal user message

Important rule:

System messages are used **only for group chat and platform messaging
events**.

They are **not used for circle membership actions** or social feed
activity.

------------------------------------------------------------------------

# 9. Group Chat Moderation Model

Group chat currently supports a simple moderation structure.

Roles:

- admin
- member

Admin permissions:

- add members
- remove members
- promote members to admin
- send announcements

System events generated:

- group_chat_member_added
- group_chat_member_removed
- group_chat_admin_promoted
- group_chat_joined
- group_chat_left
- announcement

This mirrors the moderation model used by WhatsApp / Slack style group
messaging.

------------------------------------------------------------------------

# 10. Announcement Messaging

Announcement messages are admin-authored system messages.

Metadata:

systemType: announcement
source: admin

Properties:

- repliesDisabled = true
- markdown formatting allowed
- rendered as system-style message
- visually distinct from normal messages

Announcement messages may appear in:

- group chats
- dedicated announcement channels

------------------------------------------------------------------------

# 11. Platform Broadcast System

A platform-wide broadcast system has been introduced.

Admin UI:

/admin → System Messages → Platform Broadcast

Admin can:

- write markdown message
- preview to self
- activate or deactivate broadcast

Runtime flow:

Admin message
│
▼
platform-broadcasts.ts
│
▼
syncPlatformBroadcastsForUser(userDid)
│
▼
Creates or updates conversation:

type: "announcement"
handle: PLATFORM_ANNOUNCEMENT_HANDLE

This produces a personal **Platform Announcements** chat thread for each
user.

Key properties:

- read-only for normal users
- messages appear as system announcements
- unread counters supported
- membership rows not required

------------------------------------------------------------------------

# 12. Auth Cookie Stabilization

Auth cookie handling has been centralized.

Location:

src/lib/auth/cookie.ts

Purpose:

- single source of truth for reading auth cookies
- consistent behavior across server actions and middleware
- prevents UI/server auth drift

JWT secret resolution now supports fallback:

CIRCLES_JWT_SECRET || JWT_SECRET

Middleware origin resolution now uses:

request.url

This stabilizes:

- localhost dev environments
- multiple dev ports
- staging environments

------------------------------------------------------------------------

# 13. Messaging Event Flow

Messaging actions follow this runtime flow:

User action
│
▼
Server Action
│
▼
system-message-events.ts
│
▼
createMessage()
│
▼
chatMessageDocs
│
▼
chat-room.tsx renderer

This architecture allows new system message types to be added without
changing chat core logic.

------------------------------------------------------------------------

# 14. Current status

Circles / Kamooni is now:

- Mongo-native for chat
- DID-stable
- deployment-verifiable
- CI-guarded
- system-message driven
- group moderation enabled
- announcement-capable
- platform broadcast capable

Operationally stable.

------------------------------------------------------------------------

# 15. Remaining work

Low-risk polish:

- "Messages loading..." sidebar state
- mention styling polish
- announcement visual styling polish
- minor UX cleanup

Later-phase work:

- remove Matrix helpers
- remove Synapse / Postgres containers
- remove provider branching
- finalize pure Mongo-only runtime
