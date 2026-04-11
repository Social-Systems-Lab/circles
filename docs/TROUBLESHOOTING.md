# Troubleshooting

This document covers common setup and runtime issues in Kamooni.

## Overview

When debugging Kamooni, start by checking the basics first:

* the app process is running
* Docker services are running
* the environment file is present and correct
* the expected port is available
* the current branch and repo path are correct

## App does not start

Check the following:

* Node.js is installed
* dependencies were installed successfully
* `npm run dev` or the production start command was run from the correct repo path
* the required environment variables are present
* the selected port is not already in use

Useful checks:

```bash
node -v
npm -v
git branch --show-current
git status --short
```

## Docker services are not running

Kamooni depends on supporting services such as MongoDB, MinIO, and Qdrant.

Check whether Docker is running and whether the containers started correctly:

```bash
docker ps
docker compose ps
```

If needed, restart them:

```bash
docker compose up -d
```

## Mongo connection issues

Symptoms may include:

* login failures
* pages not loading correctly
* server errors when reading or writing data

Check:

* the Mongo container is running
* `MONGODB_URI` is correct
* the database host matches the current environment
* the app can reach Mongo from the current network context

Useful checks:

```bash
docker compose ps
grep '^MONGODB_URI=' .env .env.local 2>/dev/null
```

## MinIO or image upload issues

Symptoms may include:

* broken image links
* uploads that appear to succeed but do not render
* missing media in profiles, posts, or circles

Check:

* MinIO is running
* storage-related environment variables are present
* the public base URL is correct
* proxy and storage paths match the current environment
* uploaded asset URLs are being generated from the expected base URL

Useful checks:

```bash
docker compose ps
grep -E '^(CIRCLES_URL|NEXT_PUBLIC_APP_URL|MINIO)' .env .env.local 2>/dev/null
```

## Qdrant or search issues

Symptoms may include:

* semantic search not returning results
* search-related features failing silently
* indexing or discovery features behaving inconsistently

Check:

* Qdrant is running
* host and port settings are correct
* any required collections exist
* the current feature actually uses Qdrant and is not on a Mongo fallback path

Useful checks:

```bash
docker compose ps
grep -E '^(QDRANT)' .env .env.local 2>/dev/null
```

## Auth or session problems

Symptoms may include:

* login loops
* failed callbacks
* users appearing logged out unexpectedly

Check:

* auth URL variables are correct
* auth secrets are present
* cookies from an older local session are interfering
* local and production URLs are not being mixed accidentally

Useful checks:

```bash
grep -E '^(NEXTAUTH_URL|NEXTAUTH_SECRET|CIRCLES_URL|NEXT_PUBLIC_APP_URL)' .env .env.local 2>/dev/null
```

## Chat or DM issues

Kamooni's current main chat system is Mongo-native.

For current development:

* do not follow old Matrix setup steps
* verify the user is authenticated
* verify related Mongo-backed data is being created and read correctly
* check whether the issue is permissions, unread state, or conversation access rather than transport

## Version mismatch after deploy

Symptoms may include:

* production looks unchanged after deploy
* the live server shows the wrong commit
* local and production behavior differ unexpectedly

Check:

* the correct repo path was used
* the server is on `main`
* `git pull --ff-only origin main` succeeded
* the rebuild was actually run
* `/api/version` matches the expected deployment

Useful checks:

```bash
cd /root/circles/circles
git branch --show-current
git rev-parse --short HEAD
curl -s https://kamooni.org/api/version
```

## Problems after infrastructure changes

After a server migration or major environment change, test these first:

* homepage loads
* login works
* existing images load
* new uploads work
* chat works
* notifications work
* `/api/version` is current

This catches the most common break points quickly.

## When in doubt

Use this order:

1. confirm the repo path
2. confirm the branch
3. confirm environment variables
4. confirm Docker services
5. confirm the local or live version endpoint
6. test one feature at a time

## Status of this document

This file is meant to reduce repeated setup and deployment confusion. It should be updated whenever recurring issues appear in development or production.
