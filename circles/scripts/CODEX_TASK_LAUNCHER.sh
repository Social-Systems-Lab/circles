#!/bin/bash
set -euo pipefail

REPO="$HOME/circles/circles"
OUTDIR="$REPO/tmp/codex-prompts"

mkdir -p "$OUTDIR"

STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
SLUG="${1:-task}"
OUT="$OUTDIR/${STAMP}_${SLUG}.md"

cat > "$OUT" <<PROMPT
Title: ${SLUG}

Context:
- Repo: ~/circles/circles
- Main repo is the source of truth
- Mongo is the primary backend
- Next.js App Router
- Production runs on Genesis2

Read first (MANDATORY):
- AGENTS.md
- docs/STANDARD_CODEX_PROMPT.md
- Relevant files for this task
- Any related docs in /docs

Task:
- Replace this section with the exact task for Codex.

Implementation guidance:
- Make the smallest safe change
- Reuse existing patterns
- Test locally before commit
- Keep all final changes in ~/circles/circles
- Show exact diff before commit

Output required:
1. Files changed
2. Minimal approach
3. Exact diff before commit
4. Local verification steps
5. Git commands
6. Final git status --short

Reference template:
------------------------------------------------------------

PROMPT

cat "$REPO/docs/STANDARD_CODEX_PROMPT.md" >> "$OUT"

echo "Created:"
echo "$OUT"
echo
echo "Open with:"
echo "code \"$OUT\""
