#!/usr/bin/env bash
set -euo pipefail
umask 022

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
suffix="$$"
image="kamooni-registration-ops:test-$suffix"
network="kamooni-registration-ops-test-$suffix"
mongo="kamooni-registration-ops-mongo-$suffix"
users_dir="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-registration-ops-users.XXXXXX")"
# GitHub-hosted runners create mktemp directories as UID 1001 mode 700, while
# the operator image runs as node UID 1000. The synthetic volume must be readable.
chmod 755 "$users_dir"
build_context="$(mktemp -d "${TMPDIR:-/tmp}/kamooni-registration-ops-context.XXXXXX")"

cleanup() {
    docker rm -f "$mongo" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    docker image rm "$image" >/dev/null 2>&1 || true
    rm -rf -- "$users_dir" "$build_context"
}
trap cleanup EXIT

cp "$repo_dir/Dockerfile.registration-ops" "$repo_dir/tsconfig.json" "$build_context/"
cp -R "$repo_dir/registration-ops" "$build_context/"
mkdir -p "$build_context/scripts" "$build_context/src/lib/auth"
cp "$repo_dir/scripts/pending-registration-ops.ts" "$build_context/scripts/"
cp "$repo_dir/src/lib/auth/email-normalization.ts" \
    "$repo_dir/src/lib/auth/pending-registration.ts" \
    "$repo_dir/src/lib/auth/pending-registration-monitoring.ts" \
    "$repo_dir/src/lib/auth/pending-registration-reconciliation.ts" \
    "$repo_dir/src/lib/auth/registration-routing.ts" \
    "$build_context/src/lib/auth/"

# Reproduce production checkouts that apply a restrictive umask before Docker COPY.
chmod 600 "$build_context/tsconfig.json" \
    "$build_context/registration-ops/package.json" \
    "$build_context/registration-ops/bun.lock" \
    "$build_context/scripts/pending-registration-ops.ts" \
    "$build_context/src/lib/auth/"*.ts

docker build --file "$build_context/Dockerfile.registration-ops" --tag "$image" "$build_context"
docker run --rm --entrypoint sh "$image" -c '
  [ "$(id -u)" -eq 1000 ] &&
  test -r /app/package.json &&
  test -r /app/bun.lock &&
  test -r /app/tsconfig.json &&
  test -r /app/scripts/pending-registration-ops.ts &&
  test -r /app/src/lib/auth/email-normalization.ts &&
  test -r /app/src/lib/auth/pending-registration.ts &&
  test -r /app/src/lib/auth/pending-registration-monitoring.ts &&
  test -r /app/src/lib/auth/pending-registration-reconciliation.ts &&
  test -r /app/src/lib/auth/registration-routing.ts
' >/dev/null
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
assert operations["pendingStatusMetrics"] == {
    "available": True,
    "counts": {
        "pending_email": 0,
        "email_verified": 0,
        "provisioning": 0,
        "provisioning_claimed": 0,
        "unknown": 0,
    },
    "oldestAgeSeconds": None,
    "oldestStatus": None,
    "oldestAgeSecondsByStatus": {
        "pending_email": None,
        "email_verified": None,
        "provisioning": None,
        "provisioning_claimed": None,
        "unknown": None,
    },
    "oldestUpdatedAgeSeconds": None,
    "oldestUpdatedStatus": None,
    "oldestUpdatedAgeSecondsByStatus": {
        "pending_email": None,
        "email_verified": None,
        "provisioning": None,
        "provisioning_claimed": None,
        "unknown": None,
    },
    "scanLimit": 1000,
    "documentLimit": 5000,
}
assert operations["lockMetrics"]["provisioning"]["ageAvailable"] is False
assert operations["lockMetrics"]["finalization"]["ageAvailable"] is False
assert operations["manualReviewMetrics"]["available"] is False
assert operations["manualReviewMetrics"]["reason"] == "users-directory-not-provided"
assert operations["auditEvents"]["available"] is True
assert operations["auditEvents"]["emailSent"] == {"last15Minutes": 0, "last60Minutes": 0}
assert operations["auditEvents"]["emailFailed"] == {"last15Minutes": 0, "last60Minutes": 0}
assert operations["auditEvents"]["provisioningInterrupted"] == {"last15Minutes": 0, "last60Minutes": 0}
assert operations["auditEvents"]["documentLimit"] == 20000
assert operations["runtime"]["available"] is False
assert operations["runtimeRoutingConsistency"]["status"] == "unavailable"
assert operations["monitoringLimits"] == {
    "pendingStatusRecords": 1000,
    "pendingStatusDocuments": 5000,
    "manualReviewRecords": 100,
    "manualReviewDocuments": 500,
    "identityReservationDocuments": 500,
    "auditDocuments": 20000,
}
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

