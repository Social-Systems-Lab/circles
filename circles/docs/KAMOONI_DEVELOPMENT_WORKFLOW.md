# Kamooni Development Workflow

This document defines the standard development process for Kamooni.
All development should follow this sequence to ensure stability, avoid workspace confusion, and prevent accidental production issues.

---

# Development Workflow (Chronological)

## 1. Confirm the Active Repo / Worktree First

Before making any code changes, verify that you are working in the same repo and worktree that the running app uses.

Run:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

If the app is run from a nested directory, explicitly note both:
- current working directory
- git repo root

Do not proceed until these match the repo you intend to edit.

---

## 2. Locate the Real Live Files Before Editing

Before changing anything, confirm the exact active files used by the running app.

Use searches such as:

```bash
find src/components -name "<filename>"
rg "<unique UI string or symbol>" src
```

Rules:
- do not assume a file path based on earlier prompts
- do not create duplicate files if an active file already exists elsewhere
- identify the exact files that render the live UI or execute the live action

Before editing, print the exact file paths you plan to modify.

---

## 3. Make Code Changes Locally

All development happens on the local machine.

Repository location used in current setup:

```bash
~/circles/circles
```

Examples:
- Codex-generated changes
- manual edits
- UI improvements
- bug fixes
- workflow and documentation updates

Nothing touches production at this stage.

---

## 4. Verify File Changes

Before building, confirm which files changed.

Run:

```bash
git status
```

Make sure only the expected files are modified.

Example output:

```bash
M src/lib/data/skills.ts
M src/components/forms/signup/onboarding-signup-flow.tsx
```

---

## 5. Review the Actual Diff Early

Inspect what changed before building.

```bash
git diff
```

Verify the changes match expectations and that the edits landed in the intended files.

---

## 6. Build Locally

Always run a full build before testing when the change is substantial or touches shared logic.

```bash
npm run build
```

This step catches:
- TypeScript errors
- missing imports
- syntax mistakes
- broken server/client boundaries

If the build fails, fix errors before continuing.

---

## 7. Run Local Development Server

Start the development server.

```bash
npm run dev
```

Then test the feature in the browser.

---

## 8. Functional Browser Test

Confirm that the feature works in the UI.

Example checklist for onboarding:
- onboarding loads correctly
- skill selection works
- minimum selection rules enforced
- profile displays saved data
- profile editing persists after reload

Example checklist for verification/moderation flows:
- expected modal or flow appears at the correct moment
- blocked actions stay blocked until requirements are met
- server-side enforcement matches UI rules
- data is persisted correctly after reload

Only proceed if everything works.

---

## 9. Prove the Changes Landed in the Active Repo Before Asking for Localhost Testing

Before saying “test this on localhost,” verify that the code is actually present in the repo/worktree the app is running from.

Run:

```bash
git status -- <changed file paths>
git diff -- <changed file paths>
rg -n "<new symbol 1>|<new symbol 2>|<new symbol 3>" <changed file paths>
```

Do not ask for localhost testing until:
- the edited files exist in this repo
- git status shows them as modified or untracked here
- the new symbols or strings are present in those exact files

This step is mandatory for Codex-assisted changes.

---

## 10. Commit Locally

Create a commit for the completed feature.

```bash
git add .
git commit -m "feature: description of change"
```

Example:

```bash
git commit -m "feat: unified skills taxonomy + onboarding featuredSkills"
```

---

## 11. Push to GitHub

Push the commit to the remote repository.

```bash
git push origin main
```

At this point:
- local repository
- GitHub repository

are aligned.

Production is still unchanged.

---

## 12. Deploy to Genesis2

Deploy the update on the production server.

Use a screen session to avoid disconnect issues.

```bash
screen -S rebuild
cd /root/circles/circles
git pull origin main
./deploykamooni
```

---

## 13. Verify Production Version

After deployment, confirm the server version.

```bash
curl -s https://kamooni.org/api/version
```

Check that the git SHA matches the latest commit.

Example response:

```json
{
  "version": "0.8.15",
  "gitSha": "219e574",
  "buildTime": "2026-03-15T13:51:51Z"
}
```

---

## 14. Production UI Test

Open:

```text
https://kamooni.org
```

Verify that the new feature works on the live site.

Example:
- onboarding updates visible
- profile changes persist
- UI behaves as expected

---

# Codex Prompt Safety Block (Reuse in Future Prompts)

Use this block near the top of any substantial Codex prompt.

```text
Before making any changes, verify that you are working in the same repo/worktree that the running app uses.

Required preflight checks:
1. Print:
   - pwd
   - git rev-parse --show-toplevel
   - git branch --show-current
   - git status --short

2. Confirm the exact app path being edited matches the running local app.
   - If the app is being run from a nested directory, note both:
     - current working directory
     - git repo root

3. Locate the actual live files before editing:
   - use find/rg to identify the real file paths for the components/actions involved
   - do not assume a file exists based on a previous prompt
   - do not create duplicate files if an active one already exists elsewhere

4. Before editing, print the exact paths of the files you will modify.

5. After editing, prove the changes landed in the active repo by showing:
   - git status --short for the changed files
   - git diff -- <changed file paths>
   - rg for the newly added symbols/strings in those exact files

6. Before telling me to test in localhost, confirm:
   - the changed files exist in this repo
   - git status shows them as modified/untracked here
   - the symbols referenced in your summary are present in those files

If any of these checks fail, stop and say explicitly that the repo/worktree does not match the running app.
Do not summarize changes as complete unless they are present in the actual working tree.
```

---

# Development Principles

1. Always verify the active repo/worktree before editing.
2. Always test locally before committing.
3. Keep commits focused on a single feature.
4. Avoid mixing unrelated changes in the same commit.
5. Never modify production files directly.
6. Always deploy from Git-backed changes.
7. Never report Codex work as complete until the changes are confirmed on disk in the active working tree.

---

# Codex Development Rule

When generating AI code changes:
- verify repo/worktree first
- locate the real live files first
- create the smallest safe change
- verify that the edits landed in the active repo
- test locally
- commit locally
- push to main
- deploy through Genesis2

Never leave code changes only inside Codex worktrees.
Never ask for localhost testing before proving that the active repo contains the changes.
