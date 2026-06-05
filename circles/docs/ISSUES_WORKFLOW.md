# Kamooni Issues Workflow

Updated: 2026-05-03

## Purpose

Issues are a lightweight workflow for reporting something that needs attention in a circle.

Issues are intentionally separate from Tasks:

- An **Issue** starts as a report, concern, bug, risk, or problem.
- A **Task** is planned work assigned through the broader task pipeline.
- Some Issues may later become Tasks, but conversion is not required for the MVP.

## Current workflow

### 1. Reporter creates an Issue

A normal circle member can create an Issue from a specific circle’s Issues page.

The reporter can provide:

- Title
- Description
- Optional images/location where supported
- Suggested urgency:
  - Not set
  - Low
  - Medium
  - High

Normal reporters do **not** set:

- Target date
- Critical urgency
- Circle destination selector when already creating inside a specific circle context

Target date and Critical urgency are admin/moderator triage controls.

### 2. Admin/moderator acknowledges the Issue

Issues begin in review. A reviewer/admin/moderator uses **Acknowledge (Open)** to move an Issue from review to open.

The acknowledgement step is also the triage step.

During acknowledgement, an admin/moderator can:

- Confirm or change urgency
- Choose Critical urgency if appropriate
- Set or clear a target date
- Move the Issue to Open

If urgency is **Critical**, a target date is required.

For Not set, Low, Medium, and High urgency, target date is optional.

### 3. Issue is handled

Once open, an Issue can be assigned and worked through the existing Issue actions.

The list view separates:

- Active issues
- Resolved issues

Resolved issues are shown in their own collapsible section below the active list.

### 4. Issue is resolved

Resolved Issues move out of the main active list into the Resolved issues section.

The list and side-panel preview should update without requiring a manual page reload.

## Urgency model

Issue urgency is optional for backward compatibility.

Allowed values:

- `low`
- `medium`
- `high`
- `critical`

Existing Issues with no urgency display as:

- `Not set`

There is no database backfill required.

## Server-side safety rules

The backend enforces the important permissions rather than relying only on the UI.

Current rules:

- Normal reporters cannot persist `targetDate` on create/update.
- Normal reporters cannot submit `critical` urgency.
- Admin/moderator users may set or update target date.
- `critical` urgency during acknowledgement requires a valid target date.
- Non-critical acknowledgement does not require a target date.

## UI behavior

The Issues page now follows the Tasks page more closely:

- Similar table/card treatment
- Search and stage filtering
- Separate resolved section
- Urgency badge in the list/title area
- Issue detail shows urgency and target date
- Acknowledge opens a triage dialog instead of requiring a full edit flow

## Current limitations / future work

Not included in this MVP:

- Other users suggesting urgency changes after an Issue is posted
- Separate `suggestedUrgency` and `confirmedUrgency` fields
- Issue-to-Task conversion
- Verified resolved Issues appearing on resolver profiles
- Urgency filters/sorting on the Issues list
- Circle-level default SLA / default target-date rules

## Related commits

- `4114aab` Align issues list UI with tasks page
- `09ccfdd` Separate resolved issues in issues list
- `d0a4a88` Add issue urgency triage flow
- `fe10b09` Fix issue acknowledgement date requirement
