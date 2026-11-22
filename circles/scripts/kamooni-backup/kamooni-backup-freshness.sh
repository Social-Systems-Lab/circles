#!/bin/bash
set +x
set -euo pipefail
umask 077

fail() {
    printf 'Kamooni backup freshness check failed (%s).\n' "$1" >&2
    exit 1
}

state_dir=${STATE_DIRECTORY:-}
[[ $EUID == 0 && -d $state_dir && ! -L $state_dir &&
    $(stat -c '%u:%g:%a' -- "$state_dir") == 0:0:700 ]] || fail 'expected a root-only systemd state directory'
alert_marker=$state_dir/alert-sent

has_success_since() {
    local entries
    entries=$(journalctl --unit=kamooni-backup.service --since="$1" --until=now \
        --no-pager --quiet --output=cat) || fail 'cannot read the backup journal'
    LC_ALL=C grep -Eq '^Kamooni backup succeeded kamooni-[0-9]{8}T[0-9]{6}Z\.[A-Za-z0-9]{8}\.$' <<< "$entries"
}

now=$(date +%s)
cutoff=$((now - 28 * 60 * 60))
if has_success_since "@$cutoff"; then
    rm -f -- "$alert_marker"
    printf '%s\n' 'Kamooni backup succeeded within the last 28 hours.'
    exit 0
fi

if [[ -f $alert_marker ]]; then
    alerted_at=$(date -r "$alert_marker" +%s)
    # Also recognize a recovery that happened while the monitor was offline.
    if (( alerted_at >= cutoff )) || ! has_success_since "@$alerted_at"; then
        printf '%s\n' 'Kamooni missed-backup alert already sent for this incident.'
        exit 0
    fi
fi

config_dir=${KAMOONI_BACKUP_CONFIG_DIR:-/root/kamooni-backup-config}
payload=$(python3 -I - "$config_dir/postmark.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config:
    existing = json.load(config)

payload = {
    "From": existing["From"],
    "To": "tim@socialsystems.io",
    "Subject": "[Kamooni backup] No successful backup in 28 hours on kamooniorg",
    "TextBody": "The journal has no successful Kamooni backup in the last 28 hours. "
    "On kamooniorg, check systemctl list-timers kamooni-backup.timer --all "
    "and journalctl -u kamooni-backup.service -n 50.",
}
if "MessageStream" in existing:
    payload["MessageStream"] = existing["MessageStream"]
print(json.dumps(payload))
PY
) || fail 'cannot read the existing Postmark sender configuration'

curl -q --fail --silent --max-time 30 --output /dev/null \
    --header 'Content-Type: application/json' --header "@$config_dir/postmark.header" \
    --data-binary "$payload" https://api.postmarkapp.com/email || fail 'Postmark request failed'
touch -d "@$now" -- "$alert_marker"
printf '%s\n' 'Kamooni missed-backup alert sent.'
