# Kamooni System Architecture

High-level architecture overview for the Kamooni platform.

---

# 1. Platform Overview

Kamooni is a community collaboration platform designed to help people discover projects, contribute skills, coordinate collective action, and respond to meaningful opportunities to help.

The system combines:

- social networking
- volunteer coordination
- project collaboration
- real-time messaging
- in-app notifications

Core goals:

- enable contribution
- surface opportunities to help
- build trust and reputation
- connect communities globally

---

# 2. Core Technology Stack

Frontend:

Next.js (App Router)

Backend:

Node.js server actions and route handlers

Database:

MongoDB

Storage:

MinIO (S3-compatible object storage)

Vector Search:

Qdrant (used for semantic search and future matching)

Chat:

Mongo-native chat engine

Notifications:

Mongo-backed in-app notification system

Deployment:

Docker containers on Circles-Genesis2

---

# 3. Major System Components

## Identity System

User identities are stored as circles with:

circleType: "user"

This allows users and organizations to share the same core data model.

---

## Circles System

Circles represent:

- individuals
- projects
- communities
- organizations

Each circle can contain:

- offers (skills available)
- needs (skills requested)
- tasks
- events
- posts

---

## Chat System

Chat is implemented as a Mongo-native messaging engine.

Collections:

- chatConversations
- chatMessageDocs
- chatRoomMembers
- chatReadStates

Supported conversation types:

- dm
- group
- announcement

Architecture details:

See:

docs/CHAT_SYSTEM_ARCHITECTURE.md

---

## Notifications System

Kamooni now uses a Mongo-backed in-app notification system.

Current launch behavior:

- **Mail icon** owns unread message activity
  - direct messages
  - group chat unread
  - help/contact thread unread

- **Bell icon** owns non-message activity
  - mentions
  - approvals
  - requests
  - other system notifications

Notification delivery is intentionally conservative.
Kamooni is not designed around attention capture or high-frequency engagement loops.

Current implementation includes:

- Mongo-backed notification persistence
- unread bell count endpoint
- notification list endpoint
- mark-all-read endpoint
- chat-triggered PM notifications routed into the notifications system

Important launch note:

- chat/message mentions remain enabled
- non-chat mentions in posts/comments/discussions are intentionally disabled for launch and should be rebuilt later using the working chat mention path as the reference implementation

---

## System Messaging

Platform messages are delivered through chat.

Examples:

- welcome messages
- platform announcements
- admin broadcasts

System messages reuse the Mongo chat infrastructure rather than a separate transport.

---

## Matching Engine

Matching connects:

- offers (skills people have)
- needs (skills projects request)

Matching is used in:

- circle pages
- explore page
- future task/help system

---

## Task / Help System

Tasks and help requests are a major future engagement path.

These will eventually support:

- skill matching
- contribution history
- reputation tracking
- high-signal notifications when someone is needed

---

# 4. Deployment Architecture

Production environment:

Server: Circles-Genesis2

Core services:

- Next.js app container
- MongoDB
- MinIO
- Qdrant
- cron container

Deployment command:

deploykamooni

Production code path:

/root/circles/circles

Deployment verification:

curl -sS https://kamooni.org/api/version && echo

Rollback point before the notifications polish release:

pre-notifications-polish-20260321-1008

---

# 5. Key Architectural Principles

Kamooni architecture prioritizes:

- simplicity
- transparency
- extensibility
- high-signal communication over notification overload

Important rules:

1. Mongo is the primary data store
2. Chat uses the same DB as the platform
3. Notifications are Mongo-backed
4. Mail and Bell are intentionally separated
5. Conversations normalize before UI use
6. UI must rely on normalized flags
7. System messages reuse chat infrastructure
8. Notifications should bring users back only when something meaningful happened

---

# 6. Current Launch State

Current launch-ready communication model:

- Search is implemented
- Mongo chat is active
- Mail/Bell split is active
- In-app notifications are active
- Chat mentions work
- Non-chat mentions are intentionally disabled for launch

Deferred items:

- notification settings expansion
- web push notifications
- email fallback notifications
- rebuilt non-chat mentions for posts/comments/discussions

---

# 7. Future Architecture Expansion

Upcoming major systems include:

- notification settings MVP
- web push notifications
- task/help notification routing
- contribution history
- reputation signals
- improved semantic search
- rebuilt non-chat mentions outside chat

These systems build on the same core identity and circle model.

---

# 8. Developer Entry Points

Start here when exploring the codebase:

- src/app
- src/components
- src/lib/data
- src/lib/chat

Additional details:

See related architecture docs below.

---

# Related Architecture Documents

For deeper technical details see:

- docs/CHAT_SYSTEM_ARCHITECTURE.md
- docs/chat.md
- docs/CHAT_RUNTIME_NOTE.md
- docs/CHAT_DEBUG_PLAYBOOK.md
