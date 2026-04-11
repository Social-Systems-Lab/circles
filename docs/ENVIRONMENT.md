# Environment Variables

This document explains the main environment variables used by Kamooni.

## Overview

Kamooni uses environment variables for:

* public app URLs
* authentication and session security
* MongoDB connection
* MinIO object storage
* Qdrant search and vector features
* email and external integrations
* build and version metadata

Do not commit real secrets to the repository.

## Important note

Some variable names may differ slightly between local and production environments. When in doubt, check the current `.env` files used by the project maintainers.

## Core app variables

### `CIRCLES_URL`

The public base URL of the app.

This is important because some generated links and uploaded asset paths depend on it.

Example local value:

```env
CIRCLES_URL=http://localhost:3000
```

### `NEXT_PUBLIC_APP_URL`

Public app URL exposed to the frontend where needed.

Example local value:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Authentication variables

### `NEXTAUTH_URL`

Base URL used for authentication callbacks.

Example local value:

```env
NEXTAUTH_URL=http://localhost:3000
```

### `NEXTAUTH_SECRET`

Secret used for authentication and session signing.

This must be kept private.

## Database variables

### `MONGODB_URI`

MongoDB connection string used by the app.

Example local value:

```env
MONGODB_URI=mongodb://localhost:27017/circles
```

## Object storage variables

### `MINIO_*`

Kamooni uses MinIO for object and media storage.

The exact variables may include items such as:

* endpoint or host
* port
* access key
* secret key
* bucket name
* SSL setting

Document the exact variable names currently in use once they are confirmed from the active environment template.

## Search and vector variables

### `QDRANT_*`

Kamooni uses Qdrant for vector or semantic search features where enabled.

The exact variables may include:

* Qdrant host
* Qdrant port
* API key if used
* collection settings in feature-specific contexts

Document the exact variable names currently in use once they are confirmed from the active environment template.

## Email and external integrations

Kamooni may also use environment variables for email delivery and other external services.

Examples may include:

* mail provider API keys
* sender addresses
* webhook secrets
* optional third-party service credentials

These should never be committed to git.

## Build and release metadata

Kamooni exposes version information through `/api/version`.

Production builds may include values such as:

* git SHA
* build time
* app version file values

These are useful for deployment verification.

## Local vs production

Typical differences:

* local uses localhost-based URLs
* production uses the live domain
* local secrets may differ from production secrets
* local services may run on Docker service names or localhost ports
* production may use reverse proxy routing and container networking

## Secret handling

Rules to follow:

* never commit real secrets
* keep `.env` files out of version control unless they are sanitized examples
* rotate infrastructure secrets when needed
* avoid rotating app continuity secrets during a server migration unless necessary

## Suggested future improvement

Create a sanitized `.env.example` file that includes:

* all required variable names
* safe placeholder values
* short comments for each variable

That will make onboarding much easier for new developers.

## Status of this document

This file is a practical replacement for older setup notes and should be updated as the live environment model becomes more standardized.
