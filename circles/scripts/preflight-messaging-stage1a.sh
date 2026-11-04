#!/usr/bin/env bash
# Read-only Messaging Stage 1A production preflight. Never enable shell tracing here.
set +x
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
MONGO_SCRIPT="$APP_DIR/scripts/preflight-messaging-stage1a.mongo.js"

if [[ ! -f "$MONGO_SCRIPT" ]]; then
  echo "Error: Stage 1A Mongo preflight script is missing." >&2
  exit 1
fi

resolve_application_environment() {
  (cd "$APP_DIR" && docker compose run --rm --no-deps -T circles node -e '
    const required = ["MONGODB_URI", "CIRCLES_URL", "NEXT_PUBLIC_CHAT_PROVIDER", "CRON_SECRET", "CIRCLES_JWT_SECRET"];
    const missing = required.filter((name) => !process.env[name]);
    const secretNames = ["CRON_SECRET", "CIRCLES_JWT_SECRET"];
    const placeholders = new Set([
      "your_jwt_secret",
      "your_secret_key_for_cron_jobs",
      "change_me",
      "replace_me",
      "placeholder",
      "generate_staging_only_secret",
    ]);
    const unsafe = secretNames.filter((name) => placeholders.has((process.env[name] || "").toLowerCase()));
    const warnings = secretNames
      .filter((name) => process.env[name] && !unsafe.includes(name) && process.env[name].length < 32)
      .map((name) => `${name} is suspiciously short; strength is unknown`);
    let uriOk = false;
    try {
      const uri = process.env.MONGODB_URI || "";
      const parsed = new URL(uri);
      const database = parsed.pathname.replace(/^\//, "").split("?")[0];
      uriOk = /^mongodb(?:\+srv)?:$/.test(parsed.protocol) && database === "circles" && !/[\r\n]/.test(uri);
    } catch {}
    const errors = [
      ...missing.map((name) => `${name} is missing`),
      ...unsafe.map((name) => `${name} is an unsafe placeholder`),
      ...(uriOk ? [] : ["MONGODB_URI is invalid or does not select circles"]),
      ...(process.env.CIRCLES_URL === "https://kamooni.org" ? [] : ["CIRCLES_URL is not https://kamooni.org"]),
      ...(process.env.NEXT_PUBLIC_CHAT_PROVIDER === "mongo" ? [] : ["NEXT_PUBLIC_CHAT_PROVIDER is not mongo"]),
    ];
    process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors, warnings }));
    process.exit(errors.length === 0 ? 0 : 1);
  ')
}

echo "Checking the production Compose environment (secret values will not be printed)..."
if ! ENVIRONMENT_RESULT="$(resolve_application_environment)"; then
  echo "Error: Stage 1A environment preflight failed: $ENVIRONMENT_RESULT" >&2
  exit 1
fi
echo "Environment preflight passed: $ENVIRONMENT_RESULT"

if [[ -z "${APP_MONGODB_URI:-}" ]]; then
  APP_MONGODB_URI="$(cd "$APP_DIR" && docker compose run --rm --no-deps -T circles \
    node -e 'const uri=process.env.MONGODB_URI||"";if(!uri||/[\r\n]/.test(uri))process.exit(1);process.stdout.write(uri)')"
fi
if [[ -z "$APP_MONGODB_URI" || "$APP_MONGODB_URI" == *$'\n'* || "$APP_MONGODB_URI" == *$'\r'* ]]; then
  echo "Error: could not securely resolve the application MongoDB URI." >&2
  exit 1
fi

echo "Running read-only Stage 1A MongoDB checks..."
{
  printf '%s\n' "$APP_MONGODB_URI"
  cat "$MONGO_SCRIPT"
} | (cd "$APP_DIR" && docker compose exec -T db sh -lc '
  IFS= read -r MONGODB_URI || exit 1
  [ -n "$MONGODB_URI" ] || exit 1
  export MONGODB_URI
  script_file="$(mktemp /tmp/circles-stage1a-preflight.XXXXXX.js)" || exit 1
  trap '\''rm -f "$script_file"'\'' EXIT
  chmod 600 "$script_file" || exit 1
  printf '\''%s\n'\'' '\''db = connect(process.env.MONGODB_URI);'\'' > "$script_file" || exit 1
  cat >> "$script_file" || exit 1
  mongosh --nodb --quiet --file "$script_file"
')
echo "Messaging Stage 1A production preflight passed. No MongoDB records or indexes were changed."
