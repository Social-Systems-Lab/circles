#!/usr/bin/env python3
"""Regression tests for the fail-closed rendered staging Compose validator."""

from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-staging-compose.py")
SPEC = importlib.util.spec_from_file_location("validate_staging_compose", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def configuration():
    circles_env = {
        "CIRCLES_URL": "https://staging.kamooni.org",
        "EMAIL_TRANSPORT": "mailpit",
        "MAILPIT_SMTP_HOST": "mailpit",
        "MAILPIT_SMTP_PORT": "1025",
        "PAYMENTS_ENABLED": "false",
        "VDB_ENABLED": "false",
        "PENDING_REGISTRATION_ENABLED": "false",
        "PENDING_REGISTRATION_JOURNEY_READY": "false",
    }
    for key in (
        "CIRCLES_REGISTRY_URL",
        "OPENAI_API_KEY",
        "MAPBOX_API_KEY",
        "NEXT_PUBLIC_MAPBOX_TOKEN",
        "POSTMARK_API_TOKEN",
        "POSTMARK_SENDER_EMAIL",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_BOT_USERNAME",
        "DONORBOX_EMAIL",
        "DONORBOX_API_USER",
        "DONORBOX_API_KEY",
        "DONORBOX_WEBHOOK_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_MONTHLY",
        "STRIPE_PRICE_YEARLY",
        "STRIPE_PRICE_MONTHLY_1",
        "STRIPE_PRICE_MONTHLY_2",
        "STRIPE_PRICE_MONTHLY_5",
        "STRIPE_PRICE_MONTHLY_10",
        "VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK",
        "KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK",
        "VIBE_ID_CREDENTIAL_ISSUER_DID",
    ):
        circles_env[key] = ""

    services = {
        "circles": {
            "environment": circles_env,
            "build": {"args": {"KAMOONI_DEPLOYMENT_ROLE": "staging"}},
            "networks": {"webnet": {}, "mailpit_internal": {}},
            "volumes": [
                {"type": "volume", "source": "circles", "target": "/circles"},
                {"type": "volume", "source": "circles_users", "target": "/circles/users"},
            ],
        },
        "db": {"ports": []},
        "minio": {"ports": []},
        "nginx": {"ports": [{"published": "80", "target": 80}, {"published": "443", "target": 443}], "networks": {"webnet": {}}},
        "mailpit": {
            "image": "axllent/mailpit:v1.33.0",
            "ports": [{"host_ip": "127.0.0.1", "published": "8025", "target": 8025, "protocol": "tcp"}],
            "networks": {"mailpit_internal": {}},
            "environment": {
                "MP_UI_BIND_ADDR": "0.0.0.0:8025",
                "MP_SMTP_BIND_ADDR": "0.0.0.0:1025",
                "MP_ALLOWED_HOSTS": "localhost,127.0.0.1",
                "MP_MAX_MESSAGES": "100",
                "MP_MAX_AGE": "72h",
                "MP_MAX_MESSAGE_SIZE": "2",
                "MP_DISABLE_VERSION_CHECK": "true",
                "MP_SMTP_RELAY_ALL": "false",
                "MP_SMTP_RELAY_MATCHING": "",
                "MP_SMTP_RELAY_CONFIG": "",
                "MP_SMTP_FORWARD_CONFIG": "",
            },
        },
        "qdrant": {"profiles": ["vdb"]},
        "cron": {"profiles": ["cron"]},
        "watchtower": {"profiles": ["watchtower"]},
        "minio_loopback": {"profiles": ["loopback"]},
        "nginx_loopback": {"profiles": ["loopback"]},
        "postgres": {"profiles": ["matrix"]},
        "synapse": {"profiles": ["matrix"]},
    }
    volumes = {
        f"kamooni_staging_{name}": {"name": f"kamooni_staging_{name}"}
        for name in ("db", "storage", "circles", "circles_users")
    }
    networks = {"webnet": {}, "mailpit_internal": {"internal": True}}
    config = {"name": "kamooni_staging", "services": {name: services[name] for name in ("circles", "db", "minio", "mailpit", "nginx")}}
    all_config = {"name": "kamooni_staging", "services": services, "networks": networks, "volumes": volumes}
    return config, all_config


class StagingComposeValidationTests(unittest.TestCase):
    def errors(self, mutate):
        config, all_config = configuration()
        mutate(config, all_config)
        return MODULE.validate(config, all_config, "kamooni_staging", "server { server_name staging.kamooni.org; }")

    def test_safe_staging_configuration_passes(self):
        self.assertEqual(self.errors(lambda _config, _all: None), [])

    def test_postmark_transport_is_rejected(self):
        errors = self.errors(lambda config, _all: config["services"]["circles"]["environment"].update(EMAIL_TRANSPORT="postmark"))
        self.assertTrue(any("transport is not mailpit" in error for error in errors))

    def test_nonempty_postmark_credentials_are_rejected(self):
        errors = self.errors(lambda config, _all: config["services"]["circles"]["environment"].update(POSTMARK_API_TOKEN="secret"))
        self.assertTrue(any("POSTMARK_API_TOKEN" in error for error in errors))

    def test_published_smtp_port_is_rejected(self):
        def mutate(_config, all_config):
            all_config["services"]["mailpit"]["ports"].append(
                {"host_ip": "127.0.0.1", "published": "1025", "target": 1025, "protocol": "tcp"}
            )

        errors = self.errors(mutate)
        self.assertTrue(any("Mailpit ports" in error for error in errors))

    def test_public_mailpit_ui_binding_is_rejected(self):
        def mutate(_config, all_config):
            all_config["services"]["mailpit"]["ports"][0]["host_ip"] = "0.0.0.0"

        errors = self.errors(mutate)
        self.assertTrue(any("Mailpit ports" in error for error in errors))

    def test_external_relay_and_forwarding_are_rejected(self):
        def mutate(_config, all_config):
            all_config["services"]["mailpit"]["environment"]["MP_SMTP_RELAY_ALL"] = "true"
            all_config["services"]["mailpit"]["environment"]["MP_SMTP_FORWARD_CONFIG"] = "/etc/forward.yml"

        errors = self.errors(mutate)
        self.assertTrue(any("MP_SMTP_RELAY_ALL" in error for error in errors))
        self.assertTrue(any("MP_SMTP_FORWARD_CONFIG" in error for error in errors))

    def test_mailpit_command_cannot_enable_unreviewed_relay_options(self):
        def mutate(_config, all_config):
            all_config["services"]["mailpit"]["command"] = ["--smtp-relay-all"]

        errors = self.errors(mutate)
        self.assertTrue(any("command or entrypoint" in error for error in errors))

    def test_unexpected_mailpit_environment_is_rejected(self):
        def mutate(_config, all_config):
            all_config["services"]["mailpit"]["environment"]["MP_SMTP_RELAY_HOST"] = "smtp.example.com"

        errors = self.errors(mutate)
        self.assertTrue(any("unexpected environment" in error for error in errors))

    def test_unexpected_service_is_rejected(self):
        errors = self.errors(lambda _config, all_config: all_config["services"].update(attacker={}))
        self.assertTrue(any("all services" in error for error in errors))

    def test_mailpit_cannot_attach_to_public_web_network(self):
        errors = self.errors(lambda _config, all_config: all_config["services"]["mailpit"]["networks"].update(webnet={}))
        self.assertTrue(any("Mailpit is attached" in error for error in errors))

    def test_mailpit_network_must_be_internal(self):
        errors = self.errors(lambda _config, all_config: all_config["networks"]["mailpit_internal"].update(internal=False))
        self.assertTrue(any("network is not internal" in error for error in errors))

    def test_production_role_is_rejected(self):
        errors = self.errors(
            lambda config, _all: config["services"]["circles"]["build"]["args"].update(KAMOONI_DEPLOYMENT_ROLE="production")
        )
        self.assertTrue(any("not marked as a staging build" in error for error in errors))

    def test_pending_registration_flags_must_remain_disabled(self):
        for key in ("PENDING_REGISTRATION_ENABLED", "PENDING_REGISTRATION_JOURNEY_READY"):
            with self.subTest(key=key):
                errors = self.errors(
                    lambda config, _all, key=key: config["services"]["circles"]["environment"].update({key: "true"})
                )
                self.assertTrue(any(key in error for error in errors))

    def test_application_and_credential_mounts_must_use_staging_volumes(self):
        def mutate(config, _all):
            config["services"]["circles"]["volumes"][1]["source"] = "production_users"

        errors = self.errors(mutate)
        self.assertTrue(any("application and credential mounts" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
