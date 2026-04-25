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
3. Test locally
4. Stop for human local browser check
5. Only after explicit approval: commit, merge, push, deploy

Codex must NOT merge, push, or deploy after local checks until the human has completed a local browser test and explicitly approved proceeding.

Avoid manual editing unless absolutely necessary.

---

## 3. One Step at a Time

Human operator:
- copy-pastes commands
- runs them
- returns output

Therefore:
- NEVER give multiple steps at once
- ALWAYS wait for output

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

Local Testing (MANDATORY)

Before pushing:

run build

test in browser (localhost)

verify feature works

verify nothing broke

DEPLOYMENT RULES (GENESIS2)

Deployment server:
Circles-Genesis2

Production path:
/root/circles/circles

Deployment Command

Always use:

deploykamooni

Which runs:

cd /root/circles/circles
./deploy-genesis2.sh main
Screen Session (REQUIRED)

Long builds must run inside screen:

screen -S rebuild
deploykamooni
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

