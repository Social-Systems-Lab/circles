# Circles / Kamooni – Production Playbook

This playbook consolidates operational knowledge for running Circles / Kamooni in production. It is intended for maintainers and contributors working with the live Docker Compose stack.

## 1. Production Architecture Overview

- Docker Compose–based deployment
- Core services: circles (Next.js), nginx (reverse proxy), MinIO (object storage), MongoDB, Postgres, Synapse (Matrix), Watchtower (auto-updates)
- HTTPS termination and routing handled by nginx
- Object storage handled by MinIO, accessed via nginx proxy

## 2. Storage & Image Handling

Images and uploaded assets are stored in MinIO and served via nginx under `/storage/*`.

nginx configuration:

```nginx
location /storage/ {
    proxy_pass http://minio:9000/circles/;
}

