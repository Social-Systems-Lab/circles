# Dev → Main Release Checklist

## Development flow

1. Work in feature branch
2. Test locally
3. Merge to main
4. Deploy using deploykamooni script

---

## Production deployment (2026 update)

Production images are built locally and pushed to GitHub Container Registry (GHCR).

Server builds are no longer performed.

Deployment flow:

Local machine builds image → pushes to GHCR  
Genesis2 pulls image → container restart

Typical deploy time: ~20–30 seconds.