completed_handle="completed-integrity"
completed_account_id="aaaaaaaaaaaaaaaaaaaaaaaa"
completed_pending_id="bbbbbbbbbbbbbbbbbbbbbbbb"
credential_private_key="$users_dir/synthetic-private-key.pem"
openssl genrsa -out "$credential_private_key" 2048 >/dev/null 2>&1
openssl rsa -in "$credential_private_key" -RSAPublicKey_out -out "$users_dir/public-key.pem" >/dev/null 2>&1
completed_did="$(openssl dgst -sha256 "$users_dir/public-key.pem" | awk '{print $NF}')"
completed_credential_dir="$users_dir/$completed_did"
mkdir "$completed_credential_dir"
chmod 755 "$completed_credential_dir"
cp "$users_dir/public-key.pem" "$completed_credential_dir/publicKey.pem"
completed_public_key_base64="$(base64 <"$completed_credential_dir/publicKey.pem" | tr -d '\n')"
openssl rand 16 >"$completed_credential_dir/salt.bin"
openssl rand 16 >"$completed_credential_dir/iv.bin"
openssl rand 64 >"$completed_credential_dir/privateKey.pem.enc"
chmod 644 "$completed_credential_dir/publicKey.pem"
chmod 600 "$completed_credential_dir/salt.bin" \
    "$completed_credential_dir/iv.bin" \
    "$completed_credential_dir/privateKey.pem.enc"
rm -f "$credential_private_key" "$users_dir/public-key.pem"

docker run --rm --network none --read-only --user 1000:1000 \
    -e COMPLETED_DID="$completed_did" \
    --mount type=bind,src="$users_dir",dst=/circles/users,readonly \
    --entrypoint sh "$image" -c \
    'test -d "/circles/users/$COMPLETED_DID" && test -r "/circles/users/$COMPLETED_DID/publicKey.pem"' \
    >/dev/null || {
    echo "Synthetic credentials are not readable by the operator image runtime user." >&2
    exit 1
}

docker exec -i \
    -e COMPLETED_ACCOUNT_ID="$completed_account_id" \
    -e COMPLETED_PENDING_ID="$completed_pending_id" \
    -e COMPLETED_HANDLE="$completed_handle" \
    -e COMPLETED_DID="$completed_did" \
    -e COMPLETED_PUBLIC_KEY_BASE64="$completed_public_key_base64" \
    "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet \
    --eval 'const publicKey = Buffer.from(process.env.COMPLETED_PUBLIC_KEY_BASE64, "base64").toString("utf8"); db.circles.insertOne({ _id: ObjectId(process.env.COMPLETED_ACCOUNT_ID), circleType: "user", did: process.env.COMPLETED_DID, handle: process.env.COMPLETED_HANDLE, publicKey, metadata: { pendingRegistrationId: process.env.COMPLETED_PENDING_ID, onboardingFlow: "pending-registration-v1", pendingRegistrationFinalizationVersion: 1 } }); db.pendingRegistrations.insertOne({ _id: ObjectId(process.env.COMPLETED_PENDING_ID), requestedHandle: process.env.COMPLETED_HANDLE, status: "provisioned", reservedDid: process.env.COMPLETED_DID, accountId: process.env.COMPLETED_ACCOUNT_ID, accountDid: process.env.COMPLETED_DID, provisionedAt: new Date(), reconciliationRequiredAt: null, provisioningClaimHash: null, provisioningLeaseHash: null, provisioningLeaseExpiresAt: null, expiresAt: new Date(Date.now() + 86400000) }); db.pendingRegistrationDidReservations.insertOne({ _id: process.env.COMPLETED_PENDING_ID, did: process.env.COMPLETED_DID, createdAt: new Date() });' >/dev/null

identity_before="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'EJSON.stringify({ account: db.circles.findOne({ handle: "completed-integrity" }), reservation: db.pendingRegistrationDidReservations.findOne({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb" }) })')"
if invalid_handle_output="$(printf '%s\n' 'Private Handle' | docker run --interactive --rm --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    --mount type=bind,src="$users_dir",dst=/circles/users,readonly \
    "$image" verify-provisioned-account --users-dir /circles/users 2>&1)"; then
    echo "Invalid completed-account handle unexpectedly succeeded." >&2
    exit 1
