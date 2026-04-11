# Funding Asks MVP

## Purpose

Funding Needs are a demo-safe way for circles to publish a parent Funding Request with multiple child Funding Items.

This is intentionally **not** full crowdfunding.

This MVP supports:

- one parent request with one or more individually fundable child items
- demo-only `Fund` buttons on child items
- Super Admin-only creation, editing, publishing, completion, closing, and activation
- member-only visibility
- circle-only activation before funding surfaces appear
- optional cover image using the existing image storage pipeline

This MVP intentionally does **not** support:

- payment processing
- pooled donations
- claim or payment state changes when someone clicks `Fund`
- escrow
- external fraud tooling
- map/explore rollout

## Surfaces

Phase 1 adds:

- a `Funding Needs` panel on circle home, above Mission
- circle funding list page at `/circles/[handle]/funding`
- funding request detail page at `/circles/[handle]/funding/[askId]`
- create page at `/circles/[handle]/funding/new`
- edit page at `/circles/[handle]/funding/[askId]/edit`

Funding surfaces only render when the circle has the `funding` module enabled in existing page/module settings. Funding stays off by default, only Super Admins can enable it in this MVP, and user/profile circles do not expose funding surfaces.

## Data Model

Collection:

- `fundingAsks`

Core fields:

- `_id`
- `circleId`
- `circleHandleSnapshot`
- `createdByDid`
- `createdByHandleSnapshot`
- `title`
- `shortStory`
- `description`
- `items[]`
- `status`
- `isProxy`
- `beneficiaryType`
- `beneficiaryName`
- `proxyNote`
- `completionPlan`
- `completionNote`
- `coverImage`
- `trustBadgeType`
- `activeSupporterDid`
- `activeSupporterHandleSnapshot`
- `activeSupportStartedAt`
- `completedAt`
- `closedAt`
- `createdAt`
- `updatedAt`

The model is intentionally explicit and boring. It does not reuse tasks, and it does not attempt to model crowdfunding rounds or payment state.

Parent request fields hold the broader context:

- `title`
- `shortStory`
- `description`
- `coverImage`
- beneficiary / proxy context when used

Child funding items hold the fundable need:

- `title`
- `category`
- `price`
- `currency`
- `quantity`
- `unitLabel`
- `note`
- `status`

## Status Flow

Parent request statuses:

- `draft`
- `open`
- `completed`
- `closed`

Meaning:

- `draft`: saved but only visible to Super Admins
- `open`: published and visible to members on enabled circles
- `completed`: Super Admin confirmed fulfillment and added a completion note
- `closed`: withdrawn or stopped, read-only

Child item statuses mirror the parent for this MVP:

- `draft`
- `open`
- `completed`
- `closed`

Demo fund flow:

1. A Super Admin publishes the funding request.
2. Members can open the request and click `Fund` on an open child item.
3. The button shows `Demo only - payment flow not connected yet.`
4. No payment, claim, or transaction state changes happen in this MVP.

Draft behavior:

- `Save draft` persists the request reliably before publish
- draft requests appear in a dedicated `Drafts` section on the funding list page for Super Admins
- drafts are excluded from normal member-visible funding lists and detail views
- after saving a draft, the user is returned to the draft edit page with a success message

## Permissions

View rules:

- funding surfaces must be enabled for the circle first
- funding routes are members-only
- logged-out users are blocked by the existing in-circle access gate
- the home-page panel shows a sign-in / members-only message instead of funding content when needed
- funding is scoped to `circle` circles only in this MVP, not user/profile circles

Create rules:

- only Super Admins can create funding requests
- only Super Admins can activate funding for a circle

Manage rules:

- only Super Admins can edit active funding requests
- only Super Admins can close active funding requests
- only Super Admins can mark active funding requests completed

## Trust Badges

This MVP does not introduce a new verification framework.

Badge priority:

1. `circle_admin`
2. `verified_member`
3. `proxy_ask`
4. `member_ask`

These are lightweight labels only. They are meant to make demo flows clearer without expanding the platform trust model.

## Images

Funding asks use the existing upload/storage pipeline.

- cover image upload goes through `saveFile`
- stored URLs still depend on correct `CIRCLES_URL`
- no separate funding-specific image system was added

The multi-step form preserves the selected image across Back/Next navigation, and saved drafts reload the existing cover image into the edit flow.

## Form UX

Create and edit use a request-first, items-second step flow:

1. Request
2. Items
3. Beneficiary
4. Image
5. Review

Current MVP form behavior:

- Back/Next preserves entered values across steps
- each child item has its own category, price, and controlled currency selector
- supported currencies are `ZAR`, `USD`, and `EUR`
- a request can contain multiple child items
- beneficiary type includes `project`
- the cover image persists across step navigation and draft reload
- the publish review clearly separates parent request context from child funding items

## Home Panel

The circle home-page `Funding Needs` panel is compact and action-oriented:

- it shows request rows rather than full stacked cards
- each row shows the parent request title, a one-line summary, and the count of open items
- clicking a row expands it to show child funding items
- only one request stays expanded at a time
- expanded child items include a demo-only `Fund` button and a `View request` CTA

## Deferred

Explicitly deferred from this phase:

- payment services
- paid membership or parent-circle entitlement logic
- donation splitting
- pooled campaign logic
- donor history / receipts
- profile or user-circle funding surfaces
- map and explore integration
- notifications for funding changes
- comments/discussion threads on funding requests
