#!/usr/bin/env python3
"""Focused tests for immutable recovery-image verification."""

from __future__ import annotations

from pathlib import Path
import subprocess
import unittest

VALIDATOR = Path(__file__).with_name("verify-production-application-image.py")
SHA = "2437ad23f850e31f71b3ab544326e0f471eef59d"
IMAGE_ID = "sha256:" + "a" * 64


def run_validator(
    payload: str,
    expected_sha: str = SHA,
    expected_image_id: str = IMAGE_ID,
    actual_image_id: str = IMAGE_ID,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), expected_sha, expected_image_id, actual_image_id],
        input=payload,
        check=False,
        capture_output=True,
        text=True,
    )


class ApplicationImageValidatorTests(unittest.TestCase):
    def test_accepts_matching_sha_identity_and_role(self) -> None:
        result = run_validator(f"version=0.8.15\ngitSha={SHA}\n---KAMOONI-ROLE---\nproduction\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(SHA, result.stdout + result.stderr)
        self.assertNotIn(IMAGE_ID, result.stdout + result.stderr)

    def test_rejects_wrong_sha_and_wrong_image_identity(self) -> None:
        wrong_sha = run_validator("gitSha=" + "b" * 40 + "\n---KAMOONI-ROLE---\nproduction\n")
        self.assertNotEqual(wrong_sha.returncode, 0)
        wrong_image = run_validator(
            f"gitSha={SHA}\n---KAMOONI-ROLE---\nproduction\n",
            actual_image_id="sha256:" + "b" * 64,
        )
        self.assertNotEqual(wrong_image.returncode, 0)

    def test_rejects_wrong_role_and_missing_metadata(self) -> None:
        self.assertNotEqual(run_validator(f"gitSha={SHA}\n---KAMOONI-ROLE---\nstaging\n").returncode, 0)
        self.assertNotEqual(run_validator(f"gitSha={SHA}\n").returncode, 0)
        self.assertNotEqual(
            run_validator(f"gitSha={SHA}\ngitSha={'b' * 40}\n---KAMOONI-ROLE---\nproduction\n").returncode,
            0,
        )


if __name__ == "__main__":
    unittest.main()
