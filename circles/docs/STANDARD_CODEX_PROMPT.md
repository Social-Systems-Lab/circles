# STANDARD_CODEX_PROMPT.md — Kamooni / Circles

Last updated: March 2026

---

# PURPOSE

This is the standard prompt template for all Codex tasks.

It ensures:
- safe changes
- consistent workflow
- minimal bugs
- fast iteration

Always use this as the base for new Codex tasks.

---

# STANDARD PROMPT TEMPLATE

Copy everything below when starting a new Codex task.

---

Title: <Short task title>

Context:
- Repo: ~/circles/circles
- Main repo is the source of truth
- Mongo is the primary backend
- Next.js App Router
- Production runs on Genesis2

---

Read first (MANDATORY):
- AGENTS.md
- Relevant files for this task
- Any related docs in /docs

---

CRITICAL RULES:

1. Smallest Safe Change
- Do not refactor unrelated code
- Do not rename files unnecessarily
- Keep patch minimal (1–10 lines if possible)

2. Codex Workflow
- Investigate first
- Then implement
- Then test locally
- Then commit

3. Repository Rules
- ALL changes must end in ~/circles/circles
- Never leave changes in .codex worktrees
- Before finishing, verify:

  git status --short

4. Feature Branch Required

  git checkout -b feature/<short-name>

5. Local Testing Required
- Test on localhost before commit
- Verify feature works
- Verify nothing broke

---

TASK:

<Describe the exact task clearly and minimally>

---

IMPLEMENTATION GUIDANCE:

- Reuse existing patterns in the repo
- Follow current data access structure
- Avoid introducing new abstractions
- Keep logic explicit and simple
- Prefer server actions over new API routes unless necessary

---

OUTPUT REQUIREMENTS:

Codex must:

1. Identify files to change
2. Explain minimal approach
3. Show exact diff BEFORE commit
4. Confirm where files are stored
5. Ensure changes are in ~/circles/circles

---

GIT WORKFLOW:

After implementation:

1. Verify:

   git status --short

2. Commit:

   git add .
   git commit -m "<clear message>"

3. Push:

   git push -u origin feature/<short-name>

---

LOCAL VERIFICATION:

- Run app locally
- Test the feature manually
- Confirm no regressions

---

OPTIONAL DEPLOY (ONLY AFTER VALIDATION):

On Genesis2:

screen -S rebuild
deploykamooni

Verify:

curl -sS https://kamooni.org/api/version && echo

---

FINAL CHECK:

- Minimal change?
- No unrelated edits?
- Tested locally?
- Repo clean?

If any doubt:
→ choose the safer, smaller option

---

# PHILOSOPHY

This is an AI-assisted system.

Human:
- defines problem
- tests results
- guides direction

AI:
- reads code
- writes patches
- proposes fixes

Goal:

> More thinking  
> Less typing  
> Safer deployments  
> Faster iteration  