fi
if grep -Fq 'Private Handle' <<<"$invalid_handle_output"; then
    echo "Completed-account verifier disclosed invalid handle input." >&2
    exit 1
fi
completed_output="$(printf '%s\n' "$completed_handle" | docker run --interactive --rm --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    --mount type=bind,src="$users_dir",dst=/circles/users,readonly \
    "$image" verify-provisioned-account --users-dir /circles/users)"
python3 - "$completed_output" "$completed_handle" "$completed_did" "$completed_account_id" "$completed_pending_id" <<'PY'
import json, sys
result = json.loads(sys.argv[1])
assert result["result"] == "PASS", result
assert result["pendingRecordRetained"] is True, result
assert result["failureCodes"] == [], result
assert all(value is True for key, value in result["checks"].items() if value is not None), result
serialized = sys.argv[1]
for sensitive in sys.argv[2:]:
    assert sensitive not in serialized
assert "/circles/users" not in serialized
PY
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet \
    --eval 'db.pendingRegistrations.deleteOne({ _id: ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb") })' >/dev/null
expired_output="$(printf '%s\n' "$completed_handle" | docker run --interactive --rm --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    --mount type=bind,src="$users_dir",dst=/circles/users,readonly \
    "$image" verify-provisioned-account --users-dir /circles/users)"
python3 - "$expired_output" "$completed_handle" "$completed_did" "$completed_account_id" "$completed_pending_id" <<'PY'
import json, sys
result = json.loads(sys.argv[1])
assert result["result"] == "PASS", result
assert result["pendingRecordRetained"] is False, result
assert result["checks"]["pendingRecordStatusProvisioned"] is None, result
assert result["failureCodes"] == [], result
serialized = sys.argv[1]
for sensitive in sys.argv[2:]:
    assert sensitive not in serialized
