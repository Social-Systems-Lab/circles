# Kamooni Development Workflow

This is the canonical day-to-day development workflow for Kamooni / Circles.

Use this process for normal development, documentation patches, bug fixes, and small feature work. Keep changes small, inspect before modifying, and verify before promotion.

Local Mac is the primary environment for Codex development, Git operations, code review, lightweight automated tests, TypeScript, and lint. Prefer staging for full Docker builds, integration testing, and desktop/mobile browser validation.

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

## Test locally, then on staging

Kamooni uses Bun. The app root contains `bun.lock` and `package.json`.

For first setup, follow the [local development guide](../../docs/LOCAL_DEVELOPMENT.md).

Common commands from the application root:

```bash
cd ~/circles/circles
bun install
docker compose -f docker-compose.local.yml up -d db minio qdrant
bun run dev
```

The local Docker services above are optional. Use them only when a specific local test genuinely needs them; a local Docker build is not a routine release gate.

Useful verified package scripts:

```bash
cd ~/circles/circles
bun run build
bun run check:chat-actions
```

Run the smallest relevant checks for the files changed. Then push the feature branch to GitHub and deploy that remote branch with the [staging deployment workflow](STAGING_DEPLOYMENT.md). Do not routinely hot-edit staging.

Use staging for the full Docker build, integration testing, and the exact desktop and mobile browser flows affected by the change. Preserve staging's isolated MongoDB, MinIO, and email-capture configuration. Tests that require a disposable database must create an isolated test instance; never run destructive integration tests against staging's persistent database.

Never automatically delete Docker volumes, databases, or persistent storage. For local disk maintenance, prefer conservative pruning of unused Docker build cache. Never recommend `docker system prune --volumes` or `docker volume prune`.

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

## Push to staging

All development changes must originate on a Git branch and reach staging through GitHub. After local checks and diff review, push the feature branch:

```bash
cd ~/circles
git status --short
git push -u origin HEAD
```

If the push is rejected, stop and inspect. Do not force-push `main`. Deploy the remote branch with the existing staging script, which verifies the deployed Git SHA and maintains the verified-image rollback ledger. Staging-only email-capture configuration must never enter a production release branch.

## Deploy when needed

Development and deployment are separate steps. Do not run ad-hoc Docker deployment commands from this workflow.

Only an approved release from `origin/main` that has passed the required checks may be deployed to production. Use the canonical guide and independently verify `/api/version` after deployment:

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
- [Staging deployment](STAGING_DEPLOYMENT.md)
- [Production deployment](PRODUCTION_DEPLOYMENT.md)
