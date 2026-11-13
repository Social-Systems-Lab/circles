#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
suffix="$$"
image="kamooni-registration-ops:test-$suffix"
network="kamooni-registration-ops-test-$suffix"
mongo="kamooni-registration-ops-mongo-$suffix"
users_dir="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-registration-ops-users.XXXXXX")"

cleanup() {
    docker rm -f "$mongo" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    docker image rm "$image" >/dev/null 2>&1 || true
    rm -rf -- "$users_dir"
}
trap cleanup EXIT

docker build --file "$repo_dir/Dockerfile.registration-ops" --tag "$image" "$repo_dir"
docker network create "$network" >/dev/null
docker run --detach --name "$mongo" --network "$network" mongo:7.0 --bind_ip_all >/dev/null

ready=false
for _ in $(seq 1 30); do
    if docker exec "$mongo" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
[[ "$ready" == true ]] || { echo "Disposable MongoDB did not become ready." >&2; exit 1; }

if malformed_output="$(docker run --rm -e MONGODB_URI='mongodb://sensitive-user:sensitive-password@' \
    "$image" route-status 2>&1)"; then
    echo "Malformed MongoDB URI unexpectedly succeeded." >&2
    exit 1
fi
if grep -Fq 'sensitive-password' <<<"$malformed_output"; then
    echo "Operator error output disclosed the MongoDB URI credential." >&2
    exit 1
fi

collections_before="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"

route_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" route-status)"
operations_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" operations-status)"
inspection="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles --mount type=bind,src="$users_dir",dst=/circles/users,readonly "$image" inspect --users-dir /circles/users)"
recovery_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" recovery-activation-status)"

python3 - "$route_status" "$operations_status" "$inspection" "$recovery_status" <<'PY'
import json, sys
route, operations, inspection, recovery = map(json.loads, sys.argv[1:])
assert route["mode"] == "legacy" and route["deploymentId"] is None and route["updatedBy"] == "safe-default"
assert operations["routing"]["mode"] == "legacy"
assert operations["pendingRegistrations"] == 0
assert operations["reconciliationRequired"] == 0
assert operations["activeProvisioningLocks"] == 0
assert operations["activeFinalizationLocks"] == 0
assert inspection == {"count": 0, "results": []}
assert recovery == {
    "pendingRegistrations": 0,
    "recoverablePendingRegistrations": 0,
    "unsafePendingRegistrations": 0,
}
PY

collections_after="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
[[ "$collections_before" == "$collections_after" ]] || {
    echo "Read-only operator execution changed MongoDB collections." >&2
    exit 1
}

docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
const now = new Date();
db.pendingRegistrationProvisioningLocks.insertOne({ _id: "stale-lock", expiresAt: new Date(now.getTime() - 60000) });
db.pendingRegistrationFinalizationLocks.insertOne({ _id: "active-lock", expiresAt: new Date(now.getTime() + 60000) });
' >/dev/null
lock_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" operations-status)"
python3 - "$lock_status" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
assert status["activeProvisioningLocks"] == 0
assert status["activeFinalizationLocks"] == 1
PY
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.pendingRegistrationProvisioningLocks.deleteOne({ _id: "stale-lock" });
db.pendingRegistrationFinalizationLocks.deleteOne({ _id: "active-lock" });
' >/dev/null

docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
const now = new Date();
db.pendingRegistrations.insertMany([
  {
    name: "Recoverable", email: "recoverable@example.invalid", normalizedEmail: "recoverable@example.invalid",
    requestedHandle: "recoverable", status: "email_verified", verifiedAt: new Date(now - 3600000),
    verifiedContinuationExpiresAt: new Date(now - 60000), expiresAt: new Date(now.getTime() + 3600000),
    reservedDid: null, reconciliationRequiredAt: null, accountId: null, accountDid: null, provisionedAt: null,
    provisioningClaimHash: null
  },
  {
    name: "Unsafe", email: "unsafe@example.invalid", normalizedEmail: "unsafe@example.invalid",
    requestedHandle: "unsafe", status: "provisioning", verifiedAt: new Date(now - 3600000),
    verifiedContinuationExpiresAt: new Date(now - 60000), expiresAt: new Date(now.getTime() + 3600000),
    reservedDid: null, reconciliationRequiredAt: null, accountId: null, accountDid: null, provisionedAt: null,
    provisioningClaimHash: null
  }
]);
' >/dev/null
recovery_fixture_before="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'EJSON.stringify(db.pendingRegistrations.find().sort({_id:1}).toArray())')"
recovery_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" recovery-activation-status)"
email_only_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" operations-status)"
python3 - "$recovery_status" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
assert status == {
    "pendingRegistrations": 2,
    "recoverablePendingRegistrations": 1,
    "unsafePendingRegistrations": 1,
}
PY
printf '%s\n' "$email_only_status" | python3 "$repo_dir/scripts/validate-production-onboarding-activation.py" operations-idle >/dev/null
recovery_fixture_after="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'EJSON.stringify(db.pendingRegistrations.find().sort({_id:1}).toArray())')"
[[ "$recovery_fixture_before" == "$recovery_fixture_after" ]] || {
    echo "Recovery activation inspection modified pending registrations." >&2
    exit 1
}
# Exercise stdin-only authentication and compare-and-set behavior against only
# this disposable database. The raw synthetic token never appears in Docker
# environment or command metadata.
operator_token="disposable-registration-operator-token-$suffix"
operator_hash="$(printf '%s' "$operator_token" | sha256sum | awk '{print $1}')"

