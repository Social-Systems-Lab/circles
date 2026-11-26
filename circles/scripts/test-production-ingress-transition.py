#!/usr/bin/env python3
"""Disposable Docker rehearsal for the ingress cutover and port-free rollback.

Uses a unique Compose project and loopback-only test ports, real TLS and Docker
networking, and synthetic onboarding status. No production host access.
"""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "transition", Path(__file__).with_name("production-ingress-transition.py"),
)
ingress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingress)


def execute(args, *, check=True, timeout=90):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise AssertionError(f"{args[0]} failed: {result.stderr}")
    return result.stdout.strip()


def available_port():
    with socket.socket(socket.AF_INET6) as sock:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        sock.bind(("::", 0))
        return sock.getsockname()[1]


def connect(port, address):
    with socket.create_connection((address, port), timeout=2) as sock:
        sock.sendall(b"GET /api/version HTTP/1.0\r\n\r\n")
        with sock.makefile("rb") as response:
            return response.readline()


class Rehearsal(ingress.Transition):
    def __init__(self, root, project, docker, app_port, tls_port):
        super().__init__(root, "/storage/sample.png")
        self.project = project
        self.docker_args = docker
        self.compose_args = ["compose", "--project-name", project, "--project-directory", str(root)]
        self.app_port = app_port
        self.tls_port = tls_port
        self.hmac = hashlib.sha256(b"synthetic ingress fixture").hexdigest()
        self.route_state = {"mode": "pending", "deploymentId": ingress.DEPLOYMENT,
                            "pending": [{"status": "pending_email", "reservation": "synthetic-did"}]}
        self.recovered = False
        self.fault = None

    def docker(self, *args, label, timeout=30):
        try:
            return execute([*self.docker_args, *args], timeout=timeout).encode()
        except AssertionError as error:
            print(error, file=sys.stderr)
            raise ingress.Failure(label) from None

    def compose(self, files, *args, label, activated=False, ops=False, timeout=30):
        if self.fault == "app" and files == self.target and args[0] == "up":
            raise ingress.Failure("injected application startup failure")
        if files == self.rollback and args[0] == "up":
            self.recovered = True
        return self.docker(*self.compose_args, *[flag for file in files for flag in ("-f", str(file))],
                           *args, label=label, timeout=timeout)

    def operator(self, *args):
        # The isolated fixture uses a sentinel instead of production Mongo or a
        # routing operator token. A drift case changes the observed route only.
        if args[0] == "route-status":
            if self.fault == "drift" and self.services("circles", running=True) != [self.before["Id"]]:
                return {"mode": "paused", "deploymentId": None}
            return self.route_state
        return {"activeProvisioningLocks": 0, "activeFinalizationLocks": 0, "reconciliationRequired": 0}

    def fingerprint(self):
        contents = self.scratch.joinpath("nginx.conf").read_bytes()
        if self.fault == "config-drift" and not self.services("nginx", running=True):
            return contents + b"synthetic configuration drift"
        return contents

    def version(self, container):
        code = "import sys,urllib.request,json; assert json.load(urllib.request.urlopen(sys.argv[1]))['gitSha']==sys.argv[2]"
        self.docker("exec", container["Id"], "python", "-c", code,
                    "http://" + ingress.runtime.application_container_ipv4(container) + ":3000/api/version",
                    ingress.SERVING, label="synthetic internal version check failed")

    def cron_check(self):
        self.docker("exec", self.cron, "python", "-c",
                    "import urllib.request; urllib.request.urlopen('http://circles:3000/api/version').read()",
                    label="synthetic cron connectivity failed")

    def watchdog_check(self, container):
        self.cron_check()
        return "synthetic heartbeat"

    def public_checks(self):
        url = f"https://localhost:{self.tls_port}"
        checks = {}
        try:
            for path in ("/api/version", self.asset, "/_next/image?url=/storage/sample.png&w=128&q=75"):
                checks[path] = execute(["curl", "-fsS", "--noproxy", "*", "--cacert", str(self.scratch / "cert.pem"),
                                        "--max-time", "4", url + path])
        except AssertionError as error:
            raise ingress.Failure(str(error)) from None
        assert json.loads(checks["/api/version"])["gitSha"] == ingress.SERVING
        assert checks[self.asset] == "synthetic object" and checks["/_next/image?url=/storage/sample.png&w=128&q=75"] == "optimized"
        return hashlib.sha256(checks[self.asset].encode()).digest()

    def verify_public(self):
        if self.fault == "https" and not self.recovered:
            # nginx is publicly available. Inject a terminal verification
            # failure to exercise containment and the recovery manifest.
            raise SystemExit("synthetic terminal HTTPS check failure")
        super().verify_public()

    def prepare(self):
        self.before = self.single("circles", running=True)
        self.nginx = self.single("nginx", running=True)["Id"]
        self.cron = self.single("cron", running=True)["Id"]
        self.stable = {name: self.single(name, running=True)["Id"] for name in ("db", "minio")}
        self.dependents = {"minio_loopback": self.single("minio_loopback", running=True)}
        self.configuration = self.fingerprint()
        self.storage_digest = self.public_checks()
        self.application(self.before, private=False)
        self.assert_namespace_members(self.before["Id"])
        self.cron_check()


