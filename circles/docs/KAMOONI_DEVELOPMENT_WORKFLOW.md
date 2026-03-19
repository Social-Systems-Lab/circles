# Kamooni Development Workflow

This document defines the standard development process for Kamooni.
All development should follow this sequence to ensure stability, avoid workspace confusion, and prevent accidental production issues.

---

## Enforcement Rule (Project Standard)

Always follow the Kamooni Codex Prompt Template for any implementation task.

Before writing or executing any code-related prompt:
- enforce repo/worktree verification (pwd, git root, branch, status)
- require explicit file path confirmation using rg/find
- require git diff / status proof before declaring completion
- never assume the correct repo; always verify

Do not proceed with implementation if the active repo/worktree is not confirmed.

Treat docs/KAMOONI_DEVELOPMENT_WORKFLOW.md as the source of truth.

---

# Development Workflow (Chronological)

## 1. Confirm the Active Repo / Worktree First

Before making any code changes, verify that you are working in the same repo and worktree that the running app uses.

Run:

pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short

If the app is run from a nested directory, explicitly note both:
- current working directory
- git repo root

Do not proceed until these match the repo you intend to edit.

---

## 2. Locate the Real Live Files Before Editing

Before changing anything, confirm the exact active files used by the running app.

Use searches such as:

find src/components -name "<filename>"
rg "<unique UI string or symbol>" src

Rules:
- do not assume a file path based on earlier prompts
- do not create duplicate files if an active file already exists elsewhere
- identify the exact files that render the live UI or execute the live action

Before editing, print the exact file paths you plan to modify.

---

## 3. Make Code Changes Locally

All development happens on the local machine.

---

## 4. Verify Changes Before Testing

Before testing in localhost, confirm:

- git status shows your changes
- git diff reflects intended modifications
- new symbols/functions exist via rg

Do not test if changes are not present in the working tree.

---

## 5. Localhost Testing

Only after verification:

- restart dev server if needed
- hard refresh browser
- test the exact user flow

---

## 6. Commit in Logical Units

Stage only relevant files:

git add <files>

Avoid:
git add .

---

## 7. Push Carefully

git commit -m "clear message"
git push origin main

---

## Core Principle

Never trust assumed state.
Always verify the active repo, active files, and actual code on disk before proceeding.
