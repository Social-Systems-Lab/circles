# Kamooni Onboarding v2 + Contribution Engine

Last updated: March 14, 2026

---

## Purpose

The onboarding system introduces new users to Kamooni and helps them take their first meaningful action.

Kamooni is a platform designed to help people:

- discover communities
- contribute skills
- collaborate on projects
- build trust through action

The onboarding must optimize for early network growth while remaining scalable.

Core narrative:

**Find the others.**

---

## Core Design Principles

1. Reduce signup friction.
2. Capture contribution signals early.
3. Encourage the first useful action.
4. Build toward verification and trust.
5. Make the network feel alive even when small.
6. Favor active people and circles over stale noise.

---

## Minimal Signup

Required fields:

- Email
- Password
- Handle

All other profile information is collected during onboarding.

---

## Onboarding Flow

### Step 1 — Welcome

**Headline:**

Find the others.

**Subtext:**

Join people building communities, projects, and practical alternatives together.

**CTA:**

Create your account

---

### Step 2 — Account Creation

Fields:

- Email
- Password
- Handle

---

### Step 3 — Skill Selection

**Question:**

How would you like to contribute?

Selectable skills (multi-select):

- Design
- Development
- Writing
- Community organizing
- Research
- Fundraising
- Marketing
- Translation
- Project coordination
- Teaching
- Facilitation
- Operations
- Media / storytelling
- Product / strategy

Users may select multiple.

Stored in:

`skills[]`

---

### Step 4 — Issues / Interests

**Question:**

What do you care about most right now?

Examples:

- Climate
- Community building
- Democracy
- Education
- Health
- Local economy
- Open source
- Mutual aid
- Housing
- Food systems

Stored in:

`interests[]`

---

### Step 5 — Builder Question

**Prompt:**

Are you working on a project or initiative?

Options:

- I'm building something
- I want to help existing projects
- I'm exploring for now

Optional follow-up:

**What are you building?**

Stored in:

- `builderStatus`
- `builderProjectText`

---

### Step 6 — Location

**Prompt:**

Where are you based?

Options:

- Use current location
- Enter manually
- Skip

Stored in:

`locationName`

Location is optional.

---

### Step 7 — Introduction Post

**Prompt:**

Introduce yourself to the network.

Suggested template:

> Hi, I'm @handle.  
> I'm interested in [issues] and can help with [skills].  
> I'm here to connect with people working on [topic].

Intro posts appear in two places:

1. **Kamooni Welcome Circle**
2. **As “New Member” markers on the map**

New member markers appear for 7 days.

Markers use a subtle pulsing avatar treatment to signal new arrivals.

Clicking a new member marker can open a small card with:

- handle
- short intro
- selected skills
- actions such as `Say hello` and `View profile`

---

### Step 8 — Profile Completion + Verification

Users see a profile completion progress bar.

Example tiers:

- 0–30% → Basic account
- 30–70% → Contributor profile
- 70–100% → Eligible for verification

Verification unlocks:

- Join circles
- Post updates
- Message members
- Collaborate on projects

Membership and verification are separate concepts.

---

## Activity Visibility / Fade Logic

Kamooni should favor currently active people and circles.

Profiles and circles should remain in the database even when inactive, but fade from default discovery surfaces over time unless they are specifically searched for.

This behavior should apply to:

- map visibility
- suggested people
- suggested circles
- contribution recommendations

### Product intent

The network should feel alive, active, and relevant.

Inactive profiles should not create clutter or make the platform feel abandoned.

### MVP rule

Use simple recency decay based on recent activity, such as:

- profile updated
- intro post created
- task joined or completed
- circle followed
- message sent
- project updated

A basic scoring model can later determine whether a person or circle is:

- prominently visible
- lightly visible
- hidden from default discovery

Search should still return inactive profiles when explicitly queried.

---

## Profile Completion Scoring

Example weighting:

- Profile photo: 15
- Bio: 15
- Skills selected: 15
- Interests selected: 10
- Location added: 10
- Follow a circle: 10
- Intro post: 15
- Builder answer: 10

Total: 100

Verification eligibility:

`profileCompleteness >= 70`

---

## Mongo Schema Additions

User profile additions:

```ts
skills: string[]
interests: string[]
builderStatus: "building" | "contributing" | "exploring" | null
builderProjectText?: string
locationName?: string

profileCompleteness?: number
verificationEligible?: boolean

onboardingCompletedSteps?: string[]

activationState?: "new" | "engaged" | "activated"

introPostId?: string
lastActiveAt?: Date
visibilityScore?: number
```

Notes:

- `lastActiveAt` supports activity fade / ranking.
- `visibilityScore` can remain optional until the ranking layer exists.
- `profileCompleteness` may be computed server-side and cached if useful.

---

## Activation Definition

A user is considered activated when they complete one of the following:

- Follow a circle
- Add a skill
- Post an introduction

Stronger activation:

- Follow a circle and add a skill
- Follow a circle and post an introduction

---

## Contribution Engine

The Contribution Engine helps users understand the smallest useful action they can take next.

Goal:

Turn passive users into contributors.

Core loop:

1. User joins
2. User declares skills and interests
3. Platform suggests relevant actions
4. User takes action
5. Trust and visibility increase
6. Platform suggests the next useful action

---

## Contribution Engine Inputs

- `skills[]`
- `interests[]`
- `location`
- `builderStatus`
- circles followed
- projects joined
- tasks completed
- posts
- verification status
- activity recency

---

## Engine Outputs

Examples:

- You might be able to help with this
- People near you are working on this
- This project needs your skill
- You are 2 steps away from verification
- Your profile is almost ready to verify

Suggested circles should be surfaced later, once the circle ecosystem is sufficiently populated.

---

## Suggested Next Steps Widget

Primary UI surface for the engine.

Example prompts:

- Add 3 skills to help others find you
- Complete your bio to get closer to verification
- Offer help on a nearby project
- Introduce yourself so others can find you
- Finish your profile to unlock verification

---

## Initial Ranking Logic

Start with a rules-based system.

Examples:

- if no skills → suggest adding skills
- if builderStatus = building → suggest creating or describing project
- if profileCompleteness is 50–70 → suggest verification-prep actions
- if verified and no posts → suggest intro post
- if skill match exists nearby → surface help opportunity
- if profile or circle is inactive for a long period → reduce default visibility

---

## Design Goal

Increase:

- contribution rate
- profile completion
- circle follows
- task participation
- verified contributors

---

## Immediate Build Direction

The next implementation step should replace the current onboarding flow with the first onboarding v2 steps:

1. Email
2. Password
3. Handle
4. How would you like to contribute?

This should be built as a small, safe first slice before adding later steps.
