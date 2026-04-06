# Kamooni Toolbox Structure

This document describes the current structure and intent of the Kamooni user toolbox.

The toolbox is a personal workflow panel. It aggregates things that belong to the current user across the system and keeps personal workflow items accessible in one place.

## Main UI file

Primary UI file:

- `src/components/layout/user-toolbox.tsx`

## Shift Tasks / participation-based work

Shift tasks are scheduled participation opportunities, not deliverable-style completion tasks.

Use a shift task when a circle needs people to show up for a scheduled slot, not when a single assignee is expected to deliver finished work.

Required shift fields:

- date
- start time
- duration
- slots

Product behavior:

- users sign up for a shift
- admins or moderators confirm participants
- only confirmed participants are shown publicly
- pending sign-ups stay private to admins and moderators
- public counts should reflect confirmed participation
- confirmed participants cannot silently leave
- participant notes can be used for instructions such as what to bring or where to meet

Normal outcome tasks remain on the existing accept, progress, review, verify, and resolve workflow.
