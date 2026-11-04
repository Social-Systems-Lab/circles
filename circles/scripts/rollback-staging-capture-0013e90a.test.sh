#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROLLBACK="$SCRIPT_DIR/rollback-staging-capture-0013e90a.sh"

require() { grep -F -- "$1" "$ROLLBACK" >/dev/null || { echo "FAIL: rollback lacks: $1" >&2; exit 1; }; }
require 'PINNED_APP_SHA="0013e90a47ea2933ffcac1578a12d66f0454eed1"'
require 'PINNED_INFRA_SHA="b39e2169537de7e08c41ad0affa00da12a9fd9ca"'
require 'PINNED_IMAGE_ID="sha256:0db0d222aab99763e63e08c2fb1721d25327935c2d238bf8e73a3d18e8f73ec6"'
require 'PINNED_OVERRIDE_BLOB="7ff85560fe75d1321fd920d4a675bae6ed4c953a"'
require 'PINNED_BASE_COMPOSE_BLOB="f8d8f71649f91dc09446a5ed44195af295dbf7b4"'
require 'PINNED_CAPTURE_CONTRACT_BLOB="5521b1b0a05f582a4071b0804a184a7ec2fdfa0d"'
require 'flock -x 9'
require 'validate-staging-capture-rollback.py'
require '--no-build --force-recreate circles'
require '[[ "$(docker inspect --format '\''{{.Image}}'\'' "$container_id")" == "$PINNED_IMAGE_ID" ]]'
require 'database, object storage, and volumes are preserved'

repo_dir="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
[[ "$(git -C "$repo_dir" rev-parse b39e2169537de7e08c41ad0affa00da12a9fd9ca:circles/docker-compose.staging.yml)" == "7ff85560fe75d1321fd920d4a675bae6ed4c953a" ]]
[[ "$(git -C "$repo_dir" rev-parse 0013e90a47ea2933ffcac1578a12d66f0454eed1:circles/docker-compose.yml)" == "f8d8f71649f91dc09446a5ed44195af295dbf7b4" ]]
[[ "$(git -C "$repo_dir" rev-parse 0013e90a47ea2933ffcac1578a12d66f0454eed1:circles/src/lib/email/capture-config.ts)" == "5521b1b0a05f582a4071b0804a184a7ec2fdfa0d" ]]

for forbidden in 'compose build' 'mongosh' 'mongorestore' 'docker volume rm' 'docker compose down' 'docker system prune'; do
    ! grep -F -- "$forbidden" "$ROLLBACK" >/dev/null || { echo "FAIL: rollback contains $forbidden" >&2; exit 1; }
done
echo "Pinned capture rollback script safety checks passed."
