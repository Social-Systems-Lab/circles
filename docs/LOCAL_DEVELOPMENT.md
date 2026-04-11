# Local Development

This guide is for developers setting up Kamooni locally.

## Overview

Kamooni is a Next.js and TypeScript application with supporting services for data, storage, and search.

Local development currently relies on:

* MongoDB
* MinIO
* Qdrant
* Docker / Docker Compose

Kamooni's current main chat and DM system is Mongo-native. Older Matrix references in legacy docs should not be followed for new local setup unless explicitly marked as legacy.

## Prerequisites

Install these first:

* Node.js
* npm
* Git
* Docker
* Docker Compose

## 1. Clone the repository

```bash
git clone https://github.com/Social-Systems-Lab/circles.git
cd circles
```

## 2. Create your environment file

Copy the example environment file if one exists.

```bash
cp .env.example .env.local
```

If no example file exists yet, copy the current project env template or request the latest local setup values from the maintainers.

## 3. Start local services

Start the supporting services with Docker Compose:

```bash
docker compose up -d
```

This should start the local infrastructure used by the app. Depending on the current project configuration, this may include MongoDB, MinIO, and Qdrant.

## 4. Install dependencies

```bash
npm install
```

## 5. Run the app

```bash
npm run dev
```

The app will usually be available at:

```text
http://localhost:3000
```

If port 3000 is already in use, check the terminal output for the actual port.

## Local development notes

A few important points:

* Chat and direct messaging are Mongo-native.
* Matrix is not required for normal local development.
* Media and uploaded assets are handled through MinIO.
* Some features may depend on seeded data, existing accounts, or manually created test content.
* Public URL settings still matter for some generated asset URLs.

## Recommended first checks

Once the app is running, test these first:

1. The homepage loads.
2. Login or signup works.
3. A profile page renders correctly.
4. Chat opens without errors.
5. Existing images load.
6. A new image upload works.
7. `/api/version` responds.

Example:

```bash
curl -s http://localhost:3000/api/version
```

## Stopping local services

To stop the local services:

```bash
docker compose down
```

## Resetting local state

If local data becomes corrupted or stale, you may need to reset containers and volumes.

Use caution, because this removes local data:

```bash
docker compose down -v
```

Then restart the stack:

```bash
docker compose up -d
npm run dev
```

## Troubleshooting

### App does not start

Check:

* Node.js is installed
* dependencies were installed successfully
* Docker services are running
* the required environment variables are present
* the chosen port is not already in use

### Mongo connection issues

Check:

* the Mongo container is running
* the Mongo connection string is correct
* Docker Compose started cleanly

### Image or upload issues

Check:

* MinIO is running
* storage-related environment variables are set
* the public base URL is correct
* any proxy or storage path settings match the local setup

### Search or semantic feature issues

Check:

* Qdrant is running
* host and port settings are correct
* any required collections or initialization steps have been completed

## Status of this document

This file is intended to replace older onboarding material gradually. If another document conflicts with this one on chat or messaging setup, follow this file unless the other document is clearly marked as current.
