# Kamooni staging deployment

Kamooni staging is an isolated, test-data-only installation at <https://staging.kamooni.org> on a dedicated Cleura VM separate from production. It must never receive production secrets, production data, production identity material, production volumes, production deployment scripts, or production external-service accounts.

Staging is the preferred environment for full Docker builds, integration testing, and desktop/mobile browser validation. Every change must originate on a Git branch, be pushed to GitHub, and be deployed from the remote branch with the existing script. Never routinely hot-edit staging.

## Verified environment

The staging environment and its `/api/version` response were verified at commit `e742a7898395c73ea6080af4139aa1def7eb54d7`. The infrastructure checkout remains at `/home/ubuntu/kamooni` on branch `infra/kamooni-staging`; the deployment target worktree is `/home/ubuntu/kamooni-target`, detached at the exact requested SHA. The Docker Compose project is `kamooni_staging`.

The default running services are `circles`, MongoDB (`db`), MinIO (`minio`), Mailpit (`mailpit`), the hardened localhost-only Mailpit UI proxy (`mailpit_ui_proxy`), and NGINX (`nginx`). Qdrant is initially disabled. Synapse and PostgreSQL are disabled and are not required for the current Mongo-native chat architecture. Payments and external integrations are disabled by default.

Staging MongoDB and MinIO use data, volumes, credentials, and secrets that are separate from production. Verified staging volumes include `kamooni_staging_db` and `kamooni_staging_storage`. The staging Compose changes add an ephemeral Mailpit sink; the current live staging host has not been changed or verified with Mailpit yet. Never use production deployment scripts, credentials, data, or volumes for staging. Mailpit is absent from production Compose, and the production image rejects its transport.

Treat the staging database and object storage as persistent. Tests requiring disposable databases must use separate isolated test instances; never run destructive integration tests against staging's persistent database. Never automatically delete Docker volumes, databases, or persistent storage.

Media upload has been verified end-to-end through staging MinIO. New media URLs are stored in staging MongoDB as relative `/storage/...` paths. A scan of staging MongoDB found no references to `https://kamooni.org`, `www.kamooni.org`, `127.0.0.1`, or `localhost`.

## Staging access

The staging host and SSH access verified on October 27, 2026 are:

- Public hostname: `staging.kamooni.org`
- Public IP: `188.95.227.109`
- SSH user: `ubuntu`
- Local SSH identity: `~/.ssh/kamooni_staging`
- Infrastructure checkout: `/home/ubuntu/kamooni`

Connect from the local Mac terminal with:

```bash
ssh -i ~/.ssh/kamooni_staging -o IdentitiesOnly=yes ubuntu@188.95.227.109
```

This access is only for the dedicated staging VM. Production uses `root@kamooniorg` and the production checkout under `/root/circles/circles`; it does not use the staging IP, `ubuntu` account, identity file, checkout, deployment script, data, or volumes. See [Production deployment](PRODUCTION_DEPLOYMENT.md) for the separate production workflow.

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

## Staging email capture (Mailpit)

The staging Compose override selects Mailpit explicitly for email and continues to force `POSTMARK_API_TOKEN` and `POSTMARK_SENDER_EMAIL` empty. The app image is marked as a staging build; it accepts Mailpit only when that immutable image role, transport, staging URL, and internal Mailpit host/port all agree. Staging supports the pending-registration verification link and the existing `/verify-email` compatibility link; other email templates and verification destinations fail closed. There is no Postmark fallback.

Mailpit is attached only to an internal Docker network shared by the app. SMTP port `1025` is not published on the host. Docker cannot publish a working host port directly from a container attached exclusively to an `internal: true` bridge because that bridge has no gateway. A separate, capability-free, read-only NGINX proxy therefore joins the internal Mailpit network and a UI-only bridge with IP masquerading disabled. Only the proxy publishes `127.0.0.1:8025`; it forwards HTTP to Mailpit with the reviewed `Host: localhost` header and is not routed through public NGINX. Mailpit itself never joins the UI bridge and retains no external route. Mailpit has no relay or forwarding configuration, stores no persistent volume, and prunes messages after 72 hours or when the 100-message bound is exceeded. Captured verification links are credentials: use staging test identities only and restrict UI access to staging SSH operators.

Once the reviewed infrastructure change is present in the staging infrastructure checkout, deploy the reviewed application branch with the existing staging deployment script. It starts Mailpit with the other required services. On the staging VM, check service status with:

