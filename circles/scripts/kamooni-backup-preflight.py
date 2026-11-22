"""Offline Phase 1 backup preflight. The only input is sanitized inventory on stdin."""

from datetime import datetime, timezone
import json
from pathlib import PurePosixPath
import re
import sys


GIB = 1024**3
MAX_INVENTORY_BYTES = 256 * 1024
STAGE = PurePosixPath("/root/kamooni-backup-staging")
APP = "/root/circles/circles/circles"
BASE = f"{APP}/docker-compose.yml"
ACTIVATION = f"{APP}/docker-compose.production-activation.yml"
ACTIVATION_ENV = "/root/circles/onboarding-secrets/activation.env"
ROUTING_VERIFIER = "/root/circles/onboarding-secrets/routing-operator.sha256"
BACKUP_SECRETS = PurePosixPath("/root/kamooni-backup-config")
NGINX_MOUNTS = {
    "/etc/nginx/nginx.conf": (f"{APP}/nginx/nginx.conf", False),
    "/etc/letsencrypt": ("/etc/letsencrypt", False),
    "/usr/share/nginx/html": ("/var/www/certbot", True),
}
CONFIG_DIRECTORIES = {"/etc/letsencrypt", "/var/www/certbot"}
REQUIRED_CONFIG = {
    BASE, ACTIVATION, ACTIVATION_ENV, ROUTING_VERIFIER, f"{APP}/.env", f"{APP}/nginx/nginx.conf",
} | CONFIG_DIRECTORIES
BACKENDS = {
    "mongo": ("db", 27017, "mongo_dbpath", "/data/db", "circles_mongo"),
    "minio": ("minio", 9000, "minio_data_root", "/data", "circles_minio"),
    "qdrant": ("qdrant", 6333, "qdrant_storage_root", "/qdrant/storage", "circles_qdrant"),
}
BACKEND_VOLUMES = {volume: service for service, _, _, _, volume in BACKENDS.values()}
BASE_APP_VOLUMES = {"/circles": "circles_circles", "/circles/users": "circles_circles_users"}
CORE_SERVICES = {"circles", "db", "minio", "qdrant", "nginx"}
KNOWN_SERVICES = CORE_SERVICES | {"cron", "watchtower", "minio_loopback", "nginx_loopback"}
LEASE_COLLECTIONS = {"pendingRegistrationProvisioningLocks", "pendingRegistrationFinalizationLocks"}
CORE_COLLECTIONS = {
    "circles", "chatConversations", "chatRoomMembers", "chatMessageDocs", "chatReadStates",
    "pendingRegistrations", "pendingRegistrationDidReservations", "pendingRegistrationRateLimits",
    "pendingRegistrationAuditEvents", "registrationRouting", "onboardingWatchdogState",
} | LEASE_COLLECTIONS
CREDENTIAL_FILES = {"salt.bin", "iv.bin", "publicKey.pem", "privateKey.pem.enc"}
# Synthetic 2048-bit PKCS#1 fixtures measured 426 public PEM bytes and 3360 encrypted private PEM hex bytes.
# Allow serialization variation while checking the two 16-byte files and both encoded keys.
MIN_CREDENTIAL_SET_BYTES = 16 + 16 + 400 + 3072
SERVER_KEYS = {"publicKey.pem", "privateKey.pem"}
MIN_HISTORY_METADATA_BYTES = 64
TOP_LEVEL_EXPORT_FILES = 5  # Mongo, identities, app state, Qdrant and manifest.
DEPLOYMENT_ID = r"production-onboarding-[A-Za-z0-9][A-Za-z0-9._-]{7,111}"
IMAGE_ID = r"sha256:[a-f0-9]{64}"
LEDGER_REF = r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}"
DEVICE_ID = r"(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)"
VERSION_COMPONENT = r"(?:0|[1-9][0-9]?)"
VERSION_RULES = {
    "mongo": rf"7\.0\.{VERSION_COMPONENT}",
    "mongo_tools": r"100\.20\.1",
    "minio": r"RELEASE\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z",
    "qdrant": rf"1\.{VERSION_COMPONENT}\.{VERSION_COMPONENT}",
    "restic": r"0\.16\.4",
}


class Rejected(ValueError):
    """The reason is a fixed label and never contains inventory input."""


def require(condition, reason):
    if not condition:
        raise Rejected(reason)


