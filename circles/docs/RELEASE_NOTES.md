# Release Notes

## Current main - Task UX updates
- Added optional priority to ordinary tasks with Low, Medium, High, and Critical values. Priority is unset by default, and Help Wanted urgency was intentionally not changed in this pass.
- Main Tasks page now supports multi-select stage filtering, priority filtering, Assigned To sorting, and explicit urgency ordering for priority sorting.
- Reordered the task form to: Create in, Title, Date + Priority, Description, Image, Location, Goal, Event. Description remains optional, and Goal/Event can still be preselected from their context.
- Main Tasks page now persists selected stages, selected priorities, sort order, and search text locally for that page only.
- Resolved tasks are hidden from the active list by default and moved into a bottom expandable section that auto-expands when current filters only match resolved tasks.
- Task side panel now supports direct priority editing, immediate visual sync for priority and stage changes, and a more stable header layout for long titles.

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
