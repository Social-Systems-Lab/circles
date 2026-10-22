#!/usr/bin/env bash
# Install, inspect, or remove the Kamooni staging Docker maintenance timer.
set +x
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
SYSTEMD_DIR="${KAMOONI_STAGING_SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${KAMOONI_STAGING_SYSTEMCTL:-systemctl}"
SERVICE="kamooni-staging-docker-maintenance.service"
TIMER="kamooni-staging-docker-maintenance.timer"

[[ $# -eq 1 && ( "$1" == install || "$1" == status || "$1" == remove ) ]] || {
    echo "Usage: $0 install|status|remove" >&2
    exit 2
}

if [[ "$SYSTEMD_DIR" == /etc/systemd/system && ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Error: run this command with sudo." >&2
    exit 1
fi

case "$1" in
    install)
        # Validation must succeed before unit files or timer state are changed.
        if [[ "$SYSTEMD_DIR" == /etc/systemd/system ]]; then
            runuser --user ubuntu -- "$SCRIPT_DIR/maintain-staging-docker.sh" --dry-run
        else
            "$SCRIPT_DIR/maintain-staging-docker.sh" --dry-run
        fi
        install -o root -g root -m 0644 "$APP_DIR/systemd/$SERVICE" "$SYSTEMD_DIR/$SERVICE"
        install -o root -g root -m 0644 "$APP_DIR/systemd/$TIMER" "$SYSTEMD_DIR/$TIMER"
        "$SYSTEMCTL" daemon-reload
        "$SYSTEMCTL" enable --now "$TIMER"
        "$SYSTEMCTL" status --no-pager "$TIMER"
        ;;
    status)
        "$SYSTEMCTL" status --no-pager "$TIMER"
        "$SYSTEMCTL" list-timers --all --no-pager "$TIMER"
        ;;
    remove)
        "$SYSTEMCTL" disable --now "$TIMER"
        rm -f -- "$SYSTEMD_DIR/$TIMER" "$SYSTEMD_DIR/$SERVICE"
        "$SYSTEMCTL" daemon-reload
        "$SYSTEMCTL" reset-failed "$SERVICE" "$TIMER" || true
        ;;
esac
