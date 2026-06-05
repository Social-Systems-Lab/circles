# DEBUG PLAYBOOK — Kamooni (Updated)

## Purpose

This playbook provides a fast, repeatable way to debug issues across Kamooni.

Focus:

- production safety
- minimal guesswork
- system-level understanding

---

## Core Debug Philosophy

1. Verify data first
2. Then verify backend
3. Then verify frontend
4. Never assume UI is the source of truth

---

## Standard Debug Flow

### Step 1 — Reproduce

- What exactly is broken?
- On localhost or production?
- Specific user or global?

---

### Step 2 — Check Data (MongoDB)

Always inspect stored data first.

Examples:

- missing fields
- incorrect values
- unexpected structure

If data is wrong → fix data, not UI

---

### Step 3 — Check Server Actions

- correct function used?
- correct filters?
- environment mismatch?

Common issue:

- server action not deployed
- stale client using old action

Fix:

- rebuild
- hard refresh
- log out/in

---

### Step 4 — Check Permissions

Look for:

- missing roles
- permission errors

Logs often show:

"does not have required permission"

---

### Step 5 — Check Environment

Verify:

- NEXT_PUBLIC_* variables
- NODE_ENV
- production vs localhost differences

---

### Step 6 — Check Deployment

On server:

```bash
docker compose build circles
docker compose up -d --no-deps --force-recreate circles
```

---

## MCP / Onboarding Debug (NEW)

### Verify MCP data stored

In Mongo:

- user.donationIntent exists
- amount is number (or undefined)
- no malformed objects

---

### Verify aggregation

Function:

getOnboardingMcpStats()

Check:

- totals make sense
- averages are not NaN
- buckets populated

---

### Verify admin dashboard

- /admin loads MCP stats
- values render correctly
- no currency formatting issues

---

### Common MCP Issues

1. Missing data

Cause:
- onboarding step skipped
- field not saved

Fix:
- verify onboarding action
- check actions.ts

---

2. Invalid values

Cause:
- wrong type stored (string instead of number)

Fix:
- sanitize input
- correct DB entries

---

3. Stats incorrect

Cause:
- aggregation bug

Fix:
- inspect getOnboardingMcpStats()

---

## Chat Debug (Mongo)

Common issues:

- missing conversations
- cannot access room
- messages not sending

Check:

- chatConversations
- chatRoomMembers
- chatMessageDocs

---

## Image Debug (Critical)

Follow this order:

1. Check MongoDB URL
2. Check /storage access
3. Check nginx proxy
4. Check sharp in container

Never start with frontend.

---

## Deployment Safety Rules

- never push broken main
- test on localhost first
- fast-forward merges only
- stop on conflicts

Reference:

Dev → Main checklist

---

## Quick Commands

### Check version

```bash
curl https://kamooni.org/api/version
```

---

### Check Mongo quickly

```bash
docker exec -it circles-db-1 mongosh
```

---

### Verify sharp

```bash
docker exec circles-circles-1 node -e "require('sharp')"
```

---

## TL;DR

- Data first
- Backend second
- UI last

And:

**Measure before you fix.**
