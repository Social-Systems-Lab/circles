#!/usr/bin/env python3
"""Validate live production onboarding container inspection without printing secrets."""

from __future__ import annotations

import hmac
import ipaddress
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

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


def read_activation_hmac(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        raise SystemExit("Error: approved activation file is unreadable")
    values: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "PENDING_REGISTRATION_TOKEN_HMAC_KEY":
            values.append(value.strip().strip("\"'"))
    if len(values) != 1 or not re.fullmatch(r"[0-9a-fA-F]{64}", values[0]):
        raise SystemExit("Error: approved activation HMAC is missing or invalid")
    return values[0]


def validate_application(
    container: dict,
    mode: str,
    deployment_id: str,
    approved_hmac: str | None = None,
    *,
    running: bool = True,
) -> list[str]:
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
        elif approved_hmac is not None and not hmac.compare_digest(secret, approved_hmac):
            errors.append("running pending-registration HMAC key differs from the approved activation file")
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
    state = container.get("State", {})
    if state.get("Running") is not running or (not running and state.get("Status") != "exited"):
        errors.append("application running state does not match the requested deployment mode")
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


def application_runtime_summary(container: dict) -> dict:
    env = environment(container)
    return {
        "available": True,
        "running": container.get("State", {}).get("Running") is True,
        "pendingRegistrationEnabled": env.get("PENDING_REGISTRATION_ENABLED", "").lower() == "true",
        "pendingRegistrationJourneyReady": env.get("PENDING_REGISTRATION_JOURNEY_READY", "").lower() == "true",
        "pendingRegistrationHmacPresent": bool(env.get("PENDING_REGISTRATION_TOKEN_HMAC_KEY")),
        "registrationDeploymentId": env.get("REGISTRATION_DEPLOYMENT_ID") or None,
        "altchaConfigured": bool(env.get("ALTCHA_HMAC_KEY")),
        "postmarkConfigured": bool(env.get("POSTMARK_API_TOKEN") and env.get("POSTMARK_SENDER_EMAIL")),
        "emailTransport": env.get("EMAIL_TRANSPORT") or None,
    }


def require_no_published_ports(container: dict) -> None:
    bindings: list[object] = []
    host_bindings = container.get("HostConfig", {}).get("PortBindings", {})
    network_ports = container.get("NetworkSettings", {}).get("Ports", {})
    for source in (host_bindings, network_ports):
        if not isinstance(source, dict):
            continue
        for value in source.values():
            if value not in (None, []):
                bindings.append(value)
    if bindings:
        raise SystemExit("Error: maintenance application publishes a host port")


def compose_environment(path: str, service: str) -> dict:
    with open(path, encoding="utf-8") as source:
        return json.load(source)["services"][service]["environment"]


def verified_database_uri(environments: list[dict]) -> str:
    uri = environments[0].get("MONGODB_URI", "")
    try:
        parsed = urlsplit(uri)
        valid = (
            isinstance(uri, str)
            and not any(character.isspace() for character in uri)
            and parsed.scheme == "mongodb"
            and parsed.hostname == "db"
            and parsed.port in (None, 27017)
            and parsed.path == "/circles"
            and not parsed.fragment
        )
    except (AttributeError, TypeError, ValueError):
        valid = False
    if not valid or any(
        env.get("MONGODB_URI") != uri or (env.get("CIRCLES_MONGODB_DATABASE") or "circles") != "circles"
        for env in environments
    ):
        raise SystemExit("Error: production MongoDB identity differs or is invalid")
    return uri


def verify_paused_database_and_credentials(container: dict, base: str, activation: str, ops: str) -> str:
    runtime = environment(container)
    try:
        default = compose_environment(base, "circles")
        candidate = compose_environment(activation, "circles")
        operator = compose_environment(ops, "registration_ops")
    except (OSError, ValueError, KeyError, TypeError):
        raise SystemExit("Error: unable to determine production Compose database identity")
    uri = verified_database_uri([runtime, default, candidate, operator])
    for key in ("PENDING_REGISTRATION_TOKEN_HMAC_KEY", "REGISTRATION_DEPLOYMENT_ID", "CIRCLES_JWT_SECRET", "CRON_SECRET"):
        value = runtime.get(key)
        if not value or candidate.get(key) != value:
            raise SystemExit(f"Error: candidate {key} differs from the existing production application")
    return uri


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "summary":
        print(json.dumps(application_runtime_summary(read_single_container()), separators=(",", ":")))
        return
    if len(sys.argv) == 2 and sys.argv[1] == "endpoint":
        print(application_container_ipv4(read_single_container()))
        return
    if len(sys.argv) == 2 and sys.argv[1] == "no-published-ports":
        require_no_published_ports(read_single_container())
        print("Maintenance application has no published host ports.")
        return
    if len(sys.argv) == 5 and sys.argv[1] == "paused-database":
        # Consumed only in a shell variable with tracing disabled. Never send this value to a terminal.
        print(verify_paused_database_and_credentials(read_single_container(), *sys.argv[2:]))
        return
    if len(sys.argv) not in {3, 4} or sys.argv[1] not in {"default", "activation", "stopped-activation"}:
        raise SystemExit(
            f"usage: {sys.argv[0]} summary | endpoint | no-published-ports | "
            "default|activation|stopped-activation DEPLOYMENT_ID_OR_NONE [ACTIVATION_ENV_FILE]"
        )
    approved_hmac = None
    if len(sys.argv) == 4:
        if sys.argv[1] not in {"activation", "stopped-activation"}:
            raise SystemExit("Error: activation file comparison is valid only for activation mode")
        approved_hmac = read_activation_hmac(Path(sys.argv[3]))
    stopped = sys.argv[1] == "stopped-activation"
    if stopped and approved_hmac is None:
        raise SystemExit("Error: stopped activation requires the approved activation file")
    errors = validate_application(
        read_single_container(), "activation" if stopped else sys.argv[1], sys.argv[2], approved_hmac, running=not stopped
    )
    if errors:
        for error in errors:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("Running production onboarding configuration verified.")


if __name__ == "__main__":
    main()
