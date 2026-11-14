#!/usr/bin/env python3
"""Fail-closed validation for production onboarding activation configuration."""

from __future__ import annotations

import json
import hmac
from pathlib import Path
import re
import stat
import sys
from urllib.parse import unquote, urlsplit

HMAC = re.compile(r"[0-9a-fA-F]{64}")
DEPLOYMENT_ID = re.compile(r"production-onboarding-[A-Za-z0-9][A-Za-z0-9._-]{7,111}")
PLACEHOLDER = re.compile(r"(?:GENERATE|CHANGE|PLACEHOLDER|REPLACE|EXAMPLE|TODO|YYYY|APP_SHA|SEQUENCE)", re.I)


def fail(messages: list[str] | str) -> None:
    if isinstance(messages, str):
        messages = [messages]
    for message in messages:
        print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        if key in values:
            raise ValueError(f"{path}:{number}: duplicate key")
        values[key] = value.strip().strip("\"'")
    return values


def validate_activation_values(values: dict[str, str], expected_deployment_id: str | None = None) -> list[str]:
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
        errors.append("registration deployment ID has an invalid or placeholder production format")
    if expected_deployment_id is not None and deployment_id != expected_deployment_id:
        errors.append("activation deployment ID does not match the approved deployment ID")
    return errors


def requires_origin_sync(command: str, expected: str, target: str) -> bool:
    if command in {
        "build-operator",
        "preflight",
        "prepare-indexes",
        "activate-services",
        "postmark-canary",
    }:
        return True
    if command == "route-set":
        return target == "pending" or (expected == "legacy" and target == "paused")
    return False


def validate_secret_file(path: Path, expected_owner: int) -> dict[str, str]:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        fail("activation environment file is missing")
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        fail("activation environment file must be a regular file, not a symlink")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        fail("activation environment file mode must be 600")
    if metadata.st_uid != expected_owner:
        fail("activation environment file owner is not the approved operator account")
    try:
        values = parse_env(path)
    except (OSError, UnicodeError, ValueError) as error:
        fail(str(error))
    errors = validate_activation_values(values)
    if errors:
        fail(errors)
    return values


def validate_secret_separation(
    activation: dict[str, str],
    application: dict[str, str],
    operator_verifier: str,
) -> list[str]:
    errors: list[str] = []
    pending_hmac = activation.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY", "")
    sensitive_keys = (
        "ALTCHA_HMAC_KEY",
        "CIRCLES_JWT_SECRET",
        "CRON_SECRET",
        "PENDING_REGISTRATION_TOKEN_HMAC_KEY",
        "MONGO_ROOT_PASSWORD",
        "MINIO_ROOT_PASSWORD",
        "POSTMARK_API_TOKEN",
        "SYNAPSE_POSTGRES_PASSWORD",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_WEBHOOK_SECRET",
        "DONORBOX_WEBHOOK_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK",
        "KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK",
    )
    for key in sensitive_keys:
        if application.get(key) and application[key] == pending_hmac:
            errors.append(f"pending-registration HMAC key must not reuse {key}")
    try:
        mongodb_password = urlsplit(application.get("MONGODB_URI", "")).password
    except ValueError:
        mongodb_password = None
    if mongodb_password and unquote(mongodb_password) == pending_hmac:
        errors.append("pending-registration HMAC key must not reuse the MONGODB_URI password")
    if operator_verifier and pending_hmac == operator_verifier:
        errors.append("pending-registration HMAC key must not equal the routing operator verifier")
    return errors


def circles_environment(config: dict, label: str) -> dict[str, str]:
    services = config.get("services", {})
    if "mailpit" in services or "mailpit_ui_proxy" in services:
        fail(f"{label} unexpectedly contains staging email capture services")
    circles = services.get("circles")
    if not isinstance(circles, dict):
        fail(f"{label} does not contain a circles service")
    environment = circles.get("environment", {})
    if not isinstance(environment, dict):
        fail(f"{label} circles environment is invalid")
    return {key: str(value) for key, value in environment.items()}


