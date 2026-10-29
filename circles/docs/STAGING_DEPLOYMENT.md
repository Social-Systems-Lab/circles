# Kamooni staging deployment

Kamooni staging is an isolated, test-data-only installation at `staging.kamooni.org`. It must never receive production secrets, production data, production identity material, or production external-service accounts.

## Checkout architecture

The existing infrastructure checkout is `/home/ubuntu/kamooni` and must stay on `infra/kamooni-staging`. It owns `docker-compose.staging.yml`, `nginx/nginx.staging.conf`, `.env.staging`, this document, validation, and the deployment script. Never check a feature branch out there.

The deployment script manages `/home/ubuntu/kamooni-target` as a separate detached Git worktree. The selected target branch supplies its source, `Dockerfile`, base `docker-compose.yml`, and chat migration scripts. The infrastructure checkout supplies the staging override, NGINX configuration, secrets file, and safety policy. No second infrastructure clone is required.

## One-time environment setup

Run on the staging VM:

```bash
cd /home/ubuntu/kamooni/circles && cp .env.staging.example .env.staging
```

Generate a different value for each secret. Run this command once per secret and copy each output only into `/home/ubuntu/kamooni/circles/.env.staging` on the staging VM:

```bash
openssl rand -hex 32
```

Use unique staging-only usernames of at least 12 characters for `MONGO_ROOT_USERNAME` and `MINIO_ROOT_USERNAME`. Use unique 64-character outputs for `MONGO_ROOT_PASSWORD`, `MINIO_ROOT_PASSWORD`, `CIRCLES_JWT_SECRET`, `CRON_SECRET`, `ALTCHA_HMAC_KEY`, and `TELEGRAM_WEBHOOK_SECRET`. URL-encode the Mongo username and password in `MONGODB_URI`; it must have exactly this structure:

```text
mongodb://ENCODED_STAGING_USERNAME:ENCODED_STAGING_PASSWORD@db:27017/circles?authSource=admin
```

Do not place generated values in `.env.staging.example` or any tracked file. The deploy script rejects blanks, placeholders, weak values, reused independent secrets, mismatched Mongo credentials, and any Mongo endpoint other than `mongodb://db:27017/circles?authSource=admin`.

Initial staging forcibly disables the registry, OpenAI, Postmark, Telegram bot, Donorbox, Stripe, and VibeID issuer through the Compose override even if `.env.staging` contains values. `TELEGRAM_WEBHOOK_SECRET` remains a unique defensive secret, but no Telegram bot username/token is active and no webhook should be registered. Payments and vector search are forced off. Mapbox is intentionally disabled initially. Use test data only.

Staging email uses the captured-email contract: Compose fixes `EMAIL_TRANSPORT=capture`, `EMAIL_CAPTURE_ENABLED=true`, `KAMOONI_DEPLOYMENT_ENV=staging`, `NODE_ENV=production`, and `CIRCLES_DEV_LOG_PASSWORD_RESET=false`, with all three public application URLs fixed to `https://staging.kamooni.org`. Before deployment, update an existing `.env.staging` to include these non-secret values and remove obsolete `EMAIL_CAPTURE_MODE`; keep both Postmark settings present and blank. Captured verification and password-reset messages are available only to authorized staging superadmins at `/admin/emails`; messages are not sent through Postmark. The runtime environment checks are defense in depth: deploy only the reviewed staging-only application branch `codex/messaging-personal-followups-staging-email-capture` for this feature. Keep that source branch and artifact out of production branches and deployments.

## TLS bootstrap (must happen before first deployment)

DNS must point only `staging.kamooni.org` at the staging VM. Do not request `www.staging.kamooni.org`.

Install the ordinary Ubuntu Certbot package on the fresh Ubuntu 24.04 staging VM:

```bash
sudo apt-get update && sudo apt-get install -y certbot
```

Run on the staging VM while port 80 is free:

```bash
sudo mkdir -p /var/www/certbot && sudo certbot certonly --standalone -d staging.kamooni.org
```

The deployment script refuses to start services until the staging certificate exists. Do not run `install.sh`.

For renewal, stop only staging NGINX so standalone Certbot can bind port 80, renew, then start and reload staging NGINX. Run on the staging VM:

```bash
cd /home/ubuntu/kamooni-target/circles && STAGING_INFRA_APP_DIR=/home/ubuntu/kamooni/circles STAGING_TARGET_APP_DIR=/home/ubuntu/kamooni-target/circles GIT_SHA=renewal STAGING_IMAGE_TAG=renewal BUILD_TIME=renewal docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml stop nginx
```

After that succeeds, run:

```bash
sudo certbot renew --standalone
```

Then restart staging NGINX:

```bash
cd /home/ubuntu/kamooni-target/circles && STAGING_INFRA_APP_DIR=/home/ubuntu/kamooni/circles STAGING_TARGET_APP_DIR=/home/ubuntu/kamooni-target/circles GIT_SHA=renewal STAGING_IMAGE_TAG=renewal BUILD_TIME=renewal docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml up -d --no-deps nginx
```

Finally ask the staging NGINX service to reload the renewed certificate:

```bash
cd /home/ubuntu/kamooni-target/circles && STAGING_INFRA_APP_DIR=/home/ubuntu/kamooni/circles STAGING_TARGET_APP_DIR=/home/ubuntu/kamooni-target/circles GIT_SHA=renewal STAGING_IMAGE_TAG=renewal BUILD_TIME=renewal docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml exec -T nginx nginx -s reload
```

