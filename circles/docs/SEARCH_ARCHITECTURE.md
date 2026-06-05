# Search Architecture

## Current state

### Baseline before this branch

- Main discovery search lived in [`src/components/modules/search/actions.ts`](../src/components/modules/search/actions.ts) and called `semanticSearchContent(...)` from [`src/lib/data/vdb.ts`](../src/lib/data/vdb.ts).
- `/explore` used that server action through [`src/components/modules/circles/map-explorer.tsx`](../src/components/modules/circles/map-explorer.tsx).
- Semantic search depended on:
  - Qdrant (`@qdrant/js-client-rest`)
  - OpenAI embeddings (`text-embedding-3-small`)
  - Circle/post/task/event/proposal/issue/goal upserts into the vector DB
- Simpler name-only search existed separately in [`src/lib/data/circle.ts`](../src/lib/data/circle.ts) as `getCirclesBySearchQuery(...)`.
- `/api/circles/search` used that simple Mongo regex search and was used by smaller picker UIs.

### What is live in the codebase

- Qdrant is configured in Docker and in `.env.example`.
- Embeddings are generated in [`src/lib/data/vdb.ts`](../src/lib/data/vdb.ts).
- Re-indexing exists via:
  - admin operations UI in [`src/components/modules/admin/admin-dashboard.tsx`](../src/components/modules/admin/admin-dashboard.tsx)
  - server settings initialization in [`src/app/circles/[handle]/settings/server-settings/actions.ts`](../src/app/circles/[handle]/settings/server-settings/actions.ts)
- Entity upserts into Qdrant exist for circles, posts/discussions, events, proposals, tasks, issues, and goals.

### What is unclear or weak

- There is no Mongo text index or search-specific index creation for search fields.
- The semantic search path is operational in code, but reliability depends on Qdrant state, OpenAI availability, re-index freshness, and matching env configuration.
- Search behavior is split between at least two unrelated paths:
  - vector search for `/explore`
  - name regex search for pickers/API helpers
- `selectedCategories` in the old search action was effectively ignored.
- Several “advanced” filters in the current `/explore` UI are presentation filters layered after the backend call, not a coherent search API.

### What this branch changes

- Adds deterministic Mongo-backed search in [`src/lib/data/search.ts`](../src/lib/data/search.ts).
- Replaces the main discovery action in [`src/components/modules/search/actions.ts`](../src/components/modules/search/actions.ts) so `/explore` no longer depends on semantic search for people/circles/projects.
- Updates [`src/app/api/circles/search/route.ts`](../src/app/api/circles/search/route.ts) to use the same deterministic search path.
- Fixes the pin picker in [`src/components/modules/home/pin-picker.tsx`](../src/components/modules/home/pin-picker.tsx) so it reads the API response correctly and restricts results to communities.

## Code map

### UI entry points

- [`src/app/explore/page.tsx`](../src/app/explore/page.tsx): loads discoverable circles into the explore experience.
- [`src/components/modules/circles/map-explorer.tsx`](../src/components/modules/circles/map-explorer.tsx): main search box, category toggles, SDG filter, date filter, and search result handling.
- [`src/components/layout/search-results-panel.tsx`](../src/components/layout/search-results-panel.tsx): left search panel UI.
- [`src/app/circles/page.tsx`](../src/app/circles/page.tsx): circles page with local client-side filtering only.
- [`src/components/modules/circles/circles-list.tsx`](../src/components/modules/circles/circles-list.tsx): local search-by-name on already-loaded circles.
- [`src/components/modules/home/pin-picker.tsx`](../src/components/modules/home/pin-picker.tsx): community picker using `/api/circles/search`.
- [`src/components/global-create/circle-picker.tsx`](../src/components/global-create/circle-picker.tsx): circle picker using `getCirclesBySearchQueryAction(...)`.

### Search backends

- [`src/lib/data/search.ts`](../src/lib/data/search.ts): deterministic Search MVP helper added on this branch.
- [`src/components/modules/search/actions.ts`](../src/components/modules/search/actions.ts): server action used by `/explore`.
- [`src/app/api/circles/search/route.ts`](../src/app/api/circles/search/route.ts): API route for lightweight search consumers.
- [`src/lib/data/circle.ts`](../src/lib/data/circle.ts): legacy `getCirclesBySearchQuery(...)` and core circle projections.
- [`src/lib/data/vdb.ts`](../src/lib/data/vdb.ts): Qdrant client, embedding generation, semantic search, and vector upserts.

### Related entity loaders

- [`src/lib/data/member.ts`](../src/lib/data/member.ts): member list assembly for people inside circles.
- [`src/lib/data/task.ts`](../src/lib/data/task.ts): tasks queries and Qdrant upsert on create/update.
- [`src/lib/data/issue.ts`](../src/lib/data/issue.ts): issues queries and Qdrant upsert.
- [`src/lib/data/goal.ts`](../src/lib/data/goal.ts): goals queries and Qdrant upsert.
- [`src/lib/data/event.ts`](../src/lib/data/event.ts): events queries and Qdrant upsert.
- [`src/lib/data/proposal.ts`](../src/lib/data/proposal.ts): proposals queries and Qdrant upsert.

