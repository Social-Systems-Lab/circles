# Kamooni Development Workflow

This is the canonical day-to-day development workflow for Kamooni / Circles.

Use this process for normal local development, documentation patches, bug fixes, and small feature work. Keep changes small, inspect before modifying, and verify before pushing.

## Current layout

- Repository root: `~/circles`
- Application root: `~/circles/circles`
- Main application source: `~/circles/circles/src`

Run Git commands from the repository root unless a command says otherwise. Run app, package-manager, environment, and Docker Compose commands from the application root.

## Preferred tooling

Codex Desktop is the preferred patching tool for this project. Use it for investigation, file edits, diffs, and small surgical patches.

Manual code editing by the user is a last resort. Prefer:

1. Codex investigation
2. Codex patch
3. Automated edit with a reviewed diff
4. Manual edit only when the safer options are not practical

## Start from a clean current main

Use this before beginning a new task in an existing checkout:

```bash
cd ~/circles
git status --short
git worktree prune
git fetch origin
git checkout main
git pull --ff-only origin main
```

Stop if `git status --short` shows changes you do not understand. Do not overwrite someone else's work.

## Inspect before modifying

Before editing, confirm the live files and current behavior:

```bash
cd ~/circles
git branch --show-current
git status --short
git rev-parse --show-toplevel
```

Use targeted searches from the application root:

```bash
cd ~/circles/circles
rg "unique text or function name" src
rg --files src
```

Do not create duplicate files because a path looks plausible. Find the file that actually renders the UI or runs the server action/API route.

## Make small changes

Use Codex Desktop to patch only the files needed for the task.

Rules:

- keep diffs small and focused
- avoid unrelated refactors
- do not modify generated files unless the task requires it
- do not change deployment scripts, Compose files, package files, or environment files unless the task explicitly asks for that
- review the diff before testing or pushing

## Run locally

Kamooni uses Bun. The app root contains `bun.lock` and `package.json`.

For first setup, follow the [local development guide](../../docs/LOCAL_DEVELOPMENT.md).

Common commands from the application root:

```bash
cd ~/circles/circles
bun install
docker compose -f docker-compose.local.yml up -d db minio qdrant
bun run dev
```

Useful verified package scripts:

```bash
cd ~/circles/circles
bun run build
bun run check:chat-actions
```

Run the smallest relevant checks for the files changed. For UI work, also test the exact browser flow locally.

## Review diffs

Before committing:

```bash
cd ~/circles
git status --short
git diff --stat
git diff
```

For long diffs, logs, or Codex output, write them to a temporary file and open them in TextEdit:

```bash
cd ~/circles
git --no-pager diff > /tmp/kamooni-diff.txt
open -a TextEdit /tmp/kamooni-diff.txt
```

This keeps long output readable and avoids losing important context in a terminal scrollback.

## Commit

Stage only the files that belong to the task:

```bash
cd ~/circles
git add path/to/file
git status --short
git commit -m "Clear concise message"
```

Avoid `git add .` unless the diff has been reviewed and every changed file belongs to the task.

When staging Next.js dynamic route files in zsh, quote bracketed paths:

```bash
git add -- ':(literal)circles/src/app/circles/[handle]/settings/pages/page.tsx'
```

## Push

Push to `origin/main` only after local verification and diff review:

```bash
cd ~/circles
git status --short
git push origin main
```

If the push is rejected, stop and inspect. Do not force-push `main`.

## Deploy when needed

Development and deployment are separate steps. Do not run ad-hoc Docker deployment commands from this workflow.

When a verified change needs production deployment, use the canonical guide:

- [Production deployment](PRODUCTION_DEPLOYMENT.md)

## Outdated assumptions

Do not use these as the normal workflow:

- TimDev-specific instructions
- `dev` branch promotion
- feature branch -> `dev` -> `main` promotion
- terminal Codex CLI as the default patching workflow
- old production paths outside `/root/circles/circles`
- direct `docker compose build` or `docker compose up` deployment commands

Historical documents may still mention these patterns. Treat them as legacy unless an active document explicitly says otherwise.

## Related active docs

- [Local development](../../docs/LOCAL_DEVELOPMENT.md)
- [Architecture overview](../../docs/ARCHITECTURE.md)
- [Codex project map](CODEX_PROJECT_MAP.md)
- [Environment reference](../../docs/ENVIRONMENT.md)
- [Production deployment](PRODUCTION_DEPLOYMENT.md)