This manual method avoids a port-80 conflict and changes no production container.

## Deploy a remote branch

Run on the staging VM from the infrastructure checkout:

```bash
cd /home/ubuntu/kamooni && ./circles/scripts/deploy-staging.sh BRANCH_NAME
```

The script requires a clean infrastructure checkout on `infra/kamooni-staging`, fetches `origin/BRANCH_NAME`, checks both the V2 schema compatibility floor and the committed application safety baseline, and updates the separate detached target worktree. It never pushes or merges and never switches the infrastructure checkout. Every staging deployment target must descend from `3101d0eb7590f089d625d8bfc8bbace42447b8e0`, the reviewed Group 1 application safety baseline. Do not casually change this pinned value: changing it requires review because it protects payment and welcome-link staging safety.

To enable captured verification and reset email, use `BRANCH_NAME=codex/messaging-personal-followups-staging-email-capture`. The script deploys that branch into the separate detached target worktree; do not merge or cherry-pick it into `main`.

Before starting anything it validates `.env.staging`, renders both default and all-profile Compose models, validates the effective application environment, directly scans staging NGINX, and checks isolation. It builds the exact full target SHA under `kamooni-staging-circles:<short-sha>`. It starts only Mongo and MinIO, waits up to 60 seconds for an authenticated Mongo ping, runs target-worktree migration scripts, and only then starts the app and NGINX. Deployment succeeds only when `https://staging.kamooni.org/api/version` returns the exact full target SHA.

Deployment and Docker maintenance share an exclusive lock at `/run/lock/kamooni-staging-docker.lock`. A successful deployment atomically records its full Git SHA, immutable image ID, tag, and build time in `/home/ubuntu/.local/state/kamooni-staging/verified-images.tsv` after version verification.

## Docker image maintenance

Preview maintenance on the staging VM:

```bash
cd /home/ubuntu/kamooni && ./circles/scripts/maintain-staging-docker.sh --dry-run
```

The script fails closed unless the running container, public version endpoint, Docker images, and ledger agree. It preserves the current and two preceding verified deployment images. Until three verified deployment records exist, it preserves every staging application image. It removes only individually checked, ledger-verified, unreferenced obsolete `kamooni-staging-circles` images, then prunes unused dangling images older than seven days. It never removes containers, networks, or volumes.

Install and enable the weekly timer on the staging VM. The installer runs validation as the `ubuntu` service user and refuses to change systemd state unless its own maintenance dry run succeeds first:

```bash
cd /home/ubuntu/kamooni && sudo ./circles/scripts/manage-staging-docker-maintenance.sh install
```

Use the same script with `status` to inspect the timer or `remove` to disable it and remove only its two unit files. Removing the timer does not remove the image ledger or any Docker object.

Manual version verification, run anywhere with network access:

```bash
curl -sS https://staging.kamooni.org/api/version && echo
```

After deployment, show the ports published by only the `kamooni_staging` Compose project. Run on the staging VM:

```bash
docker ps --filter label=com.docker.compose.project=kamooni_staging --format 'table {{.Names}}\t{{.Ports}}'
```

The only host bindings in the output must be staging NGINX on ports `80` and `443`. Entries such as `3000/tcp`, `27017/tcp`, or `9000/tcp` without a host-side `->` mapping are internal-only exposed ports and are expected. No other `0.0.0.0:PORT->...` or `[::]:PORT->...` bindings may appear.

## Verify media URL storage

Use only artificial staging data. In the browser, sign in to `https://staging.kamooni.org`, create or use a public staging-only test circle, create an issue titled exactly `STAGING MEDIA URL TEST`, upload one artificial test image through the normal issue form, and save it. Do not use a secret circle, because its media intentionally uses the private-media path.

Then run this read-only query on the staging VM to inspect the newest matching staging record and fail unless every stored image URL has the staging storage prefix:

```bash
cd /home/ubuntu/kamooni-target/circles && STAGING_INFRA_APP_DIR=/home/ubuntu/kamooni/circles STAGING_TARGET_APP_DIR=/home/ubuntu/kamooni-target/circles GIT_SHA=verify STAGING_IMAGE_TAG=verify BUILD_TIME=verify docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml exec -T db sh -lc 'mongosh "$MONGODB_URI" --quiet --eval '\''const d=db.getSiblingDB("circles"); const doc=d.issues.find({title:"STAGING MEDIA URL TEST","images.0":{$exists:true}}).sort({createdAt:-1}).limit(1).next(); if(!doc){print("No matching staging issue with an image"); quit(1)} const urls=doc.images.map(image=>image?.fileInfo?.url).filter(Boolean); printjson(urls); if(!urls.length || urls.some(url=>!url.startsWith("https://staging.kamooni.org/storage/"))){quit(1)}'\'''
```

Success prints the stored URL array and exits zero; every URL must begin `https://staging.kamooni.org/storage/`. A nonzero result is a deployment blocker. This query reads only the isolated staging `circles` database and does not modify or delete the test record.

The default services are exactly `circles`, `db`, `minio`, and `nginx`. Only host ports 80 and 443 are published. Qdrant, cron, Watchtower, both loopback helpers, PostgreSQL, and Synapse are profile-disabled. All volumes are Compose-managed under `kamooni_staging_`. The application lazily creates the `circles` and `circles-private` MinIO buckets; no bootstrap container is needed.
