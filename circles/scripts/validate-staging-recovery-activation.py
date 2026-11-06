#!/usr/bin/env python3
"""Fail-closed validation for the explicit staging recovery activation path."""

import json
import sys


def fail(message: str) -> None:
    raise SystemExit(f"Error: {message}")


def parse_object(label: str, raw: str) -> dict[str, object]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        fail(f"could not parse {label}")
    if not isinstance(value, dict):
        fail(f"{label} must be a JSON object")
    return value


def require_exact_integer(status: dict[str, object], key: str, expected: int) -> None:
    value = status.get(key)
    if type(value) is not int or value != expected:
        fail(f"{key} is {value!r}; recovery activation requires exactly {expected}")


def main() -> None:
    if len(sys.argv) != 3:
        fail("expected operation-status and recovery-activation-status JSON")

    operations = parse_object("pending-registration operation status", sys.argv[1])
    recovery = parse_object("pending-registration recovery status", sys.argv[2])

    require_exact_integer(operations, "pendingRegistrations", 1)
    for key in ("reconciliationRequired", "activeProvisioningLocks", "activeFinalizationLocks"):
        require_exact_integer(operations, key, 0)

    require_exact_integer(recovery, "pendingRegistrations", 1)
    require_exact_integer(recovery, "recoverablePendingRegistrations", 1)
    require_exact_integer(recovery, "unsafePendingRegistrations", 0)

    print("Exactly one recoverable pending registration verified; unsafe conditions are zero.")


if __name__ == "__main__":
    main()
