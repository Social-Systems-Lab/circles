# Deployment: Build and Restart Reference (Kamooni / Circles)

This document explains how the Kamooni / Circles production stack is built and restarted,
and why some Docker Compose commands do **not** rebuild the application.

> Repo path on droplet: `/root/circles/circles`  
> Stack: Docker Compose on DigitalOcean  
> Key service: `circles` (Next.js app)

---

## 1) Important: `circles` does NOT auto-build in Docker Compose

In the effective Docker Compose configuration, the `circles` service is defined with:

- `image: circles-circles:latest`
- **No `build:` section**

Because of this:

- `docker compose up --build circles`  
- `docker compose build circles`  

👉 **will NOT rebuild the app code**.

They will only recreate a container from an already-built image.

---

## 2) When you MUST manually build the image

You must manually build the image whenever you change:

- UI code (React / Next.js components)
- Server actions
- API routes
- Any application logic under `src/`
- Any file copied into the image by `Dockerfile`

In these cases, Docker Compose alone is insufficient.

---

## 3) Canonical safe build + deploy sequence (production)

Use this exact sequence **after you have finished editing code and exited your editor**.

### Step 1 — Build a fresh image (manual)
Run this on the droplet:

```bash
cd /root/circles/circles && docker build -t circles-circles:latest .