def check_release_models(root, docker):
    repo = Path(__file__).resolve().parents[2]
    env_file = root / "model.env"
    env_file.write_text("\n".join((
        "CIRCLES_PORT=3000", "CIRCLES_NODE_ENV=production", "MONGO_PORT=27017", "MINIO_PORT=9000",
        "CIRCLES_URL=https://kamooni.org", "CIRCLES_JWT_SECRET=synthetic", "CRON_SECRET=synthetic",
        "MONGODB_URI=mongodb://synthetic:synthetic@db:27017/circles?authSource=admin",
        "POSTMARK_API_TOKEN=synthetic", "POSTMARK_SENDER_EMAIL=ops@kamooni.invalid", "ALTCHA_HMAC_KEY=synthetic",
    )) + "\n")
    activation_file = root / "activation.env"
    activation_file.write_text(
        f"REGISTRATION_DEPLOYMENT_ID={ingress.DEPLOYMENT}\n"
        f"PENDING_REGISTRATION_TOKEN_HMAC_KEY={hashlib.sha256(b'synthetic model').hexdigest()}\n"
        "ONBOARDING_ALERT_EMAIL=ops@kamooni.invalid\n"
    )
    (root / ".env").write_text(env_file.read_text())

    def source(sha, name):
        output = root / f"{sha[:8]}-{name}"
        output.write_text(execute(["git", "-C", str(repo), "show", f"{sha}:circles/{name}"]) + "\n")
        return output

    old = source(ingress.SERVING, "docker-compose.yml")
    new = source(ingress.RELEASE, "docker-compose.yml")
    activation_overlay = source(ingress.SERVING, "docker-compose.production-activation.yml")
    maintenance = source(ingress.RELEASE, "docker-compose.production-maintenance.yml")
    pin = root / "model-image.json"
    pin.write_text(json.dumps({"services": {"circles": {"image": "sha256:" + "a" * 64}}}))

    def render(base, *additional):
        return json.loads(execute([
            "env", f"GIT_SHA={ingress.SERVING}",
            "KAMOONI_PRODUCTION_ONBOARDING_ACTIVATION_CONFIRM=AUTHORIZED_PRODUCTION_ONBOARDING_CONTROL",
            *docker, "compose", "--project-name", "kamooni-ingress-model-check", "--project-directory", str(root),
            "--env-file", str(env_file), "--env-file", str(activation_file),
            *[flag for path in (base, activation_overlay, pin, *additional) for flag in ("-f", str(path))],
            "config", "--format", "json",
        ]))

    original, candidate, recovery = render(old), render(new, maintenance), render(old, maintenance)
    assert original["services"]["circles"]["ports"][0]["published"] == "3000"
    assert ingress.without_app_ports(original) == candidate == recovery
    for model in (candidate, recovery):
        assert ingress.activation.validate_no_published_application_ports(model) == []
        assert ingress.activation.validate_activation_compose(model, ingress.DEPLOYMENT) == []
    print("PASS exact Git Compose models: only application host publication changes", flush=True)


