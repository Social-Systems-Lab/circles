#!/usr/bin/env bash
# Deploy a remote branch without switching the staging-infrastructure checkout.
set +x
set -euo pipefail

EXPECTED_INFRA_REPO_DIR="/home/ubuntu/kamooni"
EXPECTED_INFRA_BRANCH="infra/kamooni-staging"
MINIMUM_CHAT_V2_COMMIT="fcbc9e3e9d7895efd7d9fd8a13356da457b60f54"
STAGING_SAFETY_BASELINE_COMMIT="3101d0eb7590f089d625d8bfc8bbace42447b8e0"
PROJECT_NAME="kamooni_staging"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STAGING_INFRA_APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
INFRA_REPO_DIR="$(cd -- "$STAGING_INFRA_APP_DIR/.." && pwd -P)"
STAGING_TARGET_REPO_DIR="$(dirname -- "$INFRA_REPO_DIR")/kamooni-target"
STAGING_TARGET_APP_DIR="$STAGING_TARGET_REPO_DIR/circles"
ENV_FILE="$STAGING_INFRA_APP_DIR/.env.staging"
VALIDATOR="$STAGING_INFRA_APP_DIR/scripts/validate-staging-environment.py"
STAGING_COMPOSE_FILE="$STAGING_INFRA_APP_DIR/docker-compose.staging.yml"

