# Multi-Product Architecture

Circles is the shared platform engine.

Kamooni is a product built on Circles.

Peerify is a product built on Circles.

Future products may also be built on Circles.

## Platform vs Product

Shared platform code should contain reusable infrastructure, including:

- auth
- profiles
- circles
- chat
- events
- tasks
- map
- storage
- permissions
- payments

Product-specific code should contain:

- branding
- landing pages
- signup copy
- donation/supporter copy
- nav styling
- product-specific onboarding
- product-specific assets
- product-specific routes

Kamooni should no longer be treated as the whole codebase. Over time, it should become `products/kamooni` or an equivalent product-specific location.

Peerify should eventually become `products/peerify` or an equivalent product-specific location.

This does not mean doing a large file move immediately. The migration should stay incremental and low risk.

## Recommended Migration Phases

1. Guardrails and docs.
2. Product config with `PRODUCT=kamooni` or `PRODUCT=peerify`.
3. Move product assets and landing pages.
4. Move product-specific onboarding and copy.
5. Extract shared platform modules only when they are clearly reusable.

## Branch and PR Scope

Recommended developer branch naming:

- `feature/platform-...`
- `feature/kamooni-...`
- `feature/peerify-...`

Recommended PR scope labels:

- `platform`
- `kamooni`
- `peerify`
- `mixed`

Mixed PRs require extra care because they cross platform and product boundaries.

## Deploy Rule

Kamooni deploys must declare `PRODUCT=kamooni`.

Peerify deploys must declare `PRODUCT=peerify`.

The branding guard must pass before build or deploy.
