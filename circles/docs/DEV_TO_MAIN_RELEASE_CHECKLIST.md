# Dev → Main Release Checklist

## Development flow

1. Work on a feature branch, not directly on `main`.
2. Run relevant lightweight tests, TypeScript, lint, `git diff --check`, and review the complete diff locally.
3. Confirm `git status --short` contains only the intended files, then commit and push the feature branch.
4. Deploy that remote branch with the staging deployment script.
5. Run full Docker, integration, and desktop/mobile browser validation on staging, and verify that `/api/version` reports the exact staged commit.
6. Record which changes are staging-only. Email capture, staging Compose overrides, staging credentials, and staging infrastructure changes are not production release content.
7. Create a clean production release branch from the current approved `main`, and bring across only the reviewed production-ready commits. Do not merge a mixed staging branch wholesale.
8. Review the release diff against `main`. Explicitly confirm that staging-only email-capture application code and configuration are absent.
9. Re-run relevant tests, TypeScript, lint, build verification, and `git diff --check` on the clean release branch.
10. Confirm the release branch working tree is clean, commit history contains only intended changes, and all required checks and approvals have completed.
11. Push the clean release branch, merge it to `main` without unresolved conflicts, and stop if `main` cannot be updated cleanly.
12. Confirm local `main` and `origin/main` resolve to the approved release commit and that the working tree remains clean.
13. Deploy production with `cd /root/circles/circles && ./circles/deploy-genesis2.sh main`.
14. Independently verify `curl -sS https://kamooni.org/api/version && echo`; its `gitSha` must match the approved `origin/main` commit.

## Staging-only separation gate

Before merging a release to `main`, compare the clean release branch with both `main` and the branch tested on staging. Classify every difference as production-ready, staging-only, or excluded.

The production release must not contain:

- staging-only email-capture mode, captured-email storage, or captured-email admin interfaces;
- staging Compose overrides, staging environment files, staging credentials, or staging host-specific configuration;
- temporary staging diagnostics or test-only operational changes.

This gate is explicit: successful testing on staging does not authorize staging-only email capture to enter production. If production-ready and staging-only changes were developed together, reconstruct the release from the approved production commits on a clean branch and test that exact release candidate before merging.

The production build must complete successfully for the exact release candidate. A build of the mixed staging branch does not substitute for release-branch build verification.

---

## Production deployment (2026 update)

Production deploys only an approved release from `origin/main` using the canonical deployment script.

Staging-only email-capture configuration must not enter the production release branch.

Never automatically delete Docker volumes, databases, or persistent storage. For local disk maintenance, prefer conservative pruning of unused Docker build cache; never use `docker system prune --volumes` or `docker volume prune`.

See [Staging deployment](STAGING_DEPLOYMENT.md) and [Production deployment](PRODUCTION_DEPLOYMENT.md) for the canonical commands and safety checks.
