#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077

# Tool diagnostics can contain URIs, local credentials, DIDs or object keys.
exec 3>&2 >/dev/null 2>/dev/null
step='open private log'
log_open=0
log() {
    printf '%s\n' "$1" >&3 || return
    if (( log_open )); then
        printf '%s\n' "$1" >&4
    fi
}
fail() {
    log "Kamooni backup failed ($step)." || :
    exit 1
}
trap fail ERR
trap 'exit 1' HUP INT TERM

log_dir=/var/log/kamooni-backup
log_file=$log_dir/backup.log
[[ $EUID == 0 ]] || fail
[[ -d $log_dir ]] || mkdir -m 700 -- "$log_dir"
[[ ! -L $log_dir && $(stat -c '%u:%g:%a' -- "$log_dir") == 0:0:700 ]] || fail
if [[ ! -e $log_file && ! -L $log_file ]]; then
    (set -o noclobber; : > "$log_file") || [[ -f $log_file ]] || fail
fi
[[ -f $log_file && ! -L $log_file && $(stat -c '%u:%g:%a:%h' -- "$log_file") == 0:0:600:1 ]] || fail
exec 4>>"$log_file"
log_open=1

step='check configuration'
config_dir=${KAMOONI_BACKUP_CONFIG_DIR:-/root/kamooni-backup-config}
private_file() {
    [[ -f "$1" && ! -L "$1" && -s "$1" && $(stat -c '%u:%a' -- "$1") =~ ^0:(400|600)$ ]]
}
[[ -d "$config_dir" && ! -L "$config_dir" &&
    $(stat -c '%u:%a' -- "$config_dir") == 0:700 ]] || fail
config_dir=$(realpath -- "$config_dir")

