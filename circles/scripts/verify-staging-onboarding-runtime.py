#!/usr/bin/env python3
"""Validate live Docker inspection data without printing sensitive values."""

from __future__ import annotations

import json
import re
import sys


def environment(container: dict) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in container.get("Config", {}).get("Env", []):
        key, separator, value = item.partition("=")
        if separator:
            result[key] = value
    return result


def validate_application(container: dict, mode: str, deployment_id: str) -> list[str]:
    errors: list[str] = []
    env = environment(container)
    expected_flag = "true" if mode == "activation" else "false"
    for key in ("PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"):
        if env.get(key, "").lower() != expected_flag:
            errors.append(f"running {key} is not {expected_flag}")
    if mode == "activation":
        if env.get("REGISTRATION_DEPLOYMENT_ID") != deployment_id:
            errors.append("running registration deployment ID does not match the approved activation ID")
        secret = env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY", "")
        if not re.fullmatch(r"[0-9a-fA-F]{64}", secret):
            errors.append("running pending-registration HMAC key is missing or weak")
    elif env.get("REGISTRATION_DEPLOYMENT_ID") or env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY"):
        errors.append("default running application retains activation credentials")
    expected = {
        "HOSTNAME": "0.0.0.0",
        "CIRCLES_URL": "https://staging.kamooni.org",
        "EMAIL_TRANSPORT": "mailpit",
        "MAILPIT_SMTP_HOST": "mailpit",
        "MAILPIT_SMTP_PORT": "1025",
        "POSTMARK_API_TOKEN": "",
        "POSTMARK_SENDER_EMAIL": "",
        "PAYMENTS_ENABLED": "false",
        "VDB_ENABLED": "false",
    }
    for key, value in expected.items():
        if env.get(key) != value:
            errors.append(f"running {key} violates staging policy")
    if container.get("State", {}).get("Running") is not True:
        errors.append("application container is not running")
    networks = set(container.get("NetworkSettings", {}).get("Networks", {}))
    if networks != {"kamooni_staging_webnet", "kamooni_staging_mailpit_internal"}:
        errors.append("application has unexpected live network attachments")
    bindings = container.get("HostConfig", {}).get("PortBindings") or {}
    if any(value for value in bindings.values()):
        errors.append("application publishes a host port")
    return errors


def validate_mailpit(containers: list[dict]) -> list[str]:
    errors: list[str] = []
    by_service = {
        container.get("Config", {}).get("Labels", {}).get("com.docker.compose.service"): container
        for container in containers
    }
    mailpit = by_service.get("mailpit")
    proxy = by_service.get("mailpit_ui_proxy")
    if not mailpit or not proxy:
        return ["running Mailpit or its UI proxy is missing"]
    if mailpit.get("State", {}).get("Running") is not True:
        errors.append("Mailpit is not running")
    if mailpit.get("Config", {}).get("Image") != "axllent/mailpit:v1.33.0":
        errors.append("running Mailpit image is not the reviewed pinned version")
    mailpit_env = environment(mailpit)
    expected_mailpit = {
        "MP_SMTP_BIND_ADDR": "0.0.0.0:1025",
        "MP_UI_BIND_ADDR": "0.0.0.0:8025",
        "MP_SMTP_RELAY_ALL": "false",
        "MP_SMTP_RELAY_MATCHING": "",
        "MP_SMTP_RELAY_CONFIG": "",
        "MP_SMTP_FORWARD_CONFIG": "",
        "MP_ALLOWED_HOSTS": "localhost,127.0.0.1",
        "MP_DISABLE_VERSION_CHECK": "true",
    }
    for key, value in expected_mailpit.items():
        if mailpit_env.get(key) != value:
            errors.append(f"running Mailpit {key} violates isolation policy")
    if set(mailpit.get("NetworkSettings", {}).get("Networks", {})) != {"kamooni_staging_mailpit_internal"}:
        errors.append("Mailpit has unexpected live network attachments")
    if any(value for value in (mailpit.get("HostConfig", {}).get("PortBindings") or {}).values()):
        errors.append("Mailpit publishes a host port")
    if proxy.get("State", {}).get("Running") is not True:
        errors.append("Mailpit UI proxy is not running")
    if proxy.get("Config", {}).get("Image") != "nginx:1.27.4-alpine@sha256:4ff102c5d78d254a6f0da062b3cf39eaf07f01eec0927fd21e219d0af8bc0591":
        errors.append("running Mailpit UI proxy image is not the reviewed pinned version")
    if set(proxy.get("NetworkSettings", {}).get("Networks", {})) != {
        "kamooni_staging_mailpit_internal",
        "kamooni_staging_mailpit_ui_loopback",
    }:
        errors.append("Mailpit UI proxy has unexpected live network attachments")
    proxy_bindings = (proxy.get("HostConfig", {}).get("PortBindings") or {}).get("8025/tcp") or []
    if proxy_bindings != [{"HostIp": "127.0.0.1", "HostPort": "8025"}]:
        errors.append("Mailpit UI proxy is not bound only to loopback port 8025")
    host_config = proxy.get("HostConfig", {})
    if host_config.get("ReadonlyRootfs") is not True:
        errors.append("Mailpit UI proxy root filesystem is not read-only")
    if host_config.get("CapDrop") != ["ALL"]:
        errors.append("Mailpit UI proxy does not drop all capabilities")
    if "no-new-privileges:true" not in (host_config.get("SecurityOpt") or []):
        errors.append("Mailpit UI proxy lacks no-new-privileges")
    proxy_mounts = proxy.get("Mounts") or []
    if (
        len(proxy_mounts) != 1
        or proxy_mounts[0].get("Destination") != "/etc/nginx/nginx.conf"
        or proxy_mounts[0].get("RW") is not False
    ):
        errors.append("Mailpit UI proxy configuration mount is not the reviewed read-only mount")
    return errors


def main() -> None:
    if len(sys.argv) not in {2, 4}:
        raise SystemExit(f"usage: {sys.argv[0]} mailpit | application default|activation DEPLOYMENT_ID_OR_NONE")
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        raise SystemExit("Error: invalid Docker inspection JSON")
    if sys.argv[1] == "mailpit" and len(sys.argv) == 2:
        errors = validate_mailpit(data)
    elif sys.argv[1] == "application" and len(sys.argv) == 4 and sys.argv[2] in {"default", "activation"}:
        if not isinstance(data, list) or len(data) != 1:
            errors = ["expected exactly one application container"]
        else:
            errors = validate_application(data[0], sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("Error: invalid runtime verification mode")
    if errors:
        for error in errors:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Running staging onboarding configuration verified.")


if __name__ == "__main__":
    main()
