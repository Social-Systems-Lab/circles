# Architecture Overview

This document gives a current high-level view of Kamooni's application architecture.

## Overview

Kamooni is a community platform built as a modern web application with supporting services for data, storage, messaging, notifications, and search.

The current core stack includes:

* Next.js
* TypeScript
* MongoDB
* MinIO
* Qdrant
* Docker / Docker Compose
* nginx in production

## Main application layer

The main Kamooni application is built with Next.js and TypeScript.

This is the primary web app used by members, admins, and developers.

At a high level, it is responsible for:

* pages and routing
* authentication flows
* profile and circle views
* feeds, tasks, events, and messaging UI
* settings and admin flows
* API routes and server actions

## Database layer

MongoDB is the main application datastore.

It stores most of the platform's primary data, including items such as:

* users and circles
* posts and discussions
* tasks and events
* chat conversations and messages
* notifications and related state
* onboarding and profile metadata

## Chat and messaging

Kamooni's current main chat and direct messaging system is Mongo-native.

That means current DM and conversation flows do not depend on Matrix.

Older references to Matrix in legacy documents should be treated as historical unless a document explicitly says a legacy subsystem still depends on it.

At a high level, the chat system includes concepts such as:

* conversations
* messages
* read states
* message permissions
* announcement-style conversations

## Notifications

Kamooni uses an in-app notification system backed by MongoDB.

At a high level, the notification layer includes:

* general activity notifications
* unread message indicators
* routing users from notifications to the correct app surface
* per-user or per-context notification preferences where supported

## Object storage and media

Kamooni uses MinIO for object and media storage.

This is important for uploaded images and other stored assets.

Correct media handling depends on more than one layer working together:

* MinIO storage
* application-side URL generation
* public base URL configuration
* proxy or nginx routing in production

Because of this, storage and public URL mismatches can cause broken media links or upload issues.

## Search and semantic features

Kamooni uses Qdrant for vector or semantic search features where enabled.

Some discovery or search flows may also rely on direct MongoDB queries depending on the feature and current implementation stage.

## Production shape

A typical production deployment is composed of:

* nginx in front
* the main app container
* MongoDB
* MinIO
* Qdrant

This is usually managed through Docker and Docker Compose.

## Local development shape

Local development generally mirrors the same core services at a smaller scale:

* Next.js app running locally
* MongoDB
* MinIO
* Qdrant
* Docker Compose for supporting services

## Practical architecture notes

A few points are especially important for developers:

* chat is Mongo-native, not Matrix-based for current development
* uploaded assets depend on correct storage and public URL configuration
* version verification is available through `/api/version`
* deployment and infrastructure details may evolve, but the app architecture should stay understandable at the service level

## Legacy note

Some older docs may still refer to Matrix-era architecture or older setup assumptions.

Those references should not be used for new local setup or current feature work unless they are explicitly marked as still relevant.

## Status of this document

This file is intended to provide a clear current snapshot rather than an exhaustive technical specification. It should be updated as the architecture evolves.