step='check failure email configuration'
private_file "$config_dir/postmark.header" && private_file "$config_dir/postmark.json" || fail
if [[ ${1:-} == --notify-failure && $# == 1 ]]; then
    step='send failure email'
    curl -q --fail --silent --max-time 30 --output /dev/null \
        --header 'Content-Type: application/json' --header "@$config_dir/postmark.header" \
        --data-binary "@$config_dir/postmark.json" https://api.postmarkapp.com/email
    log 'Kamooni backup failure email sent.'
    exit 0
fi
[[ $# == 0 ]] || fail

step='check backup credentials'
for file in restic.env restic.pass mongo.yaml; do
    private_file "$config_dir/$file" || fail
done
unset RESTIC_REPOSITORY RESTIC_REPOSITORY_FILE RESTIC_PASSWORD RESTIC_PASSWORD_COMMAND
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
set -a
# shellcheck source=/dev/null
source "$config_dir/restic.env" >/dev/null
set +a
[[ ${RESTIC_REPOSITORY:-} == s3:* && -n ${AWS_ACCESS_KEY_ID:-} && -n ${AWS_SECRET_ACCESS_KEY:-} ]] || fail
export RESTIC_PASSWORD_FILE="$config_dir/restic.pass"
# This repo already exists. A bad endpoint, key or password must stop the run.
step='open Restic repository'
restic cat config >/dev/null

step='read backup source configuration'
private_file "$config_dir/backup.conf" || fail
MINIO_BUCKETS=()
CONFIG_PATHS=()
# shellcheck source=/dev/null
source "$config_dir/backup.conf" >/dev/null
(( ${#MINIO_BUCKETS[@]} > 0 && ${#CONFIG_PATHS[@]} > 0 )) || fail
config_paths=()
config_tar_flags=()
env_link=/root/circles/circles/circles/.env
env_target=/home/ubuntu/migration-export/.env
archive_env_link=0
for path in "${CONFIG_PATHS[@]}"; do
    [[ $path == /* ]] || fail
    if [[ -L $path ]]; then
        [[ $path == "$env_link" ]] || fail
        IFS= read -r -d '' link_target < <(readlink -z -- "$path") || fail
        [[ $link_target == "$env_target" ]] || fail
        if (( ! archive_env_link )); then
            # Pin the two parent directories. Tar must never follow either final file name.
            for env_path in "$env_link" "$env_target"; do
                [[ $env_path != "$config_dir/"* ]] || fail
                exec {dir_fd}<"${env_path%/*}"
                pinned=proc/$$/fd/$dir_fd
                IFS= read -r -d '' parent < <(realpath -ez -- "/$pinned") || fail
                [[ $parent == "${env_path%/*}" ]] || fail
                config_paths+=("$pinned/.env")
                relative_env=${env_path#/}
                config_tar_flags+=("--transform=flags=r;s|^$pinned/|${relative_env%/*}/|")
            done
            [[ -f /$pinned/.env && ! -L /$pinned/.env && -s /$pinned/.env ]] || fail
            archive_env_link=1
        fi
        continue
    fi
    path=$(realpath -e -- "$path")
    [[ $path != / && $path != "$config_dir" && $path != "$config_dir/"* && $config_dir != "$path/"* ]] || fail
    [[ -d $path || ( -f $path && -s $path ) ]] || fail
    config_paths+=("${path#/}")
done

# Read the actual local volumes attached to running Compose containers.
docker_local=(docker --host unix:///var/run/docker.sock)
container() {
    local id
    id=$("${docker_local[@]}" ps -q --filter label=com.docker.compose.project=circles \
        --filter "label=com.docker.compose.service=$1") || return
    [[ $id =~ ^[0-9a-f]{12,64}$ ]] || return 1
    printf '%s\n' "$id"
}
mount_source() {
    local path
    path=$("${docker_local[@]}" inspect --format \
        "{{range .Mounts}}{{if and (eq .Destination \"$2\") (eq .Type \"volume\") (eq .Driver \"local\") (eq .Name \"$3\")}}{{println .Source}}{{end}}{{end}}" "$1") || return
    [[ $path == /*/"$3"/_data && -d $path && ! -L $path ]] || return 1
    printf '%s\n' "$path"
}

step='check running volumes'
app=$(container circles)
db=$(container db)
minio=$(container minio)
app_data=$(mount_source "$app" /circles circles_circles)
user_data=$(mount_source "$app" /circles/users circles_circles_users)
minio_data=$(mount_source "$minio" /data circles_minio)
step='check DID data'
[[ -s "$app_data/server/privateKey.pem" && -s "$app_data/server/publicKey.pem" &&
    -n $(find "$user_data" -type f -name privateKey.pem.enc -size +0c -print -quit) ]] || fail

step='check single-drive MinIO data'
python3 -I -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
assert data["format"] == "xl-single" and [len(s) for s in data["xl"]["sets"]] == [1]
' "$minio_data/.minio.sys/format.json"
for bucket in "${MINIO_BUCKETS[@]}"; do
    [[ $bucket =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ && -d "$minio_data/$bucket" &&
        ! -L "$minio_data/$bucket" ]] || fail
done

step='create private staging directory'
stage=$(mktemp -d "/var/tmp/kamooni-$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
run_id=${stage##*/}
cd "$stage"
mkdir set
printf '%s\n' "$run_id" > set/run-id
log "Kamooni backup started $run_id."

step='dump and validate MongoDB'
# A server-level URI plus no --db includes admin users/roles and all dumpable databases.
mongodump --config "$config_dir/mongo.yaml" --gzip --out set/mongo >/dev/null
for namespace in admin/system.users circles/circles; do
    [[ -s "set/mongo/$namespace.bson.gz" ]] || fail
    bytes=$(gzip -cd -- "set/mongo/$namespace.bson.gz" | wc -c)
    (( bytes > 0 )) || fail
done
find set/mongo -type f -name '*.gz' -exec gzip -t -- {} +

step='archive DID volumes'
tar_flags=(--numeric-owner --acls --xattrs)
tar "${tar_flags[@]}" --exclude='./users' -cf set/app-data.tar -C "$app_data" .
tar "${tar_flags[@]}" -cf set/user-data.tar -C "$user_data" .
step='archive MinIO volume'
# Keep object bytes, xl.meta, versions, bucket settings and IAM on the same drive.
tar "${tar_flags[@]}" --exclude='./.minio.sys/tmp' -cf set/minio.tar -C "$minio_data" .
step='verify required buckets in MinIO archive'
python3 -I -c '
import sys, tarfile
with tarfile.open("set/minio.tar", "r:") as archive:
    required = set(sys.argv[1:])
    for member in iter(archive.next, None):
        if member.isdir():
            required.discard(member.name.removeprefix("./"))
        if not required:
            break
        # Python 3.12 normally retains every header in memory.
        archive.members.clear()
    if required:
        sys.exit(1)
' "${MINIO_BUCKETS[@]}"
step='archive recovery configuration'
image_version() {
    local image
    image=$("${docker_local[@]}" inspect --format '{{.Image}}' "$1")
    "${docker_local[@]}" image inspect --format '{{.Id}} {{join .RepoDigests " "}}' "$image"
}
{
    printf 'MongoDB image: '
    image_version "$db"
    printf 'MinIO image: '
    image_version "$minio"
    "${docker_local[@]}" exec "$app" cat /app/VERSION
} > set/runtime.txt
tar "${tar_flags[@]}" "${config_tar_flags[@]}" -cf set/config.tar -C / -- "${config_paths[@]}"
if (( archive_env_link )); then
    python3 -I -c '
import sys, tarfile
link, target = sys.argv[1:]
with tarfile.open("set/config.tar", "r:") as archive:
    link_member = archive.getmember(link.lstrip("/"))
    target_member = archive.getmember(target.lstrip("/"))
    if not (link_member.issym() and link_member.linkname == target
            and target_member.isreg() and target_member.size > 0):
        sys.exit(1)
' "$env_link" "$env_target"
fi

step='upload complete set to Restic'
# Restic exit 3 can leave a snapshot. Only exit 0 permits the restore tag.
restic --json backup --host kamooni --tag kamooni-pending --tag "$run_id" set > result.jsonl
candidate=$(python3 -I -c '
import json, re, sys
summaries = [r for r in map(json.loads, sys.stdin) if r.get("message_type") == "summary"]
(snapshot,) = [r["snapshot_id"] for r in summaries]
assert re.fullmatch(r"[0-9a-f]{8,64}", snapshot)
print(snapshot)
' < result.jsonl)
step='mark the snapshot eligible for restore'
restic tag --add kamooni-daily --remove kamooni-pending "$candidate" >/dev/null
step='verify Restic snapshot tags'
snapshot=$(restic snapshots --json --host kamooni | python3 -I -c '
from collections import Counter
import json, re, sys
snapshots = json.load(sys.stdin) or []
tag_sets = [set(s.get("tags") or []) for s in snapshots]
(snapshot,) = [s for s, tags in zip(snapshots, tag_sets) if sys.argv[1] in tags]
assert "kamooni-daily" in snapshot["tags"] and "kamooni-pending" not in snapshot["tags"]
assert re.fullmatch(r"[0-9a-f]{64}", snapshot["id"])
# Restic 0.16.4 can leave the old pending ID when saving the replacement.
# Block retention if a previous ambiguous run still has a daily copy.
run_ids = Counter(tag for tags in tag_sets for tag in tags
                  if re.fullmatch(r"kamooni-\d{8}T\d{6}Z\.[A-Za-z0-9]{8}", tag))
for tags in tag_sets:
    if "kamooni-daily" in tags:
        assert "kamooni-pending" not in tags and all(run_ids[tag] <= 1 for tag in tags)
print(snapshot["id"])
' "$run_id")
log "Kamooni backup stored $run_id as $snapshot."

step='apply 30-day Restic retention'
restic forget --host kamooni --tag kamooni-daily --group-by host --keep-daily 30 --prune >/dev/null
log "Kamooni backup succeeded $run_id."