def fields(value, names, reason):
    require(type(value) is dict and value.keys() == set(names.split()), reason)


def matches(value, pattern):
    return type(value) is str and re.fullmatch(pattern, value) is not None


def natural(value, minimum=0):
    return type(value) is int and minimum <= value < 2**63


def absolute_path(value):
    return (
        matches(value, r"(?:/[A-Za-z0-9._+-]+)+")
        and "." not in value.split("/")
        and ".." not in value.split("/")
    )


def path_list(values):
    return (
        type(values) is list
        and all(absolute_path(value) for value in values)
        and len(set(values)) == len(values)
    )


def overlaps(left, right):
    return left.is_relative_to(right) or right.is_relative_to(left)


def outside_backup_paths(path):
    return all(not overlaps(PurePosixPath(path), protected) for protected in (STAGE, BACKUP_SECRETS))


def check_path_evidence(evidence, path):
    require(
        evidence["canonical_path"] == path and evidence["no_symlinks"] is True
        and natural(evidence["uid"]) and natural(evidence["gid"]) and matches(evidence["mode"], r"[0-7]{4}"),
        "canonical path or permission evidence",
    )


def base_layout(service):
    # The production activation file changes only app environment values.
    return set(service["compose_files"]) <= {BASE, ACTIVATION}


def local_named_volume(mount, volume):
    return (
        mount["type"] == "volume" and mount["volume"] == volume
        and PurePosixPath(mount["source"]).parts[-3:] == ("volumes", volume, "_data")
    )