## Entity and field map

### People and circles

Source model: [`src/models/models.ts`](../src/models/models.ts), `circleSchema`

Important stored fields already available for deterministic search:

- identity: `name`, `handle`, `circleType`, `did`
- profile text: `description`, `content`, `mission`
- taxonomy/tags: `skills`, `interests`, `causes`
- structured search fields:
  - `offers.text`
  - `offers.skills`
  - `engagements.text`
  - `engagements.interests`
  - `needs.text`
  - `needs.tags`
- location: `location.city`, `location.region`, `location.country`, `location.lngLat`
- timestamps and social proof: `createdAt`, `members`
- visibility/discoverability related: `isVerified`, `isMember`, `isPublic`

### Tasks / needs / work items

Source models: [`src/models/models.ts`](../src/models/models.ts), `taskSchema`, `issueSchema`, `goalSchema`, `proposalSchema`, `eventSchema`

Already stored and potentially searchable soon after MVP:

- tasks: `title`, `description`, `stage`, `assignedTo`, `targetDate`, `location`, `createdAt`, `updatedAt`
- issues: `title`, `description`, `stage`, `assignedTo`, `targetDate`, `location`, `createdAt`, `updatedAt`
- goals: `title`, `description`, `stage`, `targetDate`, `location`, `createdAt`, `updatedAt`
- proposals: `name`, `background`, `decisionText`, `stage`, `location`, `createdAt`
- events: `title`, `description`, `categories`, `causes`, `startAt`, `endAt`, `location`, `createdAt`

### Notes on “needs”

- Circle profile “needs” already exist as structured fields on circle documents: `needs.text` and `needs.tags`.
- Tasks are a separate collection and workflow.
- For MVP, “needs” search can be handled by circle/profile search first, then task search can be added as a next phase.

## Recommended MVP architecture

### Backend query approach

- Use deterministic Mongo-backed search for people, circles, and projects first.
- Search only discoverable entities:
  - all circles/projects
  - users only when `isVerified === true` or `isMember === true`
- Search across explicit stored fields, not embeddings.
- Keep semantic/vector search available in code, but do not make it the critical path for launch search.

### Ranking approach

- Rank by explicit weighted field matches:
  - strongest: `name`, `handle`
  - medium: structured tags (`skills`, `interests`, `causes`, `offers.skills`, `needs.tags`)
  - weaker: longer text (`description`, `mission`, `content`, `offers.text`, `needs.text`)
- Tie-break with:
  - `members` descending
  - `createdAt` descending
- Preserve existing personalized metrics enrichment after search when available.

### Fields to search first

- People/circles/projects:
  - `name`
  - `handle`
  - `description`
  - `mission`
  - `content`
  - `skills`
  - `interests`
  - `causes`
  - `offers.text`
  - `offers.skills`
  - `engagements.text`
  - `engagements.interests`
  - `needs.text`
  - `needs.tags`
  - `location.city`
  - `location.region`
  - `location.country`

### Indexes needed

No dedicated search indexes exist today.

For pilot-safe MVP, deterministic search can run without a schema migration if the dataset stays modest.

Before wider rollout, add at minimum:

- compound discoverability filters:
  - `circleType`
  - `isVerified`
  - `isMember`
- exact/prefix helpers:
  - `handle`
  - `name`
  - `causes`
- if Mongo text search is adopted later, define one explicit text index rather than relying on many regex scans

### Simple search UX

- One input in `/explore`
- Search people, circles, and projects together
- Category chips narrow results client-side
- SDG filter remains as the first structured advanced filter

### Advanced search UX

Small, boring additions only:

- keep category filter
- keep SDG filter
- next add structured filters for:
  - circle type
  - location
  - offers/skills
  - interests
  - needs tags

Avoid adding AI “semantic mode” toggle unless the deterministic path is already stable and indexed.

## Known unknowns

- Production Qdrant freshness is not verified by this audit.
- No production Mongo index inventory was checked in this branch.
- It is not yet clear whether search should exclude private circles more aggressively than the current discover feed does.
- `getCirclesBySearchQuery(...)` is still used in other picker/mention flows and has not been broadly refactored in this branch.
- Need/task search still needs a dedicated API contract and permission-aware filtering story.

## Next implementation steps

1. Verify the deterministic people/circles search behavior locally in `/explore`.
2. Decide whether to replace `getCirclesBySearchQuery(...)` or leave picker search narrower by design.
3. Add explicit advanced filters for location, skills/offers, interests, and needs tags.
4. Add a dedicated needs/tasks search path using the same deterministic pattern.
5. Add search indexes before wider rollout beyond pilot scale.
