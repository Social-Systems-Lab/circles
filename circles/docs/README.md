# Kamooni / Circles Documentation

Canonical index for active developer-facing Kamooni / Circles documentation.

## New developers -- start here

Read these in order:

1. [Local development guide](../../docs/LOCAL_DEVELOPMENT.md)
2. [Architecture overview](../../docs/ARCHITECTURE.md)
3. [Codex project map](CODEX_PROJECT_MAP.md)
4. [Mongo-native chat architecture](CHAT_SYSTEM_ARCHITECTURE.md)
5. [Environment documentation](../../docs/ENVIRONMENT.md)
6. [Development workflow](KAMOONI_DEVELOPMENT_WORKFLOW.md)
7. [Production deployment](#production-deployment)

## Production deployment

`circles/deploy-genesis2.sh` is presently the source of truth for production deployments until the canonical deployment document is corrected.

Normal production deployments run from:

```bash
/root/circles/circles
```

Deploy from `origin/main` with:

```bash
./circles/deploy-genesis2.sh main
```

Verify afterward with:

```bash
curl -sS https://kamooni.org/api/version && echo
```

The returned `gitSha` must match the deployed commit.

## Active architecture and operations

- [Codex project map](CODEX_PROJECT_MAP.md)
- [Developer playbook](DEVELOPER_PLAYBOOK.md)
- [Development workflow](KAMOONI_DEVELOPMENT_WORKFLOW.md)
- [Mongo-native chat architecture](CHAT_SYSTEM_ARCHITECTURE.md)
- [Chat debug playbook](CHAT_DEBUG_PLAYBOOK.md)
- [Production debug playbook](../../docs/DEBUG_PLAYBOOK.md)
- [Image storage architecture](IMAGE_STORAGE.md)
- [Telegram notification forwarding](TELEGRAM_NOTIFICATIONS.md)

## Active product and feature notes

- [Onboarding, profile completion, and participation readiness](ONBOARDING_SYSTEM.md)
- [Creating a new module](../../docs/create-module.md)
- [Circle affiliations](CIRCLE_AFFILIATIONS.md)
- [Circle hierarchy and repositioning](CIRCLE_HIERARCHY_AND_REPOSITIONING.md)
- [Circle open routes and social links](CIRCLE_OPEN_ROUTES_AND_SOCIAL_LINKS.md)
- [Contribution engine](CONTRIBUTION_ENGINE.md)
- [Events module](EventsModule.md)
- [Issues workflow](ISSUES_WORKFLOW.md)
- [Kamooni toolbox structure](KAMOONI_TOOLBOX_STRUCTURE.md)
- [Questionnaire data persistence](QUESTIONNAIRE_DATA_PERSISTENCE.md)
- [Search architecture](SEARCH_ARCHITECTURE.md)
- [System messages engine](SYSTEM_MESSAGES_ENGINE.md)

## Historical and legacy references

These files are retained for context, incident history, or migration archaeology. Do not treat them as current onboarding or architecture guidance unless an active document links to a specific section.

- [Legacy dev onboarding](../../docs/dev-onboarding.md)
- [Old deployment overview](../../docs/DEPLOYMENT.md)
- [Cleura deployment notes](../../docs/cleura_deployment.md)
- [Docker Hub deployment notes](../../docs/circles-deployment.md)
- [Circles registry deployment notes](../../docs/circles-registry-deployment.md)
- [Server setup notes](../../docs/server-setup.md)
- [AI developer context](AI_DEVELOPER_CONTEXT.md)
- [AI developer context copy](AI_DEVELOPER_CONTEXT%20copy.md)
- [Mongo-native architecture v11](ARCHITECTURE_MONGO_NATIVE_v11.md)
- [Mongo-native architecture v13](ARCHITECTURE_MONGO_NATIVE_v13.md)
- [Deployment architecture](DEPLOYMENT_ARCHITECTURE.md)
- [Deployment build and restart notes](DEPLOYMENT_BUILD_AND_RESTART.md)
- [Production playbook](PRODUCTION_PLAYBOOK.md)
- [Chat system architecture v2](CHAT_SYSTEM_ARCHITECTURE_v2.md)
- [Chat runtime note](CHAT_RUNTIME_NOTE.md)
- [Onboarding architecture 30s old](ONBOARDING_ARCHITECTURE_30S.old.md)
- [Multi-product architecture note](MULTI_PRODUCT_ARCHITECTURE.md)
- [Peerify onboarding plan](peerify-onboarding-plan.md)
- [Production notes](kamooni-production-notes.md)
- [Release notes](RELEASE_NOTES.md)
