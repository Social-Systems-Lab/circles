#!/usr/bin/env python3
"""Validate the rendered, capture-only rollback configuration for image 0013e90a."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


PINNED_IMAGE = "kamooni-staging-circles:0013e90a"


def validate(config: dict, all_config: dict, nginx: str) -> list[str]:
    errors: list[str] = []
    project = "kamooni_staging"
    if config.get("name") != project or all_config.get("name") != project:
        errors.append("Compose project name is not kamooni_staging")

    default_services = config.get("services", {})
    expected_default = {"circles", "db", "minio", "nginx"}
    if set(default_services) != expected_default:
        errors.append(f"capture rollback services are {sorted(default_services)!r}")
    services = all_config.get("services", {})
    expected_all = expected_default | {
        "qdrant", "cron", "watchtower", "minio_loopback", "nginx_loopback", "postgres", "synapse"
    }
    if set(services) != expected_all:
        errors.append(f"all capture rollback services are {sorted(services)!r}")
    if "mailpit" in services:
        errors.append("capture rollback must not start Mailpit")
    for service, profile in {
        "qdrant": "vdb", "cron": "cron", "watchtower": "watchtower",
        "minio_loopback": "loopback", "nginx_loopback": "loopback",
        "postgres": "matrix", "synapse": "matrix",
    }.items():
        if profile not in services.get(service, {}).get("profiles", []):
            errors.append(f"{service} lacks profile {profile}")

    circles = default_services.get("circles", {})
    if circles.get("image") != PINNED_IMAGE:
        errors.append("capture rollback image tag is not pinned to 0013e90a")
    env = circles.get("environment", {})
    required = {
        "EMAIL_TRANSPORT": "capture",
        "EMAIL_CAPTURE_ENABLED": "true",
        "KAMOONI_DEPLOYMENT_ENV": "staging",
        "CIRCLES_DEV_LOG_PASSWORD_RESET": "false",
        "NODE_ENV": "production",
        "CIRCLES_URL": "https://staging.kamooni.org",
        "NEXT_PUBLIC_APP_URL": "https://staging.kamooni.org",
        "NEXT_PUBLIC_SITE_URL": "https://staging.kamooni.org",
        "PAYMENTS_ENABLED": "false",
        "VDB_ENABLED": "false",
    }
    for key, expected in required.items():
        if str(env.get(key, "")).lower() != expected:
            errors.append(f"{key} is not exactly {expected!r}")
    for key in ("POSTMARK_API_TOKEN", "POSTMARK_SENDER_EMAIL"):
        if env.get(key) != "":
            errors.append(f"{key} is not forced empty")
    for key in (
        "CIRCLES_REGISTRY_URL", "OPENAI_API_KEY", "MAPBOX_API_KEY", "NEXT_PUBLIC_MAPBOX_TOKEN",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "DONORBOX_EMAIL", "DONORBOX_API_USER",
        "DONORBOX_API_KEY", "DONORBOX_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
        "VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK", "KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK",
        "VIBE_ID_CREDENTIAL_ISSUER_DID",
    ):
        if env.get(key) not in (None, ""):
            errors.append(f"{key} is not forced empty")

    mounts = {
        (mount.get("source"), mount.get("target"), mount.get("type"))
        for mount in circles.get("volumes", [])
        if isinstance(mount, dict)
    }
    if mounts != {("circles", "/circles", "volume"), ("circles_users", "/circles/users", "volume")}:
        errors.append(f"capture rollback application mounts are {sorted(mounts)!r}")

    for service, definition in services.items():
        if service != "nginx" and definition.get("ports"):
            errors.append(f"{service} publishes host ports")
    nginx_ports = sorted(
        (int(port["published"]), int(port["target"])) for port in services.get("nginx", {}).get("ports", [])
    )
    if nginx_ports != [(80, 80), (443, 443)]:
        errors.append(f"NGINX ports are {nginx_ports!r}")

    for name, volume in all_config.get("volumes", {}).items():
        if not volume.get("name", "").startswith(project + "_") or volume.get("external"):
            errors.append(f"volume {name} is outside staging")
    rendered = json.dumps(all_config, sort_keys=True)
    for label, pattern in {
        "production URL": r"https?://kamooni[.]org(?:[/\\\":]|$)",
        "production certificate": r"/etc/letsencrypt/live/kamooni[.]org(?:/|\\\")",
        "production volume": r"circles_(?:mongo|minio|qdrant|postgres|synapse)(?:[^A-Za-z0-9_]|$)",
    }.items():
        if re.search(pattern, rendered):
            errors.append(f"rendered capture rollback contains {label}")
    if re.search(r"(?m)^\s*server_name\s+(?:www[.])?kamooni[.]org(?:\s|;)", nginx):
        errors.append("capture rollback NGINX contains production server_name")
    return errors


def main() -> None:
    if len(sys.argv) != 4:
        print("usage: validate-staging-capture-rollback.py DEFAULT_JSON ALL_JSON NGINX_CONFIG", file=sys.stderr)
        raise SystemExit(2)
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    all_config = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    nginx = Path(sys.argv[3]).read_text(encoding="utf-8")
    errors = validate(config, all_config, nginx)
    if errors:
        print("Error: unsafe capture-compatible staging rollback:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Capture-compatible staging rollback validation passed.")


if __name__ == "__main__":
    main()
