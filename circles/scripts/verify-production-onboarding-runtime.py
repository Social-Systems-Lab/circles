#!/usr/bin/env python3
"""Validate live production onboarding container inspection without printing secrets."""

from __future__ import annotations

import ipaddress
import json
import re
import sys

CONTAINER_NETWORK = "circles_webnet"
CONTAINER_PRIVATE_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)


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
    elif env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY"):
        errors.append("default production application retains the pending-registration HMAC key")

    expected = {
        "CIRCLES_URL": "https://kamooni.org",
        "EMAIL_TRANSPORT": "postmark",
    }
    for key, value in expected.items():
        if env.get(key) != value:
            errors.append(f"running {key} violates production policy")
    for key in ("ALTCHA_HMAC_KEY", "POSTMARK_API_TOKEN", "POSTMARK_SENDER_EMAIL"):
        if not env.get(key):
            errors.append(f"running {key} is missing")
    if container.get("State", {}).get("Running") is not True:
        errors.append("application container is not running")
    if set(container.get("NetworkSettings", {}).get("Networks", {})) != {CONTAINER_NETWORK}:
        errors.append("application has unexpected live network attachments")
    return errors


def read_single_container() -> dict:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        raise SystemExit("Error: invalid Docker inspection JSON")
    if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict):
        raise SystemExit("Error: expected exactly one application container")
    return data[0]


def application_container_ipv4(container: dict) -> str:
    if container.get("State", {}).get("Running") is not True:
        raise SystemExit("Error: application container is not running")
    networks = container.get("NetworkSettings", {}).get("Networks", {})
    if not isinstance(networks, dict) or set(networks) != {CONTAINER_NETWORK}:
        raise SystemExit("Error: application has unexpected live network attachments")
    address = networks.get(CONTAINER_NETWORK, {}).get("IPAddress", "")
    try:
        parsed = ipaddress.IPv4Address(address)
    except ipaddress.AddressValueError:
        raise SystemExit("Error: application container IPv4 address is missing or invalid")
    if not any(parsed in network for network in CONTAINER_PRIVATE_NETWORKS):
        raise SystemExit("Error: application container IPv4 address is not a private container address")
    return str(parsed)


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "endpoint":
        print(application_container_ipv4(read_single_container()))
        return
    if len(sys.argv) != 3 or sys.argv[1] not in {"default", "activation"}:
        raise SystemExit(f"usage: {sys.argv[0]} endpoint | default|activation DEPLOYMENT_ID_OR_NONE")
    errors = validate_application(read_single_container(), sys.argv[1], sys.argv[2])
    if errors:
        for error in errors:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Running production onboarding configuration verified.")


if __name__ == "__main__":
    main()
