#!/usr/bin/env bash
set -euo pipefail

EXPECTED_DIR="/root/circles/circles"
CURRENT_DIR="$(pwd -P)"

if [[ "$CURRENT_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Error: run this script from $EXPECTED_DIR (current: $CURRENT_DIR)" >&2
  exit 1
fi

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "Deploying branch: $BRANCH"
git fetch origin "$BRANCH"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "origin/$BRANCH"
fi

git reset --hard "origin/$BRANCH"

SHA="$(git rev-parse --short HEAD)"
echo "Deploying SHA: $SHA"

docker compose build circles
docker compose up -d --no-deps --force-recreate circles

echo "Version check:"
curl -fsSL https://kamooni.org/api/version
echo
