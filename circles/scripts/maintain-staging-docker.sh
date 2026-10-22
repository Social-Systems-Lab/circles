#!/usr/bin/env bash
# Conservatively remove obsolete Kamooni staging images and old dangling images.
set +x
set -eo pipefail

LOCK_FILE="${KAMOONI_STAGING_LOCK_FILE:-/run/lock/kamooni-staging-docker.lock}"
LEDGER="${KAMOONI_STAGING_IMAGE_LEDGER:-/home/ubuntu/.local/state/kamooni-staging/verified-images.tsv}"
IMAGE_REPOSITORY="kamooni-staging-circles"
PROJECT_NAME="kamooni_staging"
VERSION_URL="https://staging.kamooni.org/api/version"

[[ $# -eq 1 && ( "$1" == "--dry-run" || "$1" == "--execute" ) ]] || {
    echo "Usage: $0 --dry-run|--execute" >&2
    exit 2
}
MODE="$1"

exec 9>"$LOCK_FILE"
flock -x 9

fail() { echo "Error: $* No cleanup was started." >&2; exit 1; }
[[ -f "$LEDGER" ]] || fail "verified image ledger is missing: $LEDGER."
[[ ! -L "$LEDGER" ]] || fail "verified image ledger must not be a symlink."

declare -a ledger_shas=() ledger_ids=() ledger_tags=()
while IFS= read -r line || [[ -n "$line" ]]; do
    IFS=$'\t' read -r sha image_id tag timestamp extra <<<"$line"
    [[ -z "${extra:-}" && "$sha" =~ ^[0-9a-f]{40}$ && "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "verified image ledger is malformed."
    [[ "$tag" == "$IMAGE_REPOSITORY:${sha:0:8}" ]] || fail "ledger tag does not match its deployment SHA."
    [[ "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail "ledger timestamp is invalid."
    for existing_sha in "${ledger_shas[@]}"; do
        [[ "$existing_sha" != "$sha" ]] || fail "ledger contains a duplicate deployment SHA."
    done
    for existing_id in "${ledger_ids[@]}"; do
        [[ "$existing_id" != "$image_id" ]] || fail "ledger contains a duplicate image ID."
    done
    ledger_shas+=("$sha"); ledger_ids+=("$image_id"); ledger_tags+=("$tag")
done <"$LEDGER"
(( ${#ledger_ids[@]} > 0 )) || fail "verified image ledger is empty."

app_container_output="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME" --filter 'label=com.docker.compose.service=circles')" || fail "could not list staging containers."
app_containers=()
if [[ -n "$app_container_output" ]]; then
    while IFS= read -r container; do app_containers+=("$container"); done <<<"$app_container_output"
fi
[[ ${#app_containers[@]} -eq 1 ]] || fail "expected exactly one staging circles container."
container_id="${app_containers[0]}"
[[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == true ]] || fail "staging circles container is not running."
current_id="$(docker inspect --format '{{.Image}}' "$container_id")"
current_tag="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
current_sha="$(curl -fsSL "$VERSION_URL" | python3 -c 'import json,sys; value=json.load(sys.stdin).get("gitSha", ""); print(value); raise SystemExit(0 if isinstance(value,str) and len(value)==40 and all(c in "0123456789abcdef" for c in value) else 1)')" || fail "version endpoint is unavailable or invalid."
last=$(( ${#ledger_ids[@]} - 1 ))
[[ "$current_id" == "${ledger_ids[$last]}" && "$current_tag" == "${ledger_tags[$last]}" && "$current_sha" == "${ledger_shas[$last]}" ]] || fail "running container, version endpoint, and latest ledger entry disagree."

# The three retained records must still resolve to the exact immutable images named.
first_retained=0
(( ${#ledger_ids[@]} > 3 )) && first_retained=$(( ${#ledger_ids[@]} - 3 ))
for ((i=first_retained; i<${#ledger_ids[@]}; i++)); do
    resolved="$(docker image inspect --format '{{.Id}}' "${ledger_tags[$i]}" 2>/dev/null)" || fail "retained ledger image is missing: ${ledger_tags[$i]}."
    [[ "$resolved" == "${ledger_ids[$i]}" ]] || fail "retained ledger tag points at the wrong image: ${ledger_tags[$i]}."
done

preserved_ids=()
candidates=()
for ((i=first_retained; i<${#ledger_ids[@]}; i++)); do preserved_ids+=("${ledger_ids[$i]}"); done

array_contains() {
    local wanted="$1" value
    shift
    for value in "$@"; do [[ "$value" == "$wanted" ]] && return 0; done
    return 1
}

repo_output="$(docker image ls --no-trunc --format '{{.Repository}}\t{{.Tag}}\t{{.ID}}' "$IMAGE_REPOSITORY")" || fail "could not list staging application images."
if [[ -n "$repo_output" ]]; then
    while IFS= read -r row; do
        IFS=$'\t' read -r repository tag image_id extra <<<"$row"
        [[ -z "${extra:-}" && "$repository" == "$IMAGE_REPOSITORY" && "$tag" != "<none>" && "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Docker returned an inconsistent application image listing."
        [[ "$tag" =~ ^[0-9a-f]{8}$ ]] || fail "unexpected staging application image tag: $repository:$tag."
        [[ "$(docker image inspect --format '{{.Id}}' "$repository:$tag")" == "$image_id" ]] || fail "application image changed during inspection."
        # Unknown pre-ledger images are never deleted. Only the ledger can verify an image.
        if (( ${#ledger_ids[@]} >= 3 )) && array_contains "$image_id" "${ledger_ids[@]}" && ! array_contains "$image_id" "${preserved_ids[@]}"; then
            array_contains "$image_id" "${candidates[@]}" || candidates+=("$image_id")
        fi
    done <<<"$repo_output"
fi

for image_id in "${candidates[@]}"; do
    [[ "$image_id" != "$current_id" ]] || fail "current image was selected for deletion."
    references="$(docker ps -aq --filter "ancestor=$image_id")" || fail "could not check container references for $image_id."
    [[ -z "$references" ]] || fail "obsolete image is still referenced by a container: $image_id."
    repo_tags="$(docker image inspect --format '{{json .RepoTags}}' "$image_id")" || fail "could not inspect ownership for $image_id."
    python3 - "$repo_tags" "$IMAGE_REPOSITORY" <<'PY' || fail "obsolete image has missing, malformed, or foreign repository tags: $image_id."
import json, re, sys
try:
    tags = json.loads(sys.argv[1])
except (json.JSONDecodeError, TypeError):
    raise SystemExit(1)
repository = re.escape(sys.argv[2])
if not isinstance(tags, list) or not tags or any(not isinstance(tag, str) or not re.fullmatch(repository + r":[0-9a-f]{8}", tag) for tag in tags):
    raise SystemExit(1)
PY
done

if (( ${#ledger_ids[@]} < 3 )); then
    echo "Bootstrap mode: fewer than three verified deployments; preserving all $IMAGE_REPOSITORY images."
fi
if [[ "$MODE" == "--dry-run" ]]; then
    for image_id in "${candidates[@]}"; do echo "Would remove verified obsolete staging application image: $image_id"; done
    echo "Would prune unused dangling images older than 168h."
    exit 0
fi

for image_id in "${candidates[@]}"; do
    docker image rm "$image_id"
done
# This duration syntax is compatible with legacy Docker releases.
docker image prune --force --filter dangling=true --filter until=168h
