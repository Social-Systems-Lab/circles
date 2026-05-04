# Release Note — Issues List and Urgency Triage

Date: 2026-05-03

## Summary

This release updates the Kamooni Issues workflow so Issues behave more like a lightweight task pipeline while remaining their own content type.

The Issues page now visually aligns more closely with Tasks, separates resolved Issues, and adds urgency triage.

## Shipped changes

### Issues page UI

- Updated Issues list styling to better match Tasks.
- Fixed the Show created / Show assigned filtering bug.
- Preserved existing issue-specific columns and action menus.
- Kept Issues as their own content type.

### Resolved Issues section

- Resolved Issues now move into a separate section below active Issues.
- Resolved section is collapsible.
- Active and resolved rows update without requiring a manual page reload.
- Side-panel preview now refreshes after issue stage changes.

### Issue urgency

Added optional Issue urgency:

- Not set
- Low
- Medium
- High
- Critical

Existing Issues with no urgency show as **Not set**.

### Reporter behavior

Normal reporters can suggest urgency when creating an Issue, but only:

- Not set
- Low
- Medium
- High

Normal reporters do not see or control:

- Critical urgency
- Target date
- Circle selector when creating from a specific circle context

### Admin/moderator triage

The visible review action was renamed from **Approve (Open)** to **Acknowledge (Open)**.

During acknowledgement, admin/moderator users can:

- Confirm or change urgency
- Select Critical if needed
- Set or clear target date
- Move the Issue from review to open

Critical urgency requires a target date.

Non-critical urgency does not require a target date.

## Safety / permissions

Server-side enforcement was added or tightened:

- Ordinary reporters cannot persist target dates.
- Ordinary reporters cannot submit Critical urgency.
- Critical acknowledgement requires a valid target date.
- Non-critical acknowledgement can proceed without a date.

## Deployment notes

Production deployment was completed on Cleura from:

`/root/circles/circles/circles`

Verification completed:

- `docker compose ps circles`
- `curl -sS https://kamooni.org/api/version`
- `curl -I https://kamooni.org`

The Cleura `/api/version` endpoint currently returns `gitSha: unknown` and `buildTime: unknown`, which is expected for the current setup.

## Commits included

- `4114aab` Align issues list UI with tasks page
- `09ccfdd` Separate resolved issues in issues list
- `d0a4a88` Add issue urgency triage flow
- `fe10b09` Fix issue acknowledgement date requirement
