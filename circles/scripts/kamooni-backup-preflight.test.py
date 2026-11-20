"""Synthetic fixtures only. Run with python3 -I -B from the worktree root."""

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("kamooni-backup-preflight.py").resolve()
APP = "/root/circles/circles/circles"
STAGE = "/root/kamooni-backup-staging"
GIB = 1024**3
BASE = f"{APP}/docker-compose.yml"
ACTIVATION = f"{APP}/docker-compose.production-activation.yml"
ACTIVATION_ENV = "/root/circles/onboarding-secrets/activation.env"
ROUTING_VERIFIER = "/root/circles/onboarding-secrets/routing-operator.sha256"
DEPLOYMENT = "production-onboarding-synthetic-test"
PROVISIONING = "pendingRegistrationProvisioningLocks"
FINALIZATION = "pendingRegistrationFinalizationLocks"
QDRANT_VOLUME = "/var/lib/docker/volumes/circles_qdrant/_data"
QDRANT_LAYER = "/var/lib/docker/overlay2/synthetic-qdrant/diff"
MONGO_VOLUME = "/var/lib/docker/volumes/circles_mongo/_data"
MINIO_VOLUME = "/var/lib/docker/volumes/circles_minio/_data"
USER_VOLUME = "/var/lib/docker/volumes/circles_circles_users/_data"
APP_VOLUME = "/var/lib/docker/volumes/circles_circles/_data"
SYNTHETIC_CREDENTIAL_FILE_BYTES = {"salt.bin": 16, "iv.bin": 16, "publicKey.pem": 426, "privateKey.pem.enc": 3360}


def path_evidence(path):
    return {"canonical_path": path, "uid": 0, "gid": 0, "mode": "0700", "no_symlinks": True}


def filesystem(path, backing, device, host_path=None):
    return {
        **path_evidence(path), "backing": backing, "device": device, "quotas_checked": True,
        "host_path": host_path or backing,
        "free_bytes": 40 * GIB, "free_inodes": 100_000, "quota_bytes": None, "quota_inodes": None,
    }


