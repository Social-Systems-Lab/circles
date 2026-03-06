# Circles / Kamooni — System Architecture (AI bootstrap)

This file is a **fast orientation map for AI agents and developers**.
It intentionally stays short so tools like Codex or ChatGPT can quickly understand the repository.

---

# Repository Structure

Repo root:

~/circles

Application directory:

/circles

Main application code:

circles/src/

---

# Key Systems

## Chat backend

circles/src/lib/data/mongo-chat.ts

MongoDB collections:

- chatConversations
- chatRoomMembers
- chatMessageDocs
- chatReadStates

---

## Chat UI

circles/src/components/modules/chat/

Main UI components:

- chat-list.tsx
- chat-room.tsx
- create-chat-modal.tsx

---

## Circle creation system

circles/src/components/circle-wizard/

Responsible for:

- creating circles
- onboarding flow
- profile setup

---

## User Toolbox / Clipboard

circles/src/components/layout/user-toolbox.tsx

Purpose:

Personal dashboard aggregating:

- events
- tasks
- goals
- issues

---

# Storage System

Object storage: **MinIO**

Public path:

/storage/*

Reverse proxy:

nginx → MinIO

---

# Image URL Model

Image URLs are written into MongoDB **at upload time**.

Configuration source:

CIRCLES_URL

Example:

https://kamooni.org/storage/<owner-id>/<filename>

If CIRCLES_URL is wrong, broken URLs are permanently written to MongoDB.

---

# Deployment

Production server:

Circles-Genesis2

Production path:

/root/circles/circles

Preferred deployment command:

deploykamooni

Equivalent manual command:

cd /root/circles/circles
./deploy-genesis2.sh main

---

# Deployment Verification

Check deployed version:

curl -sS https://kamooni.org/api/version && echo

The returned gitSha should match the deployed commit.

---

# Purpose of this file

This document helps:

- AI coding agents
- new developers
- debugging sessions

quickly understand the **structure and operational layout** of the Circles/Kamooni system.
