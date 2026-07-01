# Circles

Documentation index: see [docs/README.md](docs/README.md).

Architecture note: see [docs/MULTI_PRODUCT_ARCHITECTURE.md](docs/MULTI_PRODUCT_ARCHITECTURE.md) for the intended Circles/Kamooni/Peerify multi-product structure.

For information on how to set up the local development environment on circles read [Circles Dev Onboarding](../docs/dev-onboarding.md). More docs [here](../README.md).

## Cleura production deploy

From `/root/circles/circles` on Cleura production:

```bash
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
```

Optional branch argument:

```bash
./circles/deploy-genesis2.sh codex/refactor/chat-sidebar-search
```
