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
- Requested You
- Accept / Decline
- Message when contact or existing DM history allows it

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
