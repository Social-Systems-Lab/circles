# DEBUG_PLAYBOOK.md — Kamooni / Circles Operational Debug Guide

This playbook contains **copy‑paste diagnostics** for the Kamooni / Circles production system.
Use these commands when debugging production issues.

Production server:
Circles-Genesis2

Production path:
/root/circles/circles

---

# 1 — Check deployed version

Run from anywhere:

curl -sS https://kamooni.org/api/version && echo

Expected:

{"version":"x.x.xx","gitSha":"abcdef","buildTime":"..."}

The gitSha should match the commit deployed.

---

# 2 — Check version inside container

Run on Genesis2:

cd /root/circles/circles
docker compose exec -T circles cat /app/VERSION || docker compose exec -T circles cat /VERSION

---

# 3 — Check container status

cd /root/circles/circles
docker compose ps

Look for:

circles-circles-1
circles-db-1
minio
nginx

All should be "Up".

---

# 4 — Check application logs

cd /root/circles/circles
docker compose logs --tail=100 circles

For continuous logs:

docker compose logs -f circles

---

# 5 — MongoDB inspection

cd /root/circles/circles
docker compose exec -T db mongosh

Then:

use circles

Example checks:

db.chatConversations.find().limit(5)
db.chatMessageDocs.find().limit(5)

---

# 6 — Check chat ordering

Chat ordering depends on:

chatConversations.updatedAt

Example:

db.chatConversations.find().sort({updatedAt:-1}).limit(10)

---

# 7 — Test MinIO storage

Try opening a file directly in the browser:

https://kamooni.org/storage/<owner>/<filename>

If this fails:

• nginx proxy may be broken
• MinIO container may be down

---

# 8 — Check nginx proxy

Run:

curl -I https://kamooni.org/storage/

Expected:

HTTP 200 or 403 (but not connection failure)

---

# 9 — Check Next.js image optimizer

Example:

curl -I "https://kamooni.org/_next/image?url=https://kamooni.org/storage/test.jpg&w=256&q=75"

If this fails:

• nginx config may be wrong
• sharp may be missing

---

# 10 — Verify Sharp installation

Run inside container:

docker compose exec circles node -e "require('sharp'); console.log('SHARP_OK')"

Expected output:

SHARP_OK

---

# 11 — Redeploy application

Preferred command:

deploykamooni

Manual equivalent:

cd /root/circles/circles
./deploy-genesis2.sh main

---

# 12 — Check disk usage

df -h

Docker usage:

docker system df

Cleanup if needed:

docker builder prune -af
docker image prune -af

---

# 13 — Quick triage order

When something breaks:

1. Check version endpoint
2. Check docker containers
3. Check logs
4. Check MongoDB
5. Check storage
6. Redeploy if needed

---

# Purpose

This playbook exists to:

• speed up debugging
• standardize production diagnostics
• reduce guesswork
