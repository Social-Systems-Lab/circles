#!/usr/bin/env bash
set -euo pipefail

EXPECTED_DIR="/root/circles/circles"
APP_DIR="${EXPECTED_DIR}/circles"
CURRENT_DIR="$(pwd -P)"

if [[ "$CURRENT_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Error: run this script from $EXPECTED_DIR (current: $CURRENT_DIR)" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "Error: app directory not found: $APP_DIR" >&2
  exit 1
fi

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

DIRTY_STATUS="$(git status --porcelain)"
if [[ -n "$DIRTY_STATUS" ]]; then
  echo "Error: refusing to deploy with a dirty working tree." >&2
  echo "$DIRTY_STATUS" >&2
  exit 1
fi

echo "Deploying branch: $BRANCH"
git fetch origin "$BRANCH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "origin/$BRANCH"
fi

git reset --hard "origin/$BRANCH"

GIT_SHA="$(git rev-parse --short HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_SHA BUILD_TIME

echo "Deploying SHA: $GIT_SHA"
echo "Build time (UTC): $BUILD_TIME"

echo "Running branding guard for Kamooni..."
(cd "$APP_DIR" && ./scripts/check-branding-guard.sh kamooni)

(cd "$APP_DIR" && docker compose build circles)

resolve_application_mongodb_uri() {
  # Resolve the exact environment assigned to the application service. This works even when
  # the existing circles container is stopped because the newly built image runs only `node -e`.
  (cd "$APP_DIR" && docker compose run --rm --no-deps -T circles \
    node -e 'const uri = process.env.MONGODB_URI || ""; if (!uri) process.exit(1); process.stdout.write(uri)')
}

if ! APP_MONGODB_URI="$(resolve_application_mongodb_uri)" || [[ -z "$APP_MONGODB_URI" ]]; then
  echo "Error: could not resolve MONGODB_URI from the Compose circles service environment." >&2
  echo "Migration authentication requires the same MONGODB_URI used by the application." >&2
  exit 1
fi

run_mongo_script() {
  local script_path="$1"
  local absolute_script_path="$APP_DIR/$script_path"
  if [[ ! -f "$absolute_script_path" ]]; then
    echo "Error: Mongo script not found: $absolute_script_path" >&2
    return 1
  fi

  # MONGO_INITDB_ROOT_PASSWORD initializes a new Mongo volume; it is not authoritative after
  # initialization. Use the application's working URI and a file so mongosh cannot remain in REPL mode.
  (cd "$APP_DIR" && docker compose exec -T -e MONGODB_URI="$APP_MONGODB_URI" db sh -lc \
    'script_file="$(mktemp /tmp/circles-mongo-script.XXXXXX.js)" || exit 1
     trap '\''rm -f "$script_file"'\'' EXIT
     cat > "$script_file" || exit 1
     mongosh "$MONGODB_URI" --quiet --file "$script_file"' \
    < "$absolute_script_path")
}

chat_read_state_v2_is_complete() {
  local result
  # Use the same authoritative application URI as migration and verification.
  result="$(cd "$APP_DIR" && docker compose exec -T -e MONGODB_URI="$APP_MONGODB_URI" db sh -lc \
    'mongosh "$MONGODB_URI" --quiet --eval '\''db.schemaMigrations.countDocuments({_id:"chat-read-state-v2",status:"complete"})'\''')"
  [[ "$result" == "1" ]]
}

fail_offline() {
  echo "Error: $1" >&2
  echo "The old circles application remains stopped. Do not restart an old application image after chat read-state V2 migration has begun." >&2
  echo "Inspect the Mongo migration output and this deployment's newly built image before retrying." >&2
  exit 1
}

if chat_read_state_v2_is_complete; then
  echo "Chat read-state V2 migration is already complete; running the safe idempotent verifier without a migration window."
  if ! run_mongo_script scripts/verify-chat-read-state-v2.mongo.js; then
    echo "Error: chat read-state V2 verification failed; the current V2 application was not replaced." >&2
    exit 1
  fi
else
  echo "Stopping every Compose instance of the old circles application before chat read-state migration..."
  if ! (cd "$APP_DIR" && docker compose stop circles); then
    echo "Error: failed to stop the old circles application; migration was not started." >&2
    exit 1
  fi

  RUNNING_CIRCLES_IDS="$(cd "$APP_DIR" && docker compose ps --status running -q circles)"
  if [[ -n "$RUNNING_CIRCLES_IDS" ]]; then
    echo "Error: old circles application containers are still running; migration was not started:" >&2
    echo "$RUNNING_CIRCLES_IDS" >&2
    exit 1
  fi
  echo "Confirmed: no Compose circles application container is running. Maintenance window started."

  # This migration is idempotent, but it is safe only while every old application writer is stopped.
  if ! run_mongo_script scripts/migrate-chat-read-state-v2.mongo.js; then
    fail_offline "chat read-state V2 migration failed"
  fi
  if ! run_mongo_script scripts/verify-chat-read-state-v2.mongo.js; then
    fail_offline "chat read-state V2 verification failed"
  fi
fi

if ! (cd "$APP_DIR" && docker compose up -d --no-deps --force-recreate circles); then
  fail_offline "the newly built V2 circles application failed to start"
fi

RUNNING_CIRCLES_IDS="$(cd "$APP_DIR" && docker compose ps --status running -q circles)"
if [[ -z "$RUNNING_CIRCLES_IDS" ]]; then
  fail_offline "the newly built V2 circles application is not running"
fi

VERSION_URL="https://kamooni.org/api/version"
VERSION_OUTPUT=""

for attempt in $(seq 1 20); do
  if VERSION_OUTPUT="$(curl -fsSL "$VERSION_URL" 2>/dev/null)" && \
    grep -Eq "\"gitSha\"[[:space:]]*:[[:space:]]*\"$GIT_SHA\"" <<<"$VERSION_OUTPUT"; then
    echo "Version check (attempt $attempt):"
    echo "$VERSION_OUTPUT"
    exit 0
  fi
  sleep 1
done

echo "Error: version check failed after 20 attempts: $VERSION_URL" >&2
echo "Expected deployed gitSha: $GIT_SHA" >&2
(cd "$APP_DIR" && docker compose logs --tail=50 circles || true)
fail_offline "new V2 application health/version verification failed"
