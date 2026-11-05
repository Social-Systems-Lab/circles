#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate-staging-activation.py")
SPEC = importlib.util.spec_from_file_location("validate_staging_activation", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdea"
DEPLOYMENT = "staging-onboarding-20261105-test0001"


def values():
    return {"PENDING_REGISTRATION_TOKEN_HMAC_KEY": SECRET, "REGISTRATION_DEPLOYMENT_ID": DEPLOYMENT}


def compose():
    return {
        "services": {
            "circles": {
                "environment": {
                    **values(),
                    "PENDING_REGISTRATION_ENABLED": "true",
                    "PENDING_REGISTRATION_JOURNEY_READY": "true",
                    "CIRCLES_URL": "https://staging.kamooni.org",
                    "EMAIL_TRANSPORT": "mailpit",
                    "MAILPIT_SMTP_HOST": "mailpit",
                    "MAILPIT_SMTP_PORT": "1025",
                    "POSTMARK_API_TOKEN": "",
                    "POSTMARK_SENDER_EMAIL": "",
                    "PAYMENTS_ENABLED": "false",
                    "VDB_ENABLED": "false",
                }
            },
            "db": {}, "minio": {}, "mailpit": {}, "mailpit_ui_proxy": {}, "nginx": {},
        }
    }


class ActivationValidationTests(unittest.TestCase):
    def test_safe_values_and_compose_pass(self):
        self.assertEqual(MODULE.validate_values(values()), [])
        self.assertEqual(MODULE.validate_compose(compose()), [])

    def test_missing_weak_or_placeholder_values_fail(self):
        for mutation in (
            {"PENDING_REGISTRATION_TOKEN_HMAC_KEY": "short"},
            {"PENDING_REGISTRATION_TOKEN_HMAC_KEY": "a" * 64},
            {"REGISTRATION_DEPLOYMENT_ID": "staging-onboarding-YYYYMMDD-test"},
            {"REGISTRATION_DEPLOYMENT_ID": "production-release"},
        ):
            candidate = values()
            candidate.update(mutation)
            self.assertTrue(MODULE.validate_values(candidate))

    def test_mixed_flags_and_external_email_fail(self):
        config = compose()
        env = config["services"]["circles"]["environment"]
        env["PENDING_REGISTRATION_JOURNEY_READY"] = "false"
        env["EMAIL_TRANSPORT"] = "postmark"
        env["POSTMARK_API_TOKEN"] = "secret"
        errors = MODULE.validate_compose(config)
        self.assertTrue(any("JOURNEY_READY" in error for error in errors))
        self.assertTrue(any("Mailpit" in error for error in errors))
        self.assertTrue(any("Postmark" in error for error in errors))

    def test_service_set_cannot_change(self):
        config = compose()
        config["services"]["unexpected"] = {}
        self.assertTrue(MODULE.validate_compose(config))


if __name__ == "__main__":
    unittest.main()
