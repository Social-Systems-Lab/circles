#!/usr/bin/env python3
"""Validate live production onboarding container inspection without printing secrets."""

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
    if set(container.get("NetworkSettings", {}).get("Networks", {})) != {"circles_webnet"}:
        errors.append("application has unexpected live network attachments")
    return errors


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in {"default", "activation"}:
        raise SystemExit(f"usage: {sys.argv[0]} default|activation DEPLOYMENT_ID_OR_NONE")
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        raise SystemExit("Error: invalid Docker inspection JSON")
    if not isinstance(data, list) or len(data) != 1:
        errors = ["expected exactly one application container"]
    else:
        errors = validate_application(data[0], sys.argv[1], sys.argv[2])
    if errors:
        for error in errors:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Running production onboarding configuration verified.")


if __name__ == "__main__":
    main()
