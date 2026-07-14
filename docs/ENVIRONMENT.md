# Environment Variables

Canonical environment-variable reference for Kamooni / Circles.

The checked-in template is [`circles/.env.example`](../circles/.env.example). Do not commit real secrets.

## Environment Files

Run local app and Compose commands from the application root: `~/circles/circles`.

Current behavior:

- `circles/.env.example` says to copy it to `.env`.
- `circles/docker-compose.local.yml` lists both `.env` and `.env.local` as service `env_file` inputs.
- Docker Compose variable interpolation for local service ports uses `.env`.
- Next.js loads `.env` and `.env.local` during local development.
- `circles/docker-compose.yml` for production reads `.env` only.
- `circles/.gitignore` ignores `.env` and `.env*.local`.

For normal local onboarding:

```bash
cp .env.example .env
touch .env.local
```

For production, maintain the real `.env` on Genesis2. Do not duplicate production secrets into documentation.

## Minimal local configuration

After copying `circles/.env.example` to `.env`, the app can usually start with `bun run dev` because Next.js supplies defaults for the dev server and most app variables have source fallbacks. The smallest verified local edits are about making the checked-in placeholders internally consistent:

| Variable | Minimal local guidance | Why |
| --- | --- | --- |
| `MONGO_ROOT_PASSWORD` | Set a local password. | `docker-compose.local.yml` initializes Mongo with this value. |
| `MONGODB_URI` | Set it to match `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_HOST`, and `MONGO_PORT`, for example `mongodb://admin:<password>@127.0.0.1:27017/circles?authSource=admin`. | `src/lib/data/db.ts` uses `MONGODB_URI` when it exists. Because `.env.example` includes a placeholder `MONGODB_URI`, the `MONGO_*` fallback is not used until `MONGODB_URI` is removed or corrected. |
| `CIRCLES_JWT_SECRET` | Set any local-only secret string before testing signup, login, or authenticated pages. | `src/lib/auth/jwt.ts` throws only when token signing or verification is used. It is not required just to start `next dev`. |
| `CIRCLES_URL` | Set to the local app origin, usually `http://localhost:3000`, before testing uploads, email links, Telegram links, or VibeID flows. | Several features generate persisted or outbound URLs from this value. |

Not required just to start the dev server:

- `CIRCLES_PORT`: `bun run dev` runs `next dev --turbopack`; Next chooses the dev port. `CIRCLES_PORT` is used by Compose/runtime and middleware fallbacks.
- `CIRCLES_NODE_ENV`: production Compose maps it to `NODE_ENV`; local `next dev` sets development mode.
- `MINIO_*`: app startup does not require MinIO, but uploads and media proxy routes do.
- `QDRANT_HOST`: app startup does not require Qdrant, but vector/search functions do when `VDB_ENABLED` is not disabled.
- `POSTMARK_*`, `TELEGRAM_*`, `STRIPE_*`, `DONORBOX_*`, `VIBE_ID_*`, `ALTCHA_HMAC_KEY`: feature-specific.

## Critical URL Warning

`CIRCLES_URL` is write-time critical for image and upload URLs. Upload code writes absolute URLs into MongoDB at upload time. If `CIRCLES_URL` points at the wrong origin, broken URLs can be permanently stored in MongoDB and may require data repair.

Use `http://localhost:3000` or the actual dev-server URL for local test data. Use the production origin for production.

## Active checked-in variables

These variables are present in `circles/.env.example` and are either active in current source/Compose or retained in the active template.

### Core application

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `CIRCLES_INSTANCE_NAME` | Server display name copied into server settings by `src/lib/data/server-settings.ts`. | Optional locally; production setting if server settings are initialized from env. |
| `CIRCLES_URL` | Public app origin for generated links and persisted media URLs. | Feature-critical locally; required by current production configuration. |
| `CIRCLES_HOST` | Internal app host for production middleware access checks. | Required by current production Compose; optional locally. |
| `CIRCLES_PORT` | App/container port and local Compose interpolation. | Required by current Compose files; not required by `bun run dev`. |
| `CIRCLES_NODE_ENV` | Value passed to `NODE_ENV` by production Compose. | Required by current production Compose; not required by `bun run dev`. |
| `CIRCLES_REGISTRY_URL` | Legacy registry/server setting URL. | Legacy/profile-only unless registry features are used. |
| `CIRCLES_DOMAIN` | Domain metadata retained in `.env.example`. | Legacy/profile-only; no current direct source read found. |