def inventory():
    def service(destination=None, volume=None, listener_port=None):
        mounts = {}
        if destination:
            mounts[destination] = {
                "type": "volume", "source": f"/var/lib/docker/volumes/{volume}/_data", "volume": volume, "rw": True,
            }
        result = {
            "image_id": "sha256:" + "a" * 64, "compose_files": [BASE], "mounts": mounts, "networks": ["circles_webnet"],
        }
        if listener_port is not None:
            result["listener_port"] = listener_port
        return result

    app = service("/circles", "circles_circles")
    app["mounts"].update(service("/circles/users", "circles_circles_users")["mounts"])
    app["compose_files"].append(ACTIVATION)
    nginx = service()
    for destination, source, writable in (
        ("/etc/nginx/nginx.conf", f"{APP}/nginx/nginx.conf", False),
        ("/etc/letsencrypt", "/etc/letsencrypt", False),
        ("/usr/share/nginx/html", "/var/www/certbot", True),
    ):
        nginx["mounts"][destination] = {"type": "bind", "source": source, "volume": "", "rw": writable}
    services = {
        "circles": app, "db": service("/data/db", "circles_mongo", 27017),
        "minio": service("/data", "circles_minio", 9000),
        "qdrant": service("/qdrant/storage", "circles_qdrant", 6333), "nginx": nginx, "cron": service(),
    }
    services["qdrant"]["writable_layer"] = QDRANT_LAYER
    config_paths = [
        BASE, ACTIVATION, f"{APP}/.env", ACTIVATION_ENV, ROUTING_VERIFIER, f"{APP}/nginx/nginx.conf",
        "/etc/letsencrypt", "/var/www/certbot",
    ]
    host_paths = set(config_paths) | {QDRANT_LAYER} | {
        mount["source"] for running in services.values() for mount in running["mounts"].values()
    }
    versions = {"mongo": "7.0.26", "mongo_tools": "100.20.1", "minio": "RELEASE.2025-09-07T16-13-09Z",
                "qdrant": "1.15.4", "restic": "0.16.4"}
    config_entries = {
        path: {
            "kind": "directory" if path in ("/etc/letsencrypt", "/var/www/certbot") else "file",
            "device": "8:1", "inode": number, "bytes": 1000,
        }
        for number, path in enumerate(config_paths, 1)
    }
    config_entries[ACTIVATION_ENV] = {"kind": "reference", "ledger_ref": "synthetic-activation-ref"}
    config_entries[ROUTING_VERIFIER] = {"kind": "reference", "ledger_ref": "synthetic-verifier-ref"}
    image = {"image_id": app["image_id"], "git_sha": "a" * 40, "source_digest": "sha256:" + "b" * 64}

    return {
        "schema": 3,
        "reviewed": True,
        "runtime": {
            "host": "kamooniorg", "project": "circles", "git_sha": "a" * 40,
            "services": services,
            "config_paths": config_paths,
            "host_paths": {path: path_evidence(path) for path in sorted(host_paths)},
            "writers": {
                "cron": "gate-and-drain", "watchtower": "verified-absent", "host_workers": "verified-absent",
                "webhooks": "gate-and-drain", "direct_writers": "gate-and-drain",
            },
            "application_recovery": {
                **image, "source": "image-archive", "tested": True, "test_ref": "synthetic-image-load-test",
                "test_result": image,
            },
            "effective": {
                "mongo_database": "circles", "mongo_host": "db", "mongo_port": 27017,
                "minio_host": "minio", "minio_port": 9000, "qdrant_host": "qdrant", "qdrant_port": 6333,
                "mongo_dbpath": "/data/db", "minio_data_root": "/data",
                "qdrant_storage_root": "/qdrant/storage", "qdrant_snapshot_root": "/qdrant/snapshots",
                "qdrant_temp_root": "/qdrant/storage/snapshots_temp",
                "identity_root": "/circles/users", "server_key_root": "/circles/server",
                "watchdog_users_root": "/circles/users",
                "public_bucket": "circles", "legacy_public_bucket": "circles", "private_bucket": "circles-private",
                "verification_bucket": "circles-verification", "public_url": "https://kamooni.org",
                "onboarding": "active", "onboarding_deployment_id": DEPLOYMENT,
            },
        },
        "sources": {
            "mongo": {
                "topology": "standalone", "fcv": "7.0", "bytes": 600 * 1024**2,
                "collections": {
                    "circles": 1000, "chatConversations": 25, "chatRoomMembers": 100, "chatMessageDocs": 80,
                    "chatReadStates": 0, "pendingRegistrations": 11, "pendingRegistrationDidReservations": 3,
                    "registrationRouting": 1, "onboardingWatchdogState": 1, "pendingRegistrationRateLimits": 0,
                    "pendingRegistrationAuditEvents": 20, PROVISIONING: 2, FINALIZATION: 0,
                },
                "onboarding": {
                    "routing_mode": "active", "deployment_id": DEPLOYMENT, "watchdog_deployment_id": DEPLOYMENT,
                    "active_leases": {PROVISIONING: 1, FINALIZATION: 0},
                },
            },
            "identities": {
                "bytes": 1000 * sum(SYNTHETIC_CREDENTIAL_FILE_BYTES.values()),
                "files": 4000, "mount_source": USER_VOLUME, "credential_sets": 1000,
                "credential_files": {"salt.bin": 1000, "iv.bin": 1000, "publicKey.pem": 1000, "privateKey.pem.enc": 1000},
                "layout_verified": True,
            },
            "app_state": {
                "bytes": 10_000, "files": 2,
                "server_keys": {
                    "path": "/circles/server", "mount_source": APP_VOLUME,
                    "files": {"publicKey.pem": 800, "privateKey.pem": 2000}, "pair_verified": True,
                },
            },
            "minio": {
                "bytes": 2 * GIB, "history_bytes": 4096, "export_inodes": 530,
                "buckets": {
                    "circles": {
                        "versioning": "enabled", "objects": 500, "current_bytes": GIB,
                        "versions": 2, "version_bytes": 2048, "delete_markers": 1,
                    },
                    "circles-private": {
                        "versioning": "never-enabled", "objects": 10, "current_bytes": 512 * 1024**2,
                        "versions": 0, "version_bytes": 0, "delete_markers": 0,
                    },
                    "circles-verification": {
                        "versioning": "suspended", "objects": 1, "current_bytes": 1024**2,
                        "versions": 0, "version_bytes": 0, "delete_markers": 0,
                    },
                },
            },
            "qdrant": {
                "topology": "standalone", "bytes": 2 * GIB, "collections": {"entities": 200},
                "scratch_bytes": 4 * GIB, "scratch_inodes": 12,
            },
            "config": {"bytes": 100_000, "export_inodes": 12, "entries": config_entries},
        },
        "versions": {"capture": versions, "restore": deepcopy(versions)},
        "stage": {
            "path": STAGE, "checked_path": "/root", "state": "absent", "private_ancestry": True,
            "filesystems": {
                "staging": filesystem("/root", "/root", "8:1"),
                "qdrant_storage": filesystem("/qdrant/storage", QDRANT_VOLUME, "8:2"),
                "qdrant_snapshot": filesystem("/qdrant/snapshots", QDRANT_LAYER, "8:1", f"{QDRANT_LAYER}/qdrant/snapshots"),
                "qdrant_temp": filesystem("/qdrant/storage/snapshots_temp", QDRANT_VOLUME, "8:2", f"{QDRANT_VOLUME}/snapshots_temp"),
            },
        },
    }


def dry_run(payload, *args, **kwargs):
    if isinstance(payload, dict):
        payload = json.dumps(payload)
    if isinstance(payload, str):
        payload = payload.encode()
    return subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), *args], input=payload,
                          capture_output=True, timeout=5, **kwargs)


