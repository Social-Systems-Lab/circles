# AGENTS.md

Kamooni / Circles — AI Development Rules

This repository is a live production system. Changes must be safe, incremental, and easy to verify.

## Core assumptions

Assume the human operator:
- is not an experienced developer
- should receive exact copy-paste-safe commands only
- should be given one step at a time
- should run the command and paste the output before continuing
- should do as little manual editing as possible

Therefore:
- prefer investigation before modification
- prefer Codex patches over manual editing
- prefer the smallest safe change
- avoid broad refactors unless explicitly requested

## Primary rule: Codex first

Whenever possible:
1. Investigate the codebase with Codex
2. Implement the change with Codex
3. Test locally
4. Merge cleanly
5. Deploy safely
6. Verify production

Preferred order of implementation:
1. Codex patch
2. One-line automated edit
3. Scripted edit
4. Manual editing by the human only as a last resort

If manual editing is unavoidable, always specify:
- exact file path
- exact text to find
- exact replacement
- what line comes before
- what line comes after

## Branch-base rule (critical)

Codex must determine the correct base branch before making changes.

Default rule:
- normal integration work must start from the latest `origin/dev`
- only start from `origin/main` when explicitly told the change is intended to land directly on `main`

Before editing anything, Codex must:
1. fetch latest refs
2. identify the intended integration branch
3. check out the correct base branch
4. create a fresh feature branch from that base

### Required pre-edit branch check

Before making any code changes, Codex must print or verify:
- current branch name
- chosen base branch (`dev` or `main`)
- `git status --short`
- `git log --oneline --decorate -5`

If the task is expected to merge into `dev`, Codex must explicitly say it is working from latest `origin/dev`.

### Required active-file overlap check

Before editing, if the task touches active/shared areas such as chat, notifications, relationships, profile actions, tasks, funding, or deployment logic, Codex must check whether those files differ materially between `main` and `dev`.

Recommended check:

```bash
cd ~/circles/circles
git fetch origin
git diff --stat origin/main..origin/dev -- <relevant files>
```

If relevant files differ materially between `main` and `dev`, Codex must base the task on `dev` unless explicitly instructed otherwise.

## Standard workflow

For normal feature work:
1. fetch latest refs
2. check out latest `origin/dev`
3. create feature branch from `dev`
4. investigate relevant files
5. implement the smallest safe change
6. test on localhost
7. show diff before commit
8. commit
9. push feature branch
10. merge into `dev`
11. test again if needed
12. promote later from `dev` to `main`
13. deploy on production
14. verify runtime version

For urgent production work intended directly for `main`:
1. confirm that direct-to-main is intended
2. fetch latest refs
3. check out latest `origin/main`
4. create feature branch from `main`
5. make the smallest safe fix
6. test locally where possible
7. show diff before commit
8. commit and push
9. merge to `main`
10. deploy and verify

## Repo and file-location rules

Main repo location:

```bash
~/circles/circles
```

All final code changes must end up in the main repo, not left behind in a Codex worktree.

Before finishing, Codex must:
- copy any changed files back to `~/circles/circles` if working from a worktree
- verify final file locations
- run:

```bash
cd ~/circles/circles
git status --short
```

Codex must clearly state where edited files are stored before handing back the task.

## Investigation before coding

Before changing code, check the real source of the problem where applicable:
- relevant files
- logs
- runtime state
- database records
- environment variables
- deployment version

Always ask:
- what is the smallest safe fix?

Avoid:
- unrelated refactors
- renames unless necessary
- large structural changes unless explicitly requested
- clever abstractions when boring code will do

## Testing requirements

Localhost testing is part of the standard workflow.

Before pushing or deploying, Codex should test the change locally when practical.

Minimum expectations:
- start from the correct base branch
- run the narrowest meaningful checks
- verify the specific user flow changed
- note any limitations in local data or auth

If local testing is incomplete, Codex must say exactly what was and was not tested.

## Commit and diff rules

Before commit, Codex must show a concise diff summary.

Minimum expectation:

```bash
cd ~/circles/circles
git diff --stat
git diff -- <relevant files>
```

After changes:
- commit with a clear message
- push the feature branch
- report the branch name and commit hash

## Deployment rules

Production deployment uses the kamooniorg workflow.

Preferred production context:

```bash
sudo -i
cd /root/circles/circles
```

For long-running deploy/build commands, use a `screen` session.

Example:

```bash
screen -S rebuild
```

Do not use ad-hoc production edits without syncing changes back to Git.

## Production safety rules

Never:
- hot-edit production code without syncing back to Git
- deploy without verifying `/api/version`
- mutate the DID identity model
- bypass safety checks

Always:
- deploy from the intended Git branch
- verify runtime version after deploy
- sync any production fix back to GitHub and local repos

## Deployment verification

After deployment always verify:

```bash
curl -sS https://kamooni.org/api/version && echo
```

Optional container verification:

```bash
docker compose exec -T circles cat /app/VERSION || docker compose exec -T circles cat /VERSION
```

The reported git SHA must match the deployed commit.

## Architecture reminders

Core runtime:
- Browser
- NGINX
- Next.js app
- MongoDB
- MinIO
- Qdrant

Legacy compatibility components may still exist but are not the primary application path.

### Mongo chat reminder

Mongo is the authoritative chat backend.

Important collections include:
- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

Critical rule:
- `chatConversations.updatedAt` must be updated on every message

### Image storage reminder

Image URLs are written into MongoDB at upload time using `CIRCLES_URL`.
If `CIRCLES_URL` is wrong, broken URLs are permanently written and data repair may be required.

## Final rule

If there is ambiguity, choose the option that requires the least manual work from the human and the lowest risk to production.