def check_runtime(runtime):
    fields(runtime, "host project git_sha services config_paths host_paths writers application_recovery effective",
           "runtime schema")
    require(runtime["host"] == "kamooniorg" and runtime["project"] == "circles", "production target")
    require(matches(runtime["git_sha"], r"[a-f0-9]{40}"), "deployed Git SHA")
    config_paths = runtime["config_paths"]
    require(path_list(config_paths) and REQUIRED_CONFIG <= set(config_paths), "runtime config coverage")
    require(
        all(outside_backup_paths(path) and (path in REQUIRED_CONFIG or path.startswith(f"{APP}/"))
            for path in config_paths),
        "runtime config outside supported roots",
    )

    services = runtime["services"]
    require(type(services) is dict and CORE_SERVICES <= services.keys() <= KNOWN_SERVICES, "running service coverage")
    host_paths = set(config_paths)
    backend_services = set(BACKEND_VOLUMES.values())
    volume_sources = {}
    for name, service in services.items():
        service_fields = "image_id compose_files mounts networks"
        if name in backend_services:
            service_fields += " listener_port"
        if name == "qdrant":
            service_fields += " writable_layer"
        fields(service, service_fields, "service schema")
        require(matches(service["image_id"], IMAGE_ID), "running image ID")
        networks = service["networks"]
        require(type(networks) is list and all(matches(network, LEDGER_REF) for network in networks)
                and len(set(networks)) == len(networks), "service networks")
        compose_files = service["compose_files"]
        require(
            path_list(compose_files) and compose_files[:1] == [BASE]
            and all(path.startswith(f"{APP}/") and path in config_paths for path in compose_files),
            "Compose file provenance",
        )
        require(type(service["mounts"]) is dict, "runtime mount inventory")
        for destination, mount in service["mounts"].items():
            fields(mount, "type source volume rw", "mount schema")
            require(absolute_path(destination) and absolute_path(mount["source"]), "exact runtime mount paths")
            require(
                (mount["type"] == "volume" and matches(mount["volume"], r"[A-Za-z0-9][A-Za-z0-9_.-]+"))
                or (mount["type"] == "bind" and mount["volume"] == ""),
                "runtime mount type",
            )
            require(type(mount["rw"]) is bool, "runtime mount access mode")
            require(outside_backup_paths(mount["source"]), "runtime mount overlaps backup paths")
            if mount["type"] == "volume":
                volume, source = mount["volume"], mount["source"]
                require(volume_sources.setdefault(volume, source) == source, "inconsistent named volume source")
            host_paths.add(mount["source"])
    require(ACTIVATION in services["circles"]["compose_files"], "active onboarding Compose provenance")
    writable_layer = services["qdrant"]["writable_layer"]
    if writable_layer is not None:
        require(absolute_path(writable_layer) and outside_backup_paths(writable_layer), "Qdrant writable layer")
        host_paths.add(writable_layer)

    paths = runtime["host_paths"]
    require(type(paths) is dict and paths.keys() == host_paths, "host path evidence coverage")
    for path, evidence in paths.items():
        fields(evidence, "canonical_path uid gid mode no_symlinks", "host path evidence")
        check_path_evidence(evidence, path)

    nginx = services["nginx"]["mounts"]
    for destination, (source, writable) in NGINX_MOUNTS.items():
        require(nginx.get(destination) == {"type": "bind", "source": source, "volume": "", "rw": writable},
                "NGINX recovery mounts")
    require(nginx.keys() == NGINX_MOUNTS.keys(), "unexpected NGINX mount")

    writers = runtime["writers"]
    fields(writers, "cron watchtower host_workers webhooks direct_writers", "writer dispositions")
    require(all(value in ("gate-and-drain", "verified-absent") for value in writers.values()), "writer dispositions")
    for name in ("cron", "watchtower"):
        require((writers[name] == "gate-and-drain") == (name in services), "Compose writer disposition")

    recovery = runtime["application_recovery"]
    fields(recovery, "image_id git_sha source source_digest tested test_ref test_result", "application image recovery")
    require(
        recovery["image_id"] == services["circles"]["image_id"] and recovery["git_sha"] == runtime["git_sha"]
        and recovery["source"] in ("registry-digest", "image-archive") and matches(recovery["source_digest"], IMAGE_ID)
        and recovery["tested"] is True and matches(recovery["test_ref"], LEDGER_REF),
        "tested application image recovery",
    )
    test_result = recovery["test_result"]
    fields(test_result, "image_id git_sha source_digest", "application image test result")
    require(all(test_result[key] == recovery[key] for key in test_result), "application image test result mismatch")

    effective = runtime["effective"]
    fields(
        effective,
        "mongo_database mongo_host mongo_port minio_host minio_port qdrant_host qdrant_port "
        "mongo_dbpath minio_data_root qdrant_storage_root qdrant_snapshot_root qdrant_temp_root "
        "identity_root server_key_root public_bucket legacy_public_bucket private_bucket verification_bucket "
        "public_url onboarding onboarding_deployment_id watchdog_users_root",
        "effective runtime schema",
    )
    require(
        effective["mongo_database"] == "circles" and effective["onboarding"] == "active"
        and effective["public_url"] == "https://kamooni.org"
        and matches(effective["onboarding_deployment_id"], DEPLOYMENT_ID),
        "effective production selectors",
    )
    for component, (service, port, path_key, base_path, volume) in BACKENDS.items():
        endpoint = effective[f"{component}_port"]
        listener = services[service]["listener_port"]
        require(
            effective[f"{component}_host"] == service and type(endpoint) is int and endpoint == port
            and type(listener) is int and listener == port
            and set(services["circles"]["networks"]) & set(services[service]["networks"]),
            "backend endpoint and listener mapping",
        )
        destination = effective[path_key]
        require(absolute_path(destination), "effective data and scratch paths")
        mount = services[service]["mounts"].get(destination)
        require(mount is not None and mount["rw"], "backend endpoint and data mount mapping")
        require(BACKEND_VOLUMES.get(mount["volume"], service) == service, "backend volume belongs to another service")
        if base_layout(services[service]):
            require(
                destination == base_path and local_named_volume(mount, volume),
                "backend data mount contradicts base Compose",
            )

    for name in (CORE_SERVICES | {"cron"}) & services.keys():
        if base_layout(services[name]):
            require(services[name]["networks"] == ["circles_webnet"], "service network contradicts base Compose")
    for writer, target in (("nginx", "circles"), ("nginx", "minio"), ("cron", "circles")):
        if writer in services:
            require(set(services[writer]["networks"]) & set(services[target]["networks"]),
                    "NGINX or cron route missing")

    require(
        all(absolute_path(effective[key]) for key in (
            "qdrant_snapshot_root", "qdrant_temp_root", "identity_root", "server_key_root",
        )),
        "effective data and scratch paths",
    )
    identities = PurePosixPath(effective["identity_root"])
    server = PurePosixPath(effective["server_key_root"])
    require(identities.name == "users" and server == identities.with_name("server"), "effective app data roots")
    require(effective["watchdog_users_root"] == str(identities), "watchdog credential root")
    qdrant_storage = effective["qdrant_storage_root"]
    qdrant_snapshot = PurePosixPath(effective["qdrant_snapshot_root"])
    qdrant_temp = PurePosixPath(effective["qdrant_temp_root"])
    require(
        not overlaps(qdrant_snapshot, qdrant_temp)
        and not PurePosixPath(qdrant_storage).is_relative_to(qdrant_snapshot)
        and not PurePosixPath(qdrant_storage).is_relative_to(qdrant_temp),
        "Qdrant scratch or snapshot overlaps storage",
    )
    # The mounted users tree can shadow stale files under the parent volume.
    required_mounts = [
        ("circles", str(identities)), ("circles", str(server.parent)),
        ("db", effective["mongo_dbpath"]), ("minio", effective["minio_data_root"]),
        ("qdrant", qdrant_storage),
    ]
    data_roots = []
    for service_name, destination in required_mounts:
        service = services[service_name]
        mounts = service["mounts"]
        mount = mounts.get(destination)
        require(mount is not None and mount["rw"], "required data mount")
        if service_name == "circles" and base_layout(service):
            require(
                destination in BASE_APP_VOLUMES and local_named_volume(mount, BASE_APP_VOLUMES[destination]),
                "app data mount contradicts base Compose",
            )
        supported = {destination}
        if service_name == "circles" and destination == str(server.parent):
            supported.add(str(identities))
        if service_name == "qdrant":
            supported.update((str(qdrant_snapshot), str(qdrant_temp)))
        require(
            all(not PurePosixPath(path).is_relative_to(destination) or path in supported for path in mounts),
            "unexpected nested data mount",
        )
        data_roots.append(PurePosixPath(mount["source"]))
    require(
        all(not overlaps(left, right) for index, left in enumerate(data_roots) for right in data_roots[index + 1:]),
        "overlapping data mount sources",
    )


