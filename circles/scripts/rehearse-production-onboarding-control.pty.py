#!/usr/bin/env python3
"""Drive the production onboarding wrapper's /dev/tty prompts in a PTY."""

from __future__ import annotations

import argparse
import os
import pty
import select
import sys
import time


def parse_responses(path: str) -> list[tuple[bytes, bytes]]:
    responses: list[tuple[bytes, bytes]] = []
    with open(path, "rb") as handle:
        for number, raw in enumerate(handle, 1):
            line = raw.rstrip(b"\r\n")
            if not line:
                continue
            prompt, separator, response = line.partition(b"\t")
            if not separator or not prompt or not response:
                raise SystemExit(f"invalid PTY response line {number}")
            responses.append((prompt, response))
    if not responses:
        raise SystemExit("PTY response file is empty")
    return responses


def self_test() -> None:
    import tempfile

    with tempfile.NamedTemporaryFile("wb", delete=False) as handle:
        handle.write(b"first prompt\tfirst response\nsecond prompt\tsecond response\n")
        path = handle.name
    try:
        parsed = parse_responses(path)
    finally:
        os.unlink(path)
    assert parsed == [
        (b"first prompt", b"first response"),
        (b"second prompt", b"second response"),
    ]


def run(responses_path: str, command: list[str]) -> int:
    responses = parse_responses(responses_path)
    next_response = 0
    output = bytearray()
    deadline = time.monotonic() + 300
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)
        raise AssertionError("exec failed")

    try:
        while True:
            if time.monotonic() > deadline:
                os.kill(pid, 15)
                raise SystemExit("PTY interaction timed out")
            try:
                readable, _, _ = select.select([fd], [], [], 1)
            except InterruptedError:
                continue
            if readable:
                try:
                    chunk = os.read(fd, 4096)
                except OSError:
                    chunk = b""
                if not chunk:
                    break
                output.extend(chunk)
                os.write(sys.stdout.fileno(), chunk)
                if next_response < len(responses) and responses[next_response][0] in output:
                    os.write(fd, responses[next_response][1] + b"\n")
                    next_response += 1
                    output.clear()
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited == pid:
                return os.waitstatus_to_exitcode(status)
        _, status = os.waitpid(pid, 0)
        return os.waitstatus_to_exitcode(status)
    finally:
        os.close(fd)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--responses")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("PTY response parser self-test passed.")
        return
    if not args.responses or not args.command:
        raise SystemExit("usage: --responses FILE -- COMMAND [ARGS...]")
    command = args.command
    if command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("missing command")
    raise SystemExit(run(args.responses, command))


if __name__ == "__main__":
    main()