### MongoDB

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `MONGODB_URI` | Full MongoDB connection string. Overrides the `MONGO_*` fallback in `src/lib/data/db.ts`. | Recommended local guide path; required if left present in `.env`. |
| `MONGO_HOST` | Mongo host for fallback connection string and Compose. | Required by Compose; fallback source default is `127.0.0.1`. |
| `MONGO_PORT` | Mongo port for fallback connection string and local port mapping. | Required by local Compose interpolation; fallback source default is `27017`. |
| `MONGO_ROOT_USERNAME` | Mongo root username for Compose init and source fallback. | Required by Compose; fallback source default is `admin`. |
| `MONGO_ROOT_PASSWORD` | Mongo root password for Compose init and source fallback. | Required by Compose; fallback source default is `password`. |

`MONGODB_URI` is not intrinsically required by the source: if it is absent, `src/lib/data/db.ts` builds a URI from `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_HOST`, and `MONGO_PORT`. The local guide recommends correcting `MONGODB_URI` because `.env.example` defines it with placeholder credentials, so the fallback will not run after a straight copy.

### MinIO

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `MINIO_HOST` | MinIO host for upload/storage code and Compose. | Required for uploads/media; not required for app startup. |
| `MINIO_PORT` | MinIO API port. | Required for uploads/media; required by local Compose interpolation. |
| `MINIO_ROOT_USERNAME` | MinIO access key/root user. | Required for uploads/media and MinIO container setup. |
| `MINIO_ROOT_PASSWORD` | MinIO secret key/root password. | Required for uploads/media and MinIO container setup. |

`src/lib/data/storage.ts` has local defaults for MinIO connection values, so importing the app does not fail without these variables. Uploads, `/storage`, and `/uploads` require a reachable MinIO service unless `LOCAL_FS_STORAGE=true` is used in non-production.

### Qdrant

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `QDRANT_HOST` | Qdrant host used by `src/lib/data/vdb.ts`. | Required only when vector/search functions run and vector DB is enabled. |
| `OPENAI_API_KEY` | OpenAI key for embedding generation. | Required only for embedding/vector features. |

The app can start without Qdrant. `src/lib/data/vdb.ts` creates the Qdrant client only when vector functions call `getQdrantClient()`. `VDB_ENABLED=false`, `VDB_ENABLED=0`, or `VDB_ENABLED=off` disables these vector paths and makes them throw/skip through the code's `VdbDisabledError` handling instead of attempting Qdrant/OpenAI work.

### Email, notifications, and cron

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `POSTMARK_API_TOKEN` | Postmark API token. | Feature-specific; production email requires it. |
| `POSTMARK_SENDER_EMAIL` | Sender address for Postmark email templates. | Feature-specific; production email requires it. |
| `TELEGRAM_BOT_TOKEN` | Bot token for outbound Telegram messages. | Feature-specific. |
| `TELEGRAM_BOT_USERNAME` | Public bot username used by Telegram setup/docs and Compose. | Feature-specific. |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret for Telegram webhook requests. | Feature-specific. |
| `CRON_SECRET` | Bearer token for cron endpoints and admin-triggered cron calls. | Feature-specific; required for protected production cron jobs. |

### Maps, payments, and external services

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `MAPBOX_API_KEY` | Server-settings map key from existing env map. | Optional; not the browser map token. |
| `DONORBOX_API_KEY` | Donorbox API key for admin subscription sync/refresh. | Feature-specific. |
| `DONORBOX_WEBHOOK_SECRET` | Donorbox webhook HMAC secret. | Feature-specific. |
| `DONORBOX_EMAIL` | Present in `.env.example`; no current source read found. | Legacy/profile-only. |
| `STRIPE_SECRET_KEY` | Stripe API secret key. | Feature-specific. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret. | Feature-specific. |
| `STRIPE_PRICE_MONTHLY` | Default monthly Stripe price id. | Feature-specific. |
| `STRIPE_PRICE_YEARLY` | Yearly Stripe price id. | Feature-specific. |
| `STRIPE_PRICE_MONTHLY_1` | Monthly supporter tier price id. | Feature-specific. |
| `STRIPE_PRICE_MONTHLY_2` | Monthly supporter tier price id. | Feature-specific. |
| `STRIPE_PRICE_MONTHLY_5` | Monthly supporter tier price id; code can fall back to `STRIPE_PRICE_MONTHLY`. | Feature-specific. |
| `STRIPE_PRICE_MONTHLY_10` | Monthly supporter tier price id. | Feature-specific. |

