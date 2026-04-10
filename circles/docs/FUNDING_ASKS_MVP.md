# Funding Asks MVP

## Purpose

Funding Asks are a demo-safe way for circles to publish one concrete, priced need at a time.

This is intentionally **not** full crowdfunding.

This MVP supports:

- one ask = one total price with optional itemized line items
- manual supporter claim flow
- manual completion confirmation
- member-only visibility
- circle-level activation before funding surfaces appear
- optional cover image using the existing image storage pipeline

This MVP intentionally does **not** support:

- payment processing
- pooled donations
- multiple concurrent supporters for one ask
- escrow
- external fraud tooling
- map/explore rollout

## Surfaces

Phase 1 adds:

- a `Funding Needs` panel on circle home, above Mission
- circle funding list page at `/circles/[handle]/funding`
- funding ask detail page at `/circles/[handle]/funding/[askId]`
- create page at `/circles/[handle]/funding/new`
- edit page at `/circles/[handle]/funding/[askId]/edit`

Funding surfaces only render when the circle has the `funding` module enabled in existing page/module settings. When funding is disabled, the home panel and direct funding routes stay hidden.

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
- `category`
- `amount`
- `currency`
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

Line items are optional and each may include:

- `name`
- `quantity`
- `unitLabel`
- `note`

## Status Flow

Supported statuses:

- `draft`
- `open`
- `in_progress`
- `completed`
- `closed`

Meaning:

- `draft`: saved but only visible to the creator and circle admins
- `open`: available for one member to claim
- `in_progress`: exactly one supporter has claimed the ask
- `completed`: owner/admin confirmed fulfillment and added a completion note
- `closed`: withdrawn or stopped, read-only

Manual support flow:

1. Admin or permitted creator publishes the ask.
2. One circle member clicks `I will fund this`.
3. The ask moves from `open` to `in_progress`.
4. Owner/admin adds a completion note and marks it `completed`, or closes it.

The claim path is atomic at the database update level so two members cannot successfully claim the same ask at the same time.

Draft behavior:

- `Save draft` persists the ask reliably before publish
- draft asks appear in a dedicated `Drafts` section on the funding list page for the creator and circle admins
- drafts are excluded from normal member-visible funding lists and detail views
- after saving a draft, the user is returned to the draft edit page with a success message

## Permissions

View rules:

- funding surfaces must be enabled for the circle first
- funding routes are members-only
- logged-out users are blocked by the existing in-circle access gate
- the home-page panel shows a sign-in / members-only message instead of ask content when needed

Create rules:

- circle admins can create asks in their circle
- verified users can create asks on their own user circle

Manage rules:

- ask owner or circle admin can edit active asks
- ask owner or circle admin can close active asks
- ask owner or circle admin can mark `in_progress` asks completed

Support rules:

- members can claim `open` asks
- creator cannot claim their own ask
- only one active supporter is allowed

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

Create and edit use a four-step flow:

1. Basics
2. Beneficiary
3. Proof / image
4. Review

Current MVP form behavior:

- Back/Next preserves entered values across steps
- `Total amount` is the ask-level price and sits next to a controlled currency selector
- supported currencies are `ZAR`, `USD`, and `EUR`
- itemization is optional and does not change the one-supporter / one-total-amount model
- beneficiary type includes `project`
- the confirmation field is labeled `How will donors know this was fulfilled?`
- helper text explains that confirmation can be an update, photo, receipt, or short note

## Deferred

Explicitly deferred from this phase:

- payment services
- donation splitting
- pooled campaign logic
- donor history / receipts
- profile `Support given` panel
- map and explore integration
- notifications for ask changes
- comments/discussion threads on asks
