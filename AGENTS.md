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

This rule applies when a human must perform an action. It does not require the agent to pause between routine investigation, edits, commands, or checks that are already authorized. Prefer completing authorized work autonomously and report the result together. Ask the human to run commands only when the action requires their access or judgment.

---

# Autonomous Execution, Approval Boundaries, and Handover

## Autonomous execution

- For work the user has authorized, inspect the relevant code and instructions, make the necessary focused changes, run appropriate local checks, and complete any explicitly requested source-control steps without asking the user to perform routine tasks.
- Do not stop at an intermediate status when safe, authorized work remains. Continue through implementation, verification, and documentation, then provide a consolidated report.
- If a decision or access dependency blocks part of the task, explain the specific blocker. Continue independent work that does not depend on it.
- Keep the user informed with concise progress updates during longer work. Do not use progress updates to ask for approval; use the required approval mechanism for actions that need it.

## Approval boundaries

- Authorization is limited to the actions and scope the user requested. Permission to create a branch, commit, push, or open a pull request does not authorize merging or deployment.
- Never merge or deploy, alter live production or staging services or data, change live credentials or environment configuration, activate registration or security-sensitive feature flags, or perform another externally visible or difficult-to-reverse action without explicit authorization for that action.
- Read-only inspection and appropriately isolated disposable tests may proceed when they are within the task scope. If environment or data isolation cannot be established, stop that operation and report what approval or prerequisite is needed.
- Do not send messages, emails, or other external communications unless explicitly authorized. Use test transports and synthetic identities for tests.
- Complete safe, reviewable work before requesting an approval that is genuinely required. State what action needs approval and why.

## Session continuity

- Recommend starting a fresh Codex session when the user moves to an unrelated task or accumulated context may no longer be reliable.
- A new session must not assume it has the previous session's history. On resumption, inspect the current branch, working tree, relevant commits, repository instructions, and any handover before continuing. Preserve prior decisions, constraints, and unfinished objectives that remain applicable.
- Do not restart completed work unnecessarily. Verify the current state first and continue from the actual repository state.

## Delegation

- Delegate only when parallel work materially helps and the user or applicable repository instructions authorize delegation. Keep shared-file edits coordinated, and review delegated findings before relying on them.
- The primary agent remains responsible for the complete result, verification, and final report.

## Handover

- At the end of substantial work, provide a self-contained handover summary with the current branch, relevant commit(s), completed work, checks performed, outstanding issues, and the recommended next action.
- Include enough context for a new session to continue without relying on earlier conversation messages.

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
3. Run relevant local checks and tests
4. Perform local browser or staging verification when appropriate and authorized
5. Commit, push, and open a pull request when explicitly requested
6. Merge only after explicit approval
7. Deploy only after separate explicit approval, using the deployment procedure below

Follow the Dev → Main checklist when promoting changes.

Steps that require live infrastructure or external side effects remain subject to the approval boundaries above. A request to prepare or open a pull request does not authorize merging or deploying it.

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
