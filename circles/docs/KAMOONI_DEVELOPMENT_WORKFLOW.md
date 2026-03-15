# Kamooni Development Workflow

This document defines the **standard development process** for Kamooni.  
All development should follow this sequence to ensure stability and prevent accidental production issues.

---

# Development Workflow (Chronological)

## 1. Make Code Changes Locally

All development happens on the local machine.

Repository location:

~/circles/circles

Examples:
- Codex generated changes
- manual edits
- UI improvements
- bug fixes

Nothing touches production at this stage.

---

## 2. Verify File Changes

Before building, confirm which files changed.

Run:

git status

Make sure only the expected files are modified.

Example output:

M src/lib/data/skills.ts  
M src/components/forms/signup/onboarding-signup-flow.tsx

---

## 3. Build Locally

Always run a full build before testing.

npm run build

This step catches:

- TypeScript errors
- missing imports
- syntax mistakes

If the build fails, fix errors before continuing.

---

## 4. Run Local Development Server

Start the development server.

npm run dev

Then test the feature in the browser.

Example tests:

- onboarding flow
- profile editing
- search behavior
- skill selection

---

## 5. Functional Browser Test

Confirm that the feature works in the UI.

Example checklist for onboarding:

- onboarding loads correctly
- skill selection works
- minimum selection rules enforced
- profile displays saved data
- profile editing persists after reload

Only proceed if everything works.

---

## 6. Review Code Changes

Inspect what will be committed.

git diff

Verify the changes match expectations.

---

## 7. Commit Locally

Create a commit for the completed feature.

git add .
git commit -m "feature: description of change"

Example:

git commit -m "feat: unified skills taxonomy + onboarding featuredSkills"

---

## 8. Push to GitHub

Push the commit to the remote repository.

git push origin main

At this point:

local repository  
GitHub repository  

are aligned.

Production is still unchanged.

---

## 9. Deploy to Genesis2

Deploy the update on the production server.

Use a screen session to avoid disconnect issues.

screen -S rebuild

Then run:

cd /root/circles/circles
git pull origin main
./deploykamooni

---

## 10. Verify Production Version

After deployment, confirm the server version.

curl -s https://kamooni.org/api/version

Check that the git SHA matches the latest commit.

Example response:

{
 "version": "0.8.15",
 "gitSha": "219e574",
 "buildTime": "2026-03-15T13:51:51Z"
}

---

## 11. Production UI Test

Open:

https://kamooni.org

Verify that the new feature works on the live site.

Example:

- onboarding updates visible
- profile changes persist
- UI behaves as expected

---

# Development Principles

1. Always test locally before committing.
2. Keep commits focused on a single feature.
3. Avoid mixing unrelated changes in the same commit.
4. Never modify production files directly.
5. Always deploy from Git-backed changes.

---

# Codex Development Rule

When generating AI code changes:

- create feature branch
- apply smallest safe change
- test locally
- merge to main
- deploy through Genesis2

Never leave code changes only inside Codex worktrees.

