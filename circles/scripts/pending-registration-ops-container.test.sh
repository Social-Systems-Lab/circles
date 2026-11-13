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
grep -Fq 'recovery-activation-status' "$script"
grep -Fq 'prepare-indexes' "$script"
grep -Fq 'PREPARE_PENDING_REGISTRATION_INDEXES' "$script"
grep -Fq 'Pending routing deployment id does not match REGISTRATION_DEPLOYMENT_ID' "$script"
grep -Fq 'Unsupported routing transition' "$script"
grep -Fq 'REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256' "$script"
grep -Fq 'fs.readFileSync(0, "utf8")' "$script"
if grep -Fq -- '--operator-token' "$script"; then
    echo "Operator token must never be accepted through argv." >&2
    exit 1
fi
if grep -Fq 'REGISTRATION_ROUTING_OPERATOR_TOKEN;' "$script"; then
    echo "Raw operator token must not be accepted through container environment metadata." >&2
    exit 1
fi

echo "pending registration operator container contract passed"
