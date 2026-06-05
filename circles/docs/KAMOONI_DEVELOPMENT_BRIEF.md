# Kamooni Development Brief
Launch Readiness + Codex Sprint Plan

Last updated: March 2026

---

# Project Overview

Kamooni is a community coordination platform designed to help people:

- discover communities
- contribute skills
- collaborate on projects
- build trust through action

The long-term vision is a global contribution network where people coordinate meaningful work and build reputation through verified contributions.

---

# Platform Targets

Early sustainability target:

10,000 users  
2,000 members (€5/month)  
10 ecosystem supporters (€500/month)

Revenue goal:

€10,000/month baseline operating budget.

Timeline goals:

End Q2 → 1,000 users  
End Q4 → 10,000 users  
End Q4 → 2,000 members

---

# Core Success Metric

Contribution Rate

contributors / active users

Healthy ranges:

10% → promising  
15% → strong  
20% → critical mass likely

Contributors include users who:

- offer help
- ask questions
- complete tasks
- create circles
- collaborate with others

---

# Contribution Ladder

1. Discover circle
2. Ask a question
3. Offer help
4. Complete a task
5. Become regular contributor
6. Lead project

Key UX question everywhere:

"What is the smallest useful thing I can do right now?"

---

# Launch Readiness Requirements

## Onboarding

Users must be able to:

- create profile
- add skills
- select location
- follow circles
- see opportunities

Goal: onboarding in under **2 minutes**.

---

## Verification System

Users can browse but **cannot interact until verified**.

Restricted until verified:

- posting
- messaging
- creating circles
- creating tasks

Allowed:

- browsing
- following circles
- viewing events

Verification methods:

- email verification
- invite verification (existing verified user confirms)

---

## Search

Search must return:

- circles
- users
- skills
- tasks
- events

Approach:

hybrid semantic + keyword search.

---

## Notifications

Required:

- in-app notifications
- email notifications

Notification types:

- message replies
- task invitations
- circle announcements
- event reminders

---

## Security Baseline

Minimum protections:

- strong password hashing
- login rate limiting
- optional 2FA
- role-based access control
- dependency vulnerability scanning

---

## Moderation

Admins can:

- suspend users
- hide posts
- remove members
- manage reports

Users can:

- report abuse
- block users

---

## Events

Events must support:

- invites
- RSVP
- calendar links
- video meeting links

---

## Backup and Recovery

Required:

- automated database backups
- restore procedures
- storage backups

---

# Architecture Freeze

Before public launch the following systems must remain structurally stable:

Identity system
- user model
- circle model
- membership model

Chat system
- Mongo conversation schema
- message schema
- admin contact flow

Skills taxonomy
- skills v2 schema

Circle model
- circleType
- offers
- needs
- members
- roles

Deployment architecture
- Docker stack
- MongoDB
- storage
- domain routing

Allowed changes:

- UI improvements
- security improvements
- performance improvements

---

# Codex Development Strategy

Development order:

Identity → Safety → Communication → Discovery → Contribution

---

# Codex Sprint 1 — Identity & Safety

Goal: prevent bots and protect accounts.

Tasks:

1. Add verificationStatus to user model

Fields:

verificationStatus  
verifiedAt  
verifiedBy

---

2. Email verification flow

- verification token
- verification endpoint
- resend flow

---

3. Invite verification

Existing verified users can verify another user.

Store:

verifierDid

---

4. Interaction restriction middleware

If not verified block:

- posting
- messaging
- creating circles
- creating tasks

Allow:

- browsing
- following circles
- viewing events

---

5. Login rate limiting

Protect against brute force attacks.

---

6. Session security improvements

- token rotation
- logout all sessions option

---

# Codex Sprint 2 — Onboarding

Tasks:

- onboarding UI flow
- skill picker
- circle recommendations
- first opportunities screen

---

# Codex Sprint 3 — Notifications

Tasks:

- notification model
- in-app notification UI
- email notification worker
- notification preferences

---

# Codex Sprint 4 — Search

Tasks:

- search index builder
- hybrid semantic + keyword search
- explore search improvements

---

# Codex Sprint 5 — Stability

Tasks:

- dependency vulnerability automation
- automated backups
- event system fixes

---

# Early Community Strategy

Target: **20–30 founding circles**

Types:

- project communities
- local civic groups
- volunteer organizations
- knowledge communities
- event communities

Each typically brings:

20–50 users.

---

# Beta Launch Strategy

Invite:

200–300 users  
20 circles

Run beta for **4–6 weeks** before open launch.

---

# Final Principle

Make it easy for users to:

discover communities  
offer help  
complete small contributions  
build trust through action

Low friction → high contribution rate → sustainable community growth.
