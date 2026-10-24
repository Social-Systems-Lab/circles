# Dev → Main Release Checklist

## Development flow

1. Work in feature branch
2. Run lightweight tests, TypeScript, lint, and review locally
3. Push the branch to GitHub and deploy it with the staging deployment script
4. Run full Docker, integration, and desktop/mobile browser validation on staging
5. After approval and successful checks, merge to `main`
6. Deploy production with `cd /root/circles/circles && ./circles/deploy-genesis2.sh main`
7. Independently verify `curl -sS https://kamooni.org/api/version && echo`

---

## Production deployment (2026 update)

Production deploys only an approved release from `origin/main` using the canonical deployment script.

Staging-only email-capture configuration must not enter the production release branch.

Never automatically delete Docker volumes, databases, or persistent storage. For local disk maintenance, prefer conservative pruning of unused Docker build cache; never use `docker system prune --volumes` or `docker volume prune`.

See [Staging deployment](STAGING_DEPLOYMENT.md) and [Production deployment](PRODUCTION_DEPLOYMENT.md) for the canonical commands and safety checks.