def rehearse(root, context):
    project = "kamooni-ingress-" + uuid.uuid4().hex[:10]
    docker = ["docker"] + (["--context", context] if context else [])
    daemon = execute([*docker, "info", "--format", "{{.Name}}"])
    assert daemon and daemon.split(".")[0] != "kamooniorg", "cannot use the production Docker daemon"
    check_release_models(root, docker)
    app_port, tls_port = available_port(), available_port()
    runner = Rehearsal(root, project, docker, app_port, tls_port)
    assert app_port != tls_port, "test ports must be distinct"
    ingress.runtime.CONTAINER_NETWORK = project + "_webnet"
    for image in ("python:3.12-bookworm", "nginx:1.27.4-alpine"):
        execute([*docker, "image", "inspect", "--format", "{{.Id}}", image])
    (root / "server.py").write_text(
        "from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer\n"
        "class Handler(BaseHTTPRequestHandler):\n"
        " def do_GET(self):\n"
        "  self.send_response(200); self.end_headers()\n"
        f"  self.wfile.write({json.dumps({'gitSha': ingress.SERVING}).encode()!r} if self.path == '/api/version' else b'optimized')\n"
        "ThreadingHTTPServer(('0.0.0.0',3000),Handler).serve_forever()\n"
    )
    (root / "VERSION").write_text(f"gitSha={ingress.SERVING}\n")
    (root / "role").write_text("production\n")
    (root / "object").write_text("synthetic object")
    execute(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
             "-subj", "/CN=localhost", "-keyout", str(root / "key.pem"), "-out", str(root / "cert.pem")])
    (root / "nginx.conf").write_text(
        "events {} http { server { listen 443 ssl; ssl_certificate /fixture/cert.pem; "
        "ssl_certificate_key /fixture/key.pem; "
        "location = /storage/sample.png { alias /fixture/object; } "
        "location / { proxy_pass http://circles:3000; } } }"
    )
    env = {
        "PENDING_REGISTRATION_ENABLED": "true", "PENDING_REGISTRATION_JOURNEY_READY": "true",
        "REGISTRATION_DEPLOYMENT_ID": ingress.DEPLOYMENT, "PENDING_REGISTRATION_TOKEN_HMAC_KEY": runner.hmac,
        "CIRCLES_URL": "https://kamooni.org", "EMAIL_TRANSPORT": "postmark",
        "ALTCHA_HMAC_KEY": "synthetic", "POSTMARK_API_TOKEN": "synthetic", "POSTMARK_SENDER_EMAIL": "synthetic",
    }
    python_image = execute([*docker, "image", "inspect", "--format", "{{.Id}}", "python:3.12-bookworm"])
    sleeper = {"image": python_image, "command": ["sleep", "600"], "networks": ["webnet"]}
    (root / "state").mkdir()
    volumes = [f"{root}/server.py:/fixture/server.py:ro", f"{root}/VERSION:/app/VERSION:ro",
               f"{root}/role:/app/.kamooni-deployment-role:ro", f"{root}/state:/state"]
    services = {
        "circles": {"image": python_image, "command": ["python", "/fixture/server.py"],
                    "environment": env, "volumes": volumes, "networks": ["webnet"]},
        "nginx": {"image": "nginx:1.27.4-alpine", "ports": [f"127.0.0.1:{tls_port}:443"],
                  "volumes": [f"{root}/nginx.conf:/etc/nginx/nginx.conf:ro", f"{root}:/fixture:ro"],
                  "depends_on": ["circles"], "networks": ["webnet"]},
        "minio_loopback": {"image": python_image, "command": ["sleep", "600"],
                           "network_mode": "service:circles", "depends_on": ["circles"]},
        "cron": sleeper, "db": sleeper, "minio": sleeper,
    }
    model = {"services": services, "networks": {"webnet": {}}}
    runner.target = [root / "port-free.json"]
    runner.target[0].write_text(json.dumps(model))
    runner.rollback = [root / "original-activation-port-free.json"]
    runner.rollback[0].write_text(json.dumps(model))
    services["circles"]["ports"] = [f"127.0.0.1:{app_port}:3000", f"[::1]:{app_port}:3000"]
    initial = [root / "published.json"]
    initial[0].write_text(json.dumps(model))
    retained_tag = None
    try:
        for fault in (None, "app", "https", "drift", "config-drift"):
            runner.fault = None
            runner.recovered = False
            runner.compose(initial, "up", "-d", "--no-build", "--pull", "never", label="could not start disposable fixture")
            for address in ("127.0.0.1", "::1"):
                for attempt in range(20):
                    try:
                        if b"200 OK" in connect(app_port, address):
                            break
                    except OSError:
                        if attempt == 19:
                            raise
                    time.sleep(0.25)
                else:
                    raise AssertionError(f"disposable app was not reachable on {address} before transition")
            ingress.until_ready(runner.public_checks)
            runner.prepare()
            retained_tag = runner.retain_serving_image()
            saved_route = json.dumps(runner.route_state)
            runner.fault = fault
            try:
                runner.apply()
                assert fault is None, "injected failure unexpectedly succeeded"
            except ingress.Failure as error:
                expected = {
                    "drift": "keep NGINX closed",
                    "config-drift": "environment or NGINX configuration changed",
                }.get(fault, "rollback verified")
                assert fault and expected in str(error), error
            assert runner.recovered == (fault in {"app", "https"})
            assert saved_route == json.dumps(runner.route_state)
            assert runner.single("circles", running=True)["Image"] == python_image
            if fault == "config-drift":
                assert runner.services("circles", running=True) == [runner.before["Id"]]
                assert not runner.services("nginx", running=True)
                print("PASS config drift: original application retained and changed NGINX configuration not activated",
                      flush=True)
                runner.compose(initial, "down", label="could not remove disposable case")
                continue
            ingress.runtime.require_no_published_ports(runner.single("circles", running=True))
            for address in ("127.0.0.1", "::1"):
                try:
                    with socket.create_connection((address, app_port), timeout=1):
                        raise AssertionError(f"test app retained host ingress on {address}")
                except OSError:
                    pass
            if fault == "drift":
                assert not runner.services("nginx", running=True)
            else:
                runner.public_checks()
            runner.cron_check()
            public_result = "NGINX stayed closed on routing drift" if fault == "drift" else "HTTPS and storage verified"
            print(f"PASS {fault or 'success'}: {public_result}, sidecar, cron, same image, unchanged pending status, "
                  "IPv4 and IPv6 closed", flush=True)
            runner.compose(initial, "down", label="could not remove disposable case")
    finally:
        runner.compose(initial, "down", label="could not remove disposable fixture")
        if retained_tag:
            runner.docker("image", "rm", retained_tag, label="could not remove the disposable rollback tag")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="kamooni-ingress-docker-") as directory:
        # Resolved path avoids macOS /var symlink issues with Docker sharing.
        rehearse(Path(directory).resolve(), os.environ.get("INGRESS_TEST_DOCKER_CONTEXT"))
