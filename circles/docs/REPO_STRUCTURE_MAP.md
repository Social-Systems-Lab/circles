# Kamooni Repository Structure Map

Quick navigation guide for the Kamooni codebase.

---

# Root Structure

Main project root:

circles/

Main directories:

- src/
- docs/
- public/
- scripts/

---

# Application Code

All application code lives inside:

src/

Important subdirectories:

- src/app
- src/components
- src/lib

---

# App Router

src/app

Contains route-level pages.

Examples:

- /circles/[handle]
- /chat
- /admin
- /explore
- /settings

---

# Components

UI components live in:

src/components

Important areas:

- modules/
- layout/
- ui/

Modules include:

- chat
- home
- explore
- admin
- events

---

# Chat System

Chat logic lives in:

- src/lib/data/mongo-chat.ts
- src/components/modules/chat/

Server actions:

- src/components/modules/chat/mongo-actions.ts

Architecture reference:

CHAT_SYSTEM_ARCHITECTURE.md

---

# System Messages

System messaging components:

- src/lib/chat/system-sender.ts
- src/lib/chat/system-message-templates.ts
- src/lib/data/system-message-events.ts

Admin UI:

- src/components/modules/admin/system-messages-tab.tsx

---

# Data Access Layer

Database access helpers:

src/lib/data/

Examples:

- circles.ts
- mongo-chat.ts
- members.ts
- events.ts

---

# Skill System

Skill definitions:

src/lib/data/skills-v2.ts

These power:

- offers
- needs
- matchmaking

---

# Storage System

Uploads are stored in:

MinIO object storage

Proxy routes:

/storage/*

Images are stored as URLs inside Mongo documents.

---

# Deployment

Production server:

Circles-Genesis2

Production code path:

/root/circles/circles

Deploy command:

deploykamooni

---

# Debugging

Troubleshooting reference:

DEBUG_PLAYBOOK.md

---

# Developer Starting Points

For most development tasks start with:

- src/components/modules
- src/lib/data
- src/lib/chat

These contain most of the platform logic.
