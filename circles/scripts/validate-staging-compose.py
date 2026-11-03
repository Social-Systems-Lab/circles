#!/usr/bin/env python3
"""Fail-closed checks for the fully rendered staging Compose project."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def validate(config: dict, all_config: dict, project: str, nginx: str) -> list[str]:
    errors: list[str] = []
    if config.get("name") != project or all_config.get("name") != project:
        errors.append("Compose project name is not kamooni_staging")

    rendered = json.dumps(all_config, sort_keys=True)
    patterns = {
        "production volume": r"circles_(?:mongo|minio|qdrant|postgres|synapse)(?:[^A-Za-z0-9_]|$)",
        "production certificate": r"/etc/letsencrypt/live/kamooni[.]org(?:/|\\\")",
        "production URL": r"https?://kamooni[.]org(?:[/\\\":]|$)",
        "production alias": r'(?<![A-Za-z0-9.-])(?:www[.])?kamooni[.]org(?:[^A-Za-z0-9.-]|$)',
    }
    for label, pattern in patterns.items():
        if re.search(pattern, rendered):
            errors.append(f"rendered config contains {label}")

    nginx_patterns = {
        "production server_name": r"(?m)^\s*server_name\s+(?:www[.]kamooni[.]org|kamooni[.]org)(?:\s|;)",
        "production URL": r"https?://kamooni[.]org(?:[/\s;]|$)",
        "production certificate": r"/etc/letsencrypt/live/kamooni[.]org(?:/|\s|$)",
        "production volume": r"circles_(?:mongo|minio|qdrant|postgres|synapse)(?:[^A-Za-z0-9_]|$)",
    }
    for label, pattern in nginx_patterns.items():
        if re.search(pattern, nginx):
            errors.append(f"staging NGINX contains {label}")

    default_services = config.get("services", {})
    expected_default = {"circles", "db", "minio", "mailpit", "nginx"}
    if set(default_services) != expected_default:
        errors.append(f"default services are {sorted(default_services)!r}")

    services = all_config.get("services", {})
    expected_all = expected_default | {
        "qdrant",
        "cron",
        "watchtower",
        "minio_loopback",
        "nginx_loopback",
        "postgres",
        "synapse",
    }
    if set(services) != expected_all:
        errors.append(f"all services are {sorted(services)!r}")
    profiles = {
        "qdrant": "vdb",
        "cron": "cron",
        "watchtower": "watchtower",
        "minio_loopback": "loopback",
        "nginx_loopback": "loopback",
        "postgres": "matrix",
        "synapse": "matrix",
    }
    for service, profile in profiles.items():
        if profile not in services.get(service, {}).get("profiles", []):
            errors.append(f"{service} lacks profile {profile}")

    for service, definition in services.items():
        if service not in {"nginx", "mailpit"} and definition.get("ports"):
            errors.append(f"{service} publishes host ports")
    nginx_ports = sorted(
        (int(port["published"]), int(port["target"])) for port in services.get("nginx", {}).get("ports", [])
    )
    if nginx_ports != [(80, 80), (443, 443)]:
        errors.append(f"NGINX ports are {nginx_ports!r}")

    mailpit_ports = services.get("mailpit", {}).get("ports", [])
    try:
        mailpit_ui_ports = [
            (port.get("host_ip"), int(port["published"]), int(port["target"]), port.get("protocol", "tcp"))
            for port in mailpit_ports
        ]
    except (KeyError, TypeError, ValueError):
        mailpit_ui_ports = []
    if mailpit_ui_ports != [("127.0.0.1", 8025, 8025, "tcp")]:
        errors.append(f"Mailpit ports are {mailpit_ui_ports!r}")

    env = default_services.get("circles", {}).get("environment", {})
    for key in ("PAYMENTS_ENABLED", "VDB_ENABLED"):
        if str(env.get(key, "")).lower() != "false":
            errors.append(f"{key} is not forced false")
    if env.get("EMAIL_TRANSPORT") != "mailpit":
        errors.append("staging email transport is not mailpit")
    if env.get("MAILPIT_SMTP_HOST") != "mailpit" or str(env.get("MAILPIT_SMTP_PORT")) != "1025":
        errors.append("staging SMTP destination is not the internal Mailpit service")
    if env.get("CIRCLES_URL") != "https://staging.kamooni.org":
        errors.append("staging URL is not fixed to staging.kamooni.org")
    if str(env.get("POSTMARK_API_TOKEN", "")) or str(env.get("POSTMARK_SENDER_EMAIL", "")):
        errors.append("Postmark credentials are not forced empty")
    build_args = default_services.get("circles", {}).get("build", {}).get("args", {})
    if build_args.get("KAMOONI_DEPLOYMENT_ROLE") != "staging":
        errors.append("circles image is not marked as a staging build")
    if set(default_services.get("circles", {}).get("networks", {})) != {"webnet", "mailpit_internal"}:
        errors.append("circles has unexpected staging network attachments")

    mailpit = services.get("mailpit", {})
    if mailpit.get("image") != "axllent/mailpit:v1.33.0":
        errors.append("Mailpit image is not pinned to the reviewed version")
    mailpit_environment = mailpit.get("environment", {})
    expected_mailpit_environment = {
        "MP_UI_BIND_ADDR": "0.0.0.0:8025",
        "MP_SMTP_BIND_ADDR": "0.0.0.0:1025",
        "MP_ALLOWED_HOSTS": "localhost,127.0.0.1",
        "MP_MAX_MESSAGES": "100",
        "MP_MAX_AGE": "72h",
        "MP_MAX_MESSAGE_SIZE": "2",
        "MP_DISABLE_VERSION_CHECK": "true",
        "MP_SMTP_RELAY_ALL": "false",
        "MP_SMTP_RELAY_MATCHING": "",
        "MP_SMTP_RELAY_CONFIG": "",
        "MP_SMTP_FORWARD_CONFIG": "",
    }
    for key, expected_value in expected_mailpit_environment.items():
        if str(mailpit_environment.get(key, "")) != expected_value:
            errors.append(f"Mailpit {key} is not safely configured")
    if set(mailpit_environment) != set(expected_mailpit_environment):
        errors.append("Mailpit has unexpected environment settings")
    if mailpit.get("command") or mailpit.get("entrypoint"):
        errors.append("Mailpit command or entrypoint overrides are not permitted")
    if mailpit.get("configs") or mailpit.get("secrets"):
        errors.append("Mailpit external configuration and secrets are not permitted")
    if mailpit.get("volumes"):
        errors.append("Mailpit must not have persistent volumes")
    if set(mailpit.get("networks", {})) != {"mailpit_internal"}:
        errors.append("Mailpit is attached to an unexpected network")
    if set(services.get("nginx", {}).get("networks", {})) != {"webnet"}:
        errors.append("NGINX is attached to an unexpected network")
    networks = all_config.get("networks", {})
    expected_networks = {"webnet", "mailpit_internal"}
    if set(networks) != expected_networks:
        errors.append(f"staging networks are {sorted(networks)!r}")
    if networks.get("mailpit_internal", {}).get("internal") is not True:
        errors.append("Mailpit network is not internal")

    forced_empty = (
        "CIRCLES_REGISTRY_URL",
        "OPENAI_API_KEY",
        "MAPBOX_API_KEY",
        "NEXT_PUBLIC_MAPBOX_TOKEN",
        "POSTMARK_API_TOKEN",
        "POSTMARK_SENDER_EMAIL",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_BOT_USERNAME",
        "DONORBOX_EMAIL",
        "DONORBOX_API_USER",
        "DONORBOX_API_KEY",
        "DONORBOX_WEBHOOK_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_MONTHLY",
        "STRIPE_PRICE_YEARLY",
        "STRIPE_PRICE_MONTHLY_1",
        "STRIPE_PRICE_MONTHLY_2",
        "STRIPE_PRICE_MONTHLY_5",
        "STRIPE_PRICE_MONTHLY_10",
        "VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK",
        "KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK",
        "VIBE_ID_CREDENTIAL_ISSUER_DID",
    )
    for key in forced_empty:
        if env.get(key) not in (None, ""):
            errors.append(f"{key} is not forced empty")

    for name, volume in all_config.get("volumes", {}).items():
        if not volume.get("name", "").startswith(project + "_"):
            errors.append(f"volume {name} is outside staging")
        if volume.get("external"):
            errors.append(f"volume {name} is external")
    return errors


def main() -> None:
    if len(sys.argv) != 5:
        print("usage: validate-staging-compose.py DEFAULT_JSON ALL_JSON PROJECT NGINX_CONFIG", file=sys.stderr)
        raise SystemExit(2)
    default_path, all_path, project, nginx_path = sys.argv[1:]
    config = json.loads(Path(default_path).read_text(encoding="utf-8"))
    all_config = json.loads(Path(all_path).read_text(encoding="utf-8"))
    nginx = Path(nginx_path).read_text(encoding="utf-8")
    errors = validate(config, all_config, project, nginx)
    if errors:
        print("Error: unsafe staging Compose configuration:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Staging Compose validation passed.")


if __name__ == "__main__":
    main()
