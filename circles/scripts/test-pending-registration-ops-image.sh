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

collections_before="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"

route_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" route-status)"
operations_status="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles "$image" operations-status)"
inspection="$(docker run --rm --network "$network" -e MONGODB_URI=mongodb://"$mongo":27017/circles --mount type=bind,src="$users_dir",dst=/circles/users,readonly "$image" inspect --users-dir /circles/users)"

python3 - "$route_status" "$operations_status" "$inspection" <<'PY'
import json, sys
route, operations, inspection = map(json.loads, sys.argv[1:])
assert route["mode"] == "legacy" and route["deploymentId"] is None and route["updatedBy"] == "safe-default"
assert operations["routing"]["mode"] == "legacy"
assert operations["pendingRegistrations"] == 0
assert operations["reconciliationRequired"] == 0
assert operations["activeProvisioningLocks"] == 0
assert operations["activeFinalizationLocks"] == 0
assert inspection == {"count": 0, "results": []}
PY

collections_after="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
[[ "$collections_before" == "$collections_after" ]] || {
    echo "Read-only operator execution changed MongoDB collections." >&2
    exit 1
}

# Exercise stdin-only authentication and compare-and-set behavior against only
# this disposable database. The raw synthetic token never appears in Docker
# environment or command metadata.
operator_token="disposable-registration-operator-token-$suffix"
operator_hash="$(printf '%s' "$operator_token" | sha256sum | awk '{print $1}')"
if printf '%s\n' "wrong-$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected legacy --to paused --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE; then
    echo "Wrong operator token unexpectedly authorized a route change." >&2
    exit 1
fi

collections_after_failed_auth="$(docker exec "$mongo" mongosh mongodb://127.0.0.1:27017/circles --quiet --eval 'JSON.stringify(db.getCollectionNames().sort())')"
[[ "$collections_before" == "$collections_after_failed_auth" ]] || {
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

printf '%s\n' "$operator_token" | docker run --rm --interactive --network "$network" \
    -e MONGODB_URI=mongodb://"$mongo":27017/circles \
    -e REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256="$operator_hash" \
    "$image" route-set --expected paused --to legacy --deployment-id none --actor image-test --confirm SET_REGISTRATION_ROUTE >/dev/null

echo "packaged registration operator image build, read-only execution, authentication, and CAS tests passed"