class BackupPreflightTests(unittest.TestCase):
    def assert_rejected(self, result, reason="DRY-RUN REJECTED: "):
        self.assertEqual(result.returncode, 1, result)
        self.assertEqual(result.stdout, b"")
        self.assertIn(reason.encode(), result.stderr)

    def check_rejections(self, cases):
        for path, value, reason in cases:
            with self.subTest(path=path, value=value):
                data = inventory()
                node = data
                for key in path[:-1]:
                    node = node[key]
                if value is None:
                    del node[path[-1]]
                else:
                    node[path[-1]] = value
                self.assert_rejected(dry_run(data, "--dry-run"), reason)

    def test_dry_run_has_no_effects_or_disclosures(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            secrets = root / "secrets"
            secrets.mkdir(mode=0o700)
            secret = secrets / "restic.pass"
            secret.write_text("synthetic-private-token")
            secret.chmod(0o600)
            stub = root / "restic"
            stub.write_text("#!/bin/sh\ntouch called-tool\nexit 1\n")
            stub.chmod(0o700)
            for name in ("docker", "mongodump", "mc", "curl", "aws"):
                (root / name).symlink_to(stub)

            def tree():
                return {path: (path.lstat().st_mode, path.lstat().st_size, path.lstat().st_mtime_ns)
                        for path in root.rglob("*")}

            before = tree()
            result = dry_run(inventory(), "--dry-run", cwd=root, env={
                "HOME": str(root), "PATH": str(root), "TMPDIR": str(root),
                "RESTIC_PASSWORD_FILE": str(secret), "RESTIC_REPOSITORY": "synthetic-repo",
                "AWS_SECRET_ACCESS_KEY": "synthetic-private-token", "PYTHONPYCACHEPREFIX": str(root / "cache"),
            })
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(b"DRY-RUN PASSED", result.stdout)
            self.assertIn(b"Snapshot ID: none.", result.stdout)
            self.assertEqual(result.stderr, b"")
            for private in ("synthetic-", "/root/", "kamooniorg", "circles-private", "sha256:"):
                self.assertNotIn(private.encode(), result.stdout)
            self.assertEqual(tree(), before)
            self.assertEqual(secret.read_text(), "synthetic-private-token")

    def test_accepts_empty_existing_stage_and_exact_runtime_overrides(self):
        data = inventory()
        stage, runtime = data["stage"], data["runtime"]
        stage.update(state="empty", checked_path=STAGE)
        stage["filesystems"]["staging"].update(canonical_path=STAGE, backing=STAGE, host_path=STAGE)
        app = runtime["services"]["circles"]
        override = f"{APP}/docker-compose.override.yml"
        app["compose_files"].append(override)
        runtime["config_paths"].append(override)
        runtime["host_paths"][override] = path_evidence(override)
        data["sources"]["config"]["entries"][override] = {"kind": "file", "device": "8:1", "inode": 99, "bytes": 100}
        users = "/srv/custom/users"
        app["mounts"]["/circles/users"] = {"type": "bind", "source": users, "volume": "", "rw": True}
        del runtime["host_paths"][USER_VOLUME]
        runtime["host_paths"][users] = path_evidence(users)
        data["sources"]["identities"]["mount_source"] = users
        runtime["services"]["qdrant"]["compose_files"].append(override)
        qdrant = runtime["services"]["qdrant"]["mounts"]
        qdrant["/vector-data"] = qdrant.pop("/qdrant/storage")
        runtime["effective"].update(qdrant_storage_root="/vector-data", qdrant_temp_root="/vector-data/temp")
        stage["filesystems"]["qdrant_storage"]["canonical_path"] = "/vector-data"
        stage["filesystems"]["qdrant_temp"].update(canonical_path="/vector-data/temp", host_path=f"{QDRANT_VOLUME}/temp")
        result = dry_run(data, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_dry_run_opens_no_files_sockets_or_processes(self):
        # Load the script and its standard library before auditing the dry-run itself.
        harness = """
import datetime, json, os, pathlib, re, sys
script = pathlib.Path(sys.argv.pop(1))
code = compile(script.read_bytes(), str(script), "exec")

class Unreadable:
    @property
    def buffer(self):
        return self

    def read(self, limit):
        raise OSError("synthetic-secret")

if sys.argv.pop(1) == "unreadable":
    sys.stdin = Unreadable()

def audit(event, args):
    if event == "open" or event.startswith(("os.", "socket.", "subprocess.")):
        raise AssertionError(event)

def stat(*args, **kwargs):
    raise AssertionError("filesystem metadata lookup")

os.stat = os.lstat = os.statvfs = stat
sys.addaudithook(audit)
exec(code, {"__name__": "__main__"})
"""
        symlink = inventory()
        symlink["runtime"]["host_paths"][USER_VOLUME]["no_symlinks"] = False
        cases = [
            ("valid", json.dumps(inventory()).encode(), 0),
            ("malformed", b"{synthetic-secret", 1),
            ("invalid-utf8", b'{"synthetic-secret":"\xff"}', 1),
            ("deep", b"[" * 120_000 + b"]" * 120_000, 1),
            ("symlink", json.dumps(symlink).encode(), 1),
            ("unreadable", b"", 1),
        ]
        for label, payload, status in cases:
            with self.subTest(label=label):
                result = subprocess.run(
                    [sys.executable, "-I", "-B", "-c", harness, str(SCRIPT), label, "--dry-run"],
                    input=payload, capture_output=True, timeout=5,
                )
                self.assertEqual(result.returncode, status, result.stderr)
                if status == 0:
                    self.assertIn(b"Snapshot ID: none.", result.stdout)
                    self.assertEqual(result.stderr, b"")
                else:
                    self.assert_rejected(result)
                    self.assertNotIn(b"synthetic-secret", result.stderr)
                    self.assertNotIn(b"Traceback", result.stderr)

    def test_rejects_unaccounted_nested_data_mount(self):
        data = inventory()
        mounts = data["runtime"]["services"]["circles"]["mounts"]
        mounts["/circles/server"] = {"type": "bind", "source": "/srv/keys", "volume": "", "rw": True}
        data["runtime"]["host_paths"]["/srv/keys"] = path_evidence("/srv/keys")
        self.assert_rejected(dry_run(data, "--dry-run"), "unexpected nested data mount")

    def test_missing_empty_mismatched_or_unsafe_inventory_fails_closed(self):
        cases = [
            (("schema",), 1),
            (("schema",), 2),
            (("reviewed",), False),
            (("runtime", "project"), "staging"),
            (("runtime", "services", "minio"), None),
            (("runtime", "services", "circles", "mounts", "/circles/users"), None),
            (("runtime", "services", "circles", "mounts", "/circles/users", "source"), "/root/kamooni-backup-staging"),
            (("runtime", "services", "circles", "mounts", "/circles/users", "source"), "/srv/../users"),
            (("runtime", "services", "circles", "mounts", "/circles/users", "rw"), False),
            (("runtime", "services", "circles", "compose_files"), [f"{APP}/docker-compose.yml"]),
            (("runtime", "services", "circles", "compose_files"),
             [f"{APP}/docker-compose.production-activation.yml", f"{APP}/docker-compose.yml"]),
            (("runtime", "effective", "identity_root"), "/tmp/users"),
            (("runtime", "effective", "mongo_dbpath"), "/wrong"),
            (("runtime", "effective", "private_bucket"), "circles"),
            (("runtime", "config_paths"), [f"{APP}/.env"]),
            (("sources", "mongo", "topology"), "replica-set"),
            (("sources", "mongo", "collections", "pendingRegistrations"), None),
            (("sources", "mongo", "collections", "circles"), 0),
            (("sources", "identities", "files"), 0),
            (("sources", "app_state", "bytes"), 0),
            (("sources", "minio", "buckets", "circles-private"), None),
            (("sources", "minio", "buckets", "circles-private", "objects"), 0),
            (("sources", "qdrant", "collections"), {"entities": 0}),
            (("sources", "qdrant", "topology"), "distributed"),
            (("sources", "config"), None),
            (("versions", "capture", "mongo_tools"), "100.20.0"),
            (("versions", "restore", "mongo"), "7.0.25"),
            (("versions", "restore", "qdrant"), "2.0.0"),
            (("versions", "restore", "restic"), "0.17.0"),
            (("stage", "state"), "partial"),
            (("stage", "checked_path"), "/private/tmp"),
            (("stage", "filesystems", "staging", "mode"), "0750"),
            (("stage", "filesystems", "staging", "uid"), 1000),
            (("stage", "filesystems", "staging", "uid"), False),
            (("stage", "filesystems", "staging", "free_bytes"), 20 * GIB),
            (("stage", "filesystems", "qdrant_temp", "quota_bytes"), 10 * GIB),
            (("stage", "filesystems", "staging", "free_inodes"), 100),
        ]
        self.check_rejections((path, value, "DRY-RUN REJECTED: ") for path, value in cases)

    def test_rejects_backends_that_do_not_map_to_the_application_route(self):
        cases = []
        reason = "backend endpoint and listener mapping"
        for backend, service in (("mongo", "db"), ("minio", "minio"), ("qdrant", "qdrant")):
            cases.extend((
                (("runtime", "effective", f"{backend}_host"), "elsewhere.invalid", reason),
                (("runtime", "effective", f"{backend}_port"), 1234, reason),
                (("runtime", "services", service, "listener_port"), 1234, reason),
                (("runtime", "services", service, "networks"), ["different_network"], reason),
            ))
        self.check_rejections(cases)

    def test_rejects_swapped_base_backend_mounts_and_named_volume_contradictions(self):
        for change, reason in (
            ("mounts", "backend volume belongs to another service"),
            ("paths", "backend data mount contradicts base Compose"),
            ("destination", "backend data mount contradicts base Compose"),
            ("volume-source", "inconsistent named volume source"),
        ):
            with self.subTest(change=change):
                data = inventory()
                runtime = data["runtime"]
                services = runtime["services"]
                db, minio = services["db"]["mounts"], services["minio"]["mounts"]
                if change == "mounts":
                    db["/data/db"], minio["/data"] = minio["/data"], db["/data/db"]
                elif change == "paths":
                    db["/data/db"]["source"], minio["/data"]["source"] = MINIO_VOLUME, MONGO_VOLUME
                elif change == "destination":
                    db["/another-db"] = db.pop("/data/db")
                    runtime["effective"]["mongo_dbpath"] = "/another-db"
                else:
                    path = "/srv/contradictory-mongo"
                    services["cron"]["mounts"]["/unused"] = {**db["/data/db"], "source": path}
                    runtime["host_paths"][path] = path_evidence(path)
                self.assert_rejected(dry_run(data, "--dry-run"), reason)

    def test_rejects_swapped_base_app_volumes_even_when_inventory_agrees(self):
        for paths_only in (False, True):
            with self.subTest(paths_only=paths_only):
                data = inventory()
                mounts = data["runtime"]["services"]["circles"]["mounts"]
                if paths_only:
                    mounts["/circles"]["source"], mounts["/circles/users"]["source"] = USER_VOLUME, APP_VOLUME
                else:
                    mounts["/circles"], mounts["/circles/users"] = mounts["/circles/users"], mounts["/circles"]
                data["sources"]["identities"]["mount_source"] = APP_VOLUME
                data["sources"]["app_state"]["server_keys"]["mount_source"] = USER_VOLUME
                self.assert_rejected(dry_run(data, "--dry-run"), "app data mount contradicts base Compose")

    def test_rejects_missing_nginx_and_writer_evidence(self):
        self.check_rejections((
            (("runtime", "services", "nginx", "mounts"), {}, "NGINX recovery mounts"),
            (("runtime", "services", "nginx", "mounts", "/etc/letsencrypt", "rw"), True, "NGINX recovery mounts"),
            (("runtime", "services", "nginx", "networks"), [], "service network contradicts base Compose"),
            (("runtime", "services", "nginx", "networks"), ["circles_webnet", "elsewhere"], "service network contradicts base Compose"),
            (("runtime", "services", "cron", "networks"), ["elsewhere"], "service network contradicts base Compose"),
            (("runtime", "services", "cron"), None, "Compose writer disposition"),
            (("runtime", "writers", "cron"), "verified-absent", "Compose writer disposition"),
            (("runtime", "writers", "watchtower"), "gate-and-drain", "Compose writer disposition"),
            (("runtime", "writers", "webhooks"), None, "writer dispositions"),
            (("runtime", "writers", "host_workers"), "unknown", "writer dispositions"),
            (("runtime", "writers", "direct_writers"), None, "writer dispositions"),
        ))
        data = inventory()
        data["runtime"]["config_paths"].remove(f"{APP}/nginx/nginx.conf")
        self.assert_rejected(dry_run(data, "--dry-run"), "runtime config coverage")

    def test_requires_distinct_configuration_artifacts_or_ledger_references(self):
        self.check_rejections((
            (("sources", "config"), {"bytes": 1, "files": 1}, "configuration source inventory"),
            (("sources", "config", "entries", f"{APP}/nginx/nginx.conf"), None, "configuration recovery coverage"),
            (("sources", "config", "entries", ACTIVATION, "inode"), 1, "configuration recovery paths alias the same file"),
            (("sources", "config", "entries", BASE, "kind"), "directory", "configuration recovery file evidence"),
            (("sources", "config", "entries", ROUTING_VERIFIER, "ledger_ref"), "synthetic-activation-ref",
             "distinct configuration recovery reference"),
            (("sources", "config", "entries", ROUTING_VERIFIER, "ledger_ref"), "", "distinct configuration recovery reference"),
            (("sources", "config", "bytes"), 1, "insufficient configuration export allowance"),
            (("sources", "config", "export_inodes"), 1, "insufficient configuration export allowance"),
        ))

    def test_rejects_unaccounted_or_unsafe_compose_overrides(self):
        for override, declare, reason in (
            (f"{APP}/docker-compose.override.yml", False, "Compose file provenance"),
            ("/tmp/docker-compose.override.yml", False, "Compose file provenance"),
            ("/tmp/docker-compose.override.yml", True, "runtime config outside supported roots"),
            (f"{STAGE}/docker-compose.override.yml", True, "runtime config outside supported roots"),
            (f"{APP}/../docker-compose.override.yml", True, "runtime config coverage"),
        ):
            with self.subTest(override=override, declared=declare):
                data = inventory()
                runtime = data["runtime"]
                runtime["services"]["circles"]["compose_files"].append(override)
                if declare:
                    runtime["config_paths"].append(override)
                    runtime["host_paths"][override] = path_evidence(override)
                self.assert_rejected(dry_run(data, "--dry-run"), reason)

    def test_rejects_missing_or_inconsistent_onboarding_and_identity_evidence(self):
        self.check_rejections((
            (("sources", "mongo", "collections", "registrationRouting"), None, "MongoDB coverage"),
            (("sources", "mongo", "collections", "onboardingWatchdogState"), 0, "MongoDB coverage"),
            (("sources", "mongo", "collections", FINALIZATION), None, "MongoDB coverage"),
            (("runtime", "effective", "watchdog_users_root"), "/wrong/users", "watchdog credential root"),
            (("sources", "mongo", "onboarding", "routing_mode"), "paused", "deployment mismatch"),
            (("sources", "mongo", "onboarding", "deployment_id"), f"{DEPLOYMENT}-other", "deployment mismatch"),
            (("sources", "mongo", "onboarding", "watchdog_deployment_id"), f"{DEPLOYMENT}-other", "deployment mismatch"),
            (("sources", "mongo", "onboarding", "active_leases", PROVISIONING), 3, "onboarding lease inventory"),
            (("sources", "mongo", "onboarding", "active_leases", FINALIZATION), None, "onboarding lease inventory"),
            (("sources", "identities", "mount_source"), APP_VOLUME, "user credential volume or file coverage"),
            (("sources", "identities", "credential_files", "salt.bin"), 999, "user credential volume or file coverage"),
            (("sources", "identities", "layout_verified"), False, "user credential volume or file coverage"),
            (("sources", "identities", "bytes"), 1, "user credential volume or file coverage"),
            (("sources", "identities", "bytes"), 320 * 1000 - 1, "user credential volume or file coverage"),
            (("sources", "app_state"), {"bytes": 1, "files": 1}, "app state inventory"),
            (("sources", "app_state", "server_keys", "mount_source"), USER_VOLUME, "server signing key volume or file coverage"),
            (("sources", "app_state", "server_keys", "files", "privateKey.pem"), None, "server signing key volume or file coverage"),
        ))

    def test_requires_bytes_for_serialized_complete_did_credentials(self):
        data = inventory()
        identities = data["sources"]["identities"]
        count = identities["credential_sets"]
        for too_small in (320 * count, 3504 * count - 1):
            with self.subTest(bytes=too_small):
                identities["bytes"] = too_small
                self.assert_rejected(dry_run(data, "--dry-run"), "user credential volume or file coverage")
        identities["bytes"] = 3504 * count
        result = dry_run(data, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_or_contradictory_filesystem_evidence(self):
        self.check_rejections((
            (("runtime", "host_paths", USER_VOLUME), None, "host path evidence coverage"),
            (("runtime", "host_paths", f"{APP}/.env", "canonical_path"), f"{STAGE}/.env", "canonical path or permission evidence"),
            (("runtime", "host_paths", USER_VOLUME, "no_symlinks"), False, "canonical path or permission evidence"),
            (("runtime", "effective", "qdrant_snapshot_root"), "/qdrant/storage", "Qdrant scratch or snapshot overlaps storage"),
            (("runtime", "effective", "qdrant_temp_root"), "/qdrant/storage", "Qdrant scratch or snapshot overlaps storage"),
            (("stage", "private_ancestry"), False, "staging must be absent under root-only parent or empty and root-only"),
            (("stage", "filesystems", "staging", "no_symlinks"), False, "canonical path or permission evidence"),
            (("stage", "filesystems", "qdrant_temp"), None, "filesystem coverage"),
            (("stage", "filesystems", "qdrant_temp", "quotas_checked"), False, "missing filesystem quota review"),
            (("stage", "filesystems", "qdrant_temp", "free_inodes"), 99_999, "inconsistent filesystem capacity"),
            (("stage", "filesystems", "qdrant_temp", "device"), "8:3", "inconsistent Qdrant backing device"),
            (("stage", "filesystems", "qdrant_snapshot", "backing"), QDRANT_VOLUME, "filesystem backing or device mismatch"),
            (("stage", "filesystems", "qdrant_temp", "host_path"), QDRANT_VOLUME, "filesystem backing or device mismatch"),
        ))
        data = inventory()
        data["runtime"]["services"]["qdrant"]["writable_layer"] = None
        del data["runtime"]["host_paths"][QDRANT_LAYER]
        self.assert_rejected(dry_run(data, "--dry-run"), "missing Qdrant writable layer evidence")

    def test_qdrant_snapshot_bind_must_be_writable(self):
        data = inventory()
        runtime = data["runtime"]
        qdrant = runtime["services"]["qdrant"]
        snapshots = "/srv/qdrant-snapshots"
        qdrant["writable_layer"] = None
        mount = {"type": "bind", "source": snapshots, "volume": "", "rw": True}
        qdrant["mounts"]["/qdrant/snapshots"] = mount
        del runtime["host_paths"][QDRANT_LAYER]
        runtime["host_paths"][snapshots] = path_evidence(snapshots)
        data["stage"]["filesystems"]["qdrant_snapshot"].update(backing=snapshots, host_path=snapshots, device="8:3")
        result = dry_run(data, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        mount["rw"] = False
        self.assert_rejected(dry_run(data, "--dry-run"), "Qdrant filesystem mount is read-only")

    def test_resolves_qdrant_mount_suffixes_before_checking_host_overlap(self):
        for backing, suffix, device, reason in (
            ("/var/lib/docker/volumes", "circles_mongo/_data/archive", "8:2", "Qdrant filesystem overlaps a protected source"),
            ("/var/lib/docker/volumes", "circles_minio/_data/archive", "8:2", "Qdrant filesystem overlaps a protected source"),
            ("/var/lib/docker/volumes", "circles_circles_users/_data/archive", "8:2", "Qdrant filesystem overlaps a protected source"),
            ("/var/lib/docker/volumes", "circles_circles/_data/archive", "8:2", "Qdrant filesystem overlaps a protected source"),
            ("/etc", "letsencrypt/archive", "8:1", "Qdrant filesystem overlaps a protected source"),
            (APP, "src/archive", "8:1", "Qdrant filesystem overlaps a protected source"),
            (QDRANT_VOLUME, "snapshots_temp/archive", "8:2", "Qdrant snapshot and temp host paths overlap"),
            (QDRANT_VOLUME, "other", "8:2", "Qdrant scratch or snapshot host path overlaps storage"),
            ("/var/lib/docker/volumes", "unused/archive", "8:2", None),
        ):
            with self.subTest(backing=backing, suffix=suffix):
                data = inventory()
                runtime = data["runtime"]
                qdrant = runtime["services"]["qdrant"]
                qdrant["mounts"]["/export"] = {"type": "bind", "source": backing, "volume": "", "rw": True}
                runtime["host_paths"][backing] = path_evidence(backing)
                path = f"/export/{suffix}"
                runtime["effective"]["qdrant_snapshot_root"] = path
                data["stage"]["filesystems"]["qdrant_snapshot"] = filesystem(path, backing, device, f"{backing}/{suffix}")
                result = dry_run(data, "--dry-run")
                if reason:
                    self.assert_rejected(result, reason)
                else:
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_qdrant_descendant_mounts_on_protected_or_unbudgeted_sources(self):
        protected = "Qdrant filesystem overlaps a protected source"
        for role, child, source, writable, reason in (
            ("snapshot", "/entities", MONGO_VOLUME, True, protected),
            ("snapshot", "/entities", "/etc/letsencrypt", False, protected),
            ("temp", "/work", USER_VOLUME, False, protected),
            ("temp", "/work", f"{MINIO_VOLUME}/archive", True, protected),
            ("snapshot", "/entities", "/srv/qdrant-child", True, "missing Qdrant filesystem capacity for nested mount"),
            ("snapshot", "-sibling", "/srv/qdrant-child", True, None),
        ):
            with self.subTest(role=role, child=child, source=source, writable=writable):
                data = inventory()
                runtime = data["runtime"]
                mounts = runtime["services"]["qdrant"]["mounts"]
                root = runtime["effective"]["qdrant_snapshot_root"]
                if role == "temp":
                    root = "/qdrant/temp"
                    runtime["effective"]["qdrant_temp_root"] = root
                    data["stage"]["filesystems"]["qdrant_temp"] = filesystem(
                        root, QDRANT_LAYER, "8:1", QDRANT_LAYER + root,
                    )
                mounts[root + child] = {"type": "bind", "source": source, "volume": "", "rw": writable}
                runtime["host_paths"].setdefault(source, path_evidence(source))
                result = dry_run(data, "--dry-run")
                if reason:
                    self.assert_rejected(result, reason)
                else:
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_requires_independent_current_minio_bytes_in_export_allowance(self):
        current = ("sources", "minio", "buckets", "circles", "current_bytes")
        self.check_rejections((
            (current, None, "MinIO bucket size and history inventory"),
            (current, -1, "MinIO current object byte evidence"),
            (("sources", "minio", "buckets", "circles", "objects"), 0, "MinIO current object byte evidence"),
            (("sources", "minio", "bytes"), 1, "insufficient MinIO current export allowance"),
        ))
        data = inventory()
        minio = data["sources"]["minio"]
        # Current objects may be zero-length, and history bytes have their own allowance.
        minio["buckets"]["circles-verification"]["current_bytes"] = 0
        minimum = sum(bucket["current_bytes"] for bucket in minio["buckets"].values())
        minio.update(bytes=minimum - 1, history_bytes=minio["history_bytes"] + 1)
        self.assert_rejected(dry_run(data, "--dry-run"), "insufficient MinIO current export allowance")
        minio["bytes"] = minimum
        result = dry_run(data, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_or_unbudgeted_minio_history_and_qdrant_scratch(self):
        self.check_rejections((
            (("sources", "minio", "buckets", "circles", "delete_markers"), None, "MinIO bucket size and history inventory"),
            (("sources", "minio", "buckets", "circles", "versioning"), "never-enabled", "MinIO versioning contradiction"),
            (("sources", "minio", "history_bytes"), 0, "insufficient MinIO history or export allowance"),
            (("sources", "minio", "history_bytes"), 3, "insufficient MinIO history or export allowance"),
            (("sources", "minio", "history_bytes"), 2048 + 3 * 64 - 1, "insufficient MinIO history or export allowance"),
            (("sources", "minio", "buckets", "circles-private", "version_bytes"), 100, "MinIO version size contradiction"),
            (("sources", "minio", "export_inodes"), 513, "insufficient MinIO history or export allowance"),
            (("sources", "qdrant", "scratch_inodes"), None, "Qdrant inventory"),
            (("sources", "qdrant", "scratch_inodes"), 0, "insufficient Qdrant scratch allowance"),
            (("sources", "qdrant", "scratch_bytes"), 4 * GIB - 1, "insufficient Qdrant scratch allowance"),
        ))

    def test_accepts_a_versioned_bucket_with_history_and_no_current_objects(self):
        data = inventory()
        bucket = data["sources"]["minio"]["buckets"]["circles"]
        bucket.update(objects=0, current_bytes=0)
        for versions, version_bytes in ((2, 2048), (0, 0)):
            with self.subTest(versions=versions):
                bucket.update(versions=versions, version_bytes=version_bytes)
                result = dry_run(data, "--dry-run")
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_matching_fictitious_versions_and_missing_application_recovery(self):
        for component, version, reason in (
            ("qdrant", "999.0.0", "unsupported tool or service version"),
            ("qdrant", "1.999.999", "unsupported tool or service version"),
            ("minio", "RELEASE.9999-99-99T99-99-99Z", "invalid MinIO release timestamp"),
            ("minio", "RELEASE.9999-01-01T00-00-00Z", "implausible MinIO release date"),
            ("minio", "RELEASE.0001-01-01T00-00-00Z", "implausible MinIO release date"),
            ("mongo", "7.0.026", "unsupported tool or service version"),
            ("mongo", "7.0.999999", "unsupported tool or service version"),
        ):
            with self.subTest(component=component):
                data = inventory()
                for side in data["versions"].values():
                    side[component] = version
                self.assert_rejected(dry_run(data, "--dry-run"), reason)
        self.check_rejections((
            (("runtime", "application_recovery", "image_id"), "sha256:" + "0" * 64, "tested application image recovery"),
            (("runtime", "application_recovery", "git_sha"), "0" * 40, "tested application image recovery"),
            (("runtime", "application_recovery", "source"), "circles-circles:latest", "tested application image recovery"),
            (("runtime", "application_recovery", "source_digest"), "latest", "tested application image recovery"),
            (("runtime", "application_recovery", "tested"), False, "tested application image recovery"),
            (("runtime", "application_recovery", "test_ref"), None, "application image recovery"),
            (("runtime", "application_recovery", "test_result"), None, "application image recovery"),
            (("runtime", "application_recovery", "test_result", "image_id"), "sha256:" + "c" * 64, "application image test result mismatch"),
            (("runtime", "application_recovery", "test_result", "git_sha"), "c" * 40, "application image test result mismatch"),
            (("runtime", "application_recovery", "source_digest"), "sha256:" + "c" * 64, "application image test result mismatch"),
        ))

    def test_budget_includes_shared_qdrant_scratch_and_reserve(self):
        data = inventory()
        filesystems = data["stage"]["filesystems"]
        sources = data["sources"]
        budget = 2 * (sum(source["bytes"] for source in sources.values()) + sources["minio"]["history_bytes"])
        budget += sources["qdrant"]["scratch_bytes"] + 10 * GIB
        exports = 5 + sources["minio"]["export_inodes"] + sources["config"]["export_inodes"]
        inode_budget = 2 * exports + sources["qdrant"]["scratch_inodes"] + 4096
        sources["mongo"]["collections"]["circles"] = 1_000_000
        for fs in filesystems.values():
            fs.update(free_bytes=budget, free_inodes=inode_budget)
        result = dry_run(data, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        for name, minimum, reason in (
            ("quota_bytes", budget, "insufficient disk space"),
            ("quota_inodes", inode_budget, "insufficient filesystem inodes"),
        ):
            for role in filesystems:
                with self.subTest(role=role, quota=name):
                    low_space = deepcopy(data)
                    low_space["stage"]["filesystems"][role][name] = minimum - 1
                    self.assert_rejected(dry_run(low_space, "--dry-run"), reason)

    def test_rejects_malformed_input_and_snapshot_or_secret_fields_without_echo(self):
        duplicate_mount_key = json.dumps(inventory()).replace('"rw": true', '"rw": true, "rw": false', 1)
        invalid = ['{"schema":0,"schema":3}', duplicate_mount_key, "x" * (256 * 1024 + 1), "{synthetic-secret", "", "[]"]
        for key in ("snapshot_id", "complete", "synthetic-secret-field"):
            data = inventory()
            data[key] = "synthetic-secret"
            invalid.append(data)
        for index, payload in enumerate(invalid):
            with self.subTest(index=index):
                result = dry_run(payload, "--dry-run")
                self.assert_rejected(result)
                self.assertNotIn(b"synthetic-secret", result.stderr)
                self.assertNotIn(b"Traceback", result.stderr)

    def test_requires_explicit_dry_run_and_rejects_write_modes(self):
        for args in ((), ("--capture",), ("--dry-run", "--upload"), ("--check-staged",)):
            with self.subTest(args=args):
                result = dry_run("", *args)
                self.assertEqual(result.returncode, 2, result)
                self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
