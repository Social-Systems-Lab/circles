#!/usr/bin/env bash
set -euo pipefail

EXPECTED_DIR="/root/circles/circles"
CURRENT_DIR="$(pwd -P)"

if [[ "$CURRENT_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Error: run this script from $EXPECTED_DIR (current: $CURRENT_DIR)" >&2
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

docker compose build circles
docker compose up -d --no-deps --force-recreate circles

VERSION_URL="https://kamooni.org/api/version"
VERSION_OUTPUT=""

for attempt in $(seq 1 20); do
  if VERSION_OUTPUT="$(curl -fsSL "$VERSION_URL" 2>/dev/null)"; then
    echo "Version check (attempt $attempt):"
    echo "$VERSION_OUTPUT"
    exit 0
  fi
  sleep 1
done

echo "Error: version check failed after 20 attempts: $VERSION_URL" >&2
docker compose logs --tail=50 circles || true
exit 1
