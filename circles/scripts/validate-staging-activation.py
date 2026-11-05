#!/usr/bin/env python3
"""Validate the explicitly selected onboarding activation configuration."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HMAC = re.compile(r"[0-9a-fA-F]{64}")
DEPLOYMENT_ID = re.compile(r"staging-onboarding-[A-Za-z0-9][A-Za-z0-9._-]{7,111}")
PLACEHOLDER = re.compile(r"(?:GENERATE|CHANGE|PLACEHOLDER|REPLACE|EXAMPLE|TODO|YYYY|APP_SHA|SEQUENCE)", re.I)


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def validate_values(values: dict[str, str]) -> list[str]:
    errors: list[str] = []
    if set(values) != {"PENDING_REGISTRATION_TOKEN_HMAC_KEY", "REGISTRATION_DEPLOYMENT_ID"}:
        errors.append("activation file must contain exactly the HMAC key and deployment ID")
    secret = values.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY", "")
    deployment_id = values.get("REGISTRATION_DEPLOYMENT_ID", "")
    if not HMAC.fullmatch(secret) or PLACEHOLDER.search(secret):
        errors.append("pending-registration HMAC key must be a non-placeholder 64-character hexadecimal value")
    if secret and any(secret == secret[:size] * (64 // size) for size in range(1, 17) if 64 % size == 0):
        errors.append("pending-registration HMAC key must not be a repeated low-entropy pattern")
    if not DEPLOYMENT_ID.fullmatch(deployment_id) or PLACEHOLDER.search(deployment_id):
        errors.append("registration deployment ID has an invalid or placeholder staging format")
    return errors


def validate_compose(config: dict) -> list[str]:
    errors: list[str] = []
    services = config.get("services", {})
    if set(services) != {"circles", "db", "minio", "mailpit", "mailpit_ui_proxy", "nginx"}:
        errors.append("activation overlay changes the default staging service set")
        return errors
    env = services.get("circles", {}).get("environment", {})
    values = {
        "PENDING_REGISTRATION_TOKEN_HMAC_KEY": str(env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY", "")),
        "REGISTRATION_DEPLOYMENT_ID": str(env.get("REGISTRATION_DEPLOYMENT_ID", "")),
    }
    errors.extend(validate_values(values))
    for key in ("PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"):
        if str(env.get(key, "")).lower() != "true":
            errors.append(f"{key} must be exactly true in activation mode")
    if env.get("CIRCLES_URL") != "https://staging.kamooni.org":
        errors.append("activation origin is not staging.kamooni.org")
    if env.get("EMAIL_TRANSPORT") != "mailpit" or env.get("MAILPIT_SMTP_HOST") != "mailpit" or str(env.get("MAILPIT_SMTP_PORT")) != "1025":
        errors.append("activation email transport is not internal Mailpit")
    if str(env.get("POSTMARK_API_TOKEN", "")) or str(env.get("POSTMARK_SENDER_EMAIL", "")):
        errors.append("activation enables external Postmark delivery")
    if str(env.get("PAYMENTS_ENABLED", "")).lower() != "false" or str(env.get("VDB_ENABLED", "")).lower() != "false":
        errors.append("activation enables a production-only integration")
    return errors


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in {"env-file", "compose-json"}:
        raise SystemExit(f"usage: {sys.argv[0]} env-file|compose-json PATH")
    try:
        if sys.argv[1] == "env-file":
            errors = validate_values(parse_env(Path(sys.argv[2])))
        else:
            errors = validate_compose(json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        errors = [str(error)]
    if errors:
        for error in errors:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Staging onboarding activation validation passed.")


if __name__ == "__main__":
    main()
