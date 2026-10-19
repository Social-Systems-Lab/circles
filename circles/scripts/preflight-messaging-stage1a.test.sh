#!/usr/bin/env bash
# Destructive only inside the disposable Mongo container created below.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CONTAINER="circles-stage1a-preflight-test-$$"
ROOT_URI="mongodb://root:stage1a-test-only@127.0.0.1:27017/circles_stage1a_preflight_test?authSource=admin"
TEST_DB="circles_stage1a_preflight_test"

cleanup() {
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm -d --name "$CONTAINER" \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=stage1a-test-only \
  mongo:7.0 >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" mongosh "$ROOT_URI" --quiet --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" mongosh "$ROOT_URI" --quiet --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null

mongo_eval() {
  docker exec "$CONTAINER" mongosh "$ROOT_URI" --quiet --eval "$1" >/dev/null
}

run_preflight() {
  local uri="${1:-$ROOT_URI}"
  docker exec -i -e MONGODB_URI="$uri" "$CONTAINER" sh -lc '
    f="$(mktemp /tmp/stage1a-test.XXXXXX.js)" || exit 1
    trap '\''rm -f "$f"'\'' EXIT
    printf '\''db = connect(process.env.MONGODB_URI);\n'\'' > "$f"
    cat >> "$f"
    mongosh --nodb --quiet --file "$f"
  ' < "$APP_DIR/scripts/preflight-messaging-stage1a.mongo.js"
}

reset_db() {
  mongo_eval 'if (db.getName() !== "circles_stage1a_preflight_test") quit(90); db.dropDatabase();'
}

expect_failure() {
  local label="$1"
  local expected="$2"
  local uri="${3:-$ROOT_URI}"
  if run_preflight "$uri" >"$work_dir/output" 2>&1; then
    echo "FAIL: $label unexpectedly passed" >&2
    exit 1
  fi
  grep -Fq "$expected" "$work_dir/output" || {
    echo "FAIL: $label did not report $expected" >&2
    sed -n '1,200p' "$work_dir/output" >&2
    exit 1
  }
  echo "PASS: $label"
}

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"; cleanup' EXIT

reset_db
if ! run_preflight >"$work_dir/output" 2>&1; then
  echo "FAIL: clean fixture failed" >&2
  sed -n '1,240p' "$work_dir/output" >&2
  exit 1
fi
grep -Fq 'ok: true' "$work_dir/output"
echo "PASS: clean fixture"

reset_db
mongo_eval 'db.chatTopicReadStates.insertMany([{userDid:"did:a",conversationId:"c",topicId:"t"},{userDid:"did:a",conversationId:"c",topicId:"t"}]); db.chatTopicDrafts.insertMany([{authorDid:"did:a",recipientDid:"did:b"},{authorDid:"did:a",recipientDid:"did:b"}]); db.chatTopicDraftTombstones.insertMany([{authorDid:"did:a",recipientDid:"did:b",generation:"g"},{authorDid:"did:a",recipientDid:"did:b",generation:"g"}]); db.canonicalDmClaims.insertMany([{pairKey:"p"},{pairKey:"p"}]); db.chatMessageDocs.insertMany([{senderDid:"did:a",submissionId:"s"},{senderDid:"did:a",submissionId:"s"}]);'
expect_failure "duplicate fixtures" "duplicates:chatTopicReadStates"
grep -Fq 'duplicates:chatTopicDrafts' "$work_dir/output"
grep -Fq 'duplicates:chatTopicDraftTombstones' "$work_dir/output"
grep -Fq 'duplicates:canonicalDmClaims' "$work_dir/output"
grep -Fq 'duplicates:chatMessageDocs' "$work_dir/output"

reset_db
mongo_eval 'db.chatTopicDrafts.createIndex({authorDid:1,recipientDid:1},{name:"authorDid_1_recipientDid_1"});'
expect_failure "incompatible default-name index" "required default name is occupied by an incompatible index"

reset_db
mongo_eval 'db.chatTopicDrafts.createIndex({authorDid:1,recipientDid:1},{name:"compatible_custom_name",unique:true});'
if ! run_preflight >"$work_dir/output" 2>&1; then
  echo "FAIL: compatible custom-named index failed" >&2
  sed -n '1,240p' "$work_dir/output" >&2
  exit 1
fi
grep -Fq 'compatible (compatible_custom_name)' "$work_dir/output"
echo "PASS: compatible custom-named index"

reset_db
mongo_eval 'db.chatTopicDrafts.createIndex({authorDid:1,recipientDid:1},{name:"nonunique_custom_variant"});'
if ! run_preflight >"$work_dir/output" 2>&1; then
  echo "FAIL: permitted custom-name coexistence failed preflight" >&2
  sed -n '1,240p' "$work_dir/output" >&2
  exit 1
fi
grep -Fq 'custom-named same-key index variants can coexist' "$work_dir/output"
mongo_eval 'db.chatTopicDrafts.createIndex({authorDid:1,recipientDid:1},{unique:true});'
echo "PASS: MongoDB 7 permits custom-name same-key coexistence"

reset_db
mongo_eval 'db.canonicalDmClaims.insertOne({pairKey:["did:a","did:b"].join(String.fromCharCode(0)),participants:["did:a","did:b"],conversationId:new ObjectId().toString(),state:"creating"});'
if ! run_preflight >"$work_dir/output" 2>&1; then
  echo "FAIL: recoverable creating claim failed" >&2
  sed -n '1,240p' "$work_dir/output" >&2
  exit 1
fi
grep -Fq 'creating claim target is missing but recoverable' "$work_dir/output"
echo "PASS: recoverable creating claim"

reset_db
mongo_eval 'const id=new ObjectId(); db.chatConversations.insertOne({_id:id,type:"dm",participants:["did:a","did:b"]}); db.canonicalDmClaims.insertOne({pairKey:["did:a","did:b"].join(String.fromCharCode(0)),participants:["did:b","did:a"],conversationId:id.toString(),state:"ready"});'
if ! run_preflight >"$work_dir/output" 2>&1; then
  echo "FAIL: reversed valid participants failed" >&2
  sed -n '1,240p' "$work_dir/output" >&2
  exit 1
fi
grep -Fq 'participants are valid but not normalized' "$work_dir/output"
echo "PASS: reversed participants warn"

reset_db
mongo_eval 'db.canonicalDmClaims.insertOne({pairKey:["did:a","did:b"].join(String.fromCharCode(0)),participants:["did:a","did:b"],conversationId:new ObjectId().toString(),state:"ready"});'
expect_failure "ready claim with missing target" "target is missing"

reset_db
mongo_eval 'db.chatConversations.insertOne({type:"dm",participants:["did:a","did:b"]}); db.canonicalDmClaims.insertOne({pairKey:["did:a","did:b"].join(String.fromCharCode(0)),participants:["did:a","did:b"],conversationId:new ObjectId().toString(),state:"creating"});'
expect_failure "creating claim with conflicting active history" "creating claim target is missing and conflicts with active DM history"

reset_db
mongo_eval 'const id=new ObjectId(); db.chatConversations.insertMany([{_id:id,type:"dm",participants:["did:a","did:b"],archived:true},{type:"dm",participants:["did:e","did:f"]},{type:"dm",participants:["did:f","did:e"]}]); db.canonicalDmClaims.insertMany([{pairKey:["did:a","did:b"].join(String.fromCharCode(0)),participants:["did:a","did:b"],conversationId:id.toString(),state:"ready"},{pairKey:"bad",participants:["did:x","did:x"],conversationId:"not-an-id",state:"broken"},{pairKey:["did:c","did:d"].join(String.fromCharCode(0)),participants:["did:c","did:d"],conversationId:new ObjectId().toString(),state:"ready"}]);'
expect_failure "malformed and missing claims" "target is archived"
grep -Fq 'malformed participants' "$work_dir/output"
grep -Fq 'target is missing' "$work_dir/output"
grep -Fq 'multiple active DMs' "$work_dir/output"

reset_db
mongo_eval 'db.createUser({user:"stage1a_read_only",pwd:"stage1a-test-only",roles:[{role:"read",db:"circles_stage1a_preflight_test"}]});'
READ_URI="mongodb://stage1a_read_only:stage1a-test-only@127.0.0.1:27017/$TEST_DB?authSource=$TEST_DB"
expect_failure "missing createIndex permission" "createIndex is not advertised" "$READ_URI"

fake_bin="$work_dir/bin"
mkdir -p "$fake_bin"
printf '%s\n' '#!/bin/sh' 'case "$*" in' '  *"compose run"*) while [ "$#" -gt 1 ]; do shift; done; node -e "$1" ;;' '  *"compose exec"*) cat >/dev/null ;;' '  *) exit 1 ;;' 'esac' > "$fake_bin/docker"
chmod +x "$fake_bin/docker"

run_environment_preflight() {
  env -i \
    PATH="$fake_bin:$PATH" \
    APP_MONGODB_URI="mongodb://example.invalid/circles" \
    MONGODB_URI="${MONGODB_URI-mongodb://example.invalid/circles}" \
    CIRCLES_URL="${CIRCLES_URL-https://kamooni.org}" \
    NEXT_PUBLIC_CHAT_PROVIDER="${NEXT_PUBLIC_CHAT_PROVIDER-mongo}" \
    CRON_SECRET="${CRON_SECRET-secret-prefixed-synthetic-value-123456}" \
    CIRCLES_JWT_SECRET="${CIRCLES_JWT_SECRET-synthetic-jwt-value-123456789012345}" \
    "$APP_DIR/scripts/preflight-messaging-stage1a.sh"
}

expect_environment_failure() {
  local label="$1"
  local expected="$2"
  if run_environment_preflight >"$work_dir/env-output" 2>&1; then
    echo "FAIL: $label unexpectedly passed" >&2
    exit 1
  fi
  grep -Fq "$expected" "$work_dir/env-output" || {
    echo "FAIL: $label did not report $expected" >&2
    sed -n '1,120p' "$work_dir/env-output" >&2
    exit 1
  }
  echo "PASS: $label"
}

MONGODB_URI="" expect_environment_failure "missing environment" "MONGODB_URI is missing"
CRON_SECRET="" expect_environment_failure "missing cron secret" "CRON_SECRET is missing"
CIRCLES_JWT_SECRET="" expect_environment_failure "missing JWT secret" "CIRCLES_JWT_SECRET is missing"
CRON_SECRET="your_secret_key_for_cron_jobs" expect_environment_failure "documented cron placeholder" "CRON_SECRET is an unsafe placeholder"
CIRCLES_JWT_SECRET="your_jwt_secret" expect_environment_failure "documented JWT placeholder" "CIRCLES_JWT_SECRET is an unsafe placeholder"
CRON_SECRET="ChAnGe_Me" expect_environment_failure "case-insensitive change-me placeholder" "CRON_SECRET is an unsafe placeholder"
CRON_SECRET="RePlAcE_Me" expect_environment_failure "case-insensitive placeholder" "CRON_SECRET is an unsafe placeholder"
CRON_SECRET="PlAcEhOlDeR" expect_environment_failure "case-insensitive literal placeholder" "CRON_SECRET is an unsafe placeholder"
CRON_SECRET="GENERATE_STAGING_ONLY_SECRET" expect_environment_failure "staging placeholder" "CRON_SECRET is an unsafe placeholder"

short_secret="short-but-custom"
CRON_SECRET="$short_secret" run_environment_preflight >"$work_dir/env-output" 2>&1
grep -Fq 'CRON_SECRET is suspiciously short; strength is unknown' "$work_dir/env-output"
if grep -Fq "$short_secret" "$work_dir/env-output"; then
  echo "FAIL: successful output exposed a secret value" >&2
  exit 1
fi
echo "PASS: short custom secret warns without failing or leaking"

secret_prefix="secret-prefixed-synthetic-value-123456"
CRON_SECRET="$secret_prefix" run_environment_preflight >"$work_dir/env-output" 2>&1
if grep -Fq "$secret_prefix" "$work_dir/env-output"; then
  echo "FAIL: successful output exposed a secret-prefixed value" >&2
  exit 1
fi
echo "PASS: secret-prefixed non-placeholder"

failed_secret="your_jwt_secret"
CIRCLES_JWT_SECRET="$failed_secret" expect_environment_failure "failed output redaction fixture" "CIRCLES_JWT_SECRET is an unsafe placeholder"
if grep -Fq "$failed_secret" "$work_dir/env-output"; then
  echo "FAIL: failed output exposed a secret value" >&2
  exit 1
fi
echo "PASS: failed output does not leak secret values"

MONGODB_URI="mongodb://example.invalid/not-circles" expect_environment_failure "invalid MongoDB database" "MONGODB_URI is invalid or does not select circles"
CIRCLES_URL="https://example.invalid" expect_environment_failure "invalid CIRCLES_URL" "CIRCLES_URL is not https://kamooni.org"
NEXT_PUBLIC_CHAT_PROVIDER="matrix" expect_environment_failure "invalid chat provider" "NEXT_PUBLIC_CHAT_PROVIDER is not mongo"

echo "Messaging Stage 1A preflight tests passed"
