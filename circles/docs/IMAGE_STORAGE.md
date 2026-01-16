# Image Storage & Thumbnails (Kamooni / Circles)

This document explains how images and thumbnails work in production.

## High-level architecture

- Images are stored in **MinIO** (S3-compatible object storage)
- Public access is via:

  https://<DOMAIN>/storage/<circle-or-user-id>/<filename>

- `nginx` proxies `/storage/*` to the MinIO container
- The frontend uses **Next.js `<Image />`** for rendering

## Upload flow

1. User uploads an image
2. Backend stores the file in MinIO
3. The **absolute URL** is written to MongoDB at upload time

⚠️ **Important:**  
The URL is generated using `CIRCLES_URL`.

If `CIRCLES_URL` is wrong (e.g. `http://127.0.0.1`), broken URLs will be permanently stored in MongoDB.

## Thumbnails & Next.js image optimization

- Next.js image optimization uses **Sharp**
- We use `output: "standalone"` in production
- Because of that:
  - Sharp **must be installed in the runtime image**
  - Native deps (e.g. `libvips`) must be present

This is handled in the `Dockerfile`.

If Sharp is missing:
- `_next/image` still responds
- Thumbnails silently fail or return full-size images

## Known gotchas (read this)

### 1. Never store MongoDB expressions in fields

Do **not** write update expressions like this into documents:

```js
{
  url: { $replaceOne: { ... } }
}


