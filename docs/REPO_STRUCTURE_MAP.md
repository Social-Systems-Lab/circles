# Repo Structure Map — Circles / Kamooni

This map is intentionally practical. It is meant to help humans and AI tools find the right file quickly.

## Root

- `src/` → main application code
- `public/` → static assets
- `docs/` → internal documentation
- `.github/workflows/` → CI / GitHub Actions
- `docker-compose.yml` → production stack definition
- `Dockerfile` → app image build
- `deploy-genesis2.sh` → production deploy script

## `src/` high-level

### `src/app/`
App Router pages, layouts, API routes.

Examples:
- `src/app/chat/` → chat pages + layout
- `src/app/api/version/` → deploy verification endpoint

### `src/components/`
UI and feature components.

Important areas:
- `src/components/modules/chat/` → chat UI + chat server actions
- `src/components/circle-wizard/` → group/community creation flow
- `src/components/layout/` → global app layout pieces, toolbox, etc.

### `src/lib/`
Core data / backend logic.

Important areas:
- `src/lib/data/` → Mongo access, chat data layer, events, members, users
- `src/lib/auth/` → auth helpers
- `src/lib/data/mongo-chat.ts` → Mongo chat backend logic
- `src/lib/data/event.ts` → events data logic
- `src/lib/data/member.ts` → memberships / permissions

### `src/models/`
Shared schema / data shape definitions.

Important:
- model fields like `isAdmin`, circle fields, chat display types

## Chat-specific map

### UI
- `src/app/chat/layout.tsx`
- `src/components/modules/chat/chat-list.tsx`
- `src/components/modules/chat/chat-room.tsx`
- `src/components/modules/chat/chat-search.tsx`
- `src/components/modules/chat/create-chat-modal.tsx`

### Actions
- `src/components/modules/chat/actions.ts`

### Data layer
- `src/lib/data/mongo-chat.ts`

## Group creation / images
- `src/components/circle-wizard/profile-step.tsx`
- `src/components/circle-wizard/actions.ts`

## Auth / verification
- `src/components/modules/auth/actions.ts`

## Deploy / ops
- `docker-compose.yml`
- `Dockerfile`
- `deploy-genesis2.sh`
- `src/app/api/version/...`

## Docs already useful
- architecture docs
- image storage docs
- release checklist
- toolbox / clipboard docs

## Practical “where do I look first?” guide

### Chat sidebar bug
Start with:
- `src/app/chat/layout.tsx`
- `src/components/modules/chat/chat-list.tsx`

### Message rendering / mention bug
Start with:
- `src/components/modules/chat/chat-room.tsx`

### Create DM / contact picker bug
Start with:
- `src/components/modules/chat/create-chat-modal.tsx`
- `src/components/modules/chat/actions.ts`

### Group creation / image persistence bug
Start with:
- `src/components/circle-wizard/profile-step.tsx`
- `src/components/circle-wizard/actions.ts`

### Event / clipboard issue
Start with:
- `src/components/layout/user-toolbox.tsx`
- `src/lib/data/event.ts`

### Deploy issue
Start with:
- `deploy-genesis2.sh`
- `docker-compose.yml`
- `src/app/api/version/...`

## Rule of thumb

When debugging:
1. find the UI component
2. find the matching server action
3. find the underlying data layer in `src/lib/data`
4. verify deploy with `/api/version`
