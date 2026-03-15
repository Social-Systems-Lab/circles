# Circles / Kamooni — AI Developer Context

This document provides **mandatory context and rules** for AI agents (Codex, ChatGPT, or other automated developers) working on this repository.

It ensures safe interaction with the production codebase and prevents accidental architectural damage.

All AI agents must read this file before performing any modifications.

---------------------------------------------------------------------

# Repository Overview

Main repository location:

~/circles/circles

Production server:

Circles-Genesis2

Production path:

/root/circles/circles

Deployment command:

deploykamooni

Production verification endpoint:

/api/version

Example:

curl -sS https://kamooni.org/api/version

---------------------------------------------------------------------

# Core System Architecture

The platform currently runs a **Mongo-native architecture**.

Main components:

Browser
↓
NGINX (TLS + reverse proxy)
↓
Next.js Application Server
↓
MongoDB (primary data store)

Supporting services:

MinIO — object storage  
Qdrant — vector search  
Synapse/Postgres — legacy dependency being removed

Architecture documentation:

ARCHITECTURE_MONGO_NATIVE_v*.md

---------------------------------------------------------------------

# Mongo Chat System

The chat system is **Mongo-native**.

Matrix has been removed.

Primary collections:

chatConversations  
chatMessageDocs  
chatRoomMembers

Key files:

src/lib/data/mongo-chat.ts  
src/components/modules/chat/mongo-actions.ts  
src/components/modules/chat/chat-room.tsx  

System messages are implemented using:

announcement conversations  
repliesDisabled flag  
system metadata  

---------------------------------------------------------------------

# Mongo Chat Schema Guardrails

AI agents **must not change the Mongo chat schema** unless explicitly instructed.

The following fields are considered **stable contract fields**:

ChatConversation
_id
type
participants
circleId
handle
name
description
picture
metadata
createdAt
updatedAt

ChatMessageDoc
_id
conversationId
senderDid
body
format
system
createdAt


AI must **not rename, remove, or restructure these fields**.

Breaking these fields can destroy:

DM visibility  
conversation history  
system messages  
group membership resolution  

If a change would modify these fields, the AI must stop and request confirmation.

---------------------------------------------------------------------

# System Messaging Engine

System messages include:

Welcome messages  
Platform broadcasts  
Announcement threads  

Key properties:
conversationType: "announcement"
repliesDisabled: true
senderDid: system:kamooni


System sender identity:

Name: Kamooni  
Handle: kamooni  
DID: system:kamooni  

Avatar is the Kamooni logo.

System messaging files:

src/lib/data/platform-broadcasts.ts  
src/lib/data/system-message-templates.ts  
src/lib/chat/system-messages.ts  

---------------------------------------------------------------------

# AI PATCH SAFETY RULES

AI agents must follow these rules for every modification.

---------------------------------------------------------------------

## Minimal Patch Principle

AI must apply the **smallest possible change** required.

AI must NOT:

- refactor unrelated code
- rename files
- move modules
- reorganize folder structures
- introduce new architecture
- rewrite subsystems

Only modify files required for the specific task.

If a task requires changing **more than 4 files**, the AI must stop and request confirmation.

---------------------------------------------------------------------

## Diff Review Requirement

Before committing changes AI must run:

git diff

The AI must confirm:

- only relevant files changed
- no files were deleted unexpectedly
- no unrelated formatting changes occurred
- no architecture files were modified unintentionally

If unexpected changes appear, the AI must stop and request clarification.

---------------------------------------------------------------------

## Repository Integrity Rules

The following files must **never be deleted or rewritten** unless explicitly instructed:

AI_DEVELOPER_CONTEXT.md  
ARCHITECTURE_MONGO_NATIVE_*.md  
SYSTEM_MESSAGES_ENGINE.md  
DEBUG_PLAYBOOK.md  

These files define system architecture and operational knowledge.

---------------------------------------------------------------------

## Real Repository Requirement

All code changes must end in the **real repository**:

~/circles/circles

AI must not leave changes inside:

.codex/worktrees

Before finishing a task the AI must:

1. confirm files exist in ~/circles/circles
2. run:

git status --short

3. report changed files

---------------------------------------------------------------------

# Build Verification

Before completing a task AI should attempt:

npm run build

Build warnings are acceptable.

Build failures related to the AI's patch must be fixed before reporting completion.

---------------------------------------------------------------------

# Deployment Rules

AI agents **must not deploy to production**.

Deployment is performed manually by the maintainer.

Deployment command:

ssh root@genesis2.socialsystems.io
deploykamooni

After deployment the maintainer verifies:

curl -sS https://kamooni.org/api/version

AI should instead provide:

commit SHA  
changed files  
localhost results  

---------------------------------------------------------------------

# Coding Principles

The platform favors:

small incremental changes  
stable architecture  
clear system boundaries  

AI should always prefer:

minimal diffs  
low-risk patches  
isolated improvements  

Large refactors should be proposed but **never executed automatically**.

---------------------------------------------------------------------

# End of AI Developer Context