### Authentication and security

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `CIRCLES_JWT_SECRET` | Primary JWT signing secret. | Required for signup/login/authenticated sessions. |
| `ALTCHA_HMAC_KEY` | ALTCHA CAPTCHA HMAC key. | Feature-specific; required where ALTCHA signup verification is enabled. |
| `VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK` | VibeID credential issuer private JWK. | Feature-specific. |
| `VIBE_ID_CREDENTIAL_ISSUER_DID` | Expected VibeID issuer DID; validated against the private key when set. | Feature-specific. |
| `VIBE_ID_CREDENTIAL_ISSUER_NAME` | VibeID issuer display name. | Optional; code defaults to `Kamooni`. |
| `VIBE_ID_CREDENTIAL_ISSUER_TAGLINE` | VibeID issuer tagline. | Optional. |

## Important source-only feature variables

These variables are read by current source or deployment code but are not in `circles/.env.example`:

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `JWT_SECRET` | Local fallback if `CIRCLES_JWT_SECRET` is absent. | Optional fallback. |
| `CIRCLES_COOKIE_SECURE` | Overrides secure-cookie behavior. | Optional. |
| `CIRCLES_DEV_INTERNAL_ORIGIN` | Extra local origin for middleware access checks. | Optional local development. |
| `CIRCLES_DEV_LOG_PASSWORD_RESET` | Allows password-reset link logging outside production. | Optional local development. |
| `CIRCLES_LOCAL_AUTH_DIR` | Forces local auth data directory behavior. | Optional local development. |
| `LOCAL_FS_STORAGE` | Non-production upload storage override to `public/uploads`. | Optional local development. |
| `MINIO_BUCKET` | Bucket override for `/storage` and `/uploads`; defaults to `circles`. | Optional. |
| `VDB_ENABLED` | Disables vector DB paths when set to `false`, `0`, or `off`. | Optional feature flag. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser Mapbox token used by `src/components/KamooniMap.tsx`. | Feature-specific. |
| `DONORBOX_API_USER` | Donorbox API username for admin subscription sync/refresh. | Feature-specific. |
| `VIBE_ID_CREDENTIAL_ISSUER_LOGO_URL` | VibeID issuer logo URL. | Optional. |
| `KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK` | Backward-compatible VibeID issuer private key fallback. | Optional fallback. |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `APP_URL`, `SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` | URL fallbacks for specific auth, reminder, Stripe, and VibeID flows. | Optional fallbacks. |
| `NEXT_PUBLIC_MAINTENANCE_MODE`, `NEXT_PUBLIC_MAINTENANCE_MESSAGE` | Maintenance-mode UI controls. | Optional feature flags. |
| `GIT_SHA`, `BUILD_TIME` | Build metadata passed by `deploy-genesis2.sh` and exposed by `/api/version`. | Supplied by deployment. |
| `APP_VERSION` | `/api/version` fallback if `VERSION` metadata is absent. | Optional fallback. |
| `IS_BUILD`, `NODE_ENV`, `PORT` | Build/runtime controls normally supplied by Next.js, Dockerfile, or Compose. | Supplied by build/runtime. |

## Legacy Matrix/Synapse compatibility

Kamooni chat is Mongo-native. Matrix is not the authoritative chat backend.

These variables remain in `.env.example` and Compose for legacy/profile compatibility:

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `SYNAPSE_POSTGRES_USERNAME` | Synapse Postgres username. | Legacy/profile-only. |
| `SYNAPSE_POSTGRES_PASSWORD` | Synapse Postgres password. | Legacy/profile-only. |
| `MATRIX_HOST` | Legacy Matrix host. | Legacy/profile-only. |
| `MATRIX_PORT` | Legacy Matrix port. | Legacy/profile-only. |
| `NEXT_PUBLIC_MATRIX_URL` | Legacy public Matrix URL. | Legacy/profile-only. |
| `NEXT_PUBLIC_MATRIX_DOMAIN` | Legacy public Matrix domain. | Legacy/profile-only. |
| `MATRIX_DOMAIN` | Legacy Matrix domain. | Legacy/profile-only. |
| `MATRIX_SHARED_SECRET` | Legacy Matrix registration/shared secret. | Legacy/profile-only. |
| `MATRIX_ADMIN_PASSWORD` | Legacy Matrix admin password. | Legacy/profile-only. |

In production Compose, `postgres` and `synapse` are behind the `matrix` profile. In local Compose they are present, but normal local development starts only `db`, `minio`, and `qdrant`.

## Inactive template variables

These variables are present in `circles/.env.example`, but no current source or Compose usage was found during this audit:

- `TEST`
- `USE_SSL`

Keep them out of new guidance unless a current feature or deployment process starts using them.

## Status

This file is the active environment-variable reference. If older setup notes conflict with this document, prefer this document plus the current source, Compose files, and `circles/.env.example`.
