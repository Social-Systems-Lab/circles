# Release Notes

## Current main - Task UX updates
### Shift Tasks

- Added Shift Tasks for scheduled participation work alongside ordinary outcome tasks.
- Shift Tasks use a sign up -> confirm flow instead of deliverable-style completion.
- Pending sign-ups remain private to admins and moderators until confirmed.
- Public visibility and public participant counts are driven by confirmed participants.
- Added notifications for shift sign-up and shift confirmation.

- Added optional priority to ordinary tasks with Low, Medium, High, and Critical values. Priority is unset by default, and Help Wanted urgency was intentionally not changed in this pass.
- Main Tasks page now supports multi-select stage filtering, priority filtering, Assigned To sorting, and explicit urgency ordering for priority sorting.
- Reordered the task form to: Create in, Title, Date + Priority, Description, Image, Location, Goal, Event. Description remains optional, and Goal/Event can still be preselected from their context.
- Main Tasks page now persists selected stages, selected priorities, sort order, and search text locally for that page only.
- Resolved tasks are hidden from the active list by default and moved into a bottom expandable section that auto-expands when current filters only match resolved tasks.
- Task side panel now supports direct priority editing, immediate visual sync for priority and stage changes, and a more stable header layout for long titles.
- Tasks now record acceptance metadata via `acceptedAt` and `acceptedBy` when the assignee explicitly accepts the work.
- Self-assignment now auto-accepts the task so assignees do not need a redundant second acceptance step.
- Added strict task review and verification workflow rules so in-progress work must be submitted for review, verified, and only then resolved.
- Added the admin-only `Needs Verification` queue in circle tasks so admins can `Mark Verified` or `Request Changes` on submitted work.
- Added the `Verified Contributions` panel on user profiles with a public contribution count separated from the viewer-visible contribution list.
- Fixed task preview refresh after Accept Task, Start Progress, Submit for Review, Request Changes, and Mark Verified so the open side panel updates immediately without a manual browser refresh.

### Funding Asks MVP

- Added the demo-safe `Funding Needs` home-page panel and dedicated funding routes under `/circles/[handle]/funding`.
- Added a dedicated `fundingAsks` collection with explicit MVP fields for status, beneficiary, proxy state, trust badge, and single active supporter.
- Added a step-based create/edit flow, manual `I will fund this` claim action, and admin/owner completion with required outcome note.
- Funding routes are members-only, logged-out access is blocked through the existing in-circle gate, and proxy asks are clearly labeled.
- Deferred payment processing, pooled crowdfunding, profile support summaries, and map/explore rollout.

## 0.8.16 - 2026-03-28
- Fixed profile header CTA alignment by anchoring action buttons (Message, Follow, etc.) to the title row instead of the full text column.
- Removed fragile negative-margin positioning in profile header.
- Ensures consistent CTA positioning regardless of description length or metadata height.
- Minor UX improvements:
  - Latest post ordering refinement
  - Circle message button routes to admin chat
  - General UI polish and consistency tweaks

## 0.8.15 - 2025-12-13
- Added the maintenance notice button from the holding screen to the welcome hero so both variants share the same messaging experience.
- Updated the default maintenance copy to “Maintenance and updates. We should be running smoothly again on Tuesday, 16 September.” for clarity.
- Bumped the app version to `0.8.15` to capture these UI changes.