```bash
docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml ps circles db minio mailpit mailpit_ui_proxy nginx
```

From the local Mac terminal, open a private SSH tunnel:

```bash
ssh -i ~/.ssh/kamooni_staging -o IdentitiesOnly=yes -N -L 8025:127.0.0.1:8025 ubuntu@188.95.227.109
```

While that command remains open, visit <http://127.0.0.1:8025> in the local browser. The tunnel does not expose the Mailpit UI publicly. Check the verification message and its `/signup/verify?token=...` link there. Do not copy links into logs, tickets, analytics, or shared chat.

Pending registration remains disabled unless its separately reviewed flags and coordinated routing state are deliberately enabled for a staging test. Before rollback, disable pending registration and return registration routing to `legacy`. Delete captured messages using Mailpit’s **Delete all** control after testing; restarting the service also removes its ephemeral database. Do not remove staging MongoDB or MinIO volumes as part of email cleanup.

The staging Compose override and rendered-configuration validator force both `PENDING_REGISTRATION_ENABLED=false` and `PENDING_REGISTRATION_JOURNEY_READY=false`. Existing `.env.staging` files may omit these previously unnecessary keys; no live secrets-file edit is required for this infrastructure upgrade because the effective Compose values remain explicitly disabled. Changing either effective value, or the MongoDB registration routing mode, requires a separate authorization and deployment review.

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
cd /home/ubuntu/kamooni/circles && ./scripts/deploy-staging.sh BRANCH_NAME
```

The script requires a clean infrastructure checkout on `infra/kamooni-staging`, fetches `origin/BRANCH_NAME`, checks both the V2 schema compatibility floor and the committed application safety baseline, and updates the separate detached target worktree to deploy that branch's exact SHA. It never pushes or merges and never switches the infrastructure checkout. Every staging deployment target must descend from `3101d0eb7590f089d625d8bfc8bbace42447b8e0`, the reviewed Group 1 application safety baseline. Do not casually change this pinned value: changing it requires review because it protects payment and welcome-link staging safety.

For the normal production-equivalent staging deployment, use:

```bash
cd /home/ubuntu/kamooni/circles && ./scripts/deploy-staging.sh main
```

Before starting anything it validates `.env.staging`, renders both default and all-profile Compose models, validates the effective application environment, directly scans staging NGINX, and checks isolation. It builds the exact full target SHA under `kamooni-staging-circles:<short-sha>`. It starts only Mongo and MinIO, waits up to 60 seconds for an authenticated Mongo ping, runs target-worktree migration scripts, and only then recreates the app. The staging override binds Next standalone to every container interface. The script verifies the exact SHA through the app's address on the NGINX-shared network before force-recreating NGINX, which refreshes Docker upstream resolution after every application replacement. Deployment succeeds only when `https://staging.kamooni.org/api/version` returns the exact full target SHA. Use the script rather than ad-hoc deployment commands so the verified-image rollback ledger is maintained.

## Roll back to a verified staging image

Rollback is an explicitly authorized staging operation; preparing this procedure does not authorize running it. It does not restore or migrate MongoDB. Before rollback, confirm that the database remains compatible with the selected application revision and that registration routing is `legacy` with both pending-registration flags disabled.

Use only a record already present in `/home/ubuntu/.local/state/kamooni-staging/verified-images.tsv`. Under the same exclusive `/run/lock/kamooni-staging-docker.lock` used by deployment, verify that the selected record has four valid fields, its tag is `kamooni-staging-circles:<first-eight-git-characters>`, `docker image inspect` returns the ledger's immutable image ID, and the target Git commit exists locally. Keep the infrastructure checkout on `infra/kamooni-staging`, detach `/home/ubuntu/kamooni-target` at that exact full Git SHA, and render and run both staging validators before changing services.

With `STAGING_IMAGE_TAG` set to the selected eight-character tag and the standard staging Compose command, stop only `circles`, `mailpit_ui_proxy`, and `nginx`, then recreate `circles` from the verified image without rebuilding. Before exposing it, obtain the new container's address on `kamooni_staging_webnet` and require its `/api/version` response on port `3000` to report the selected full Git SHA. Start `db`, `minio`, `mailpit`, and `mailpit_ui_proxy` without recreating persistent services, then force-recreate only `nginx` so its upstream state cannot survive an application replacement. Verify `https://staging.kamooni.org/api/version` reports the selected full Git SHA and verify the running `circles` container's immutable image ID still matches the ledger. If either internal or external identity check fails, stop `nginx`, `mailpit_ui_proxy`, and `circles`; leave MongoDB, MinIO, Mailpit, all volumes, the backup archive, and the ledger untouched. Never use `docker compose down -v`, restore the database, delete images, or change registration routing as part of this rollback.

