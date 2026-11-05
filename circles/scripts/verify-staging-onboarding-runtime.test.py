#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-staging-onboarding-runtime.py")
SPEC = importlib.util.spec_from_file_location("verify_staging_onboarding_runtime", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

DEPLOYMENT_ID = "staging-onboarding-20261105-runtime01"
SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdea"


def application(mode: str = "activation") -> dict:
    env = {
        "HOSTNAME": "0.0.0.0",
        "CIRCLES_URL": "https://staging.kamooni.org",
        "EMAIL_TRANSPORT": "mailpit",
        "MAILPIT_SMTP_HOST": "mailpit",
        "MAILPIT_SMTP_PORT": "1025",
        "POSTMARK_API_TOKEN": "",
        "POSTMARK_SENDER_EMAIL": "",
        "PAYMENTS_ENABLED": "false",
        "VDB_ENABLED": "false",
        "PENDING_REGISTRATION_ENABLED": "true" if mode == "activation" else "false",
        "PENDING_REGISTRATION_JOURNEY_READY": "true" if mode == "activation" else "false",
    }
    if mode == "activation":
        env["PENDING_REGISTRATION_TOKEN_HMAC_KEY"] = SECRET
        env["REGISTRATION_DEPLOYMENT_ID"] = DEPLOYMENT_ID
    return {
        "Config": {"Env": [f"{key}={value}" for key, value in env.items()]},
        "State": {"Running": True},
        "NetworkSettings": {"Networks": {"kamooni_staging_webnet": {}, "kamooni_staging_mailpit_internal": {}}},
        "HostConfig": {"PortBindings": {}},
    }


def mailpit_containers() -> list[dict]:
    return [
        {
            "Config": {
                "Image": "axllent/mailpit:v1.33.0",
                "Labels": {"com.docker.compose.service": "mailpit"},
                "Env": [
                    "MP_SMTP_BIND_ADDR=0.0.0.0:1025",
                    "MP_UI_BIND_ADDR=0.0.0.0:8025",
                    "MP_SMTP_RELAY_ALL=false",
                    "MP_SMTP_RELAY_MATCHING=",
                    "MP_SMTP_RELAY_CONFIG=",
                    "MP_SMTP_FORWARD_CONFIG=",
                    "MP_ALLOWED_HOSTS=localhost,127.0.0.1",
                    "MP_DISABLE_VERSION_CHECK=true",
                ],
            },
            "State": {"Running": True},
            "NetworkSettings": {"Networks": {"kamooni_staging_mailpit_internal": {}}},
            "HostConfig": {"PortBindings": {}},
        },
        {
            "Config": {
                "Image": "nginx:1.27.4-alpine@sha256:4ff102c5d78d254a6f0da062b3cf39eaf07f01eec0927fd21e219d0af8bc0591",
                "Labels": {"com.docker.compose.service": "mailpit_ui_proxy"},
                "Env": [],
            },
            "State": {"Running": True},
            "NetworkSettings": {
                "Networks": {
                    "kamooni_staging_mailpit_internal": {},
                    "kamooni_staging_mailpit_ui_loopback": {},
                }
            },
            "HostConfig": {
                "PortBindings": {"8025/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8025"}]},
                "ReadonlyRootfs": True,
                "CapDrop": ["ALL"],
                "SecurityOpt": ["no-new-privileges:true"],
            },
            "Mounts": [{"Destination": "/etc/nginx/nginx.conf", "RW": False}],
        },
    ]


class RuntimeVerificationTests(unittest.TestCase):
    def test_activation_and_default_application_pass(self):
        self.assertEqual(MODULE.validate_application(application(), "activation", DEPLOYMENT_ID), [])
        self.assertEqual(MODULE.validate_application(application("default"), "default", "none"), [])

    def test_mixed_flags_deployment_and_external_email_fail(self):
        container = application()
        container["Config"]["Env"] = [
            value.replace("PENDING_REGISTRATION_JOURNEY_READY=true", "PENDING_REGISTRATION_JOURNEY_READY=false")
            .replace("EMAIL_TRANSPORT=mailpit", "EMAIL_TRANSPORT=postmark")
            .replace(f"REGISTRATION_DEPLOYMENT_ID={DEPLOYMENT_ID}", "REGISTRATION_DEPLOYMENT_ID=wrong")
            for value in container["Config"]["Env"]
        ]
        errors = MODULE.validate_application(container, "activation", DEPLOYMENT_ID)
        self.assertTrue(any("JOURNEY_READY" in error for error in errors))
        self.assertTrue(any("deployment ID" in error for error in errors))
        self.assertTrue(any("EMAIL_TRANSPORT" in error for error in errors))

    def test_weak_hmac_and_network_drift_fail(self):
        container = application()
        container["Config"]["Env"] = [
            value.replace(f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={SECRET}", "PENDING_REGISTRATION_TOKEN_HMAC_KEY=short")
            for value in container["Config"]["Env"]
        ]
        container["NetworkSettings"]["Networks"]["unexpected"] = {}
        errors = MODULE.validate_application(container, "activation", DEPLOYMENT_ID)
        self.assertTrue(any("HMAC" in error for error in errors))
        self.assertTrue(any("network" in error for error in errors))

    def test_mailpit_safe_runtime_passes(self):
        self.assertEqual(MODULE.validate_mailpit(mailpit_containers()), [])

    def test_mailpit_relay_public_binding_and_proxy_drift_fail(self):
        containers = mailpit_containers()
        containers[0]["Config"]["Env"] = [
            value.replace("MP_SMTP_RELAY_ALL=false", "MP_SMTP_RELAY_ALL=true")
            for value in containers[0]["Config"]["Env"]
        ]
        containers[0]["HostConfig"]["PortBindings"] = {"1025/tcp": [{"HostIp": "0.0.0.0", "HostPort": "1025"}]}
        containers[1]["HostConfig"]["PortBindings"]["8025/tcp"][0]["HostIp"] = "0.0.0.0"
        containers[1]["HostConfig"]["ReadonlyRootfs"] = False
        errors = MODULE.validate_mailpit(containers)
        self.assertTrue(any("RELAY_ALL" in error for error in errors))
        self.assertTrue(any("publishes" in error for error in errors))
        self.assertTrue(any("loopback" in error for error in errors))
        self.assertTrue(any("read-only" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
