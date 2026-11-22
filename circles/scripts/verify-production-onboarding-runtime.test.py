#!/usr/bin/env python3
"""Focused tests for production onboarding runtime inspection."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
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
        "HostConfig": {"PortBindings": {}},
        "NetworkSettings": {
            "Networks": {"circles_webnet": {"IPAddress": "172.20.0.4"}},
            "Ports": {"3000/tcp": None},
        },
    }


def run_validator(
    mode: str,
    deployment_id: str,
    value: object,
    activation_file: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    args = ["python3", str(VALIDATOR), mode, deployment_id]
    if activation_file is not None:
        args.append(str(activation_file))
    return subprocess.run(
        args,
        input=json.dumps(value),
        check=False,
        capture_output=True,
        text=True,
    )


def run_endpoint(value: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), "endpoint"],
        input=json.dumps(value),
        check=False,
        capture_output=True,
        text=True,
    )


def run_summary(value: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), "summary"],
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

    def test_activation_hmac_must_match_without_disclosure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            activation = Path(directory) / "activation.env"
            activation.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\n"
                f"REGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}\n"
                "ONBOARDING_ALERT_EMAIL=onboarding-alerts@kamooni.invalid\n",
                encoding="utf-8",
            )
            accepted = run_validator("activation", DEPLOYMENT_ID, [container()], activation)
            self.assertEqual(accepted.returncode, 0, accepted.stderr)
            self.assertNotIn(HMAC, accepted.stdout + accepted.stderr)

            replacement = "0" * 64
            activation.write_text(
                f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={replacement}\n"
                f"REGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}\n"
                "ONBOARDING_ALERT_EMAIL=onboarding-alerts@kamooni.invalid\n",
                encoding="utf-8",
            )
            rejected = run_validator("activation", DEPLOYMENT_ID, [container()], activation)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("differs from the approved activation file", rejected.stderr)
            self.assertNotIn(HMAC, rejected.stdout + rejected.stderr)
            self.assertNotIn(replacement, rejected.stdout + rejected.stderr)

    def test_database_and_credentials_must_match_serving_application(self) -> None:
        uri = "mongodb://synthetic:do-not-print@db:27017/circles?authSource=admin"
        server = container()
        required = {
            "MONGODB_URI": uri,
            "CIRCLES_JWT_SECRET": "synthetic-jwt",
            "CRON_SECRET": "synthetic-cron",
        }
        server["Config"]["Env"].extend(f"{key}={value}" for key, value in required.items())
        candidate = dict(required, PENDING_REGISTRATION_TOKEN_HMAC_KEY=HMAC, REGISTRATION_DEPLOYMENT_ID=DEPLOYMENT_ID)
        operator = {"MONGODB_URI": uri, "CIRCLES_MONGODB_DATABASE": "circles"}

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "base.json"
            active = root / "activation.json"
            ops = root / "ops.json"
            base.write_text(json.dumps({"services": {"circles": {"environment": required}}}), encoding="utf-8")

            def validate() -> subprocess.CompletedProcess[str]:
                active.write_text(json.dumps({"services": {"circles": {"environment": candidate}}}), encoding="utf-8")
                ops.write_text(json.dumps({"services": {"registration_ops": {"environment": operator}}}), encoding="utf-8")
                return subprocess.run(
                    ["python3", str(VALIDATOR), "paused-database", str(base), str(active), str(ops)],
                    input=json.dumps([server]), capture_output=True, text=True, check=False,
                )

            self.assertEqual(validate().stdout.strip(), uri)

            candidate["CIRCLES_MONGODB_DATABASE"] = "staging"
            mismatched = validate()
            self.assertNotEqual(mismatched.returncode, 0)
            self.assertIn("MongoDB identity differs", mismatched.stderr)
            self.assertNotIn("do-not-print", mismatched.stdout + mismatched.stderr)
            del candidate["CIRCLES_MONGODB_DATABASE"]

            operator["MONGODB_URI"] = uri.replace("@db:", "@wrong-service:")
            self.assertNotEqual(validate().returncode, 0)
            operator["MONGODB_URI"] = uri

            candidate["PENDING_REGISTRATION_TOKEN_HMAC_KEY"] = "0" * 64
            self.assertNotEqual(validate().returncode, 0)

    def test_offline_recovery_requires_a_stopped_activation_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            activation = Path(directory) / "activation.env"
            activation.write_text(f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={HMAC}\n", encoding="utf-8")
            live = container()
            self.assertNotEqual(run_validator("stopped-activation", DEPLOYMENT_ID, [live], activation).returncode, 0)
            live["State"].update(Running=False, Status="exited")
            self.assertEqual(run_validator("stopped-activation", DEPLOYMENT_ID, [live], activation).returncode, 0)
            live["State"]["Status"] = "restarting"
            self.assertNotEqual(run_validator("stopped-activation", DEPLOYMENT_ID, [live], activation).returncode, 0)

    def test_maintenance_application_must_not_publish_host_ports(self) -> None:
        safe = subprocess.run(
            ["python3", str(VALIDATOR), "no-published-ports"],
            input=json.dumps([container()]),
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(safe.returncode, 0, safe.stderr)

        published = container()
        published["HostConfig"]["PortBindings"] = {
            "3000/tcp": [{"HostIp": "", "HostPort": "3000"}],
        }
        published["NetworkSettings"]["Ports"] = published["HostConfig"]["PortBindings"]
        rejected = subprocess.run(
            ["python3", str(VALIDATOR), "no-published-ports"],
            input=json.dumps([published]),
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(rejected.returncode, 0)

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

    def test_endpoint_returns_one_private_container_address(self) -> None:
        result = run_endpoint([container()])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "172.20.0.4")
        self.assertNotIn(HMAC, result.stdout + result.stderr)
        self.assertNotIn(POSTMARK_TOKEN, result.stdout + result.stderr)

    def test_endpoint_rejects_loopback_public_missing_and_ambiguous_networks(self) -> None:
        for address in ("127.0.0.1", "8.8.8.8", "", "invalid"):
            with self.subTest(address=address):
                value = container()
                value["NetworkSettings"]["Networks"]["circles_webnet"]["IPAddress"] = address
                self.assertNotEqual(run_endpoint([value]).returncode, 0)

        extra_network = container()
        extra_network["NetworkSettings"]["Networks"]["unexpected"] = {"IPAddress": "172.21.0.4"}
        self.assertNotEqual(run_endpoint([extra_network]).returncode, 0)
        self.assertNotEqual(run_endpoint([container(), container()]).returncode, 0)
        missing_network = container()
        missing_network["NetworkSettings"]["Networks"] = {}
        self.assertNotEqual(run_endpoint([missing_network]).returncode, 0)
        stopped = container()
        stopped["State"]["Running"] = False
        self.assertNotEqual(run_endpoint([stopped]).returncode, 0)

    def test_summary_reports_flags_and_secret_presence_without_values(self) -> None:
        result = run_summary([container()])
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual(
            summary,
            {
                "available": True,
                "running": True,
                "pendingRegistrationEnabled": True,
                "pendingRegistrationJourneyReady": True,
                "pendingRegistrationHmacPresent": True,
                "registrationDeploymentId": DEPLOYMENT_ID,
                "altchaConfigured": True,
                "postmarkConfigured": True,
                "emailTransport": "postmark",
            },
        )
        self.assertNotIn(HMAC, result.stdout + result.stderr)
        self.assertNotIn(POSTMARK_TOKEN, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
