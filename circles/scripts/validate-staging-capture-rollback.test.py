#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate-staging-capture-rollback.py")
SPEC = importlib.util.spec_from_file_location("capture_rollback_validator", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def configuration():
    env = {
        "EMAIL_TRANSPORT": "capture", "EMAIL_CAPTURE_ENABLED": "true", "KAMOONI_DEPLOYMENT_ENV": "staging",
        "CIRCLES_DEV_LOG_PASSWORD_RESET": "false", "NODE_ENV": "production",
        "CIRCLES_URL": "https://staging.kamooni.org", "NEXT_PUBLIC_APP_URL": "https://staging.kamooni.org",
        "NEXT_PUBLIC_SITE_URL": "https://staging.kamooni.org", "PAYMENTS_ENABLED": "false", "VDB_ENABLED": "false",
        "POSTMARK_API_TOKEN": "", "POSTMARK_SENDER_EMAIL": "",
    }
    circles = {
        "image": MODULE.PINNED_IMAGE,
        "environment": env,
        "volumes": [
            {"type": "volume", "source": "circles", "target": "/circles"},
            {"type": "volume", "source": "circles_users", "target": "/circles/users"},
        ],
    }
    services = {
        "circles": circles, "db": {}, "minio": {},
        "nginx": {"ports": [{"published": 80, "target": 80}, {"published": 443, "target": 443}]},
        "qdrant": {"profiles": ["vdb"]}, "cron": {"profiles": ["cron"]},
        "watchtower": {"profiles": ["watchtower"]}, "minio_loopback": {"profiles": ["loopback"]},
        "nginx_loopback": {"profiles": ["loopback"]}, "postgres": {"profiles": ["matrix"]},
        "synapse": {"profiles": ["matrix"]},
    }
    default = {name: services[name] for name in ("circles", "db", "minio", "nginx")}
    volumes = {name: {"name": f"kamooni_staging_{name}"} for name in ("db", "storage", "circles", "circles_users")}
    return {"name": "kamooni_staging", "services": default}, {"name": "kamooni_staging", "services": services, "volumes": volumes}


class CaptureRollbackValidationTests(unittest.TestCase):
    def errors(self, mutate):
        config, all_config = configuration()
        mutate(config, all_config)
        return MODULE.validate(config, all_config, "server { server_name staging.kamooni.org; }")

    def test_pinned_capture_configuration_passes(self):
        self.assertEqual(self.errors(lambda _config, _all: None), [])

    def test_wrong_image_is_rejected(self):
        errors = self.errors(lambda config, _all: config["services"]["circles"].update(image="latest"))
        self.assertTrue(any("image tag" in error for error in errors))

    def test_mailpit_is_rejected(self):
        errors = self.errors(lambda _config, all_config: all_config["services"].update(mailpit={}))
        self.assertTrue(any("Mailpit" in error for error in errors))

    def test_postmark_is_rejected(self):
        errors = self.errors(lambda config, _all: config["services"]["circles"]["environment"].update(POSTMARK_API_TOKEN="secret"))
        self.assertTrue(any("POSTMARK_API_TOKEN" in error for error in errors))

    def test_capture_contract_is_required(self):
        for key in ("EMAIL_TRANSPORT", "EMAIL_CAPTURE_ENABLED", "KAMOONI_DEPLOYMENT_ENV"):
            with self.subTest(key=key):
                errors = self.errors(lambda config, _all, key=key: config["services"]["circles"]["environment"].pop(key))
                self.assertTrue(any(key in error for error in errors))

    def test_staging_mounts_are_required(self):
        errors = self.errors(lambda config, _all: config["services"]["circles"]["volumes"][1].update(source="circles_users"))
        self.assertEqual(errors, [])
        errors = self.errors(lambda config, _all: config["services"]["circles"]["volumes"][1].update(source="production_users"))
        self.assertTrue(any("application mounts" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
