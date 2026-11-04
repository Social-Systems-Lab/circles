# AGENTS.md — Kamooni / Circles AI Development System (v2)

Last updated: March 2026

---

# PURPOSE

This file defines how AI agents (Codex, ChatGPT) must operate when working on the Circles / Kamooni codebase.

Goals:

- Safe changes
- Fast iteration
- Minimal breakage
- Reproducible workflow

This is a **production system**. All changes must be careful and verifiable.

---

# CORE PRINCIPLES

## 1. Smallest Safe Change

Always ask:

> What is the smallest possible fix?

Avoid:

- large refactors
- renaming files unnecessarily
- changing unrelated code

Prefer:

- 1–10 line patches
- surgical edits
- minimal surface area

---

## 2. Codex First

Preferred workflow:

1. Investigate (read code first)
2. Implement using Codex
3. Run lightweight automated checks locally
4. Commit, push, and open a pull request when explicitly requested
5. Deploy to staging only when explicitly authorized, then run the appropriate Docker, integration, and desktop/mobile browser validation
6. Only after explicit approval: merge to `main` and deploy production

Local Mac remains the primary environment for Codex development, Git operations, code review, lightweight automated tests, TypeScript, and lint. Local Docker builds are optional and are required only when a specific local test genuinely needs one.

Codex must NOT merge to `main` or deploy to staging or production without explicit authorization for that action. Production deployment also requires the approved release, successful checks, and the production procedure below.

### Autonomous execution and approval boundaries

- For work the user has authorized, inspect the relevant code and instructions, make the focused changes, run appropriate local checks, and complete explicitly requested source-control steps without asking the user to perform routine tasks.
- Do not stop at an intermediate status when safe, authorized work remains. Continue through implementation, verification, and documentation, then report the result together. If one part is blocked, explain the specific blocker and continue independent work.
- Authorization is limited to the requested scope. Permission to create a branch, commit, push, or open a pull request does not authorize merging or deployment.
- Never merge, deploy, alter live production or staging services or data, change live credentials or environment configuration, activate security-sensitive feature flags, or perform another externally visible or difficult-to-reverse action without explicit authorization for that action.
- Read-only inspection and properly isolated disposable tests may proceed when within scope. If isolation cannot be established, stop that operation and report the prerequisite. Do not send external messages or emails unless explicitly authorized.
- Complete safe, reviewable work before requesting approval that is genuinely required. State the exact action needing approval and why.

### Session continuity and handover

- Recommend a fresh Codex session when moving to an unrelated task or when accumulated context may be unreliable.
- A new session must not assume it has prior conversation history. On resumption, inspect the branch, working tree, relevant commits, repository instructions, and any handover; preserve applicable decisions and constraints.
- Verify actual repository state before resuming work. Do not repeat completed work unnecessarily.
- At the end of substantial work, provide a self-contained handover with the current branch, relevant commits, completed work, checks performed, outstanding issues, and recommended next action.
- Include enough context for a new session to continue without relying on earlier conversation messages.

### Delegation

- Delegate only when it materially helps and the user or applicable repository instructions authorize it. Coordinate shared-file edits and review delegated findings.
- The primary agent remains responsible for the complete result, verification, and final report.

Avoid manual editing unless absolutely necessary.

---

## 3. One Step at a Time

Human operator:

- copy-pastes commands
- runs them
- returns output

Therefore:

- Give one exact, copy-paste-safe action at a time when a human must run a command or make a decision.
- The agent should run routine authorized commands and inspect their outputs autonomously; do not ask the human to relay routine results.
- Wait for human output only when the next step depends on an action that genuinely requires their access or judgment.

---

## 4. Boring > Clever

Prefer:

- explicit code
- predictable logic
- simple patterns

Avoid:

- abstractions
- overengineering
- premature optimization

---

# REPOSITORY RULES

## Source of Truth

ALL code must end up in:

~/circles/circles

Never leave changes inside:
.codex/worktrees/

Before finishing ANY task:

```bash
git status --short
```

Must be clean and correct.

Feature Branch Workflow

Always use:

git checkout -b feature/<name>

Flow:

Create branch

Make changes

Test locally

Commit

Push

Merge into main ONLY after validation

Testing

Before staging:

run relevant lightweight automated checks locally

run TypeScript and lint where relevant

review the diff

Push feature branches to GitHub and use staging for full Docker builds, integration testing, and desktop/mobile browser validation. Never routinely hot-edit staging. Tests requiring disposable databases must use isolated test instances; never run destructive integration tests against staging's persistent database.

Never automatically delete Docker volumes, databases, or persistent storage. For local disk maintenance, prefer conservative pruning of unused Docker build cache. Never recommend `docker system prune --volumes` or `docker volume prune`.

DEPLOYMENT RULES (CLEURA)

Deployment server:
Cleura host `kamooniorg`

Production path:
/root/circles/circles

Deployment Command

Always use:

cd /root/circles/circles && ./circles/deploy-genesis2.sh main

The `deploykamooni` shell command is not installed and must not be documented as the deployment method. `deploy-genesis2.sh` is a legacy filename retained for compatibility; do not rename it. Deploy only from `origin/main`.
Screen Session (REQUIRED)

Long builds must run inside screen:

screen -S rebuild
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
Deployment Verification (MANDATORY)

After deploy:

curl -sS https://kamooni.org/api/version && echo

Expected:

gitSha must match latest commit

Optional:

docker compose exec -T circles cat /app/VERSION || docker compose exec -T circles cat /VERSION
PRODUCTION SAFETY RULES

NEVER:

hot-edit production without Git

deploy without verification

mutate identity model (DID)

bypass CI

ALWAYS:

deploy from origin/main

verify /api/version

sync fixes back to GitHub

require an approved release and successful checks

keep staging-only email capture out of production release branches

DATABASE RULES (CRITICAL)
Mongo is the source of truth

Key collections:

chatConversations

chatRoomMembers

chatMessageDocs

chatReadStates

CRITICAL RULE

chatConversations.updatedAt MUST be updated on every message

This controls:

chat ordering

UI correctness

IMAGE STORAGE RULES

Images stored in:
MinIO

URLs written at upload time using:
CIRCLES_URL

Example:

https://kamooni.org/storage/
<owner>/<filename>

WARNING:
If CIRCLES_URL is wrong → broken URLs are permanently stored in Mongo

DEBUGGING RULES

Always verify before changing:

logs

runtime state

database records

environment variables

deployed version

Never guess.

AI EXECUTION CHECKLIST

Before making changes:

Read relevant files

Identify exact problem

Confirm assumptions

During changes:

Keep patch minimal

Avoid unrelated edits

After changes:

Test locally

Verify UI behavior

Check database impact

Before finishing:

Ensure files are in ~/circles/circles

Run:

git status --short
PHILOSOPHY

This system is built with AI-assisted development.

Human focuses on:

architecture

product decisions

testing

AI focuses on:

code edits

debugging

patch generation

Goal:

More thinking
Less typing
Safer systems
Faster iteration

FINAL RULE

If there is any ambiguity:

Choose the option that:

requires the least manual work

has the lowest risk to production
