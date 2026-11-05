#!/usr/bin/env python3
"""Validate and return the independently installed routing-token verifier."""

from __future__ import annotations

import os
from pathlib import Path
import re
import stat
import sys


def fail(message: str) -> None:
    raise SystemExit(f"Error: {message}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("expected one routing operator verifier path")

    path = Path(sys.argv[1])
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        fail("approved routing operator verifier file is missing")

    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        fail("routing operator verifier must be a regular file, not a symlink")
    if stat.S_IMODE(metadata.st_mode) != 0o600:
        fail("routing operator verifier file mode must be 600")

    try:
        raw = path.read_bytes()
    except OSError as error:
        fail(f"could not read routing operator verifier: {error}")
    if re.fullmatch(rb"[0-9a-f]{64}\n", raw) is None:
        fail("routing operator verifier must contain exactly one lowercase SHA-256 line")

    os.write(sys.stdout.fileno(), raw[:-1])


if __name__ == "__main__":
    main()
