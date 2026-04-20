# STANDARD_CODEX_PROMPT.md

Use this template for Kamooni / Circles development tasks.

---

## Standard Codex Prompt Header

```text
Kamooni / Circles — Codex task

Read first:
- AGENTS.md
- docs/STANDARD_CODEX_PROMPT.md
- Any feature-specific docs relevant to this task

Repo context:
- Main repo: ~/circles/circles
- Stack: Next.js App Router, TypeScript, MongoDB, MinIO, Qdrant
- This is a live production system
- Make the smallest safe change

Critical branch-base rule:
- First determine the correct base branch for this task
- Default integration branch is latest origin/dev
- Only base on origin/main if explicitly told this work should land directly on main
- Before editing, fetch latest refs and state clearly which base branch you chose and why

Required pre-edit checks:
- git fetch origin
- print current branch
- print chosen base branch
- git status --short
- git log --oneline --decorate -5
- if relevant files are in active/shared areas, compare main vs dev before editing

Active/shared areas include:
- chat
- notifications
- relationships / contacts
- profile actions
- tasks / goals / issues
- funding
- deployment

Recommended overlap check:
cd ~/circles/circles
git fetch origin
git diff --stat origin/main..origin/dev -- <relevant files>

If the relevant files differ materially between main and dev, base the task on dev unless explicitly instructed otherwise.

Required workflow:
1. Fetch latest refs
2. Choose the correct base branch
3. Create a feature branch from that base
4. Investigate relevant files first
5. Implement the smallest safe change
6. Test locally on localhost before push/deploy
7. Show git diff before commit
8. Commit
9. Push feature branch
10. Ensure changed files end up in ~/circles/circles, not only in a worktree
11. Verify with git status --short from ~/circles/circles
12. Report exact file locations, branch name, and commit hash

Important implementation rules:
- Do not refactor unrelated code
- Do not widen scope unnecessarily
- Prefer boring, explicit code
- Reuse existing patterns where possible
- Avoid manual editing by the human whenever possible
- If manual editing is unavoidable, provide exact copy-paste-safe instructions

Testing rules:
- Test the specific changed flow locally when practical
- State exactly what was tested
- State exactly what could not be tested and why

Diff and commit rules:
- Show a concise diff summary before commit
- Use a clear commit message
- Report the final branch and commit SHA

File-location rule:
- All final code changes must end in the main repo at ~/circles/circles
- If working from a Codex worktree, copy changes back before finishing
- Verify final state with:
  cd ~/circles/circles && git status --short

Deployment reminder:
- Production server workflow uses kamooniorg
- Use:
  sudo -i
  cd /root/circles/circles
- Run long builds/deploys in screen
- After deploy verify:
  curl -sS https://kamooni.org/api/version && echo

Expected output from Codex:
1. Chosen base branch and why
2. Relevant files inspected
3. Smallest-safe implementation summary
4. Exact files changed
5. Local test steps and results
6. Diff summary before commit
7. Commit message
8. Branch name and commit hash
9. Final verification from ~/circles/circles including git status --short
```

---

## Short reusable branch-check snippet

Use this near the top of feature prompts when the correct base branch matters:

```text
Before coding, fetch latest refs and determine the correct base branch for this task.
Default to latest origin/dev unless I explicitly say this should land directly on main.
If the files touched by this task differ materially between origin/main and origin/dev, base the task on dev and say so explicitly.
Print:
- current branch
- chosen base branch
- git status --short
- git log --oneline --decorate -5
before making changes.
```

---

## Short reusable file-location snippet

```text
Before finishing, ensure all edited files are present in ~/circles/circles, not just in a Codex worktree.
Then run:
cd ~/circles/circles && git status --short
Report the output and the final file locations.
```

---

## Short reusable deploy reminder snippet

```text
If this task is later deployed, production workflow is:
sudo -i
cd /root/circles/circles

Run long deploy/build commands inside screen.
After deployment verify:
curl -sS https://kamooni.org/api/version && echo
```
