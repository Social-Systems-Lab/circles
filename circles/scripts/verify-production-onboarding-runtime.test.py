#!/usr/bin/env python3
"""Focused tests for production onboarding runtime inspection."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import unittest

VALIDATOR = Path(__file__).with_name("verify-production-onboarding-runtime.py")
DEPLOYMENT_ID = "production-onboarding-20261113-2437ad23-01"
HMAC = "fedcba98765432100123456789abcdefa1b2c3d4e5f60718293a4b5c6d7e8f90"
POSTMARK_TOKEN = "private-postmark-token"


def container(*, activation: bool = True) -> dict:
    return {
        "State": {"Running": True},
        "Config": {
            "Env": [
                "PENDING_REGISTRATION_ENABLED=" + ("true" if activation else "false"),
                "PENDING_REGISTRATION_JOURNEY_READY=" + ("true" if activation else "false"),
                "PENDING_REGISTRATION_TOKEN_HMAC_KEY=" + (HMAC if activation else ""),
                "REGISTRATION_DEPLOYMENT_ID=" + (DEPLOYMENT_ID if activation else ""),
                "CIRCLES_URL=https://kamooni.org",
                "EMAIL_TRANSPORT=postmark",
                "ALTCHA_HMAC_KEY=independent-altcha-test-value",
                f"POSTMARK_API_TOKEN={POSTMARK_TOKEN}",
                "POSTMARK_SENDER_EMAIL=hello@example.invalid",
            ]
        },
        "NetworkSettings": {"Networks": {"circles_webnet": {}}},
    }


def run_validator(mode: str, deployment_id: str, value: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), mode, deployment_id],
        input=json.dumps(value),
        check=False,
        capture_output=True,
        text=True,
    )


class RuntimeValidatorTests(unittest.TestCase):
    def test_validates_activation_without_disclosing_secrets(self) -> None:
        result = run_validator("activation", DEPLOYMENT_ID, [container()])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(HMAC, result.stdout + result.stderr)
        self.assertNotIn(POSTMARK_TOKEN, result.stdout + result.stderr)

    def test_rejects_wrong_deployment_and_default_hmac(self) -> None:
        self.assertNotEqual(
            run_validator("activation", "production-onboarding-20261113-12345678-01", [container()]).returncode,
            0,
        )
        default = container(activation=False)
        default["Config"]["Env"].append(f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}")
        result = run_validator("default", "none", [default])
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(HMAC, result.stdout + result.stderr)

    def test_rejects_wrong_network_and_multiple_containers(self) -> None:
        wrong_network = container()
        wrong_network["NetworkSettings"]["Networks"] = {"staging_webnet": {}}
        self.assertNotEqual(
            run_validator("activation", DEPLOYMENT_ID, [wrong_network]).returncode,
            0,
        )
        self.assertNotEqual(
            run_validator("activation", DEPLOYMENT_ID, [container(), container()]).returncode,
            0,
        )


if __name__ == "__main__":
    unittest.main()
