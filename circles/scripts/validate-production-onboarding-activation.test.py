#!/usr/bin/env python3
"""Focused tests for production onboarding configuration validation."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

VALIDATOR = Path(__file__).with_name("validate-production-onboarding-activation.py")
DEPLOYMENT_ID = "production-onboarding-20261113-2437ad23-01"
HMAC = "0123456789abcdef0123456789abcdeffedcba9876543210fedcba9876543210"
POSTMARK_TOKEN = "sensitive-postmark-token"


def compose_environment(*, mode: str = "default", deployment_id: str = "") -> dict:
    activation = mode == "activation"
    return {
        "name": "circles",
        "services": {
            "circles": {
                "build": {"args": {"KAMOONI_DEPLOYMENT_ROLE": "production"}},
                "environment": {
                    "CIRCLES_URL": "https://kamooni.org",
                    "EMAIL_TRANSPORT": "postmark",
                    "ALTCHA_HMAC_KEY": "independent-altcha-test-value",
                    "POSTMARK_API_TOKEN": POSTMARK_TOKEN,
                    "POSTMARK_SENDER_EMAIL": "hello@example.invalid",
                    "PENDING_REGISTRATION_ENABLED": "true" if activation else "false",
                    "PENDING_REGISTRATION_JOURNEY_READY": "true" if activation else "false",
                    "PENDING_REGISTRATION_TOKEN_HMAC_KEY": HMAC if activation else "",
                    "REGISTRATION_DEPLOYMENT_ID": deployment_id,
                },
            }
        },
    }


def ops_compose() -> dict:
    return {
        "services": {
            "registration_ops": {
                "image": "circles-registration-ops:2437ad23f850e31f71b3ab544326e0f471eef59d",
                "environment": {
                    "CIRCLES_MONGODB_DATABASE": "circles",
                    "MONGODB_URI": "mongodb://sensitive:secret@db:27017/circles?authSource=admin",
                    "REGISTRATION_DEPLOYMENT_ID": DEPLOYMENT_ID,
                },
                "networks": {"webnet": None},
                "read_only": True,
                "cap_drop": ["ALL"],
                "security_opt": ["no-new-privileges:true"],
                "volumes": [
                    {
                        "type": "volume",
                        "source": "circles_users",
                        "target": "/circles/users",
                        "read_only": True,
                    }
                ],
            }
        }
    }


class ActivationValidatorTests(unittest.TestCase):
    def run_command(self, *args: str, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(VALIDATOR), *args],
            input=stdin,
            check=False,
            capture_output=True,
            text=True,
        )

    def write_json(self, root: Path, name: str, value: dict) -> Path:
        path = root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_secret_file_permissions_content_and_non_disclosure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "activation.env"
            path.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\nREGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}\n",
                encoding="utf-8",
            )
            path.chmod(0o600)
            result = self.run_command("file", str(path), str(os.getuid()))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

            path.chmod(0o644)
            self.assertNotEqual(self.run_command("file", str(path), str(os.getuid())).returncode, 0)

            path.chmod(0o600)
            symlink = Path(directory) / "activation-link"
            symlink.symlink_to(path)
            self.assertNotEqual(self.run_command("file", str(symlink), str(os.getuid())).returncode, 0)

    def test_activation_values_reject_placeholders_and_mismatches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "activation.env"
            path.write_text(
                "PENDING_REGISTRATION_TOKEN_HMAC_KEY=GENERATE_PRODUCTION_ONLY_64_HEX_SECRET\n"
                "REGISTRATION_DEPLOYMENT_ID=production-onboarding-YYYYMMDD-APP_SHA_SEQUENCE\n",
                encoding="utf-8",
            )
            path.chmod(0o600)
            result = self.run_command("file", str(path), str(os.getuid()))
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("GENERATE_PRODUCTION_ONLY", result.stderr)

            path.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\n"
                "REGISTRATION_DEPLOYMENT_ID=production-onboarding-20261113-12345678-01\n",
                encoding="utf-8",
            )
            composed = compose_environment(
                mode="activation",
                deployment_id="production-onboarding-20261113-12345678-01",
            )
            composed_path = self.write_json(Path(directory), "activation.json", composed)
            self.assertNotEqual(
                self.run_command(
                    "activation-compose-json",
                    str(composed_path),
                    DEPLOYMENT_ID,
                ).returncode,
                0,
            )

    def test_activation_secret_is_separate_from_application_and_operator_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            activation = root / "activation.env"
            application = root / ".env"
            verifier = root / "verifier"
            activation.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\nREGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}\n",
                encoding="utf-8",
            )
            activation.chmod(0o600)
            verifier.write_text("a" * 64, encoding="utf-8")
            application.write_text("ALTCHA_HMAC_KEY=separate-value\n", encoding="utf-8")
            result = subprocess.run(
                [
                    "python3",
                    str(VALIDATOR),
                    "separation",
                    str(activation),
                    str(application),
                    str(verifier),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

            application.write_text(f"ALTCHA_HMAC_KEY={HMAC}\n", encoding="utf-8")
            result = subprocess.run(
                [
                    "python3",
                    str(VALIDATOR),
                    "separation",
                    str(activation),
                    str(application),
                    str(verifier),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

            application.write_text(
                f"MONGODB_URI=mongodb://user:{HMAC}@db:27017/circles?authSource=admin\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    "python3",
                    str(VALIDATOR),
                    "separation",
                    str(activation),
                    str(application),
                    str(verifier),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

    def test_operator_token_must_differ_from_activation_hmac(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            activation = Path(directory) / "activation.env"
            activation.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\nREGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}\n",
                encoding="utf-8",
            )
            distinct = subprocess.run(
                ["python3", str(VALIDATOR), "token-separation", str(activation)],
                input="distinct-routing-token",
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(distinct.returncode, 0, distinct.stderr)
            self.assertNotIn(HMAC, distinct.stdout + distinct.stderr)

            identical = subprocess.run(
                ["python3", str(VALIDATOR), "token-separation", str(activation)],
                input=HMAC,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(identical.returncode, 0)
            self.assertNotIn(HMAC, identical.stdout + identical.stderr)

    def test_origin_policy_allows_rollback_when_origin_advances(self) -> None:
        deployed = "a" * 40
        origin = "b" * 40

        def eligible(command: str, expected: str = "", target: str = "") -> bool:
            return (
                self.run_command(
                    "origin-eligible",
                    command,
                    expected,
                    target,
                    deployed,
                    origin,
                ).returncode
                == 0
            )

        for command in ("status", "inspect", "deactivate-services"):
            with self.subTest(command=command):
                self.assertTrue(eligible(command))
        self.assertTrue(eligible("route-set", "pending", "paused"))
        self.assertTrue(eligible("route-set", "paused", "legacy"))

        for command in ("build-operator", "preflight", "prepare-indexes", "activate-services"):
            with self.subTest(command=command):
                self.assertFalse(eligible(command))
        self.assertFalse(eligible("route-set", "legacy", "paused"))
        self.assertFalse(eligible("route-set", "paused", "pending"))

        def eligible_without_origin(command: str, expected: str = "", target: str = "") -> bool:
            return (
                self.run_command(
                    "origin-eligible",
                    command,
                    expected,
                    target,
                    deployed,
                    "",
                ).returncode
                == 0
            )

        self.assertTrue(eligible_without_origin("deactivate-services"))
        self.assertFalse(eligible_without_origin("preflight"))

    def test_operations_idle_ignores_email_only_records_but_rejects_active_or_uncertain_state(self) -> None:
        safe = {
            "pendingRegistrations": 4,
            "reconciliationRequired": 0,
            "activeProvisioningLocks": 0,
            "activeFinalizationLocks": 0,
        }
        self.assertEqual(self.run_command("operations-idle", stdin=json.dumps(safe)).returncode, 0)
        for key in ("reconciliationRequired", "activeProvisioningLocks", "activeFinalizationLocks"):
            with self.subTest(key=key):
                unsafe = {**safe, key: 1}
                self.assertNotEqual(
                    self.run_command("operations-idle", stdin=json.dumps(unsafe)).returncode,
                    0,
                )
        self.assertNotEqual(self.run_command("operations-idle", stdin="[]").returncode, 0)

    def test_default_and_activation_compose_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            default_path = self.write_json(root, "default.json", compose_environment())
            activation_path = self.write_json(
                root,
                "activation.json",
                compose_environment(mode="activation", deployment_id=DEPLOYMENT_ID),
            )
            self.assertEqual(self.run_command("default-compose-json", str(default_path)).returncode, 0)
            result = self.run_command("activation-compose-json", str(activation_path), DEPLOYMENT_ID)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

            unsafe = compose_environment()
            unsafe["services"]["circles"]["environment"]["PENDING_REGISTRATION_TOKEN_HMAC_KEY"] = HMAC
            unsafe_path = self.write_json(root, "unsafe.json", unsafe)
            self.assertNotEqual(self.run_command("default-compose-json", str(unsafe_path)).returncode, 0)

            staging = compose_environment()
            staging["services"]["mailpit"] = {"image": "axllent/mailpit:v1.33.0"}
            staging_path = self.write_json(root, "staging.json", staging)
            self.assertNotEqual(self.run_command("default-compose-json", str(staging_path)).returncode, 0)

    def test_operator_compose_is_isolated_and_does_not_disclose_uri(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(Path(directory), "ops.json", ops_compose())
            result = self.run_command(
                "ops-compose-json",
                str(path),
                "2437ad23f850e31f71b3ab544326e0f471eef59d",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("sensitive", result.stdout + result.stderr)

            unsafe = ops_compose()
            unsafe["services"]["registration_ops"]["environment"]["PENDING_REGISTRATION_TOKEN_HMAC_KEY"] = HMAC
            unsafe_path = self.write_json(Path(directory), "unsafe-ops.json", unsafe)
            result = self.run_command(
                "ops-compose-json",
                str(unsafe_path),
                "2437ad23f850e31f71b3ab544326e0f471eef59d",
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(HMAC, result.stdout + result.stderr)

    def test_routing_status_and_zero_operation_guards(self) -> None:
        self.assertEqual(
            self.run_command("route-status", "legacy", stdin='{"mode":"legacy","deploymentId":null}').returncode,
            0,
        )
        self.assertNotEqual(
            self.run_command("route-status", "paused", stdin='{"mode":"legacy"}').returncode,
            0,
        )
        self.assertNotEqual(self.run_command("route-status", "legacy", stdin="[]").returncode, 0)
        self.assertNotEqual(
            self.run_command(
                "route-status",
                "legacy",
                stdin='{"mode":"legacy","deploymentId":"unexpected"}',
            ).returncode,
            0,
        )
        self.assertEqual(
            self.run_command(
                "operations-zero",
                stdin=json.dumps(
                    {
                        "pendingRegistrations": 0,
                        "reconciliationRequired": 0,
                        "activeProvisioningLocks": 0,
                        "activeFinalizationLocks": 0,
                    }
                ),
            ).returncode,
            0,
        )
        self.assertNotEqual(
            self.run_command(
                "operations-zero",
                stdin=json.dumps(
                    {
                        "pendingRegistrations": 1,
                        "reconciliationRequired": 0,
                        "activeProvisioningLocks": 0,
                        "activeFinalizationLocks": 0,
                    }
                ),
            ).returncode,
            0,
        )
        self.assertNotEqual(self.run_command("operations-zero", stdin="[]").returncode, 0)


if __name__ == "__main__":
    unittest.main()
