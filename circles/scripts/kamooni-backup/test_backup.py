"""Run as root inside a disposable, network-isolated Ubuntu container.

Requires mongod, mongodump, mongorestore, minio, restic 0.16.4, boto3 and pymongo.
MongoDB, MinIO and the S3 Restic repository all use fresh loopback services.
Docker mount discovery and failure mail use stubs. Fault tests inject targeted
filesystem changes and a failed S3 DELETE. Retention uses synthetic dates.
"""
from datetime import datetime, timedelta
import gzip
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tarfile
import tempfile
from threading import Thread
import time
import unittest

import boto3
from bson import decode_all
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError
from pymongo import MongoClient
from pymongo.errors import OperationFailure

SCRIPT = Path(__file__).with_name("kamooni-backup.sh").resolve()
BUCKETS = ("circles", "circles-private", "circles-verification", "other-bucket")
MONGO_URI = "mongodb://root:synthetic-password@127.0.0.1:27117/?authSource=admin"
DUMP_URI = "mongodb://backup:synthetic-backup-password@127.0.0.1:27117/?authSource=admin"
S3_KEYS = {"aws_access_key_id": "synthetic-access", "aws_secret_access_key": "synthetic-secret"}
ENV_LINK = Path("/root/circles/circles/circles/.env")
ENV_TARGET = Path("/home/ubuntu/migration-export/.env")
BACKUP_LOG = Path("/var/log/kamooni-backup/backup.log")


def retry(action):
    for _ in range(100):
        try:
            return action()
        except Exception:
            time.sleep(0.1)
    return action()


class BackupTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="synthetic-kamooni-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.config = self.root / "backup-config"
        self.config.mkdir(mode=0o700)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.env = {
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "HOME": str(self.root),
            "KAMOONI_BACKUP_CONFIG_DIR": str(self.config),
            "TEST_ROOT": str(self.root),
            "AWS_EC2_METADATA_DISABLED": "true",
        }
        self.restic = shutil.which("restic")
        self.mongodump = shutil.which("mongodump")
        self.app_data, self.user_data, self.minio_data = [
            self.root / name / "_data" for name in
            ("circles_circles", "circles_circles_users", "circles_minio")
        ]
        for volume in (self.app_data, self.user_data, self.minio_data):
            volume.mkdir(parents=True)
        (self.app_data / "server").mkdir()
        (self.app_data / "users").mkdir()
        (self.app_data / "users" / "shadowed").touch()
        for name in ("privateKey.pem", "publicKey.pem"):
            (self.app_data / "server" / name).write_text(f"synthetic-{name}")
        user = self.user_data / "synthetic-did"
        user.mkdir()
        for name in ("publicKey.pem", "privateKey.pem.enc", "iv.bin", "salt.bin"):
            (user / name).write_text(f"synthetic-{name}")
        self.user_key = user / "privateKey.pem.enc"
        self.user_key.chmod(0o640)
        os.chown(self.user_key, 1234, 4321)

        self.app_env = self.root / "app.env"
        self.app_env.write_text("APP_SECRET=synthetic-app-secret\n")
        self.app_env.chmod(0o600)
        self.configure_sources(self.app_env)
        self.secret("mongo.yaml", f"uri: {DUMP_URI}\n")
        self.secret("restic.pass", "synthetic-restic-password\n")
        self.secret("postmark.header", "X-Postmark-Server-Token: synthetic-alert-token\n")
        self.secret("postmark.json", '{"To":"backup@example.invalid"}\n')
        self.repo_env = {
            "RESTIC_REPOSITORY": "s3:http://127.0.0.1:19002/synthetic-repo",
            "RESTIC_PASSWORD_FILE": str(self.config / "restic.pass"),
            "AWS_ACCESS_KEY_ID": S3_KEYS["aws_access_key_id"],
            "AWS_SECRET_ACCESS_KEY": S3_KEYS["aws_secret_access_key"],
        }
        self.secret("restic.env", "".join(f"{key}={value}\n" for key, value in self.repo_env.items()
                                         if key != "RESTIC_PASSWORD_FILE"))

        self.stub("docker", """
[[ $1 == --host && $2 == unix:///var/run/docker.sock ]]
shift 2
case "$1" in
    ps)
        case "$*" in
            *service=circles) echo 1234567890ab ;;
            *service=minio) echo 2345678901ab ;;
            *service=db) echo 3456789012ab ;;
            *) exit 1 ;;
        esac ;;
    inspect)
        case "$*" in
            *circles_circles_users*1234567890ab) echo "$TEST_ROOT/circles_circles_users/_data" ;;
            *circles_circles*1234567890ab) echo "$TEST_ROOT/circles_circles/_data" ;;
            *circles_minio*2345678901ab) echo "$TEST_ROOT/circles_minio/_data" ;;
            *Image*2345678901ab) echo sha256:test-minio ;;
            *Image*3456789012ab) echo sha256:test-mongo ;;
            *) exit 1 ;;
        esac ;;
    image) printf '%s\n' "${!#}" ;;
    exec) echo gitSha=synthetic-test-sha ;;
    *) exit 1 ;;
esac
""")

        _, mongo = self.mongo(27117, auth=True)
        mongo.admin.command("createUser", "root", pwd="synthetic-password", roles=["root"])
        mongo.close()
        with MongoClient(MONGO_URI) as mongo:
            mongo.admin.command("createUser", "backup", pwd="synthetic-backup-password", roles=["backup"])
            mongo.admin.command("createRole", "synthetic-role", privileges=[],
                                roles=[{"role": "read", "db": "other_db"}])
            mongo.admin.command("createUser", "synthetic-user", pwd="synthetic-user-password",
                                roles=["synthetic-role"])
            mongo.circles.circles.insert_one({"_id": "synthetic-did", "value": 1})
            mongo.circles.circles.create_index("value")
            mongo.other_db.other.insert_one({"_id": "extra"})

        source = self.minio(self.minio_data, 19001)
        for bucket in BUCKETS:
            source.create_bucket(Bucket=bucket)
            source.put_object(Bucket=bucket, Key="owner/object", Body=bucket.encode())
        source.put_bucket_versioning(Bucket="other-bucket", VersioningConfiguration={"Status": "Enabled"})
        self.version = source.put_object(Bucket="other-bucket", Key="versioned", Body=b"old")["VersionId"]
        source.put_object(Bucket="other-bucket", Key="versioned", Body=b"new")
        source.put_bucket_policy(Bucket="circles", Policy=json.dumps({
            "Version": "2012-10-17", "Statement": [{
                "Effect": "Allow", "Principal": "*", "Action": ["s3:GetObject"],
                "Resource": ["arn:aws:s3:::circles/*"],
            }],
        }))
        self.minio(self.root / "repo-drive", 19002).create_bucket(Bucket="synthetic-repo")
        self.run_restic("init")

    def secret(self, name, value):
        path = self.config / name
        path.write_text(value)
        path.chmod(0o600)

    def configure_sources(self, *paths):
        self.secret("backup.conf", f"MINIO_BUCKETS=({' '.join(BUCKETS[:3])})\n"
                    f"CONFIG_PATHS=({shlex.join(map(str, paths))})\n")

    def stub(self, name, script):
        path = self.bin / name
        path.write_text("#!/bin/bash\nset -eu\n" + script)
        path.chmod(0o700)

    def start(self, *args, env=None):
        p = subprocess.Popen(args, env=env or self.env, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
        self.addCleanup(p.wait, 10)
        self.addCleanup(p.terminate)
        return p

    def mongo(self, port, *, auth=False):
        path = self.root / f"mongo{port}"
        path.mkdir(exist_ok=True)
        args = ["mongod", "--bind_ip", "127.0.0.1", "--port", str(port), "--dbpath", str(path)]
        process = self.start(*args, "--auth" if auth else "--noauth")
        client = MongoClient(f"mongodb://127.0.0.1:{port}/", serverSelectionTimeoutMS=500)
        self.addCleanup(client.close)
        retry(lambda: client.admin.command("ping"))
        return process, client

    def s3(self, port, *, signed=True):
        return boto3.client("s3", endpoint_url=f"http://127.0.0.1:{port}", region_name="us-east-1",
                            config=Config(signature_version="s3v4" if signed else UNSIGNED,
                                          connect_timeout=1, retries={"max_attempts": 0}),
                            **S3_KEYS)

    def minio(self, path, port):
        path.mkdir(exist_ok=True)
        self.start("minio", "server", "--address", f"127.0.0.1:{port}",
                   "--console-address", f"127.0.0.1:{port + 10}", str(path), env={
                       **self.env,
                       "MINIO_ROOT_USER": S3_KEYS["aws_access_key_id"],
                       "MINIO_ROOT_PASSWORD": S3_KEYS["aws_secret_access_key"],
                       "MINIO_BROWSER": "off",
                   })
        client = self.s3(port)
        retry(client.list_buckets)
        return client

    def run_restic(self, *args):
        return subprocess.check_output([self.restic, *args], env=self.env | self.repo_env, text=True)

    def snapshots(self, *args):
        return json.loads(self.run_restic("snapshots", "--json", *args)) or []

    def backup(self, *args, server_pair_absent=False):
        log_size = BACKUP_LOG.stat().st_size if BACKUP_LOG.exists() else 0
        result = subprocess.run(["bash", str(SCRIPT), *args], env=self.env,
                                capture_output=True, text=True, timeout=120)
        self.assertEqual(list(Path("/var/tmp").glob("kamooni-*")), [])
        self.assertEqual(result.stdout, "")
        self.assertNotIn("synthetic-", result.stderr)
        for line in result.stderr.splitlines():
            self.assertRegex(line, r"^Kamooni backup (?:started kamooni-[\w.]+|"
                             r"stored kamooni-[\w.]+ as [a-f0-9]{64}|succeeded kamooni-[\w.]+|"
                             r"failed \([a-zA-Z0-9 -]+\)|failure email sent)\.$")
        for path, mode in ((BACKUP_LOG, 0o600), (BACKUP_LOG.parent, 0o700)):
            info = path.stat()
            self.assertEqual((info.st_uid, info.st_gid, info.st_mode & 0o777), (0, 0, mode))
        with BACKUP_LOG.open() as log:
            log.seek(log_size)
            messages = log.read()
        if server_pair_absent:
            start = result.stderr.splitlines()[0]
            run_id = start.removeprefix("Kamooni backup started ").removesuffix(".")
            warning = f"Kamooni backup warning for {run_id}: server DID signing key pair absent.\n"
            self.assertIn(warning, messages)
            messages = messages.replace(warning, "", 1)
        self.assertEqual(messages, result.stderr)
        return result

    def test_complete_backup_and_restore(self):
        for path in (ENV_LINK, ENV_TARGET):
            self.assertFalse(path.exists() or path.is_symlink())
            path.parent.mkdir(parents=True, exist_ok=True)
            self.addCleanup(path.unlink, missing_ok=True)
        with ENV_TARGET.open("x") as file:
            file.write("APP_SECRET=synthetic-linked-env-secret\n")
        ENV_TARGET.chmod(0o600)
        ENV_LINK.symlink_to(ENV_TARGET)
        self.configure_sources(self.app_env, ENV_LINK)
        result = self.backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("backup succeeded", result.stderr)
        snapshot, = self.snapshots()
        self.assertIn("kamooni-daily", snapshot["tags"])
        self.assertNotIn("kamooni-pending", snapshot["tags"])
        target = self.root / "restore"
        self.run_restic("restore", "--verify", "--target", str(target), snapshot["id"])
        backup = target / "set"
        self.assertIn((backup / "run-id").read_text().strip(), snapshot["tags"])
        self.assertEqual({p.name for p in backup.iterdir()},
                         {"app-data.tar", "user-data.tar", "minio.tar", "config.tar",
                          "manifest.txt", "mongo", "run-id", "runtime.txt"})
        self.assertEqual((backup / "manifest.txt").read_text(), "server_did_signing_pair=present\n")
        self.assertIn("gitSha=synthetic-test-sha", (backup / "runtime.txt").read_text())

        restore_process, mongo = self.mongo(27118)
        subprocess.run(["mongorestore", "--quiet", "--host", "127.0.0.1:27118", "--gzip",
                        "--stopOnError", str(backup / "mongo")], env=self.env, check=True)
        mongo.close()
        restore_process.terminate()
        self.assertEqual(restore_process.wait(timeout=10), 0)
        _, anonymous_mongo = self.mongo(27118, auth=True)
        with self.assertRaises(OperationFailure) as error:
            anonymous_mongo.other_db.other.find_one()
        self.assertEqual(error.exception.code, 13)
        with MongoClient(MONGO_URI.replace(":27117", ":27118")) as mongo:
            self.assertEqual(mongo.circles.circles.find_one()["_id"], "synthetic-did")
            self.assertIn("value_1", mongo.circles.circles.index_information())
            self.assertEqual(mongo.admin.command("usersInfo", "synthetic-user")["users"][0]["roles"],
                             [{"role": "synthetic-role", "db": "admin"}])
            roles = mongo.admin.command("rolesInfo", "synthetic-role")["roles"]
            self.assertEqual(roles[0]["roles"], [{"role": "read", "db": "other_db"}])
        with MongoClient(DUMP_URI.replace(":27117", ":27118")) as mongo:
            roles = mongo.admin.command("connectionStatus")["authInfo"]["authenticatedUserRoles"]
            self.assertEqual(roles, [{"role": "backup", "db": "admin"}])
        for password, code in (("synthetic-user-password", 13), ("synthetic-wrong-password", 18)):
            with MongoClient(f"mongodb://synthetic-user:{password}@127.0.0.1:27118/"
                             "?authSource=admin") as user:
                if code == 13:
                    self.assertEqual(user.other_db.other.find_one()["_id"], "extra")
                with self.assertRaises(OperationFailure) as error:
                    user.circles.circles.find_one()
                self.assertEqual(error.exception.code, code)

        for name in ("app-data", "user-data", "minio", "config"):
            (target / name).mkdir()
            subprocess.run(["tar", "--numeric-owner", "--acls", "--xattrs", "-xpf",
                            str(backup / f"{name}.tar"), "-C", str(target / name)],
                           env=self.env, check=True)
        key = target / "user-data" / self.user_key.relative_to(self.user_data)
        self.assertEqual(key.read_bytes(), self.user_key.read_bytes())
        self.assertEqual((key.stat().st_uid, key.stat().st_gid, key.stat().st_mode & 0o777),
                         (1234, 4321, 0o640))
        self.assertEqual((target / "app-data/server/privateKey.pem").read_text(), "synthetic-privateKey.pem")
        self.assertFalse((target / "app-data/users").exists())
        self.assertEqual((target / "config" / self.root.relative_to("/") / "app.env").read_text(),
                         "APP_SECRET=synthetic-app-secret\n")
        restored_link = target / "config" / ENV_LINK.relative_to("/")
        restored_env = target / "config" / ENV_TARGET.relative_to("/")
        self.assertEqual(restored_link.readlink(), ENV_TARGET)
        self.assertEqual(restored_env.read_text(), "APP_SECRET=synthetic-linked-env-secret\n")
        self.assertEqual(restored_env.stat().st_mode & 0o777, 0o600)
        restored = self.minio(target / "minio", 19003)
        self.assertEqual({b["Name"] for b in restored.list_buckets()["Buckets"]}, set(BUCKETS))
        for bucket in BUCKETS:
            self.assertEqual(restored.get_object(Bucket=bucket, Key="owner/object")["Body"].read(),
                             bucket.encode())
        self.assertEqual(restored.get_object(Bucket="other-bucket", Key="versioned",
                                            VersionId=self.version)["Body"].read(), b"old")
        anonymous = self.s3(19003, signed=False)
        self.assertEqual(anonymous.get_object(Bucket="circles", Key="owner/object")["Body"].read(), b"circles")
        for bucket in ("circles-private", "circles-verification"):
            with self.assertRaises(ClientError) as error:
                anonymous.get_object(Bucket=bucket, Key="owner/object")
            self.assertEqual(error.exception.response["ResponseMetadata"]["HTTPStatusCode"], 403)

    def test_missing_server_signing_pair(self):
        keys = [self.app_data / "server" / name for name in ("privateKey.pem", "publicKey.pem")]
        for key in keys:
            key.unlink()
        (self.app_data / "server" / "app-state").write_bytes(b"app state")
        server_did = "synthetic-historical-server-digest"
        with MongoClient(MONGO_URI) as mongo:
            mongo.circles.serverSettings.insert_one({"did": server_did})

        result = self.backup(server_pair_absent=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        snapshot, = self.snapshots()
        self.assertIn("kamooni-daily", snapshot["tags"])
        self.assertNotIn("kamooni-pending", snapshot["tags"])
        target = self.root / "restore"
        self.run_restic("restore", "--verify", "--target", str(target), snapshot["id"])
        backup = target / "set"
        self.assertEqual((backup / "manifest.txt").read_text(), "server_did_signing_pair=absent\n")
        with tarfile.open(backup / "app-data.tar") as archive:
            self.assertEqual(archive.extractfile("./server/app-state").read(), b"app state")
            for key in keys:
                self.assertNotIn(f"./server/{key.name}", archive.getnames())
                self.assertFalse(key.exists())
        with tarfile.open(backup / "user-data.tar") as archive:
            self.assertEqual(archive.extractfile(f"./{self.user_key.relative_to(self.user_data)}").read(),
                             self.user_key.read_bytes())
        with gzip.open(backup / "mongo/circles/serverSettings.bson.gz", "rb") as dump:
            settings, = decode_all(dump.read())
            self.assertEqual(settings["did"], server_did)
        self.assertTrue((backup / "minio.tar").is_file())
        self.assertTrue((backup / "config.tar").is_file())

    def assert_failure(self, step, *, daily_ids=()):
        result = self.backup()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"failed ({step})", result.stderr)
        self.assertNotIn("succeeded", result.stderr)
        self.assertEqual({s["id"] for s in self.snapshots("--tag", "kamooni-daily")}, set(daily_ids))

    def test_incomplete_mongo(self):
        self.stub("mongodump", f"""
{shlex.quote(self.mongodump)} "$@"
truncate -s -6 set/mongo/other_db/other.bson.gz
echo synthetic-mongo-secret >&2
""")
        self.assert_failure("dump and validate MongoDB")
        self.assertEqual(self.snapshots(), [])

    def test_missing_minio_bucket(self):
        (self.minio_data / "circles-verification").rename(self.root / "missing-bucket")
        self.assert_failure("check single-drive MinIO data")
        self.assertEqual(self.snapshots(), [])

    def test_missing_user_did_key(self):
        self.user_key.unlink()
        self.assert_failure("check DID data")
        self.assertEqual(self.snapshots(), [])

    def test_missing_app_data_volume(self):
        self.app_data.rename(self.root / "missing-app-data")
        self.assert_failure("check running volumes")
        self.assertEqual(self.snapshots(), [])

    def test_missing_required_config_path(self):
        self.app_env.unlink()
        self.assert_failure("read backup source configuration")
        self.assertEqual(self.snapshots(), [])

    def test_bucket_disappears_after_initial_check(self):
        self.stub("mongodump", f"""
{shlex.quote(self.mongodump)} "$@"
mv "$TEST_ROOT/circles_minio/_data/circles-verification" "$TEST_ROOT/missing-bucket"
""")
        self.assert_failure("verify required buckets in MinIO archive")
        self.assertTrue((self.root / "missing-bucket").is_dir())
        self.assertEqual(self.snapshots(), [])

    def test_unapproved_env_symlinks(self):
        ENV_LINK.parent.mkdir(parents=True, exist_ok=True)
        ENV_TARGET.parent.mkdir(parents=True, exist_ok=True)
        self.assertFalse(ENV_LINK.exists() or ENV_LINK.is_symlink())
        self.assertFalse(ENV_TARGET.exists() or ENV_TARGET.is_symlink())
        self.addCleanup(ENV_LINK.unlink, missing_ok=True)
        self.addCleanup(ENV_TARGET.unlink, missing_ok=True)
        self.configure_sources(ENV_LINK)
        ENV_LINK.symlink_to(self.app_env)
        self.assert_failure("read backup source configuration")
        ENV_LINK.unlink()
        ENV_LINK.symlink_to(ENV_TARGET)
        self.assert_failure("read backup source configuration")
        ENV_TARGET.symlink_to(self.app_env)
        self.assert_failure("read backup source configuration")
        ENV_TARGET.unlink()

        # The target's parent must also resolve to the exact approved path.
        parent = ENV_TARGET.parent
        redirected = parent.with_name(parent.name + "\n")
        redirected.mkdir()
        self.addCleanup(shutil.rmtree, redirected)
        (redirected / ENV_TARGET.name).write_text("synthetic-unapproved-target\n")
        parent.rmdir()
        parent.symlink_to(redirected)
        try:
            self.assert_failure("read backup source configuration")
        finally:
            parent.unlink()
            parent.mkdir()

    def test_restic_partial_failure(self):
        self.assertEqual(self.backup().returncode, 0)
        previous, = self.snapshots()
        self.stub("restic", f"""
if [[ $1 == --json && $2 == backup ]]; then
    rm set/minio.tar
    {shlex.quote(self.restic)} "$@"
    echo synthetic-restic-secret >&2
    exit 3
fi
exec {shlex.quote(self.restic)} "$@"
""")
        self.assert_failure("upload complete set to Restic", daily_ids=[previous["id"]])
        snapshot, = self.snapshots("--tag", "kamooni-pending")
        self.assertIn("kamooni-pending", snapshot["tags"])

    def test_pending_removal_failure_preserves_previous_good_id(self):
        self.assertEqual(self.backup().returncode, 0)
        previous, = self.snapshots()
        deleted = []

        class DenySnapshotDelete(BaseHTTPRequestHandler):
            def forward(self):
                if self.command == "DELETE" and self.path.startswith("/synthetic-repo/snapshots/"):
                    deleted.append(self.path.rsplit("/", 1)[1])
                    payload = b"<Error><Code>AccessDenied</Code><Message>synthetic-denial</Message></Error>"
                    self.send_response(403)
                    self.send_header("Content-Type", "application/xml")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return

                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                connection = HTTPConnection("127.0.0.1", 19002, timeout=10)
                try:
                    connection.request(self.command, self.path, body, dict(self.headers.items()))
                    response = connection.getresponse()
                    payload = response.read()
                    self.send_response(response.status)
                    for name, value in response.getheaders():
                        if name.lower() not in {"connection", "transfer-encoding", "server", "date"}:
                            self.send_header(name, value)
                    self.end_headers()
                    self.wfile.write(payload)
                finally:
                    connection.close()

            do_GET = do_HEAD = do_PUT = do_POST = do_DELETE = forward

            def log_message(self, *_):
                pass

        self.stub("restic", f"""
if [[ $1 == forget ]]; then touch "$TEST_ROOT/retention-called"; fi
exec {shlex.quote(self.restic)} "$@"
""")
        with ThreadingHTTPServer(("127.0.0.1", 0), DenySnapshotDelete) as proxy:
            thread = Thread(target=proxy.serve_forever, daemon=True)
            thread.start()
            url = self.repo_env["RESTIC_REPOSITORY"]
            proxied_url = url.replace(":19002/", f":{proxy.server_port}/")
            self.secret("restic.env", (self.config / "restic.env").read_text().replace(url, proxied_url))
            try:
                result = self.backup()
            finally:
                proxy.shutdown()
                thread.join()
                self.secret("restic.env", (self.config / "restic.env").read_text().replace(proxied_url, url))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed (verify Restic snapshot tags)", result.stderr)
        self.assertNotIn("stored", result.stderr)
        self.assertNotIn("succeeded", result.stderr)
        self.assertFalse((self.root / "retention-called").exists())
        pending, = self.snapshots("--tag", "kamooni-pending")
        self.assertTrue(deleted)
        self.assertEqual(set(deleted), {pending["id"]})
        run_id, = set(pending["tags"]) - {"kamooni-pending"}
        duplicates = self.snapshots("--tag", run_id)
        self.assertCountEqual([set(s["tags"]) for s in duplicates],
                              [{run_id, "kamooni-pending"}, {run_id, "kamooni-daily"}])
        self.assertIn(previous, self.snapshots())
        target = self.root / "previous-good-restore"
        self.run_restic("restore", "--verify", "--target", str(target), previous["id"])
        self.assertTrue((target / "set/minio.tar").is_file())

        # A later completed upload still must not apply retention to the ambiguous run.
        result = self.backup()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed (verify Restic snapshot tags)", result.stderr)
        self.assertFalse((self.root / "retention-called").exists())
        self.assertIn(previous, self.snapshots())

    def test_retention_keeps_last_30_successful_dates_with_gaps(self):
        self.env["TZ"] = "Africa/Johannesburg"
        self.stub("restic", f"""
if [[ $1 == --json && $2 == backup ]]; then
    set -- "$@" --time "$TEST_SNAPSHOT_TIME"
fi
exec {shlex.quote(self.restic)} "$@"
""")
        dates = [datetime(2025, 1, 1, 2, 30) + timedelta(days=2 * i) for i in range(31)]
        duplicate = dates[-2].replace(hour=4)
        ids_by_date = {}
        for stamp in [*dates[:-1], duplicate, dates[-1]]:
            self.env["TEST_SNAPSHOT_TIME"] = stamp.strftime("%Y-%m-%d %H:%M:%S")
            result = self.backup()
            self.assertEqual(result.returncode, 0, result.stderr)
            stored, = [line for line in result.stderr.splitlines() if " backup stored " in line]
            ids_by_date[stamp.date().isoformat()] = stored.rsplit(" ", 1)[1].rstrip(".")

        self.assertEqual(len(ids_by_date), 31)
        del ids_by_date[dates[0].date().isoformat()]
        daily = self.snapshots()
        self.assertEqual(len(daily), 30)
        self.assertEqual({s["time"][:10]: s["id"] for s in daily}, ids_by_date)
        self.assertTrue(all("kamooni-daily" in s["tags"] and "kamooni-pending" not in s["tags"]
                            for s in daily))

    def test_missing_credentials_and_failure_email(self):
        (self.config / "mongo.yaml").unlink()
        self.assert_failure("check backup credentials")
        self.assertEqual(self.snapshots(), [])
        self.stub("curl", """
[[ "$*" == *"@$KAMOONI_BACKUP_CONFIG_DIR/postmark.header"* ]]
[[ "$*" == *"@$KAMOONI_BACKUP_CONFIG_DIR/postmark.json"* ]]
[[ "${!#}" == https://api.postmarkapp.com/email ]]
touch "$TEST_ROOT/alert-sent"
echo synthetic-alert-stdout
echo synthetic-alert-stderr >&2
""")
        result = self.backup("--notify-failure")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / "alert-sent").is_file())


if __name__ == "__main__":
    unittest.main()