Manual version verification, run anywhere with network access:

```bash
curl -sS https://staging.kamooni.org/api/version && echo
```

After deployment, show the ports published by only the `kamooni_staging` Compose project. Run on the staging VM:

```bash
docker ps --filter label=com.docker.compose.project=kamooni_staging --format 'table {{.Names}}\t{{.Ports}}'
```

The only host bindings in the output must be staging NGINX on ports `80` and `443`, plus `mailpit_ui_proxy` on `127.0.0.1:8025`. Mailpit itself must have no host bindings, and neither UI port `8025` nor SMTP port `1025` may bind to `0.0.0.0` or `[::]`. Entries such as `3000/tcp`, `27017/tcp`, `9000/tcp`, or `1025/tcp` without a host-side `->` mapping are internal-only exposed ports and are expected. No other host bindings may appear.

## Conservative disk maintenance

Inspect disk use before changing anything. Run on the staging VM:

```bash
df -h /
```

Then inspect Docker's accounting:

```bash
docker system df
```

If unused build cache is consuming substantial space, remove only unused builder cache:

```bash
docker builder prune -f
```

On October 27, 2026, this conservative cache cleanup reclaimed approximately 55 GB on staging. It did not require deleting persistent application data.

Preserve all staging volumes, persistent MongoDB data, uploaded MinIO media, and images retained by the verified rollback ledger. Never use `docker volume prune`, `docker system prune --volumes`, or an indiscriminate image-deletion command. Do not delete rollback images merely because Docker reports them as reclaimable; use the deployment script's verified-image retention policy.

## Verify media URL storage

Use only artificial staging data. In the browser, sign in to `https://staging.kamooni.org`, create or use a public staging-only test circle, create an issue titled exactly `STAGING MEDIA URL TEST`, upload one artificial test image through the normal issue form, and save it. Do not use a secret circle, because its media intentionally uses the private-media path.

Then run this read-only query on the staging VM to inspect the newest matching staging record and fail unless every stored image URL is a relative storage path:

```bash
cd /home/ubuntu/kamooni-target/circles && STAGING_INFRA_APP_DIR=/home/ubuntu/kamooni/circles STAGING_TARGET_APP_DIR=/home/ubuntu/kamooni-target/circles GIT_SHA=verify STAGING_IMAGE_TAG=verify BUILD_TIME=verify docker compose --project-name kamooni_staging --project-directory /home/ubuntu/kamooni-target/circles --env-file /home/ubuntu/kamooni/circles/.env.staging -f /home/ubuntu/kamooni-target/circles/docker-compose.yml -f /home/ubuntu/kamooni/circles/docker-compose.staging.yml exec -T db sh -lc 'mongosh "$MONGODB_URI" --quiet --eval '\''const d=db.getSiblingDB("circles"); const doc=d.issues.find({title:"STAGING MEDIA URL TEST","images.0":{$exists:true}}).sort({createdAt:-1}).limit(1).next(); if(!doc){print("No matching staging issue with an image"); quit(1)} const urls=doc.images.map(image=>image?.fileInfo?.url).filter(Boolean); printjson(urls); if(!urls.length || urls.some(url=>!url.startsWith("/storage/"))){quit(1)}'\'''
```

Success prints the stored URL array and exits zero; every URL must begin `/storage/`. A nonzero result is a deployment blocker. This query reads only the isolated staging `circles` database and does not modify or delete the test record.

The default services are exactly `circles`, `db`, `minio`, `mailpit`, `mailpit_ui_proxy`, and `nginx`. NGINX publishes host ports `80` and `443`; the hardened UI proxy publishes only `127.0.0.1:8025`; Mailpit publishes no host ports. Qdrant, cron, Watchtower, both loopback helpers, PostgreSQL, and Synapse are profile-disabled. All volumes are Compose-managed under `kamooni_staging_`. The application lazily creates the `circles` and `circles-private` MinIO buckets; no bootstrap container is needed.