def counts(mapping, names, reason):
    require(type(mapping) is dict and mapping, reason)
    require(all(matches(name, names) and natural(count) for name, count in mapping.items()), reason)
    return sum(mapping.values())


def check_config(config, paths):
    fields(config, "bytes export_inodes entries", "configuration source inventory")
    entries = config["entries"]
    require(type(entries) is dict and entries.keys() == set(paths), "configuration recovery coverage")
    seen_files = set()
    references = set()
    captured_bytes = 0
    for path, entry in entries.items():
        require(type(entry) is dict, "configuration recovery entry")
        if entry.get("kind") == "reference":
            fields(entry, "kind ledger_ref", "configuration recovery reference")
            ref = entry["ledger_ref"]
            require(matches(ref, LEDGER_REF) and ref not in references, "distinct configuration recovery reference")
            references.add(ref)
        else:
            fields(entry, "kind device inode bytes", "configuration recovery file")
            directory = path in CONFIG_DIRECTORIES
            require(
                entry["kind"] == ("directory" if directory else "file") and matches(entry["device"], DEVICE_ID)
                and natural(entry["inode"], 1) and natural(entry["bytes"], 0 if directory else 1),
                "configuration recovery file evidence",
            )
            identity = (entry["device"], entry["inode"])
            require(identity not in seen_files, "configuration recovery paths alias the same file")
            seen_files.add(identity)
            captured_bytes += entry["bytes"]
    require(natural(config["bytes"], captured_bytes)
            and natural(config["export_inodes"], 1 + len(seen_files) + bool(references)),
            "insufficient configuration export allowance")


