#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
dockerfile="$repo_dir/Dockerfile.registration-ops"
script="$repo_dir/scripts/pending-registration-ops.ts"

grep -Fq 'USER node' "$dockerfile"
grep -Fq 'ENTRYPOINT ["bun", "scripts/pending-registration-ops.ts"]' "$dockerfile"
if grep -Eq 'EXPOSE|HEALTHCHECK|CMD' "$dockerfile"; then
    echo "Operator image must not expose or start a network service." >&2
    exit 1
fi
grep -Fq 'const client = new MongoClient(uri)' "$script"
if grep -Fq 'getDb' "$script"; then
    echo "Operator CLI must not import application database initialization with index side effects." >&2
    exit 1
fi
grep -Fq 'operations-status' "$script"
grep -Fq 'Pending routing deployment id does not match REGISTRATION_DEPLOYMENT_ID' "$script"
grep -Fq 'Unsupported routing transition' "$script"

echo "pending registration operator container contract passed"