PY
identity_after="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'EJSON.stringify({ account: db.circles.findOne({ handle: "completed-integrity" }), reservation: db.pendingRegistrationDidReservations.findOne({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb" }) })')"
python3 - "$identity_before" "$identity_after" <<'PY'
import json, sys
assert json.loads(sys.argv[1]) == json.loads(sys.argv[2])
PY
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.circles.deleteOne({ _id: ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa") });
db.pendingRegistrationDidReservations.deleteOne({ _id: "bbbbbbbbbbbbbbbbbbbbbbbb" });
' >/dev/null
rm -rf -- "$completed_credential_dir"

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
assert status["lockMetrics"]["finalization"]["active"] == 1
assert status["lockMetrics"]["finalization"]["oldestRemainingSeconds"] is not None
assert status["lockMetrics"]["finalization"]["oldestAgeSeconds"] is None
assert status["lockMetrics"]["finalization"]["ageAvailable"] is False
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
    provisioningClaimHash: null, createdAt: new Date(now.getTime() - 45 * 60 * 1000),
    updatedAt: new Date(now.getTime() - 45 * 60 * 1000)
  },
  {
    name: "Unsafe", email: "unsafe@example.invalid", normalizedEmail: "unsafe@example.invalid",
    requestedHandle: "unsafe", status: "provisioning", verifiedAt: new Date(now - 3600000),
    verifiedContinuationExpiresAt: new Date(now - 60000), expiresAt: new Date(now.getTime() + 3600000),
    reservedDid: null, reconciliationRequiredAt: null, accountId: null, accountDid: null, provisionedAt: null,
    provisioningClaimHash: null, createdAt: new Date(now.getTime() - 10 * 60 * 1000),
    updatedAt: new Date(now.getTime() - 10 * 60 * 1000)
  }
]);
db.pendingRegistrationAuditEvents.insertMany([
  { pendingRegistrationId: "audit-sent", eventType: "pending_registration.verification_sent", occurredAt: new Date(now.getTime() - 5 * 60 * 1000), expiresAt: new Date(now.getTime() + 86400000) },
  { pendingRegistrationId: "audit-failed", eventType: "pending_registration.email_delivery_failed", occurredAt: new Date(now.getTime() - 20 * 60 * 1000), expiresAt: new Date(now.getTime() + 86400000) },
  { pendingRegistrationId: "audit-interrupted", eventType: "pending_registration.provisioning_interrupted", occurredAt: new Date(now.getTime() - 40 * 60 * 1000), expiresAt: new Date(now.getTime() + 86400000) }
]);
' >/dev/null
monitoring_runtime='{"available":true,"running":true,"pendingRegistrationEnabled":false,"pendingRegistrationJourneyReady":false,"pendingRegistrationHmacPresent":false,"registrationDeploymentId":null,"altchaConfigured":true,"postmarkConfigured":true,"emailTransport":"postmark"}'
monitoring_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles --mount type=bind,src="$users_dir",dst=/circles/users,readonly "$image" operations-status --users-dir /circles/users --runtime-summary "$monitoring_runtime")"
python3 - "$monitoring_status" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
assert status["pendingStatusMetrics"]["available"] is True
assert status["pendingStatusMetrics"]["counts"]["email_verified"] == 1
assert status["pendingStatusMetrics"]["counts"]["provisioning"] == 1
assert 2690 <= status["pendingStatusMetrics"]["oldestAgeSecondsByStatus"]["email_verified"] <= 2710
assert status["pendingStatusMetrics"]["oldestStatus"] == "email_verified"
assert 2690 <= status["pendingStatusMetrics"]["oldestUpdatedAgeSecondsByStatus"]["email_verified"] <= 2710
assert status["pendingStatusMetrics"]["oldestUpdatedStatus"] == "email_verified"
assert status["manualReviewMetrics"] == {
    "available": True,
    "recordsExamined": 0,
    "byClassification": {},
    "manualReview": 0,
    "transientActiveProvisioning": 0,
    "recoverableFinalize": 0,
    "recordLimit": 100,
    "pendingDocumentLimit": 500,
    "reservationDocumentLimit": 500,
}
assert status["auditEvents"]["emailSent"] == {"last15Minutes": 1, "last60Minutes": 1}
assert status["auditEvents"]["emailFailed"] == {"last15Minutes": 0, "last60Minutes": 1}
assert status["auditEvents"]["provisioningInterrupted"] == {"last15Minutes": 0, "last60Minutes": 1}
assert status["runtimeRoutingConsistency"]["consistent"] is True
assert status["runtimeRoutingConsistency"]["issues"] == []
assert status["watchdogHeartbeat"]["status"] == "not_applicable"
assert status["watchdogHeartbeat"]["reason"] == "routing_legacy"
assert "recoverable@example.invalid" not in sys.argv[1]
assert "unsafe@example.invalid" not in sys.argv[1]
PY
drifted_runtime='{"available":true,"running":true,"pendingRegistrationEnabled":true,"pendingRegistrationJourneyReady":false,"pendingRegistrationHmacPresent":false,"registrationDeploymentId":null,"altchaConfigured":true,"postmarkConfigured":true,"emailTransport":"postmark"}'
drifted_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" operations-status --runtime-summary "$drifted_runtime")"
python3 - "$drifted_status" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
assert status["runtimeRoutingConsistency"]["available"] is True
assert status["runtimeRoutingConsistency"]["consistent"] is False
assert status["runtimeRoutingConsistency"]["status"] == "inconsistent"
assert "legacy_runtime_not_default_off" in status["runtimeRoutingConsistency"]["issues"]
PY
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.pendingRegistrations.insertOne({
  name: "Manual Review", email: "manual-review@example.invalid", normalizedEmail: "manual-review@example.invalid",
  requestedHandle: "manual-review", status: "provisioning_claimed",
  reservedDid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  reconciliationRequiredAt: null, accountId: null, accountDid: null, provisionedAt: null,
  provisioningClaimHash: "synthetic-claim-hash",
  createdAt: new Date(), updatedAt: new Date()
});
' >/dev/null
manual_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles --mount type=bind,src="$users_dir",dst=/circles/users,readonly "$image" operations-status --users-dir /circles/users)"
python3 - "$manual_status" <<'PY'
import json, sys
status = json.loads(sys.argv[1])
assert status["manualReviewMetrics"]["available"] is True
assert status["manualReviewMetrics"]["manualReview"] == 1
assert status["manualReviewMetrics"]["byClassification"] == {"manual_review_missing_credentials": 1}
assert "manual-review@example.invalid" not in sys.argv[1]
assert "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" not in sys.argv[1]
PY
docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval '
db.pendingRegistrations.deleteOne({ normalizedEmail: "manual-review@example.invalid" });
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
