# Kamooni Toolbox Structure

This document describes the current structure and intent of the Kamooni user toolbox.

The toolbox is a personal workflow panel. It is not tied only to the currently viewed profile or circle. It aggregates things that belong to the current user across the system.

## Core concept

The toolbox is the user's compact side panel for:

- chat
- notifications
- connections
- tasks and workflow items
- other personal cross-circle views

It is meant to function as a personal dashboard.

## Main UI file

Primary UI file:

- `src/components/layout/user-toolbox.tsx`

This file is responsible for:

- defining toolbox tabs and icons
- loading user-specific data via server actions
- rendering compact lists in the toolbox panel
- updating local panel state after lightweight actions

## Connections tab

Sprint 2 added a dedicated Connections view to the toolbox.

This replaced the older Projects tab in the personal toolbox context.

### What Connections now shows

The Connections tab now has three relationship buckets derived from `userRelationships`:

- **Requests for you**  
  Incoming contact requests where the current user can respond

- **Requests sent**  
  Outgoing contact requests that are still pending

- **Connections**  
  Accepted contacts

These sections only render when they contain data.

If all three are empty, the existing empty-state behavior remains.

## Relationship source of truth

Connections data is derived from the Mongo `userRelationships` collection.

Relevant states include:

- `accepted`
- `pending_sent`
- `pending_received`

Current product meaning:

- **Follow** = feed subscription
- **Contact / Connect** = relationship layer for new DM initiation and contact visibility
- Follow is separate from Contact

## Respond control in Connections

Incoming requests in the toolbox now use a compact **Respond** control instead of large inline buttons.

### Behavior

For each incoming request row:

- **Respond** opens a small dropdown menu
- menu options:
  - **Accept**
  - **Decline**

### Expected result

- **Accept**
  - removes the row from Requests for you
  - moves the person into Connections
  - should update immediately in the toolbox state

- **Decline**
  - removes the row from Requests for you
  - does not affect other accepted contacts

This reuses the same accept/decline relationship actions already used elsewhere.

## Relationship handling elsewhere

The toolbox is not the only surface for relationships.

### Profile pages

Profile pages can also show relationship controls, including:

- Add Contact
- Requested
- Requested You via a compact **Respond** dropdown
- Message when contact or existing DM history allows it

The profile header CTA row is now anchored to the title/header row, so CTA alignment stays stable even when profile description length changes.

### Notifications

Bell notifications for contact requests are intentionally lightweight.

They should:

- notify the user that a contact request was received
- open the sender profile when clicked

They are not the primary place to manage requests.

The actual request management surface is:

- profile page
- Connections tab in the toolbox

## Design intent

The current UX intent is:

- notifications should be prompts
- Connections should be the compact management surface
- profile pages should remain fully usable
- keep the layout clean in narrow side panels

That is why the toolbox uses a compact **Respond** dropdown instead of always showing full Accept/Decline buttons inline.

## Tasks surfaces

Task work now spans two related surfaces:

- the main Tasks page for broader filtering, sorting, and detail work
- the toolbox for compact personal workflow access

### Current Tasks baseline

On the main Tasks page:

- ordinary tasks now support optional priority
- supported priority levels are Low, Medium, High, and Critical
- priority is unset by default
- stage filtering is multi-select
- priority filtering is available
- sorting includes Assigned To, and priority sorting follows explicit urgency order instead of alphabetical order
- the form flow is now: Create in, Title, Date + Priority, Description, Image, Location, Goal, Event
- description remains optional
- Goal and Event links remain available and can still be preselected from goal or event context
- resolved tasks are hidden from the active list by default and remain available in a bottom expandable section
- the resolved section auto-expands when current filters only match resolved tasks
- in the task side panel, priority can be edited directly, stage and priority changes update visually immediately, and the header keeps Stage, Priority, and actions stable above long titles

## Task Acceptance (MVP behavior)

Tasks now support explicit acceptance by the assignee.

### Fields

- acceptedAt: Date
- acceptedBy: DID

### Behavior

- Only the assigned user can accept a task
- Assigning a task to yourself auto-accepts it and removes the redundant extra acceptance click
- Accepting a task:
  - sets acceptedAt + acceptedBy
  - triggers notification to task creator
