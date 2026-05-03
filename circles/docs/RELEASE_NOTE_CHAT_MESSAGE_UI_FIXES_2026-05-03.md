# Release Note: Chat Message UI Fixes

Date: 2026-05-03  
Status: Deployed to production  
Branch merged: `feature/mobile-chat-composer-space`  
Production verification: Passed on kamooni.org

## Summary

This release improves the chat/message experience across desktop and mobile.

## Fixes included

### 1. Emoji reaction scroll behavior

Adding or removing an emoji reaction on an older message no longer forces the chat to scroll to the bottom.

The chat still scrolls to the latest message when the current user sends a new message.

### 2. Jump-to-latest button

A floating down-arrow button now appears when the user scrolls away from the latest messages.

Clicking the button scrolls the chat back to the newest message, then hides the button again.

### 3. Mobile composer spacing

The mobile chat composer now gives the text input more usable writing space while typing.

The input is more comfortable for longer multi-line messages.

### 4. Mobile composer actions

On mobile, while actively composing, a compact plus button provides access to hidden composer actions such as:

- Attach file
- Emoji picker

This keeps the writing area spacious while preserving access to common actions.

### 5. Duplicate mobile send arrow

The confusing duplicate mobile send arrow was removed as part of the mobile composer cleanup.

## Files changed

- `src/components/modules/chat/chat-room.tsx`

## Verification completed

Local checks:

- `npm run build`
- `npm run check:chat-actions`
- `npm run lint`

Production checks:

- `docker compose ps circles`
- `curl -sS https://kamooni.org/api/version`
- Browser verification on production

Manual browser verification confirmed:

- Reacting to older messages does not jump to bottom.
- Jump-to-latest arrow appears and works.
- Mobile composer has more writing space.
- Mobile plus button works.
- Send behavior still works.