[[ "$#" -eq 1 ]] || { echo "Usage: $0 <remote-branch>" >&2; exit 1; }
BRANCH="$1"
if ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || [[ "$BRANCH" == refs/* ]]; then
    echo "Error: invalid branch name: $BRANCH" >&2
    exit 1
fi
[[ "$INFRA_REPO_DIR" == "$EXPECTED_INFRA_REPO_DIR" ]] || { echo "Error: staging infrastructure must be at $EXPECTED_INFRA_REPO_DIR." >&2; exit 1; }
[[ "$(git -C "$INFRA_REPO_DIR" rev-parse --show-toplevel 2>/dev/null || true)" == "$INFRA_REPO_DIR" ]] || { echo "Error: invalid infrastructure checkout." >&2; exit 1; }
[[ "$(git -C "$INFRA_REPO_DIR" branch --show-current)" == "$EXPECTED_INFRA_BRANCH" ]] || { echo "Error: infrastructure checkout must remain on $EXPECTED_INFRA_BRANCH." >&2; exit 1; }
if [[ -n "$(git -C "$INFRA_REPO_DIR" status --porcelain --untracked-files=normal)" ]]; then
    echo "Error: refusing to deploy with a dirty infrastructure checkout." >&2
    git -C "$INFRA_REPO_DIR" status --short >&2
    exit 1
fi
for required in "$ENV_FILE" "$VALIDATOR" "$STAGING_COMPOSE_FILE" "$STAGING_INFRA_APP_DIR/nginx/nginx.staging.conf"; do
    [[ -f "$required" ]] || { echo "Error: required staging file is missing: $required" >&2; exit 1; }
done

# This happens before Docker, Mongo, migrations, or any service mutation.
python3 "$VALIDATOR" env-file "$ENV_FILE"

echo "Fetching origin/$BRANCH without switching the infrastructure checkout..."
git -C "$INFRA_REPO_DIR" fetch --no-tags origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
DEPLOY_SHA="$(git -C "$INFRA_REPO_DIR" rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")"
if ! git -C "$INFRA_REPO_DIR" merge-base --is-ancestor "$MINIMUM_CHAT_V2_COMMIT" "$DEPLOY_SHA"; then
    echo "Error: target predates chat read-state V2 compatibility floor $MINIMUM_CHAT_V2_COMMIT." >&2
    exit 1
fi
if ! git -C "$INFRA_REPO_DIR" merge-base --is-ancestor "$STAGING_SAFETY_BASELINE_COMMIT" "$DEPLOY_SHA"; then
    echo "Error: target predates staging application safety baseline $STAGING_SAFETY_BASELINE_COMMIT." >&2
    exit 1
fi

if [[ -e "$STAGING_TARGET_REPO_DIR" ]]; then
    [[ "$(git -C "$STAGING_TARGET_REPO_DIR" rev-parse --show-toplevel 2>/dev/null || true)" == "$STAGING_TARGET_REPO_DIR" ]] || { echo "Error: target path exists but is not a worktree." >&2; exit 1; }
    infra_common="$(git -C "$INFRA_REPO_DIR" rev-parse --path-format=absolute --git-common-dir)"
    target_common="$(git -C "$STAGING_TARGET_REPO_DIR" rev-parse --path-format=absolute --git-common-dir)"
    [[ "$infra_common" == "$target_common" ]] || { echo "Error: target worktree belongs to another repository." >&2; exit 1; }
    target_status="$(git -C "$STAGING_TARGET_REPO_DIR" status --porcelain --untracked-files=all)"
    target_clean_preview="$(git -C "$STAGING_TARGET_REPO_DIR" clean -ndx)"
    if [[ -n "$target_status" || -n "$target_clean_preview" ]]; then
        echo "Error: refusing to replace a target worktree containing tracked, untracked, or ignored content." >&2
        [[ -z "$target_status" ]] || printf '%s\n' "$target_status" >&2
        [[ -z "$target_clean_preview" ]] || printf '%s\n' "$target_clean_preview" >&2
        exit 1
    fi
    git -C "$STAGING_TARGET_REPO_DIR" checkout --detach --force "$DEPLOY_SHA"
else
    git -C "$INFRA_REPO_DIR" worktree add --detach "$STAGING_TARGET_REPO_DIR" "$DEPLOY_SHA"
fi
[[ "$(git -C "$STAGING_TARGET_REPO_DIR" rev-parse HEAD)" == "$DEPLOY_SHA" ]] || { echo "Error: target worktree SHA mismatch." >&2; exit 1; }

for required in docker-compose.yml Dockerfile scripts/migrate-chat-read-state-v2.mongo.js scripts/verify-chat-read-state-v2.mongo.js; do
    [[ -f "$STAGING_TARGET_APP_DIR/$required" ]] || { echo "Error: compatible target lacks $required." >&2; exit 1; }
done

GIT_SHA="$DEPLOY_SHA"
STAGING_IMAGE_TAG="$(git -C "$INFRA_REPO_DIR" rev-parse --short=8 "$DEPLOY_SHA")"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_SHA STAGING_IMAGE_TAG BUILD_TIME STAGING_INFRA_APP_DIR STAGING_TARGET_APP_DIR

compose() {
    docker compose --project-name "$PROJECT_NAME" --project-directory "$STAGING_TARGET_APP_DIR" \
        --env-file "$ENV_FILE" -f "$STAGING_TARGET_APP_DIR/docker-compose.yml" -f "$STAGING_COMPOSE_FILE" "$@"
}

RENDERED_CONFIG="$(mktemp /tmp/kamooni-staging-compose.XXXXXX.json)"
RENDERED_ALL_CONFIG="$(mktemp /tmp/kamooni-staging-compose-all.XXXXXX.json)"
trap 'rm -f "$RENDERED_CONFIG" "$RENDERED_ALL_CONFIG"' EXIT
compose config --format json >"$RENDERED_CONFIG"
compose --profile "*" config --format json >"$RENDERED_ALL_CONFIG"
# Validate the actual environment Docker will provide before any service starts.
python3 "$VALIDATOR" compose-json "$RENDERED_CONFIG"

python3 - "$RENDERED_CONFIG" "$RENDERED_ALL_CONFIG" "$PROJECT_NAME" "$STAGING_INFRA_APP_DIR/nginx/nginx.staging.conf" <<'PY'
import json, re, sys
default_path, all_path, project, nginx_path = sys.argv[1:]
config = json.load(open(default_path, encoding="utf-8"))
all_config = json.load(open(all_path, encoding="utf-8"))
nginx = open(nginx_path, encoding="utf-8").read()
errors = []
if config.get("name") != project or all_config.get("name") != project:
    errors.append("Compose project name is not kamooni_staging")
rendered = json.dumps(all_config, sort_keys=True)
patterns = {
    "production volume": r"circles_(?:mongo|minio|qdrant|postgres|synapse)(?:[^A-Za-z0-9_]|$)",
    "production certificate": r"/etc/letsencrypt/live/kamooni[.]org(?:/|\\\")",
    "production URL": r"https?://kamooni[.]org(?:[/\\\":]|$)",
    "production alias": r'(?<![A-Za-z0-9.-])(?:www[.])?kamooni[.]org(?:[^A-Za-z0-9.-]|$)',
}
for label, pattern in patterns.items():
    if re.search(pattern, rendered): errors.append(f"rendered config contains {label}")
nginx_patterns = {
    "production server_name": r"(?m)^\\s*server_name\\s+(?:www[.]kamooni[.]org|kamooni[.]org)(?:\\s|;)",
    "production URL": r"https?://kamooni[.]org(?:[/\\s;]|$)",
    "production certificate": r"/etc/letsencrypt/live/kamooni[.]org(?:/|\\s|$)",
    "production volume": r"circles_(?:mongo|minio|qdrant|postgres|synapse)(?:[^A-Za-z0-9_]|$)",
}
for label, pattern in nginx_patterns.items():
    if re.search(pattern, nginx): errors.append(f"staging NGINX contains {label}")
default_services = config.get("services", {})
expected = {"circles", "db", "minio", "nginx"}
if set(default_services) != expected: errors.append(f"default services are {sorted(default_services)!r}")
services = all_config.get("services", {})
profiles = {"qdrant":"vdb", "cron":"cron", "watchtower":"watchtower", "minio_loopback":"loopback", "nginx_loopback":"loopback", "postgres":"matrix", "synapse":"matrix"}
for service, profile in profiles.items():
    if profile not in services.get(service, {}).get("profiles", []): errors.append(f"{service} lacks profile {profile}")
for service, definition in services.items():
    if service != "nginx" and definition.get("ports"): errors.append(f"{service} publishes host ports")
published = sorted((int(p["published"]), int(p["target"])) for p in services.get("nginx", {}).get("ports", []))
if published != [(80,80), (443,443)]: errors.append(f"NGINX ports are {published!r}")
env = default_services.get("circles", {}).get("environment", {})
for key in ("PAYMENTS_ENABLED", "VDB_ENABLED"):
    if str(env.get(key, "")).lower() != "false": errors.append(f"{key} is not forced false")
forced_empty = ("CIRCLES_REGISTRY_URL","OPENAI_API_KEY","MAPBOX_API_KEY","NEXT_PUBLIC_MAPBOX_TOKEN","POSTMARK_API_TOKEN","POSTMARK_SENDER_EMAIL","TELEGRAM_BOT_TOKEN","TELEGRAM_BOT_USERNAME","DONORBOX_EMAIL","DONORBOX_API_USER","DONORBOX_API_KEY","DONORBOX_WEBHOOK_SECRET","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_PRICE_MONTHLY","STRIPE_PRICE_YEARLY","STRIPE_PRICE_MONTHLY_1","STRIPE_PRICE_MONTHLY_2","STRIPE_PRICE_MONTHLY_5","STRIPE_PRICE_MONTHLY_10","VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK","KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK","VIBE_ID_CREDENTIAL_ISSUER_DID")
for key in forced_empty:
    if env.get(key) not in (None, ""): errors.append(f"{key} is not forced empty")
for name, volume in all_config.get("volumes", {}).items():
    if not volume.get("name", "").startswith(project + "_"): errors.append(f"volume {name} is outside staging")
    if volume.get("external"): errors.append(f"volume {name} is external")
if errors:
    print("Error: unsafe staging configuration:", file=sys.stderr)
    for error in errors: print(f"  - {error}", file=sys.stderr)
    raise SystemExit(1)
PY

if [[ ! -f /etc/letsencrypt/live/staging.kamooni.org/fullchain.pem || ! -f /etc/letsencrypt/live/staging.kamooni.org/privkey.pem ]]; then
    echo "Error: staging-only TLS certificate is missing; complete TLS bootstrap first." >&2
    exit 1
fi

echo "Building exact target $DEPLOY_SHA as kamooni-staging-circles:$STAGING_IMAGE_TAG..."
compose build circles
echo "Stopping staging writers and proxy before readiness and migration checks..."
compose stop circles nginx
echo "Starting staging Mongo and MinIO only..."
compose up -d db minio

APP_MONGODB_URI="$(python3 - "$RENDERED_CONFIG" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["services"]["circles"]["environment"]["MONGODB_URI"])
PY
)"
echo "Waiting up to 60 seconds for authenticated staging Mongo readiness..."
mongo_ready=false
for attempt in $(seq 1 30); do
    if printf '%s\n' "$APP_MONGODB_URI" | compose exec -T db sh -lc 'IFS= read -r MONGODB_URI && export MONGODB_URI && mongosh "$MONGODB_URI" --quiet --eval '\''quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)'\'' >/dev/null 2>&1'; then
        mongo_ready=true; break
    fi
    sleep 2
done
[[ "$mongo_ready" == true ]] || { echo "Error: Mongo readiness timed out; circles and NGINX were not started." >&2; exit 1; }

run_mongo_script() {
    local script_path="$STAGING_TARGET_APP_DIR/$1"
    { printf '%s\n' "$APP_MONGODB_URI"; cat "$script_path"; } | compose exec -T db sh -lc 'IFS= read -r MONGODB_URI || exit 1
      export MONGODB_URI; f="$(mktemp /tmp/circles-mongo-script.XXXXXX.js)" || exit 1
      trap '\''rm -f "$f"'\'' EXIT; chmod 600 "$f"
      printf '\''%s\n'\'' '\''db = connect(process.env.MONGODB_URI);'\'' >"$f"; cat >>"$f"
      mongosh --nodb --quiet --file "$f" >/dev/null 2>&1'
}
get_migration_completion_count() {
    printf '%s\n' "$APP_MONGODB_URI" | compose exec -T db sh -lc 'IFS= read -r MONGODB_URI || exit 1; export MONGODB_URI
      r="$(mongosh --nodb --quiet --eval '\''const d=connect(process.env.MONGODB_URI); d.schemaMigrations.countDocuments({_id:"chat-read-state-v2",status:"complete"})'\'' 2>/dev/null)" || exit 1
      case "$r" in ""|*[!0-9]*) exit 1 ;; *) printf '\''%s\n'\'' "$r" ;; esac'
}
fail_offline() { echo "Error: $1. Staging circles remains stopped." >&2; exit 1; }
fail_public_services() {
    echo "Error: $1. Stopping unverified staging nginx and circles; db, minio, and all volumes are preserved." >&2
    local stop_failed=false
    compose stop nginx || stop_failed=true
    compose stop circles || stop_failed=true
    if [[ "$stop_failed" == true ]] || [[ -n "$(compose ps --status running -q nginx circles 2>/dev/null || true)" ]]; then
        echo "Error: could not confirm that both staging nginx and circles stopped; operator intervention is required." >&2
    else
        echo "Unverified staging nginx and circles are stopped. Staging db, minio, and volumes were preserved." >&2
    fi
    exit 1
}
COMPLETION_COUNT="$(get_migration_completion_count)" || fail_offline "could not inspect migration status"
if [[ "$COMPLETION_COUNT" == 1 ]]; then
    run_mongo_script scripts/verify-chat-read-state-v2.mongo.js || fail_offline "migration verification failed"
elif [[ "$COMPLETION_COUNT" == 0 ]]; then
    [[ -z "$(compose ps --status running -q circles)" ]] || fail_offline "a circles writer is still running"
    run_mongo_script scripts/migrate-chat-read-state-v2.mongo.js || fail_offline "migration failed"
    run_mongo_script scripts/verify-chat-read-state-v2.mongo.js || fail_offline "migration verification failed"
else
    fail_offline "unexpected migration count $COMPLETION_COUNT"
fi

compose up -d --no-deps --force-recreate circles || fail_public_services "circles startup failed"
compose up -d --no-deps db minio nginx || fail_public_services "nginx startup failed"
VERSION_URL="https://staging.kamooni.org/api/version"
VERSION_OUTPUT=""
for attempt in $(seq 1 30); do
    if VERSION_OUTPUT="$(curl -fsSL "$VERSION_URL")" && python3 - "$VERSION_OUTPUT" "$DEPLOY_SHA" <<'PY'
import json, sys
try: raise SystemExit(0 if json.loads(sys.argv[1]).get("gitSha") == sys.argv[2] else 1)
except (json.JSONDecodeError, TypeError): raise SystemExit(1)
PY
    then
        echo "Version check passed for exact target $DEPLOY_SHA."
        printf '%s\n' "$VERSION_OUTPUT"
        exit 0
    fi
    sleep 2
done
echo "Error: version endpoint did not report $DEPLOY_SHA. Last response: $VERSION_OUTPUT" >&2
compose logs --tail=50 circles >&2 || true
fail_public_services "version verification failed (curl error, malformed JSON, missing gitSha, or SHA mismatch)"
