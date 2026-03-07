# AI_DEVELOPER_CONTEXT.md

Kamooni / Circles — AI Developer Context  
Last updated: 2026-03-07

This file gives AI coding agents the minimum reliable context needed to work safely on Kamooni / Circles without re-discovering core architecture each time.

---

## 1. Repository + operator assumptions

Repository:
`~/circles/circles`

Production server:
`Circles-Genesis2`

Production path:
`/root/circles/circles`

Primary operator constraints:
- Give exact commands only
- One step at a time
- Prefer Codex patches over manual edits
- Minimize risky production changes
- Smallest safe fix first
- Apply changes locally, commit, push, pull on Genesis2, then deploy
- Never assume the operator can safely free-edit code by hand

When writing future Codex prompts, include:
- use `~/circles/circles` as the repository
- do not use any `.codex` worktree path
- include the workflow: apply changes locally, commit, push, pull on Genesis2, build/deploy

---

## 2. Current production architecture

Active runtime stack:

Browser  
↓  
NGINX  
↓  
Next.js app  
↓  
MongoDB  
↓  
MinIO  
↓  
Qdrant

Legacy / disabled-by-default services:
- Synapse
- Postgres

These remain only as legacy/profile-based services and are not part of the active runtime path.

---

## 3. Chat architecture (important)

Chat is now fully Mongo-native.

Authoritative collections:
- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Important rule:
- `chatConversations.updatedAt` must be updated on every message send
- this controls chat list ordering

Important behavior:
- chat list visibility is membership-driven
- removed / left group chats must disappear from the list
- membership state is represented by fields such as:
  - `status`
  - `active`
  - `isActive`

Current rule of thumb:
- do not rely on historical `participants` alone for group visibility
- use active membership logic

Soft-deactivation behavior:
- leaving a group should set membership to inactive rather than hard-delete it
- removed users should not be silently reactivated by generic add-member paths

DMs:
- DMs should remain visible and function independently of circle membership
- avoid reintroducing old Matrix assumptions

---

## 4. Matrix migration status

Matrix runtime has been removed.

Removed / retired:
- Matrix runtime chat paths
- Matrix provider fallback logic
- matrix-js-sdk
- Matrix debug scripts
- active Matrix app dependencies

Some legacy fields may still exist in models/documents for compatibility:
- `matrixRoomId`
- `matrixNotificationsRoomId`
- `matrixUsername`
- `fullMatrixName`

These are legacy metadata, not active runtime dependencies.  
Do not treat them as proof that Matrix is still part of the live stack.

---

## 5. Current deployment architecture

Production images are built locally and pushed to GHCR.

Registry:
`ghcr.io/social-systems-lab/circles`

Deployment model:
local build → GHCR push → Genesis2 pull → container restart

The server should not build the application image during normal deploys.

Typical deploy flow:
1. local commit + push
2. `deploykamooni`
3. Genesis2 pulls image
4. container restarts
5. verify `/api/version`

Rollback model:
- image-based rollback by git SHA tag
- use `rollbackkamooni <sha>`

Important:
- `/api/version` is the source of truth for what is actually running
- always verify deployed `gitSha`

---

## 6. Image / media architecture

Images are stored in MinIO.

Critical rule:
- absolute image URLs are written into MongoDB at upload time using `CIRCLES_URL`
- if `CIRCLES_URL` is wrong, broken URLs are permanently written and database repair may be required

Delivery path:
- browser requests `/storage/...`
- nginx proxies `/storage/*` to MinIO
- Next.js handles optimized image requests through `/_next/image`
- `sharp` must exist in the runtime image

Do not assume broken images are purely a frontend issue.  
Check:
- MongoDB stored URLs
- `CIRCLES_URL`
- nginx proxy
- `sharp`
- Next image config

---

## 7. High-value Mongo indexes already added

Chat-related indexes already exist for core hot paths.

ChatConversations:
- `{ participants: 1, type: 1, archived: 1, updatedAt: -1 }`
- `{ circleId: 1, type: 1, archived: 1 }`

ChatRoomMembers:
- `{ userDid: 1, chatRoomId: 1 }`
- `{ chatRoomId: 1 }`

ChatMessageDocs:
- `{ conversationId: 1, _id: 1 }`

ChatReadStates:
- `{ userDid: 1, conversationId: 1 }`

Do not add speculative chat indexes without checking actual query shapes.

---

## 8. Current local dev gotcha

When running the app locally outside Docker:
- do not point `MONGODB_URI` at `db`
- use `127.0.0.1` / `localhost`

Inside containers:
- `db` is correct

Outside containers:
- `db` will fail DNS resolution

---

## 9. Development style expected from AI agents

Prefer:
- smallest safe patch
- inspection before modification
- minimal blast radius
- boring explicit code
- grounded verification steps

Avoid:
- broad refactors
- renaming files without clear need
- mixing unrelated fixes
- reintroducing Matrix abstractions
- editing production directly without Git-backed changes

When proposing a fix, try to return:
1. diagnosis
2. exact files to change
3. minimal diff scope
4. local verification commands
5. git commands
6. Genesis2 pull/deploy commands
7. production verification steps

---

## 10. Current strategic priorities

Infrastructure has recently been stabilized.

Good next tasks are usually:
- onboarding improvements
- membership / invite flows
- welcome messages
- chat UX polish
- product-level growth features

Lower priority now:
- rebuilding chat architecture from scratch
- reintroducing protocol abstractions
- large-scale infra changes unless clearly necessary

---

## 11. Best place to store this file

Recommended location:
- repo root as `AI_DEVELOPER_CONTEXT.md`

Optional secondary copies:
- summarized note in `ARCHITECTURE_MONGO_NATIVE_v11.md`
- mention in developer onboarding docs

Why repo root:
- easy for Codex / AI tools to find
- easy to reference in prompts
- stays close to the codebase
