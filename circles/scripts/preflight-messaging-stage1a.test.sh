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
printf '%s\n' '#!/bin/sh' 'printf '\''{"ok":false,"errors":["MONGODB_URI is missing"]}'\''' 'exit 1' > "$fake_bin/docker"
chmod +x "$fake_bin/docker"
if PATH="$fake_bin:$PATH" "$APP_DIR/scripts/preflight-messaging-stage1a.sh" >"$work_dir/env-output" 2>&1; then
  echo "FAIL: missing environment unexpectedly passed" >&2
  exit 1
fi
grep -Fq 'MONGODB_URI is missing' "$work_dir/env-output"
echo "PASS: missing environment"

echo "Messaging Stage 1A preflight tests passed"