def validate_common_application(env: dict[str, str], config: dict, label: str) -> list[str]:
    errors: list[str] = []
    if env.get("CIRCLES_URL") != "https://kamooni.org":
        errors.append(f"{label} application URL is not https://kamooni.org")
    if env.get("EMAIL_TRANSPORT") != "postmark":
        errors.append(f"{label} application transport is not Postmark")
    if not env.get("POSTMARK_API_TOKEN"):
        errors.append(f"{label} application Postmark token is missing")
    if not env.get("POSTMARK_SENDER_EMAIL"):
        errors.append(f"{label} application Postmark sender is missing")
    if not env.get("ALTCHA_HMAC_KEY"):
        errors.append(f"{label} application ALTCHA HMAC key is missing")
    build_args = config.get("services", {}).get("circles", {}).get("build", {}).get("args", {})
    if str(build_args.get("KAMOONI_DEPLOYMENT_ROLE", "")) != "production":
        errors.append(f"{label} application image role is not production")
    return errors


def validate_default_compose(config: dict) -> list[str]:
    env = circles_environment(config, "default production")
    errors = validate_common_application(env, config, "default production")
    for key in ("PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"):
        if env.get(key, "").lower() != "false":
            errors.append(f"default production {key} is not exactly false")
    if env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY"):
        errors.append("default production must not receive the pending-registration HMAC key")
    return errors


def validate_activation_compose(config: dict, expected_deployment_id: str) -> list[str]:
    env = circles_environment(config, "activation production")
    errors = validate_common_application(env, config, "activation production")
    for key in ("PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"):
        if env.get(key, "").lower() != "true":
            errors.append(f"activation production {key} is not exactly true")
    errors.extend(
        validate_activation_values(
            {
                "PENDING_REGISTRATION_TOKEN_HMAC_KEY": env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY", ""),
                "REGISTRATION_DEPLOYMENT_ID": env.get("REGISTRATION_DEPLOYMENT_ID", ""),
            },
            expected_deployment_id,
        )
    )
    return errors


def validate_ops_compose(config: dict, expected_sha: str) -> list[str]:
    services = config.get("services", {})
    ops = services.get("registration_ops")
    if not isinstance(ops, dict):
        return ["operator Compose does not define registration_ops"]
    errors: list[str] = []
    if ops.get("image") != f"circles-registration-ops:{expected_sha}":
        errors.append("operator image is not pinned to the exact production SHA")
    if ops.get("ports") or ops.get("expose"):
        errors.append("operator service publishes or exposes a network port")
    if ops.get("read_only") is not True:
        errors.append("operator root filesystem is not read-only")
    if ops.get("cap_drop") != ["ALL"]:
        errors.append("operator service does not drop all capabilities")
    if "no-new-privileges:true" not in (ops.get("security_opt") or []):
        errors.append("operator service lacks no-new-privileges")
    if set(ops.get("networks") or {}) != {"webnet"}:
        errors.append("operator service has unexpected network attachments")
    env = ops.get("environment") or {}
    if set(env) != {"CIRCLES_MONGODB_DATABASE", "MONGODB_URI", "REGISTRATION_DEPLOYMENT_ID"}:
        errors.append("operator service receives unexpected environment values")
    if "PENDING_REGISTRATION_TOKEN_HMAC_KEY" in env:
        errors.append("operator service must not receive the pending-registration HMAC key")
    mounts = ops.get("volumes") or []
    safe_mount = any(
        isinstance(mount, dict)
        and mount.get("type") == "volume"
        and mount.get("source") == "circles_users"
        and mount.get("target") == "/circles/users"
        and mount.get("read_only") is True
        for mount in mounts
    )
    if len(mounts) != 1 or not safe_mount:
        errors.append("operator credential mount is not the single read-only users volume")
    return errors


