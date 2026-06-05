# CLAUDE_CONTEXT.md
# Kamooni / Circles — Persistent AI Context

This file is the stable foundation for AI-assisted development sessions.
Paste this into Claude at the start of each session, along with SESSION_LOG.md.

---

## What Kamooni Is

Kamooni is a pro-social, non-extractive alternative to conventional social platforms, built on
the open-source Circles codebase by Social Systems Lab. It is designed for changemakers,
activists, volunteers, and community builders.

Core principles:
- No ads, no data mining, no algorithmic manipulation
- Membership-funded (€5/month or €50/year target)
- All surplus returned to members via the Altruistic Wallet
- Open-source, member-governed, oligarch-free

Core features:
- Map-based interface for discovering people, projects, places ("opportunity-rolling")
- Circles: semi-autonomous community spaces with governance tools
- Goals, tasks, proposals, events, discussions, funding asks
- Contribution-based identity ("passport of character") — reputation earned through action
- Altruistic Wallet: a wallet whose contents can only be spent on others
- Chat and DMs (Mongo-native, not Matrix)
- Stripe integration for memberships and project funding
- LiveKit integration planned for video meetings

The platform is live at: https://kamooni.org
GitHub: https://github.com/Social-Systems-Lab/circles

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Database | MongoDB |
| Object storage | MinIO |
| Vector/semantic search | Qdrant |
| Infrastructure | Docker / Docker Compose |
| Reverse proxy (prod) | nginx |
| Email | Postmark |
| Payments | Stripe |
| UI | Radix UI, Tailwind CSS, shadcn/ui |
| Maps | Mapbox GL |
| Auth | Custom (JWT/jose) |
| Video (planned) | LiveKit |

Version at time of writing: 0.8.15

---

## Repo Structure

Root: `/Users/timmidnightmac/circles/`
App code: `/Users/timmidnightmac/circles/circles/`
Docs: `/Users/timmidnightmac/circles/docs/`

Key source paths:
- `circles/src/app/` — App Router pages, layouts, API routes
- `circles/src/components/` — UI and feature components
- `circles/src/lib/data/` — MongoDB access and backend logic
- `circles/src/models/` — shared schema/data shape definitions

Important files:
- `circles/src/lib/data/mongo-chat.ts` — chat backend
- `circles/src/components/modules/chat/` — chat UI + actions
- `circles/src/components/layout/user-toolbox.tsx` — personal dashboard/clipboard
- `circles/src/lib/data/event.ts` — events logic
- `circles/src/lib/data/member.ts` — memberships/permissions
- `circles/src/app/api/version/` — deployment verification endpoint

---

## Production Environment

- Server: Cleura (kamooniorg)
- SSH: `ssh ubuntu@91.123.202.241` then `sudo -i`
- App directory on server: `/root/circles/circles/circles`
- Deploy: `git pull --ff-only origin main` then `docker compose up -d --build circles nginx cron`
- Verify deployment: `curl -s https://kamooni.org/api/version`
- Note: gitSha may show as unknown on Cleura — verify by checking `git rev-parse --short HEAD` and live UI

---

## Development Workflow

1. Make changes on a feature branch (never directly on main)
2. Test locally at localhost
3. If happy, merge to main (fast-forward preferred)
4. SSH into Cleura, pull main, rebuild with docker compose
5. Verify with `/api/version`
6. Update SESSION_LOG.md

Golden rules:
- Never edit directly on main
- Fast-forward merges preferred
- Conflicts on main are a hard stop
- Verify deployment after every push

---

## Architecture Notes

- Chat is Mongo-native (not Matrix — all Matrix references are legacy)
- `chatConversations.updatedAt` must update on every message insert (controls sidebar order)
- User DID must never change (breaks chat membership, DM visibility, identity references)
- Images stored in MinIO; absolute URLs written to MongoDB at upload time using `CIRCLES_URL`
- If `CIRCLES_URL` is wrong, broken URLs are permanently written to DB and need repair
- Image delivery: Browser → nginx → /storage → MinIO

---

## AI Workflow Rules (from AGENTS.md)

The human operator is not an experienced developer and can only copy/paste commands.

Priority order for all changes:
1. Claude Code investigation
2. Claude Code patch
3. Automated edit (sed/perl/script)
4. Manual edit by human (last resort — avoid)

Instruction rules:
- Provide exact commands only
- Commands must be copy-paste safe
- Specify where each command runs (local Mac terminal / Cleura server / Docker container)
- One step at a time: human runs → pastes output → Claude analyzes → next step

Coding philosophy:
- Small patches, minimal surface changes
- Explicit code, predictable behaviour
- No large refactors, no unnecessary abstractions
- Always ask: "What is the smallest safe fix?"

---

## Session Workflow

At the start of each session:
1. Paste CLAUDE_CONTEXT.md + SESSION_LOG.md into Claude chat
2. Describe what you want to work on
3. Claude plans and confirms approach
4. Claude writes implementation brief for Claude Code
5. Run in Claude Code, test locally
6. If happy, push to main and deploy
7. Update SESSION_LOG.md together before closing