collections_before_prepare="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
if printf '%s\n' "wrong-$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES; then
    echo "Wrong operator token unexpectedly authorized index preparation." >&2
    exit 1
fi
collections_after_failed_prepare="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
[[ "$collections_before_prepare" == "$collections_after_failed_prepare" ]] || {
    echo "Failed index-preparation authentication changed MongoDB collections." >&2
    exit 1
}

docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.circles.insertMany([
  { name: "Duplicate 1", metadata: { pendingRegistrationId: "duplicate-correlation" } },
  { name: "Duplicate 2", metadata: { pendingRegistrationId: "duplicate-correlation" } }
]);
' >/dev/null
if printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES; then
    echo "Duplicate account correlations unexpectedly allowed index preparation." >&2
    exit 1
fi
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
if (db.circles.countDocuments({ "metadata.pendingRegistrationId": "duplicate-correlation" }) !== 2) quit(1);
db.circles.deleteMany({ "metadata.pendingRegistrationId": "duplicate-correlation" });
' >/dev/null

for _ in 1 2; do
    printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
        -e MONGODB_URI=mongodb://"$mongo":27017/circles \
        -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
        "$image" prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES >/dev/null
done
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
const pending = db.pendingRegistrations.getIndexes().map((entry) => entry.name);
const reservations = db.pendingRegistrationDidReservations.getIndexes().map((entry) => entry.name);
const provisioning = db.pendingRegistrationProvisioningLocks.getIndexes().map((entry) => entry.name);
const finalization = db.pendingRegistrationFinalizationLocks.getIndexes().map((entry) => entry.name);
const accounts = db.circles.getIndexes().map((entry) => entry.name);
if (!pending.includes("normalizedEmail_1") || !pending.includes("requestedHandle_1")) quit(1);
if (!reservations.includes("did_1")) quit(1);
if (!provisioning.includes("expiresAt_1") || !finalization.includes("expiresAt_1")) quit(1);
if (!accounts.some((name) => name.includes("metadata.pendingRegistrationId"))) quit(1);
' >/dev/null

collections_before_failed_auth="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
if printf '%s\n' "wrong-$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected legacy --to paused --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE; then
    echo "Wrong operator token unexpectedly authorized a route change." >&2
    exit 1
fi

collections_after_failed_auth="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
[[ "$collections_before_failed_auth" == "$collections_after_failed_auth" ]] || {
    echo "Failed authentication initialized routing state." >&2
    exit 1
}

printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected legacy --to paused --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE >/dev/null

if printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected legacy --to paused --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE; then
    echo "Stale compare-and-set transition unexpectedly succeeded." >&2
    exit 1
fi

if printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_DEPLOYMENT_ID=release-123 \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected paused --to pending --deployment-id release-999 \
    --actor image-test --confirm SET_REGISTRATION_ROUTE; then
    echo "Pending transition unexpectedly succeeded with a deployment mismatch." >&2
    exit 1
fi

printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_DEPLOYMENT_ID=release-123 \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected paused --to pending --deployment-id release-123 \
    --actor image-test --confirm SET_REGISTRATION_ROUTE >/dev/null

printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected pending --to paused --deployment-id none \
    --actor image-test --confirm SET_REGISTRATION_ROUTE >/dev/null

printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected paused --to legacy --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE >/dev/null

docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.pendingRegistrations.insertOne({
  name: "Reserved", email: "reserved@example.invalid", normalizedEmail: "reserved@example.invalid",
  requestedHandle: "reserved", status: "provisioning_claimed",
  reservedDid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  expiresAt: new Date(Date.now() + 3600000)
});
' >/dev/null
before_preservation_count="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'db.pendingRegistrations.countDocuments()')"
printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" prepare-indexes --confirm PREPARE_PENDING_REGISTRATION_INDEXES >/dev/null
after_preservation_count="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'db.pendingRegistrations.countDocuments()')"
reservation_count="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'db.pendingRegistrationDidReservations.countDocuments()')"
[[ "$before_preservation_count" == "$after_preservation_count" && "$reservation_count" == "1" ]] || {
    echo "Index preparation did not preserve pending records or DID reservations." >&2
    exit 1
}

echo "packaged registration operator image build, read-only execution, authentication, CAS, and index-preparation tests passed"