def read_json(path: str) -> dict:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        fail(f"could not read rendered production configuration: {error}")
    if not isinstance(value, dict):
        fail("rendered production configuration must be a JSON object")
    return value


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: validate-production-onboarding-activation.py COMMAND ...")
    command = sys.argv[1]
    if command == "file" and len(sys.argv) == 4:
        validate_secret_file(Path(sys.argv[2]), int(sys.argv[3]))
        print("Production onboarding activation file verified.")
        return
    if command == "token-separation" and len(sys.argv) == 3:
        try:
            activation = parse_env(Path(sys.argv[2]))
        except (OSError, UnicodeError, ValueError) as error:
            fail(str(error))
        errors = validate_activation_values(activation)
        if errors:
            fail(errors)
        supplied = sys.stdin.buffer.read(1025)
        if not supplied or len(supplied) > 1024 or b"\r" in supplied or b"\n" in supplied:
            fail("routing operator token input is invalid")
        expected = activation["PENDING_REGISTRATION_TOKEN_HMAC_KEY"].encode("utf-8")
        if hmac.compare_digest(supplied, expected):
            fail("routing operator token must not equal the pending-registration HMAC key")
        print("Routing operator token is distinct from the activation HMAC key.")
        return
    if command == "origin-eligible" and len(sys.argv) == 7:
        command_name, expected, target, deployed_sha, origin_sha = sys.argv[2:]
        if requires_origin_sync(command_name, expected, target) and deployed_sha != origin_sha:
            fail("this operation requires the production checkout to exactly match origin/main")
        print("Production command origin policy passed.")
        return
    if command == "separation" and len(sys.argv) == 5:
        try:
            activation = parse_env(Path(sys.argv[2]))
        except (OSError, UnicodeError, ValueError) as error:
            fail(str(error))
        activation_errors = validate_activation_values(activation)
        if activation_errors:
            fail(activation_errors)
        try:
            application = parse_env(Path(sys.argv[3]))
        except (OSError, UnicodeError, ValueError) as error:
            fail(str(error))
        errors = validate_secret_separation(activation, application, Path(sys.argv[4]).read_text().strip())
    elif command == "default-compose-json" and len(sys.argv) == 3:
        errors = validate_default_compose(read_json(sys.argv[2]))
    elif command == "activation-compose-json" and len(sys.argv) == 4:
        errors = validate_activation_compose(read_json(sys.argv[2]), sys.argv[3])
    elif command == "ops-compose-json" and len(sys.argv) == 4:
        errors = validate_ops_compose(read_json(sys.argv[2]), sys.argv[3])
    elif command == "route-status" and len(sys.argv) == 3:
        try:
            status = json.load(sys.stdin)
        except json.JSONDecodeError:
            fail("could not parse registration routing status")
        if not isinstance(status, dict):
            fail("registration routing status must be a JSON object")
        expected_mode = sys.argv[2]
        mode_matches = status.get("mode") == expected_mode
        deployment_clean = expected_mode == "pending" or status.get("deploymentId") is None
        errors = (
            []
            if mode_matches and deployment_clean
            else [f"registration routing is not the expected {expected_mode} state"]
        )
    elif command == "operations-zero" and len(sys.argv) == 2:
        try:
            status = json.load(sys.stdin)
        except json.JSONDecodeError:
            fail("could not parse pending-registration operation status")
        if not isinstance(status, dict):
            fail("pending-registration operation status must be a JSON object")
        errors = []
        for key in (
            "pendingRegistrations",
            "reconciliationRequired",
            "activeProvisioningLocks",
            "activeFinalizationLocks",
        ):
            if type(status.get(key)) is not int or status.get(key) != 0:
                errors.append(f"{key} must be zero before initial activation")
    elif command == "operations-idle" and len(sys.argv) == 2:
        try:
            status = json.load(sys.stdin)
        except json.JSONDecodeError:
            fail("could not parse pending-registration operation status")
        if not isinstance(status, dict):
            fail("pending-registration operation status must be a JSON object")
        errors = []
        for key in ("reconciliationRequired", "activeProvisioningLocks", "activeFinalizationLocks"):
            if type(status.get(key)) is not int or status.get(key) != 0:
                errors.append(f"{key} must be zero before deactivation")
    else:
        fail("invalid production onboarding validation command")
    if errors:
        fail(errors)
    print("Production onboarding configuration validation passed.")


if __name__ == "__main__":
    main()
