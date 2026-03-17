# Onboarding Architecture — 30s Overview

## Flow

1. Welcome
2. Account creation
3. Skills selection
4. Interests selection
5. Profile setup
6. Support (NEW)

## Support Step (NEW)

Users are asked:

- Monthly donation intent:
  - €5 / €10 / €25 / €50 / €100+ / custom
- OR volunteering intent
- OR skip

Purpose:
- Gauge contribution intent early
- Prepare for Contribution Engine
- No commitment required

## Completion

After Support step:
- Completion animation (standalone screen)
- Optional "Thank you for participating"
- Redirect to:

/circles/{handle}/home

## Current State

- UX complete
- Data NOT yet persisted
- Next step: store + activate intent

## Design Principles

- Minimal friction
- Ask contribution intent at peak engagement
- Progressive activation (UX → data → system)