- Re-accepting is idempotent (no duplicate writes)

## Task Review And Verification Workflow

The current work lifecycle remains stage-based:

- open
- inProgress
- resolved

Review and verification are additive workflow metadata layered onto the existing task stages. They do not introduce a separate core work stage for accepted task progress, but they now gate how a task can move to completion.

### Strict workflow lifecycle

- An assignee accepts an open task
- The accepted assignee starts progress and moves the task into inProgress
- The accepted assignee submits in-progress work for review
- The creator, admin, or task manager can request changes
- The creator, admin, or task manager can mark the task verified
- Only verified work moves to resolved

### Workflow rules

- There is no direct `inProgress -> resolved` shortcut
- All tasks must pass through review submission and verification before resolution
- `Re-open Task` only appears for resolved tasks

### Backend workflow metadata

In addition to acceptedAt and acceptedBy, the task workflow now uses:

- submittedForReviewAt: Date
- submittedForReviewBy: DID
- reviewRequestedChangesAt: Date
- reviewRequestedChangesBy: DID
- reviewRequestedChangesNote: string
- verifiedAt: Date
- verifiedBy: DID

### Current UI behavior

Visible task workflow actions now include:

- Accept Task
- Start Progress
- Submit for Review
- Request Changes
- Mark Verified
- Re-open Task (resolved tasks only)

Visible workflow status badges now include:

- Review Requested
- Changes Requested
- Verified

These badges appear in task views so reviewers and assignees can see whether work is waiting for review, has been sent back for changes, or has been verified.

### Admin verification queue

Circle task views now include a dedicated admin-only `Needs Verification` queue.

- The queue is hidden for non-admins
- It shows tasks where:
  - stage is `inProgress`
  - `submittedForReviewAt` exists
  - `verifiedAt` does not exist
- Admins can review directly from this queue
- Queue actions are:
  - Mark Verified
  - Request Changes

### Preview refresh behavior

The open task side panel preview now refreshes immediately after successful task workflow actions.

This is done by reloading the currently open preview task after:

- Accept Task
- Start Progress
- Submit for Review
- Request Changes
- Mark Verified

This prevents stale workflow state in the side panel and removes the need for a manual browser refresh after those actions.

## Verified Contributions

User profiles now include a `Verified Contributions` panel.

### Source of truth

A task counts as a verified contribution for a user when all of the following are true:

- the task is assigned to that user
- `verifiedAt` exists
- `verifiedBy` exists
- `stage == resolved`

### Public count vs viewer-visible list

The panel intentionally separates summary count from the rendered list:

- the public contribution count is the public trust signal
- the contribution list only includes items the current viewer is allowed to see
- only public contributions count toward the public summary
- private or otherwise non-visible tasks are never exposed in the visible list

This means the public summary count and the visible list can differ by design.

### Click-through behavior

Verified contribution items open task detail when clicked:

- on compact/mobile layouts they open the full task page
- on larger layouts they open the task side preview

### Important dev note

If task workflow state appears broken (UI not updating, repeated notifications, badges missing, stale review state):

Check SAFE_TASK_PROJECTION includes:

- acceptedAt
- acceptedBy
- submittedForReviewAt
- submittedForReviewBy
- reviewRequestedChangesAt
- reviewRequestedChangesBy
- reviewRequestedChangesNote
- verifiedAt
- verifiedBy

Missing projection fields will cause UI state to appear incorrect even when DB writes succeed.

### Toolbox boundary

- task list view state persistence is limited to the main Tasks page
- persisted state includes selected stages, selected priorities, sort order, and search text
- this persisted state is scoped to the Tasks page and does not carry into the toolbox or other contexts
- toolbox task views remain compact and continue to exclude resolved tasks from the main list

## Important editing notes

When modifying the toolbox in future:

- keep changes small and local
- do not mix notification rewrites into toolbox work unless absolutely necessary
- preserve the three relationship sections
- preserve immediate local state updates after Respond actions
- do not collapse Follow and Contact into one concept
- keep the side panel uncluttered

## Related areas

Useful related files include:

- `src/components/layout/user-toolbox.tsx`
- `src/components/modules/home/actions.ts`
- `src/lib/data/relationships.ts`
- `src/components/layout/notifications.tsx`
