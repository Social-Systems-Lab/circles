#!/usr/bin/env python3
"""Verify an immutable production application image without printing metadata."""

from __future__ import annotations

import sys

ROLE_MARKER = "---KAMOONI-ROLE---"


def fail(message: str) -> None:
    raise SystemExit(f"Error: {message}")


def parse_version(contents: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in contents.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        if key in values:
            fail("application image VERSION metadata contains duplicate keys")
        values[key] = value.strip()
    return values


def main() -> None:
    if len(sys.argv) != 4:
        fail("expected application SHA, expected image ID, and actual image ID")
    expected_sha, expected_image_id, actual_image_id = sys.argv[1:]
    if expected_image_id != actual_image_id:
        fail("application image identity changed")

    payload = sys.stdin.read()
    version_contents, separator, role = payload.partition(ROLE_MARKER)
    if not separator:
        fail("application image metadata is incomplete")
    if parse_version(version_contents).get("gitSha") != expected_sha:
        fail("application image SHA does not match the deployed checkout")
    if role.strip() != "production":
        fail("application image role is not production")

    print("Application image SHA, identity, and production role verified.")


if __name__ == "__main__":
    main()
