#!/usr/bin/env python3
"""Fail-closed validation for Kamooni staging secrets and Mongo routing."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

REQUIRED = (
    "MONGO_ROOT_USERNAME",
    "MONGO_ROOT_PASSWORD",
    "MINIO_ROOT_USERNAME",
    "MINIO_ROOT_PASSWORD",
    "CIRCLES_JWT_SECRET",
    "CRON_SECRET",
    "ALTCHA_HMAC_KEY",
    "TELEGRAM_WEBHOOK_SECRET",
    "MONGODB_URI",
)
SECRET_KEYS = (
    "MONGO_ROOT_PASSWORD",
    "MINIO_ROOT_PASSWORD",
    "CIRCLES_JWT_SECRET",
    "CRON_SECRET",
    "ALTCHA_HMAC_KEY",
    "TELEGRAM_WEBHOOK_SECRET",
)
PLACEHOLDER = re.compile(r"(?:GENERATE_STAGING_ONLY|CHANGE[ _-]?ME|PLACEHOLDER|REPLACE[ _-]?ME|EXAMPLE|TODO)", re.I)
GENERATED_SECRET = re.compile(r"[0-9a-fA-F]{64}")
FORCED_EMPTY = (
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


def fail(messages: list[str]) -> None:
    for message in messages:
        print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            fail([f"{path}:{number}: expected KEY=VALUE"])
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def validate_mongodb_uri(uri: str, username: str, password: str) -> list[str]:
    errors: list[str] = []
    try:
        parsed = urlsplit(uri)
        port = parsed.port
    except ValueError as error:
        return [f"MONGODB_URI is malformed: {error}"]
    if parsed.scheme != "mongodb":
        errors.append("MONGODB_URI scheme must be exactly mongodb")
    if parsed.hostname != "db":
        errors.append("MONGODB_URI host must be exactly db")
    if port != 27017:
        errors.append("MONGODB_URI port must be exactly 27017")
    if parsed.path != "/circles":
        errors.append("MONGODB_URI database must be exactly circles")
    query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=False)
    if set(query) != {"authSource"} or query.get("authSource") != ["admin"]:
        errors.append("MONGODB_URI query must be exactly authSource=admin")
    if parsed.username is None or unquote(parsed.username) != username:
        errors.append("MONGODB_URI username must match MONGO_ROOT_USERNAME")
    if parsed.password is None or unquote(parsed.password) != password:
        errors.append("MONGODB_URI password must match MONGO_ROOT_PASSWORD")
    if parsed.fragment:
        errors.append("MONGODB_URI must not contain a fragment")
    return errors


def validate(values: dict[str, str], *, require_forced_empty: bool = False) -> None:
    errors: list[str] = []
    for key in REQUIRED:
        value = values.get(key, "")
        if not value:
            errors.append(f"{key} must not be blank")
        elif PLACEHOLDER.search(value):
            errors.append(f"{key} contains placeholder text")

    for key in SECRET_KEYS:
        value = values.get(key, "")
        if value and not GENERATED_SECRET.fullmatch(value):
            errors.append(f"{key} must be exactly 64 hexadecimal characters")
        elif value and any(value == value[:size] * (64 // size) for size in range(1, 17) if 64 % size == 0):
            errors.append(f"{key} must not be a repeated low-entropy pattern")

    for key in ("MONGO_ROOT_USERNAME", "MINIO_ROOT_USERNAME"):
        value = values.get(key, "")
        if value and len(value) < 12:
            errors.append(f"{key} must be at least 12 characters")

    seen: dict[str, str] = {}
    for key in SECRET_KEYS:
        value = values.get(key, "")
        if not value:
            continue
        if value in seen:
            errors.append(f"{key} must not reuse {seen[value]}")
        else:
            seen[value] = key

    errors.extend(
        validate_mongodb_uri(
            values.get("MONGODB_URI", ""),
            values.get("MONGO_ROOT_USERNAME", ""),
            values.get("MONGO_ROOT_PASSWORD", ""),
        )
    )
    if require_forced_empty:
        for key in FORCED_EMPTY:
            if values.get(key, ""):
                errors.append(f"{key} must be forced empty")
    if errors:
        fail(errors)


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in {"env-file", "compose-json"}:
        fail([f"usage: {sys.argv[0]} env-file|compose-json PATH"])
    path = Path(sys.argv[2])
    if sys.argv[1] == "env-file":
        values = parse_env(path)
    else:
        config = json.loads(path.read_text(encoding="utf-8"))
        values = config.get("services", {}).get("circles", {}).get("environment", {})
        values = {key: str(value) for key, value in values.items()}
    validate(values, require_forced_empty=sys.argv[1] == "compose-json")
    print("Staging environment validation passed.")


if __name__ == "__main__":
    main()
