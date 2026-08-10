# AGENTS.md — AI Agent Instructions for Kamooni / Circles

This repository is developed using AI‑assisted workflows (Codex + ChatGPT).
The human operator is **not an experienced developer** and can reliably **only copy and paste commands**.

Agents must therefore operate with **extreme clarity, minimal manual editing, and safe production practices**.

---

# Core Principle

Prefer **Codex investigation and patches** over asking the human to edit files manually.

Priority order:

1. Codex investigation
2. Codex patch
3. Automated edit (sed / perl / script)
4. Manual edit by human (last resort)

Manual editing by the human should be minimized.

---

# Interaction Rules

When giving instructions:

• Provide **exact commands only**  
• Commands must be **copy‑paste safe**  
• Specify **where the command must run**

Examples:

- Local Mac terminal
- Genesis2 production server
- Docker container
- VS Code terminal
- Browser

Never assume the human can infer missing steps.

---

# One Step Rule

Only provide **one action at a time**.

Workflow:

1. Human runs command
2. Human pastes output
3. Agent analyzes output
4. Agent provides next step

Do not give multi‑step blocks unless explicitly requested.

---

# Production Environment

Server:

Cleura host `kamooniorg`

Application directory:

/root/circles/circles

---

# Deployment

Supported production deployment command:

cd /root/circles/circles && ./circles/deploy-genesis2.sh main

The `deploykamooni` shell command is not installed and must not be documented as the deployment method. `deploy-genesis2.sh` is a legacy filename retained for compatibility; do not rename it as part of deployment documentation work. Deploy only from `origin/main`.

Avoid ad‑hoc docker build commands unless troubleshooting.

---

# Deployment Verification

Always verify deployment with:

curl -sS https://kamooni.org/api/version && echo

The returned **gitSha must match the deployed commit**.

Optional runtime verification:

docker compose exec -T circles cat /app/VERSION || docker compose exec -T circles cat /VERSION

---

# Development Workflow

Preferred workflow:

1. Investigate using Codex
2. Implement change using Codex
3. Test locally or in staging
4. Merge to main
5. Deploy on `kamooniorg`
6. Verify deployment

Follow the Dev → Main checklist when promoting changes.

Golden rules:

• Never edit directly on main  
• Fast‑forward merges are preferred  
• Conflicts on main are a hard stop

---

# Chat Architecture

MongoDB is the authoritative chat backend.

Collections:

chatConversations
chatRoomMembers
chatMessageDocs
chatReadStates

Critical rule:

chatConversations.updatedAt must update whenever a message is inserted.

This controls sidebar ordering.

Earlier Matrix behavior included a fallback that attempted to force‑join a user to a room when send errors indicated they were not a member.

---

# Identity Invariant

User **DID must never change** during password reset.

Changing DID breaks:

• chat membership
• DM visibility
• identity references across collections

---

# Toolbox / Clipboard System

The **User Toolbox (clipboard)** is a client‑side dashboard aggregating personal workflow items such as:

• events
• tasks
• goals
• issues

The UI lives in:

src/components/layout/user-toolbox.tsx

It fetches events, tasks, goals, and issues via server actions and merges them into a single chronological milestone timeline.

---

# Image Storage Architecture

Images are stored in **MinIO**.

Absolute URLs are written into MongoDB **at upload time** using the `CIRCLES_URL` environment variable.

Example:

https://kamooni.org/storage/<owner-id>/<filename>

If `CIRCLES_URL` is incorrect (for example `http://127.0.0.1`), broken URLs are permanently written to MongoDB and require database repair.

Images are delivered via:

Browser → nginx → /storage → MinIO
Next.js → /_next/image → Sharp optimizer

Sharp must exist inside the runtime container for thumbnails to work.

---

# Debugging Philosophy

Before modifying code, verify:

• logs
• MongoDB records
• environment variables
• deployment version
• container state

Prefer **inspection before mutation**.

---

# Coding Philosophy

Prefer:

• small patches
• minimal surface changes
• explicit code
• predictable behavior

Avoid:

• large refactors
• unnecessary abstractions
• renaming files unless necessary

Always ask:

“What is the smallest safe fix?”

---

# Final Rule

When uncertain:

Choose the safest change requiring the **least manual work from the human** and the **lowest risk to production**.
