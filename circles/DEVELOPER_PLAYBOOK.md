# Kamooni Developer Playbook

Operational guide for developers and AI agents working in the Kamooni repository.

This document explains how to safely modify the system.

---

# 1. Development philosophy

Kamooni is built using **incremental, safe modifications**.

Rules:

- Prefer small changes
- Avoid large refactors
- Maintain backward compatibility
- Preserve stable architecture

AI agents should prioritize **stability over cleverness**.

---

# 2. Repository layout

Main application path:

~/circles/circles

Important directories:

src/components
React UI components

src/lib
Core platform logic

src/lib/data
Database access and persistence logic

src/lib/chat
Chat and messaging utilities

docs (if present)
Architecture documentation

---

# 3. Core architecture documents

Developers must read these before modifying core systems.

ARCHITECTURE_MONGO_NATIVE_v13.md
Overall system architecture

CHAT_SYSTEM_ARCHITECTURE.md
Mongo-native chat design

SYSTEM_MESSAGES_ENGINE.md
System messaging architecture

AI_DEVELOPER_CONTEXT.md
AI workflow rules

These documents describe critical invariants.

---

# 4. Git workflow

Use feature branches for all changes.

Example:

git checkout -b feature/my-change

Never develop directly on main.

Typical workflow:

create branch  
make small change  
commit  
push branch  
merge into main

---

# 5. Safe modification rules

Follow these rules when editing code.

Do NOT:

- rename core schema fields
- change Mongo collection structures
- break normalized conversation flags
- remove server-side safety checks

Important invariants:

chatConversations.updatedAt must update on message send.

announcement conversations must never allow replies.

system sender identities must remain stable.

---

# 6. Mongo chat guardrails

Chat behavior depends on several invariants.

DM conversations
Authorized via participants list.

Group conversations
Authorized via membership records.

Announcement conversations
Authorized via participants list, but replies are disabled.

These behaviors must remain consistent.

---

# 7. System messaging rules

System messages include:

welcome messages  
platform broadcasts  
announcement threads

System messages use the chat system and must not bypass it.

Broadcasts should always flow through:

platform-broadcasts.ts

---

# 8. Deployment workflow

Production server:

Circles-Genesis2

Production path:

/root/circles/circles

Deployment command:

deploykamooni

Typical workflow:

1. push changes to GitHub
2. SSH to server
3. run deploykamooni
4. verify version

Example verification:

curl https://kamooni.org/api/version

---

# 9. Version verification

The platform exposes a version endpoint.

Route:

/api/version

This returns:

version  
gitSha  
buildTime

Always verify deployments using this endpoint.

---

# 10. AI development rules

AI-generated code must follow these rules:

- apply smallest possible patch
- avoid unrelated formatting changes
- never remove safety checks
- prefer additive changes

AI agents must report:

changed files  
git status --short output  
commit SHA

---

# 11. Debugging approach

When debugging:

1. confirm reproduction
2. inspect server logs
3. verify Mongo state
4. review normalization logic

Never attempt large rewrites when debugging.

Fix root causes with minimal patches.

---

# 12. Summary

Kamooni development prioritizes:

stability  
small patches  
clear architecture  

Following this playbook ensures the platform remains reliable as it evolves.
