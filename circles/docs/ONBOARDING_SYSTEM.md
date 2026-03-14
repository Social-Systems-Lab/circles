# Kamooni Onboarding System

Last updated: March 2026

## Purpose

The onboarding system introduces new users to Kamooni and collects key signals used for personalization, discovery, and contribution matching.

Primary goals:

- minimize signup friction
- identify contributors early
- guide users toward profile completion
- gate verification behind meaningful identity signals

## Core Narrative

**Find the others.**

Kamooni connects people building communities and projects for positive change.

Early users are pioneers shaping the network.

## Onboarding Flow

1. Welcome
2. Account creation
3. Choose handle
4. Skill selection
5. Issue selection
6. Builder question
7. Location
8. Map moment
9. Suggested circles
10. Profile completion
11. Verification request

## Skill Selection

Users select how they can contribute.

Examples:

- Design
- Development
- Writing
- Community organizing
- Research
- Fundraising
- Marketing
- Translation
- Teaching
- Project coordination

These signals are used for:

- contributor discovery
- project matching
- ecosystem analytics

## Profile Completion System

Users see a completion bar indicating progress.

Example:

- 0–30% → basic account
- 30–70% → contributor
- 70–100% → verification eligible

Completion signals:

- profile photo
- bio
- skills
- interests
- location
- follow circle
- intro post

## Verification System

Users must request verification to unlock full platform functionality.

**Verify your profile**

Verification allows:

- joining circles
- messaging members
- posting updates
- collaborating on projects

Verification requires:

- `profileCompleteness >= 70`

Membership and verification are separate concepts.

Financial support and Founding Member status may provide community/governance benefits, but verification is about trust and identity.

## Activation Metric

A user is considered activated when they:

- follow a circle
- offer a skill
- post an introduction

## Data Collected

- `skills[]`
- `interests[]`
- `location`
- `builderStatus`
- `projectDescription`
- `profileCompleteness`
- `verificationStatus`

## Sprint Implementation Order

1. Skill selection onboarding step
2. Profile completion bar
3. Verification gate logic
4. Suggested circles improvements

## Future Improvements

- dynamic circle recommendation
- contributor matching
- project discovery
- activation experiments
- stronger local discovery
