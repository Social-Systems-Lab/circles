# Kamooni System Architecture

High-level architecture overview for the Kamooni platform.

---

# 1. Platform Overview

Kamooni is a community collaboration platform designed to help people discover projects, contribute skills, and coordinate collective action.

The system combines:

- social networking
- volunteer coordination
- project collaboration
- real-time messaging

Core goals:

- enable contribution
- surface opportunities to help
- build trust and reputation
- connect communities globally

---

# 2. Core Technology Stack

Frontend:

Next.js (App Router)

Backend:

Node.js server actions

Database:

MongoDB

Storage:

MinIO (S3-compatible object storage)

Vector Search:

Qdrant (used for semantic search and future matching)

Chat:

Mongo-native chat engine

Deployment:

Docker containers on Circles-Genesis2

---

# 3. Major System Components

## Identity System

User identities are stored as circles with:

circleType: "user"

This allows users and organizations to share the same core data model.

---

## Circles System

Circles represent:

- individuals
- projects
- communities
- organizations

Each circle can contain:

- offers (skills available)
- needs (skills requested)
- tasks
- events
- posts

---

## Chat System

Chat is implemented as a Mongo-native messaging engine.

Collections:

- chatConversations
- chatMessageDocs
- chatRoomMembers
- chatReadStates

Supported conversation types:

- dm
- group
- announcement

Architecture details:

See:

CHAT_SYSTEM_ARCHITECTURE.md

---

## System Messaging

Platform messages are delivered through chat.

Examples:

- welcome messages
- platform announcements
- admin broadcasts

Details:

SYSTEM_MESSAGES_ENGINE.md

---

## Matching Engine

Matching connects:

- offers (skills people have)
- needs (skills projects request)

Matching is used in:

- circle pages
- explore page
- future task system

---

## Task System (planned)

Tasks allow circles to request specific help.

Example:

"Translate website into Spanish"

Tasks will eventually support:

- skill matching
- contribution history
- reputation tracking

---

# 4. Deployment Architecture

Production environment:

Server: Circles-Genesis2

Core services:

- Next.js app container
- MongoDB
- MinIO
- Qdrant
- cron container

Deployment command:

deploykamooni

Production code path:

/root/circles/circles

---

# 5. Key Architectural Principles

Kamooni architecture prioritizes:

- simplicity
- transparency
- extensibility

Important rules:

1. Mongo is the primary data store
2. Chat uses the same DB as the platform
3. Conversations normalize before UI use
4. UI must rely on normalized flags
5. System messages reuse chat infrastructure

---

# 6. Future Architecture Expansion

Upcoming major systems include:

- tasks engine
- contribution history
- reputation signals
- improved semantic search
- notification system

These systems build on the same core identity and circle model.

---

# 7. Developer Entry Points

Start here when exploring the codebase:

- src/app
- src/components
- src/lib/data
- src/lib/chat

Additional details:

See:

REPO_STRUCTURE_MAP.md

# Related Architecture Documents

For deeper technical details see:

- REPO_STRUCTURE_MAP.md
- CHAT_SYSTEM_ARCHITECTURE.md
- SYSTEM_MESSAGES_ENGINE.md
- DEPLOYMENT_ARCHITECTURE.md
- DEBUG_PLAYBOOK.md
## User Lifecycle

User lifecycle stages:

1. Signup
2. Onboarding
3. Activation
4. Verification
5. Contribution

### Onboarding signals collected

- skills
- interests
- location
- builder status
- project description

### Profile completeness

Profile completeness is used to guide users toward verification readiness.

Suggested thresholds:

- 0–30% → basic account
- 30–70% → contributor
- 70–100% → eligible to verify profile

### Verification

Verification is distinct from paid membership.

Verification should unlock higher-trust interaction capabilities such as:

- joining circles
- messaging members
- posting updates
- collaborating on projects

Recommended gate:

- `profileCompleteness >= 70`

### Activation metric

A user is considered activated when they complete at least one of:

- follow a circle
- offer a skill
- post an introduction


---

# 8. Contribution Signal Layer (MCP)

Kamooni captures early-stage economic intent during onboarding via a donation/volunteering prompt.

This data is stored on the user document as `donationIntent` and aggregated into **MCP (Monthly Contribution Potential)**.

MCP represents the total potential monthly contributions users indicate they would make if contribution mechanisms were available.

## Current Implementation

### Storage (User Document)

```ts
donationIntent: {
  amount?: number,
  volunteering?: boolean,
  skipped?: boolean,
  updatedAt: Date
}
```

### Aggregation

- Function: `getOnboardingMcpStats()`
- Location: `src/lib/data/user.ts`

Calculates:
- totalUsersWithDonationIntent
- usersWithAmount
- totalMonthlyContributionPotential
- averageMonthlyContributionPotential
- volunteeringCount
- skippedCount
- amountBuckets

## Access

- Admin dashboard (internal only)
  - `/admin` → Server Settings → Onboarding MCP Summary

- CLI:
  - `npx tsx scripts/report-onboarding-mcp.ts`

## Purpose

- Measure latent economic potential before payment systems exist
- Validate contribution-driven model
- Support fundraising and strategy
- Establish baseline for contribution economy

## Strategic Role

Intent → Measurement → Activation → Transactions

## Future Evolution

- Contribution segmentation
- Activation flows
- Altruistic Wallet integration
- Trust and reputation layer
- Contribution-based personalization