def check_sources(sources, runtime):
    effective = runtime["effective"]
    fields(sources, "mongo identities app_state minio qdrant config", "source coverage")
    mongo = sources["mongo"]
    fields(mongo, "topology fcv bytes collections onboarding", "MongoDB inventory")
    require(mongo["topology"] == "standalone" and mongo["fcv"] == "7.0", "MongoDB topology or FCV")
    collections = mongo["collections"]
    counts(collections, r"[A-Za-z0-9_.-]+", "MongoDB collection inventory")
    require(CORE_COLLECTIONS <= collections.keys() and collections["circles"] > 0
            and collections["registrationRouting"] == collections["onboardingWatchdogState"] == 1, "MongoDB coverage")
    onboarding = mongo["onboarding"]
    fields(onboarding, "routing_mode deployment_id watchdog_deployment_id active_leases", "MongoDB onboarding evidence")
    require(
        onboarding["routing_mode"] == effective["onboarding"]
        and onboarding["deployment_id"] == onboarding["watchdog_deployment_id"] == effective["onboarding_deployment_id"],
        "onboarding routing or watchdog deployment mismatch",
    )
    leases = onboarding["active_leases"]
    require(type(leases) is dict and leases.keys() == LEASE_COLLECTIONS
            and all(natural(count) and count <= collections[name] for name, count in leases.items()),
            "onboarding lease inventory")

    check_identity(sources, runtime)
    check_config(sources["config"], runtime["config_paths"])

    minio = sources["minio"]
    fields(minio, "bytes history_bytes export_inodes buckets", "MinIO inventory")
    buckets = minio["buckets"]
    require(type(buckets) is dict and buckets, "MinIO bucket inventory")
    objects = current_bytes = history = version_bytes = 0
    for name, bucket in buckets.items():
        require(matches(name, r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"), "MinIO bucket name")
        fields(
            bucket, "versioning objects current_bytes versions version_bytes delete_markers",
            "MinIO bucket size and history inventory",
        )
        versioning = bucket["versioning"]
        require(
            versioning in ("never-enabled", "enabled", "suspended") and natural(bucket["objects"])
            and natural(bucket["versions"]) and natural(bucket["delete_markers"]) and natural(bucket["version_bytes"]),
            "MinIO bucket history evidence",
        )
        history_items = bucket["versions"] + bucket["delete_markers"]
        require(versioning != "never-enabled" or history_items == 0, "MinIO versioning contradiction")
        require(bucket["versions"] > 0 or bucket["version_bytes"] == 0, "MinIO version size contradiction")
        require(natural(bucket["current_bytes"]) and (bucket["objects"] > 0 or bucket["current_bytes"] == 0),
                "MinIO current object byte evidence")
        require(bucket["objects"] > 0 or history_items > 0, "empty MinIO bucket")
        objects += bucket["objects"]
        current_bytes += bucket["current_bytes"]
        history += history_items
        version_bytes += bucket["version_bytes"]
    require(natural(minio["bytes"], current_bytes), "insufficient MinIO current export allowance")
    require(
        natural(minio["history_bytes"], version_bytes + MIN_HISTORY_METADATA_BYTES * history)
        and natural(minio["export_inodes"], 1 + objects + history),
        "insufficient MinIO history or export allowance",
    )
    public, legacy, private, verification = (
        effective[key] for key in ("public_bucket", "legacy_public_bucket", "private_bucket", "verification_bucket")
    )
    for name in (public, legacy, private, verification):
        require(type(name) is str and name in buckets, "MinIO bucket coverage")
    require(legacy == "circles" and private != verification and {private, verification}.isdisjoint({public, legacy}),
            "MinIO bucket access roles")

    qdrant = sources["qdrant"]
    fields(qdrant, "bytes collections topology scratch_bytes scratch_inodes", "Qdrant inventory")
    require(qdrant["topology"] == "standalone", "Qdrant snapshot topology")
    points = counts(qdrant["collections"], r"[A-Za-z0-9_.-]+", "Qdrant collection inventory")
    require(points > 0, "empty Qdrant source")

    require(all(natural(source["bytes"], 1) for source in sources.values()), "missing or empty source size")
    require(natural(qdrant["scratch_bytes"], 2 * qdrant["bytes"]) and natural(qdrant["scratch_inodes"], 2),
            "insufficient Qdrant scratch allowance")
    return TOP_LEVEL_EXPORT_FILES + minio["export_inodes"] + sources["config"]["export_inodes"]


def check_identity(sources, runtime):
    effective = runtime["effective"]
    identity_root = effective["identity_root"]
    server_root = PurePosixPath(effective["server_key_root"])
    mounts = runtime["services"]["circles"]["mounts"]
    identities = sources["identities"]
    fields(identities, "bytes files mount_source credential_sets credential_files layout_verified", "user credential inventory")
    credentials = identities["credential_files"]
    sets = identities["credential_sets"]
    require(
        identities["mount_source"] == mounts[identity_root]["source"] and identities["layout_verified"] is True
        and natural(sets, 1) and natural(identities["files"], len(CREDENTIAL_FILES) * sets)
        and natural(identities["bytes"], MIN_CREDENTIAL_SET_BYTES * sets)
        and type(credentials) is dict and credentials.keys() == CREDENTIAL_FILES
        and all(natural(count, 1) and count == sets for count in credentials.values()),
        "user credential volume or file coverage",
    )
    app_state = sources["app_state"]
    fields(app_state, "bytes files server_keys", "app state inventory")
    keys = app_state["server_keys"]
    fields(keys, "path mount_source files pair_verified", "server signing key inventory")
    key_files = keys["files"]
    require(
        keys["path"] == str(server_root) and keys["mount_source"] == mounts[str(server_root.parent)]["source"]
        and keys["pair_verified"] is True and natural(app_state["files"], len(SERVER_KEYS))
        and type(key_files) is dict and key_files.keys() == SERVER_KEYS
        and all(natural(size, 1) for size in key_files.values()) and natural(app_state["bytes"], sum(key_files.values())),
        "server signing key volume or file coverage",
    )


def check_versions(versions):
    fields(versions, "capture restore", "version evidence")
    now = datetime.now(timezone.utc)
    for side in versions.values():
        fields(side, " ".join(VERSION_RULES), "version evidence")
        require(all(matches(side[key], pattern) for key, pattern in VERSION_RULES.items()), "unsupported tool or service version")
        try:
            released = datetime(*(int(part) for part in re.findall(r"[0-9]+", side["minio"])), tzinfo=timezone.utc)
        except ValueError:
            raise Rejected("invalid MinIO release timestamp") from None
        require(released.year >= 2015 and released <= now, "implausible MinIO release date")
    require(versions["capture"] == versions["restore"], "capture and restore version mismatch")


def check_stage(stage, runtime, sources, items):
    fields(stage, "path checked_path state private_ancestry filesystems", "staging evidence")
    expected_path = {"absent": str(STAGE.parent), "empty": str(STAGE)}
    require(
        stage["path"] == str(STAGE) and type(stage["state"]) is str
        and expected_path.get(stage["state"]) == stage["checked_path"]
        and type(stage["checked_path"]) is str and stage["private_ancestry"] is True,
        "staging must be absent under root-only parent or empty and root-only",
    )
    # Use the combined budget even on distinct filesystems, covering shared backing without double-counting free space.
    qdrant = sources["qdrant"]
    required_bytes = 2 * (sum(source["bytes"] for source in sources.values()) + sources["minio"]["history_bytes"])
    required_bytes += qdrant["scratch_bytes"] + 10 * GIB
    required_inodes = 2 * items + qdrant["scratch_inodes"] + 4096
    filesystems = stage["filesystems"]
    fields(filesystems, "staging qdrant_storage qdrant_snapshot qdrant_temp", "filesystem coverage")
    stage_path = stage["checked_path"]
    evidence = filesystems["staging"]
    capacities = {}
    check_filesystem(evidence, stage_path, stage_path, stage_path, capacities, required_bytes, required_inodes)
    require(evidence["uid"] == evidence["gid"] == 0 and evidence["mode"] == "0700", "staging ownership or mode")

    qdrant_service = runtime["services"]["qdrant"]
    mounts = qdrant_service["mounts"]
    protected_sources = {PurePosixPath(path) for path in runtime["config_paths"]}
    protected_sources.add(PurePosixPath(APP))
    protected_sources.update(
        PurePosixPath(mount["source"])
        for service, entry in runtime["services"].items() if service != "qdrant"
        for mount in entry["mounts"].values()
    )
    backing_devices = {}
    host_paths = {}
    for role in ("qdrant_storage", "qdrant_snapshot", "qdrant_temp"):
        path = runtime["effective"][f"{role}_root"]
        container_path = PurePosixPath(path)
        containing = [destination for destination in mounts if container_path.is_relative_to(destination)]
        if containing:
            parent = max(containing, key=len)
            mount = mounts[parent]
            require(mount["rw"], "Qdrant filesystem mount is read-only")
            backing = mount["source"]
        else:
            parent = "/"
            backing = qdrant_service["writable_layer"]
            require(backing is not None, "missing Qdrant writable layer evidence")
        host_path = PurePosixPath(backing) / container_path.relative_to(parent)
        nested_host_paths = []
        if role != "qdrant_storage":
            nested_host_paths = [
                PurePosixPath(mount["source"])
                for destination, mount in mounts.items()
                if destination != path and PurePosixPath(destination).is_relative_to(container_path)
            ]
        require(
            all(outside_backup_paths(resolved) and all(not overlaps(resolved, source) for source in protected_sources)
                for resolved in (host_path, *nested_host_paths)),
            "Qdrant filesystem overlaps a protected source",
        )
        # Root capacity evidence does not cover a mount below that root.
        require(not nested_host_paths, "missing Qdrant filesystem capacity for nested mount")
        host_paths[role] = host_path
        evidence = filesystems[role]
        check_filesystem(evidence, path, backing, str(host_path), capacities, required_bytes, required_inodes)
        require(backing_devices.setdefault(backing, evidence["device"]) == evidence["device"],
                "inconsistent Qdrant backing device")
    storage, snapshot, temp = (host_paths[role] for role in ("qdrant_storage", "qdrant_snapshot", "qdrant_temp"))
    require(not overlaps(snapshot, temp), "Qdrant snapshot and temp host paths overlap")
    for role, host_path in (("qdrant_snapshot", snapshot), ("qdrant_temp", temp)):
        container_path = PurePosixPath(runtime["effective"][f"{role}_root"])
        container_storage = runtime["effective"]["qdrant_storage_root"]
        require(
            not storage.is_relative_to(host_path)
            and (not host_path.is_relative_to(storage) or container_path.is_relative_to(container_storage)),
            "Qdrant scratch or snapshot host path overlaps storage",
        )


def check_filesystem(evidence, path, backing, host_path, capacities, required_bytes, required_inodes):
    fields(evidence, "canonical_path uid gid mode no_symlinks backing host_path device free_bytes free_inodes "
           "quotas_checked quota_bytes quota_inodes", "filesystem evidence")
    check_path_evidence(evidence, path)
    device = evidence["device"]
    require(evidence["backing"] == backing and evidence["host_path"] == host_path and matches(device, DEVICE_ID),
            "filesystem backing or device mismatch")
    free = (evidence["free_bytes"], evidence["free_inodes"])
    require(all(natural(value) for value in free) and capacities.setdefault(device, free) == free,
            "inconsistent filesystem capacity")
    require(evidence["quotas_checked"] is True, "missing filesystem quota review")
    for free_amount, quota, minimum, reason in (
        (free[0], evidence["quota_bytes"], required_bytes, "insufficient disk space"),
        (free[1], evidence["quota_inodes"], required_inodes, "insufficient filesystem inodes"),
    ):
        require(quota is None or natural(quota), "invalid filesystem quota capacity")
        require(free_amount >= minimum and (quota is None or quota >= minimum), reason)


def preflight(inventory):
    fields(inventory, "schema runtime sources versions stage reviewed", "inventory schema")
    require(type(inventory["schema"]) is int and inventory["schema"] == 3, "inventory version")
    require(inventory["reviewed"] is True, "inventory review evidence")
    runtime, sources = inventory["runtime"], inventory["sources"]
    check_runtime(runtime)
    items = check_sources(sources, runtime)
    check_versions(inventory["versions"])
    check_stage(inventory["stage"], runtime, sources, items)


def unique_keys(pairs):
    result = dict(pairs)
    require(len(result) == len(pairs), "duplicate inventory key")
    return result


def main():
    if sys.argv[1:] != ["--dry-run"]:
        print("Usage: python3 -I -B kamooni-backup-preflight.py --dry-run < inventory.json", file=sys.stderr)
        return 2
    try:
        raw = sys.stdin.buffer.read(MAX_INVENTORY_BYTES + 1)
        require(len(raw) <= MAX_INVENTORY_BYTES, "inventory too large")
        preflight(json.loads(raw.decode("utf-8"), object_pairs_hook=unique_keys))
    except Rejected as exc:
        print(f"DRY-RUN REJECTED: {exc}", file=sys.stderr)
        return 1
    except (ValueError, OSError, RecursionError):
        print("DRY-RUN REJECTED: unreadable or invalid JSON", file=sys.stderr)
        return 1

    print("DRY-RUN PASSED: supplied inventory meets Phase 1 checks.")
    print("Planned recovery set: MongoDB, DID files, app state, MinIO, Qdrant, runtime config and manifest.")
    print("Capture requires separately approved write-pause and restore procedures. Snapshot ID: none.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
