#!/usr/bin/env python3
"""Replace the serving application container without publishing a host port."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
REPO = Path("/root/circles/circles")
APP = REPO / "circles"
SECRETS = Path("/root/circles/onboarding-secrets")
LOCK = Path("/run/lock/circles-production-docker.lock")
SERVING = "47d9ca1b92047702bb83ac35d9ababc9e51daaeb"
RELEASE = "00cd6a38266d70c454e96323154a6112b9a802fc"
DEPLOYMENT = "production-onboarding-20261114-dc9dc405-01"
PUBLIC = "https://kamooni.org"
HELPERS = ("minio_loopback", "nginx_loopback")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}")
SHA = re.compile(r"[0-9a-f]{40}")


def validator(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


activation = validator("validate-production-onboarding-activation")
runtime = validator("verify-production-onboarding-runtime")


class Failure(Exception):
    pass


class Uncertain(Failure):
    pass


def require(condition, reason):
    if not condition:
        raise Failure(reason)


def command(args, *, label, timeout=30, data=None, mutating=False):
    # Raw process output may include a credential-bearing Compose model or URI.
    try:
        process = subprocess.Popen(
            args, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/root", "GIT_OPTIONAL_LOCKS": "0"},
        )
    except OSError:
        raise Failure(label) from None
    try:
        output, _ = process.communicate(data, timeout=timeout)
    except (subprocess.TimeoutExpired, InterruptedError):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        error_type = Uncertain if mutating else Failure
        raise error_type(f"{label} (interrupted or timed out)") from None
    require(process.returncode == 0, label)
    return output


def checked_json(payload, reason):
    try:
        return json.loads(payload)
    except (ValueError, UnicodeError):
        raise Failure(reason) from None


def issues(errors):
    require(not errors, ", ".join(errors))


@contextmanager
def maintenance_lock():
    # Match flock(1) in the production deploy and onboarding controls.
    with LOCK.open("a") as lock:
        deadline = time.monotonic() + 120
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                require(time.monotonic() < deadline, "production maintenance lock is busy")
                time.sleep(1)
        yield


class Transition:
    def __init__(self, scratch, storage_path):
        self.scratch = scratch
        self.activation_file = SECRETS / "activation.env"
        self.base_env = APP / ".env"
        self.asset = storage_path
        self.project = "circles"
        self.docker_args = ["docker", "--host", "unix:///var/run/docker.sock"]
        self.compose_args = [
            "compose", "--project-name", "circles", "--project-directory", str(APP),
            "--env-file", str(self.base_env),
        ]
        self.public_may_be_open = True

    def docker(self, *args, label, timeout=30):
        return command([*self.docker_args, *args], label=label, timeout=timeout, mutating=args[0] in {"stop", "start"})

    def docker_json(self, *args, label):
        return checked_json(self.docker(*args, label=label), label)

    def inspect(self, identifier):
        items = self.docker_json("inspect", identifier, label="could not inspect required container")
        require(len(items) == 1, "ambiguous container inspection")
        return items[0]

    def services(self, name, *, running=False):
        args = [] if running else ["--all"]
        return self.docker(
            "ps", *args, "--no-trunc", "--filter", f"label=com.docker.compose.project={self.project}",
            "--filter", f"label=com.docker.compose.service={name}", "--format", "{{.ID}}",
            label=f"could not identify {name}",
        ).decode().splitlines()

    def single(self, name, *, running=False):
        ids = self.services(name, running=running)
        require(len(ids) == 1, f"expected one {name} container")
        return self.inspect(ids[0])

    def compose(self, files, *args, label, activated=False, ops=False, timeout=30):
        extra = ["--env-file", str(self.activation_file)] if activated else []
        if ops:
            extra += ["--profile", "production-onboarding-ops"]
        for file in files:
            extra += ["-f", str(file)]
        # The operator image tag is validated before use and overridden with its
        # immutable ID at execution. The app image never comes from latest.
        return command(
            ["env", f"GIT_SHA={SERVING}", "KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM=AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL",
             *self.docker_args, *self.compose_args, *extra, *args],
            label=label, timeout=timeout, mutating=args[0] == "up",
        )

    def file_from_git(self, sha, name):
        content = command(
            ["git", "-C", str(REPO), "show", f"{sha}:circles/{name}"],
            label=f"checked-in production {name} is unavailable",
        )
        target = self.scratch / f"{sha[:8]}-{name}"
        target.write_bytes(content)
        return target

    def overlay(self, name, services):
        target = self.scratch / f"{name}.json"
        target.write_text(json.dumps({"services": services}), encoding="utf-8")
        return target

    def render(self, files, *, activated=False, ops=False):
        return checked_json(self.compose(
            files, "config", "--format", "json", activated=activated, ops=ops,
            label="could not render production Compose configuration",
        ), "invalid production Compose configuration")

    def image_id(self, reference):
        result = self.docker(
            "image", "inspect", "--format", "{{.Id}}", reference, label="required local image is missing",
        ).decode().strip()
        require(IMAGE.fullmatch(result), "invalid local image identity")
        return result

    def require_route(self, *, idle=False):
        mode = self.operator("route-status")
        require(mode.get("mode") == "pending" and mode.get("deploymentId") == DEPLOYMENT,
                "onboarding routing changed or deployment ID does not match")
        if idle:
            status = self.operator("operations-status", "--users-dir", "/circles/users")
            for key in ("activeProvisioningLocks", "activeFinalizationLocks", "reconciliationRequired"):
                require(type(status.get(key)) is int and status[key] == 0, f"{key} must be zero")
        return mode

    def operator(self, *args):
        return checked_json(self.compose(
            self.ops_files, "run", "--rm", "--no-deps", "--pull", "never", "-T",
            "registration_ops", *args, ops=True, label="read-only onboarding status failed",
        ), "invalid onboarding status")

    def fingerprint(self):
        try:
            return tuple(hashlib.sha256(path.read_bytes()).digest() for path in (
                self.base_env, self.activation_file, APP / "nginx/nginx.conf",
            ))
        except OSError:
            raise Failure("could not verify production environment and NGINX configuration") from None

    def public_checks(self):
        def fetch(path):
            return command([
                "curl", "-fsS", "--noproxy", "*", "--connect-timeout", "3", "--max-time", "8",
                "--max-filesize", "4194304", PUBLIC + path,
            ], label="production HTTPS, storage or image check failed", timeout=10)

        require(checked_json(fetch("/api/version"), "invalid HTTPS version response").get("gitSha") == SERVING,
                "production HTTPS serves the wrong application SHA")
        original = fetch(self.asset)
        optimized = fetch("/_next/image?url=" + quote(self.asset, safe="") + "&w=128&q=75")
        require(original and optimized, "storage or optimized image returned an empty body")
        return hashlib.sha256(original).digest()

    def version(self, container):
        cid = container["Id"]
        addr = runtime.application_container_ipv4(container)
        code = (
            "fetch('http://' + process.argv[1] + ':3000/api/version',"
            "{redirect:'error',signal:AbortSignal.timeout(3500)})"
            ".then(r=>{if(!r.ok)throw Error();return r.json()})"
            ".then(v=>process.exit(v.gitSha===process.argv[2]?0:1)).catch(()=>process.exit(1))"
        )
        self.docker("exec", cid, "node", "-e", code, addr, SERVING, label="internal application version check failed")

    def application(self, candidate, *, private):
        issues(runtime.validate_application(candidate, "activation", DEPLOYMENT, self.hmac))
        if private:
            runtime.require_no_published_ports(candidate)
        require(candidate["Image"] == self.before["Image"], "application immutable image changed")
        require(runtime.environment(candidate) == runtime.environment(self.before), "application environment changed")
        require(mounts(candidate) == mounts(self.before), "application mounts changed")
        for key in ("Entrypoint", "Cmd", "User", "WorkingDir", "Healthcheck", "StopSignal"):
            require(candidate["Config"].get(key) == self.before["Config"].get(key), f"application {key} changed")
        for key in ("Privileged", "ReadonlyRootfs", "CapAdd", "CapDrop", "SecurityOpt", "RestartPolicy", "Devices"):
            require(candidate["HostConfig"].get(key) == self.before["HostConfig"].get(key), f"application {key} changed")
        version = self.docker("exec", candidate["Id"], "cat", "/app/VERSION", label="cannot read application VERSION")
        role = self.docker("exec", candidate["Id"], "cat", "/app/.kamooni-deployment-role",
                           label="cannot verify application role")
        command(
            [sys.executable, str(TOOLS / "verify-production-application-image.py"), SERVING,
             self.before["Image"], candidate["Image"]],
            data=version + b"\n---KAMOONI-ROLE---\n" + role, label="application SHA, role or image is invalid",
        )
        self.version(candidate)

    def preflight(self):
        require(activation.validate_activation_values(
            activation.validate_secret_file(self.activation_file, 0), DEPLOYMENT,
        ) == [], "activation deployment ID does not match")
        self.hmac = runtime.read_activation_hmac(self.activation_file)
        self.configuration = self.fingerprint()
        self.before = self.single("circles")
        nginx = self.single("nginx", running=True)
        nginx_configs = [mount for mount in nginx["Mounts"] if mount.get("Destination") == "/etc/nginx/nginx.conf"]
        require(len(nginx_configs) == 1 and nginx_configs[0].get("Type") == "bind"
                and nginx_configs[0].get("RW") is False
                and Path(nginx_configs[0]["Source"]) == APP / "nginx/nginx.conf",
                "running NGINX does not use the expected read-only configuration bind")
        self.nginx = nginx["Id"]
        self.cron = self.single("cron", running=True)["Id"]
        self.dependents = {name: self.single(name, running=True) for name in HELPERS if self.services(name, running=True)}
        self.assert_namespace_members(self.before["Id"])
        self.stable = {name: self.single(name, running=True)["Id"] for name in ("db", "minio")}
        self.application(self.before, private=False)
        require(original_binding(self.before), "serving application does not have the expected 3000/tcp publication")
        self.image_id(self.before["Image"])
        networks = self.docker_json("network", "inspect", "circles_webnet", label="cannot inspect production webnet")
        runtime.require_private_bridge(networks[0])
        self.docker("exec", self.nginx, "nginx", "-t", label="existing NGINX config is invalid")

        original = self.file_from_git(SERVING, "docker-compose.yml")
        base = self.file_from_git(RELEASE, "docker-compose.yml")
        enabled = self.file_from_git(SERVING, "docker-compose.production-activation.yml")
        ops = self.file_from_git(SERVING, "docker-compose.production-ops.yml")
        pin = self.overlay("images", {
            "circles": {"image": self.before["Image"]},
            **{name: {"image": value["Image"]} for name, value in self.dependents.items()},
        })
        maintenance = self.file_from_git(RELEASE, "docker-compose.production-maintenance.yml")
        self.target = [base, enabled, pin, maintenance]
        # Reconstruct the serving release's activation model for recovery. The
        # insecure host publication is excluded from both launch models.
        self.rollback = [original, enabled, pin, maintenance]
        old_model = self.render([original, enabled, pin], activated=True)
        target = self.render(self.target, activated=True)
        rollback = self.render(self.rollback, activated=True)
        require(without_app_ports(old_model) == without_app_ports(rollback) == without_app_ports(target),
                "rendered activation models differ beyond application port publication")
        for model in (target, rollback):
            issues(activation.validate_activation_compose(model, DEPLOYMENT))
            issues(activation.validate_no_published_application_ports(model))
        operator = self.render([original, ops], ops=True)
        issues(activation.validate_ops_compose(operator, SERVING))
        default = self.render([original])
        issues(activation.validate_default_compose(default))
        runtime.require_matching_users_volume(self.before, [
            (default, "circles", False), (target, "circles", False), (operator, "registration_ops", True),
        ])
        serving_env = runtime.environment(self.before)
        candidate_env = target["services"]["circles"]["environment"]
        runtime.verified_database_uri([serving_env, candidate_env, operator["services"]["registration_ops"]["environment"]])
        image = self.docker_json("image", "inspect", self.before["Image"], label="cannot inspect serving image")[0]
        expected_env = runtime.environment(image)
        expected_env.update({key: value for key, value in candidate_env.items() if value is not None})
        for key, value in candidate_env.items():
            if value is None:
                expected_env.pop(key, None)
        require(expected_env == serving_env, "rendered activation environment does not exactly match the serving container")
        for key, field in (("Entrypoint", "entrypoint"), ("Cmd", "command"), ("User", "user"), ("WorkingDir", "working_dir")):
            desired = target["services"]["circles"].get(field, image["Config"].get(key))
            require(desired == self.before["Config"].get(key), f"rendered application {field} differs from the serving container")
        require(bool(serving_env.get("CRON_SECRET")) and bool(serving_env.get("CIRCLES_JWT_SECRET")),
                "serving cron or JWT credential is missing")
        self.verify_model_mounts(target)
        verifier_path = SECRETS / "routing-operator.sha256"
        verifier = command([str(TOOLS / "validate-routing-operator-verifier.py"), str(verifier_path)],
                           label="protected routing operator verifier is invalid").decode().strip()
        issues(activation.validate_secret_separation(
            activation.parse_env(self.activation_file), activation.parse_env(self.base_env), verifier,
        ))
        operator_id = self.image_id(f"circles-registration-ops:{SERVING}")
        self.ops_files = [original, ops, self.overlay("operator-image", {"registration_ops": {"image": operator_id}})]
        self.require_route(idle=True)
        print(f"Preflight watchdog heartbeat {self.watchdog_check(self.before)}.", flush=True)
        self.cron_check()
        self.storage_digest = self.public_checks()
        print(f"Preflight passed. Serving application image {self.before['Image']}.", flush=True)

    def watchdog_check(self, container):
        status = self.operator("operations-status", "--users-dir", "/circles/users", "--runtime-summary",
                               json.dumps(runtime.application_runtime_summary(container)))
        heartbeat = status.get("watchdogHeartbeat", {})
        require(status.get("runtimeRoutingConsistency", {}).get("consistent") is True
                and heartbeat.get("status") == "current" and heartbeat.get("deploymentStateMatches") is True
                and heartbeat.get("level") in {"healthy", "warning"}, "production watchdog is not current for this deployment")
        require(bool(heartbeat.get("lastSuccessfulRunAt")), "current watchdog heartbeat has no successful timestamp")
        return heartbeat["lastSuccessfulRunAt"]

    def verify_model_mounts(self, model):
        app_volumes = model["services"]["circles"]["volumes"]
        expected = {
            v["target"]: ("volume", model["volumes"][v["source"]]["name"], not v.get("read_only", False))
            for v in app_volumes if v["type"] == "volume"
        }
        require(len(expected) == len(app_volumes) and expected == mounts(self.before),
                "rendered application volumes do not match the serving container")

    def cron_check(self):
        self.docker("exec", self.cron, "sh", "-ec",
                    "grep -Fq /api/cron/email-reminders /etc/crontabs/root && "
                    "grep -Fq /api/cron/first-topic-notifications /etc/crontabs/root && "
                    "grep -Eq '^\\*/5 .*[/]api/cron/onboarding-watchdog' /etc/crontabs/root && "
                    "curl -fsS --max-time 5 http://circles:3000/api/version >/dev/null",
                    label="existing cron schedule or app connectivity check failed")

    def assert_namespace_members(self, app_id):
        expected = {value["Id"] for value in self.dependents.values()}
        rows = self.docker("ps", "--no-trunc", "--format", "{{.ID}}", label="cannot enumerate running containers")
        found = set()
        for cid in rows.decode().splitlines():
            mode = self.inspect(cid)["HostConfig"].get("NetworkMode", "")
            if mode.startswith("container:") and mode[10:] and app_id.startswith(mode[10:]):
                found.add(cid)
        require(found == expected, "application network namespace has unexpected running dependents")

    def check_unchanged(self):
        require(self.fingerprint() == self.configuration, "production environment or NGINX configuration changed")
        for name, cid in self.stable.items():
            require(self.services(name, running=True) == [cid], f"{name} container changed")
        require(self.services("cron", running=True) == [self.cron], "cron container changed")

    def stop_public(self):
        self.docker("stop", "--time", "-1", self.nginx, timeout=75, label="NGINX did not drain")
        self.require_public_closed()
        self.public_may_be_open = False

    def require_public_closed(self):
        require(self.services("nginx") == [self.nginx] and not self.services("nginx", running=True),
                "NGINX changed or is still serving")

    def replace(self, source):
        self.require_public_closed()
        for name in self.dependents:
            for cid in self.services(name, running=True):
                self.docker("stop", cid, label=f"could not stop {name}")
        self.compose(source, "up", "-d", "--no-build", "--no-deps", "--pull", "never",
                     "--force-recreate", "circles", activated=True, timeout=75,
                     label="could not recreate the pinned application")
        candidate = self.single("circles", running=True)
        require(candidate["Id"] != self.before["Id"], "original application container was not replaced")
        until_ready(lambda: self.application(self.inspect(candidate["Id"]), private=True))
        if self.dependents:
            self.compose(source, "up", "-d", "--no-build", "--no-deps", "--pull", "never",
                         "--force-recreate", *self.dependents, activated=True, timeout=60,
                         label="could not reattach application namespace helpers")
            for name, original in self.dependents.items():
                helper = self.single(name, running=True)
                require(helper["Image"] == original["Image"], f"{name} image changed")
                self.dependents[name] = helper
        self.assert_namespace_members(candidate["Id"])
        self.cron_check()
        self.check_unchanged()
        self.require_route()
        self.require_public_closed()
        self.public_may_be_open = True
        self.docker("start", self.nginx, label="existing NGINX could not start")
        require(self.services("nginx", running=True) == [self.nginx], "NGINX container changed")
        until_ready(self.verify_public)
        self.require_route()
        self.check_unchanged()
        serving = self.single("circles", running=True)
        self.application(serving, private=True)
        self.verified_heartbeat = self.watchdog_check(serving)

    def verify_public(self):
        require(self.public_checks() == self.storage_digest, "public storage object changed during the transition")

    def retain_serving_image(self):
        image = self.before["Image"]
        tag = f"{self.project}-circles:ingress-rollback-{SERVING[:8]}-{image.split(':', 1)[1]}"
        self.docker("image", "tag", image, tag, label="could not retain the serving image for rollback")
        require(self.image_id(tag) == image, "retained rollback image does not match the serving image")
        return tag

    def apply(self):
        self.check_unchanged()
        require(self.single("circles", running=True)["Id"] == self.before["Id"], "serving application changed")
        self.require_route(idle=True)
        # A drain timeout leaves the original application alone. No replacement
        # or recovery is attempted until NGINX was confirmed stopped.
        self.stop_public()
        try:
            self.check_unchanged()
            self.require_route(idle=True)
        except (Failure, SystemExit):
            # Reopen only for the unchanged original runtime. A bind-mounted
            # NGINX config can change even though the container ID is stable.
            self.check_unchanged()
            self.require_route()
            original = self.single("circles", running=True)
            require(original["Id"] == self.before["Id"], "original application changed during the drain")
            self.application(original, private=False)
            self.require_public_closed()
            self.public_may_be_open = True
            try:
                self.docker("start", self.nginx, label="could not restore NGINX after rejected pre-cutover checks")
                until_ready(self.verify_public)
                self.require_route()
            except (Failure, SystemExit, InterruptedError):
                self.stop_public()
                raise
            raise
        try:
            self.replace(self.target)
        except Uncertain:
            if self.public_may_be_open:
                self.stop_public()
            raise Failure("Docker state is uncertain; keep NGINX closed and inspect state before recovery") from None
        except (Failure, SystemExit, InterruptedError, ValueError, KeyError, TypeError) as error:
            reason = str(error) if isinstance(error, Failure) else "a safety check or operator session failed"
            print(f"Transition failed ({reason}). Restoring the original activation model with no host ports.", file=sys.stderr)
            try:
                if self.public_may_be_open:
                    self.stop_public()
                self.check_unchanged()
                self.require_route(idle=True)
                self.replace(self.rollback)
            except (Failure, SystemExit, InterruptedError, ValueError, KeyError, TypeError):
                if self.public_may_be_open:
                    self.stop_public()
                raise Failure("rollback could not be verified; keep NGINX closed and review production state") from None
            raise Failure("transition failed; rollback verified with the original image, HTTPS and no host ports") from None


def mounts(container):
    return {v["Destination"]: (v["Type"], v.get("Name"), v["RW"]) for v in container["Mounts"]}


def original_binding(container):
    host = container["HostConfig"]
    entries = host.get("PortBindings", {})
    return (
        not host.get("PublishAllPorts") and set(entries) == {"3000/tcp"} and bool(entries["3000/tcp"])
        and all(item.get("HostPort") == "3000" for item in entries["3000/tcp"])
    )


def without_app_ports(model):
    return {
        **model,
        "services": {**model["services"], "circles": {
            key: value for key, value in model["services"]["circles"].items() if key != "ports"
        }},
    }


def until_ready(check):
    deadline = time.monotonic() + 30
    while True:
        try:
            check()
            return
        except Failure:
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)


def production_boundary(ops_commit):
    forbidden = ("DOCKER_", "COMPOSE_", "BUILDX_", "BUILDKIT_", "GIT_")
    require(not any(value and key.startswith(forbidden) for key, value in os.environ.items()),
            "ambient Docker, Compose, build or Git overrides are forbidden")
    require(sys.platform == "linux" and os.geteuid() == 0 and os.uname().nodename.split(".")[0] == "kamooniorg",
            "this command requires the production host and root operator")
    require(SHA.fullmatch(ops_commit), "provide the approved full operations commit")
    ops_root = TOOLS.parent.parent
    require(command(["git", "-C", str(ops_root), "rev-parse", "HEAD"], label="cannot identify operations checkout")
            .decode().strip() == ops_commit, "operations checkout does not match the approved commit")
    require(not command(["git", "-C", str(ops_root), "status", "--porcelain", "--untracked-files=all"],
                        label="cannot verify clean operations checkout"), "operations checkout is dirty")
    require(ops_root != REPO, "use a separate pinned operations checkout")
    secret_dir = SECRETS.lstat()
    require(not SECRETS.is_symlink() and SECRETS.is_dir() and secret_dir.st_uid == 0
            and secret_dir.st_mode & 0o777 == 0o700, "production onboarding secret directory is not protected")
    verifier = (SECRETS / "routing-operator.sha256").lstat()
    require(verifier.st_uid == 0 and verifier.st_mode & 0o777 == 0o600
            and not (SECRETS / "routing-operator.sha256").is_symlink(), "routing verifier is not protected")
    docker = ["docker", "--host", "unix:///var/run/docker.sock"]
    require(command([*docker, "info", "--format", "{{.Name}}"], label="cannot identify local Docker daemon")
            .decode().strip().split(".")[0] == "kamooniorg", "unexpected local Docker daemon")
    version = command([*docker, "compose", "version", "--short"], label="cannot identify Docker Compose version")
    match = re.match(rb"v?(\d+)\.(\d+)\.(\d+)", version)
    require(match and tuple(map(int, match.groups())) >= (2, 24, 4), "Docker Compose 2.24.4 or later is required")


def interrupt(signum, frame):
    raise InterruptedError(f"operator command interrupted by signal {signum}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("preflight", "apply"))
    parser.add_argument("operations_commit")
    parser.add_argument("public_storage_image", help="known public /storage/... image path, without a query")
    args = parser.parse_args()
    require(re.fullmatch(r"/storage/[A-Za-z0-9._/-]+", args.public_storage_image)
            and ".." not in args.public_storage_image.split("/"), "use an existing public /storage image path")
    production_boundary(args.operations_commit)
    os.umask(0o077)
    with maintenance_lock(), tempfile.TemporaryDirectory(prefix="kamooni-ingress-") as directory:
        transition = Transition(Path(directory), args.public_storage_image)
        transition.preflight()
        if args.operation == "apply":
            with open("/dev/tty", "w", encoding="utf-8") as output, open("/dev/tty", encoding="utf-8") as terminal:
                output.write("Confirm production ingress containment and approved maintenance. Type REMOVE_APPLICATION_HOST_PORT: ")
                output.flush()
                require(terminal.readline().strip() == "REMOVE_APPLICATION_HOST_PORT", "operator confirmation declined")
            for name in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
                signal.signal(name, interrupt)
            transition.retain_serving_image()
            transition.apply()
            print(f"Verified {SERVING} with unchanged pending onboarding, HTTPS and no application host ports.")
            print(f"Watchdog is current at {transition.verified_heartbeat}. "
                  "Confirm the next scheduled heartbeat advances before starting a release pause.")


if __name__ == "__main__":
    try:
        main()
    except (Failure, OSError, ValueError, KeyError, TypeError) as error:
        # Only explicitly sanitized operator errors may be printed.
        print(f"Error: {error if isinstance(error, Failure) else 'ingress transition check failed'}", file=sys.stderr)
        sys.exit(1)
