
---

# Codex Workflow Rules

## IMPORTANT WORKFLOW RULE

This project uses a real Git repository located at:

~/circles/circles

All changes must be written directly into the main repository, NOT into a `.codex` worktree.

Codex may operate in `.codex/worktrees`, but before finishing any task that modifies files it **must copy the modified files back into the main repo**.

### Required final steps for any Codex task

1. Confirm files exist in:

   ~/circles/circles

2. Run:

   git status --short

3. Report the changed files.

### Codex Worktree Handling

If Codex executed inside a `.codex/worktrees` directory:

1. Copy modified files from the worktree into the main repo:

   ~/circles/circles

2. Verify the files exist in the real repository.

3. Only report task completion once the files are visible via:

   git status --short

This ensures AI-generated code never remains trapped inside a Codex worktree.

