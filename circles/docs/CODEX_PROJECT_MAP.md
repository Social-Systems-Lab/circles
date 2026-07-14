# Codex Project Map - Kamooni / Circles

This is the practical codebase map for new developers and Codex Desktop. Use it to find the live files before editing.

## Repository layout

There are two important local paths:

```text
Repository root: ~/circles
Application root: ~/circles/circles
```

Run Git commands from the repository root:

```bash
cd ~/circles
```

Run app, package-manager, Docker Compose, and environment-file commands from the application root:

```bash
cd ~/circles/circles
```

## Main directories

- `circles/src/app` - Next.js App Router pages, layouts, route handlers, and colocated server actions.
- `circles/src/components` - shared UI components and feature UI modules.
- `circles/src/lib` - authentication, data helpers, integrations, utilities, storage, search, and shared server-side logic.
- `circles/src/models` - shared TypeScript models and domain types.
- `docs` - active repository-level onboarding docs such as local development, architecture, and environment reference.
- `circles/docs` - active app-specific docs, playbooks, feature notes, and historical references.
- `circles/public` - static public assets served by Next.js.
- `circles/scripts` - maintenance, migration, seed, verification, and helper scripts.
- `circles/docker-compose.yml`, `circles/docker-compose.local.yml`, `circles/Dockerfile`, `circles/Dockerfile.cron`, `circles/nginx/`, and `circles/deploy-genesis2.sh` - Docker, nginx, and deployment files.

## Main source areas

| Area | Current paths |
| --- | --- |
| Authentication | `circles/src/app/(auth)`, `circles/src/components/auth`, `circles/src/components/modules/auth`, `circles/src/lib/auth`, `circles/src/lib/actions/auth.ts` |
| Profiles and circles | `circles/src/app/circles`, `circles/src/app/circles/[handle]`, `circles/src/components/circle`, `circles/src/components/modules/circles`, `circles/src/components/modules/members`, `circles/src/lib/data/circle.ts`, `circles/src/lib/data/member.ts`, `circles/src/lib/data/user.ts` |
| Feeds and noticeboard | `circles/src/app/circles/[handle]/feed`, `circles/src/app/foryou`, `circles/src/app/explore`, `circles/src/components/modules/feeds`, `circles/src/lib/data/feed.ts` |
| Tasks and shifts | `circles/src/app/circles/[handle]/tasks`, `circles/src/app/circles/[handle]/shifts`, `circles/src/components/modules/tasks`, `circles/src/lib/data/task.ts` |
| Events | `circles/src/app/circles/[handle]/events`, `circles/src/components/modules/events`, `circles/src/lib/data/event.ts`, `circles/src/lib/data/eventRsvp.ts`, `circles/src/lib/data/eventNotifications.ts` |
| Chat | `circles/src/app/chat`, `circles/src/components/modules/chat`, `circles/src/lib/data/mongo-chat.ts`, `circles/src/lib/chat/mongo-types.ts` |
| Notifications | `circles/src/app/api/notifications`, `circles/src/components/notifications`, `circles/src/lib/data/notifications.ts`, `circles/src/lib/actions/notificationSettings.ts` |
| Search and Qdrant | `circles/src/components/modules/search`, `circles/src/lib/data/search.ts`, `circles/src/lib/data/search-visibility.ts`, `circles/src/lib/data/vdb.ts`, `circles/src/app/api/circles/search/route.ts` |
| Storage and MinIO | `circles/src/lib/data/storage.ts`, `circles/src/app/storage/[...path]/route.ts`, `circles/src/app/uploads/[...path]/route.ts` |
| Admin | `circles/src/app/admin`, `circles/src/components/modules/admin`, `circles/src/lib/data/platform-settings.ts`, `circles/src/lib/data/platform-stats.ts` |
| API routes | `circles/src/app/api/**/route.ts`, plus feature route handlers such as `circles/src/app/storage/[...path]/route.ts` |

## Code location patterns

- Pages and layouts usually live in `circles/src/app/**/page.tsx` and `circles/src/app/**/layout.tsx`.
- Route handlers live in `circles/src/app/**/route.ts`.
- Server actions are usually colocated as `actions.ts` under the relevant route directory, or placed in `circles/src/lib/actions`.
- Shared data access and Mongo collection helpers live in `circles/src/lib/data`.
- Shared UI components live in `circles/src/components`; feature-specific UI is usually under `circles/src/components/modules`.
- Shared domain types live in `circles/src/models/models.ts`; Mongo-native chat types live in `circles/src/lib/chat/mongo-types.ts`; global declarations live in `circles/src/globals.d.ts`.

## Mongo-native chat

MongoDB is the authoritative chat backend. Matrix is not the current primary chat system.

Authoritative chat files:

- `circles/src/lib/data/mongo-chat.ts`
- `circles/src/lib/chat/mongo-types.ts`
- `circles/src/lib/data/db.ts`
- `circles/src/components/modules/chat`
- `circles/src/app/chat`

Authoritative chat collections:

- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Critical invariant:

`chatConversations.updatedAt` must be updated whenever a message is sent. Sidebar ordering depends on this timestamp.

See [Mongo-native chat architecture](CHAT_SYSTEM_ARCHITECTURE.md) for details.

## Legacy compatibility paths

Postgres, Synapse, and Matrix-related files are legacy or compatibility-only for normal development. Do not treat them as primary application infrastructure unless a task explicitly targets historical Matrix compatibility.

Relevant compatibility references include:

- `circles/docker-compose.yml` `postgres` and `synapse` services behind the `matrix` profile.
- `circles/docker-compose.local.yml` `postgres` and `synapse` services.
- Historical docs such as `circles/docs/chat.md`, `circles/docs/CHAT_SYSTEM_ARCHITECTURE_v2.md`, and old deployment/architecture notes.

## How to locate the live file

Use `rg` before editing:

```bash
cd ~/circles/circles
rg "visible UI text or function name" src
rg --files src | rg "chat|task|event|notification"
```

For routes, list the App Router files:

```bash
cd ~/circles/circles
find src/app -name page.tsx -o -name route.ts -o -name actions.ts
```

Do not create duplicate files from guessed paths. Find the file that actually renders the UI, handles the request, or owns the data helper.

## Production and deployment

Normal production deployment is documented separately. Do not duplicate deployment commands here.

- [Production deployment](PRODUCTION_DEPLOYMENT.md)

## Related active docs

- [Architecture overview](../../docs/ARCHITECTURE.md)
- [Local development](../../docs/LOCAL_DEVELOPMENT.md)
- [Development workflow](KAMOONI_DEVELOPMENT_WORKFLOW.md)
- [Mongo-native chat architecture](CHAT_SYSTEM_ARCHITECTURE.md)
- [Environment reference](../../docs/ENVIRONMENT.md)
- [Production deployment](PRODUCTION_DEPLOYMENT.md)
