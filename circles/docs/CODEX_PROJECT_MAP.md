# Codex Project Map — Kamooni / Circles

This file exists to prevent Codex from working in the wrong directory or from reusing stale dirty worktrees.

## Repository layout

There are two important local paths:

```text
Git root: ~/circles
App root: ~/circles/circles
```

The Git repository root is one level above the app directory.

Most source files live under:

```text
~/circles/circles/src
```

When running app commands locally, usually run from:

```bash
cd ~/circles/circles
```

When staging or committing with Git, it is safest to run from:

```bash
cd ~/circles
```

## Production layout

Production currently runs on Cleura.

Production paths:

```text
Server repo root: /root/circles/circles
Server app root:  /root/circles/circles/circles
```

Current production deploy command:

```bash
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
```

After deployment, verify:

```bash
cd /root/circles/circles/circles && git rev-parse --short HEAD && docker compose ps circles && curl -sS https://kamooni.org/api/version && echo
```

The `/api/version` `gitSha` should match the deployed commit.

## Codex safety rules

Before making code changes, Codex must verify:

```bash
git status --short
git branch --show-current
git rev-parse --show-toplevel
```

If the working tree is dirty, Codex must stop and ask before editing.

Avoid reusing old Codex worktrees such as:

```text
~/.codex/worktrees/...
```

unless the worktree is confirmed clean and based on current `origin/main`.

Preferred starting point before a patch:

```bash
cd ~/circles
git checkout main
git pull --ff-only origin main
git status --short
```

## Diff handling

For long diffs or logs, write output to `/tmp` and open it in TextEdit:

```bash
git --no-pager diff > /tmp/kamooni-diff.txt && open -a TextEdit /tmp/kamooni-diff.txt
```

Before applying any Codex-generated patch to the real repo, verify:

```bash
cd ~/circles
git apply --check /tmp/the-patch.diff
```

Do not apply patches that fail this check.

## Current Tasks/Shifts structure

Tasks and Shifts currently share the same backend model and Mongo collection.

They are distinguished by:

```text
taskType: "outcome" | "shift"
```

Current behavior:

```text
/circles/[handle]/tasks  -> non-shift outcome tasks
/circles/[handle]/shifts -> shift tasks only
```

Shift detail/edit/create routes still live under `/tasks` for now.

The `/shifts` route currently uses the existing `tasks` access rules in `src/app/api/access/route.ts`.

Do not create a separate Shifts collection or schema unless explicitly requested.
