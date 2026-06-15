#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/chitanda-geoip}
CURRENT=${CURRENT:-$APP_ROOT/current}
WORK_DIR=${WORK_DIR:-$APP_ROOT/update-work}
DOMESTIC_HOST=${DOMESTIC_HOST:-110.42.32.161}
DOMESTIC_PORT=${DOMESTIC_PORT:-30222}
DOMESTIC_USER=${DOMESTIC_USER:-geoipsync}
SYNC_KEY=${SYNC_KEY:-/root/.ssh/chitanda_geoip_sync}
RELEASE=${RELEASE:-$(cat "$CURRENT/.release-tag" 2>/dev/null || basename "$(readlink -f "$CURRENT")")}
RSYNC_RETRIES=${RSYNC_RETRIES:-10}
RSYNC_RETRY_DELAY=${RSYNC_RETRY_DELAY:-180}
RSYNC_IO_TIMEOUT=${RSYNC_IO_TIMEOUT:-180}

case "$RELEASE" in
  data-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]|[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9])
    ;;
  *)
    echo "invalid release name: $RELEASE" >&2
    exit 1
    ;;
esac

if [ ! -d "$CURRENT" ]; then
  echo "current release not found: $CURRENT" >&2
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required" >&2
    exit 1
  }
}

need rsync
need ssh
need tar
need sha256sum

SSH_OPTS=(-i "$SYNC_KEY" -p "$DOMESTIC_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o TCPKeepAlive=yes)
RSYNC_SSH_CMD="ssh -i $SYNC_KEY -p $DOMESTIC_PORT -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o TCPKeepAlive=yes"

mkdir -p "$WORK_DIR"
archive="$WORK_DIR/chitanda-geoip-$RELEASE.tgz"
remote_tmp="chitanda-geoip-$RELEASE.tgz.tmp"

tar -czf "$archive" -C "$CURRENT" .
archive_sha=$(sha256sum "$archive" | awk '{print $1}')

for attempt in $(seq 1 "$RSYNC_RETRIES"); do
  echo "rsync release to domestic node attempt $attempt/$RSYNC_RETRIES"
  if rsync -a --partial --append-verify --timeout="$RSYNC_IO_TIMEOUT" \
    -e "$RSYNC_SSH_CMD" \
    "$archive" "$DOMESTIC_USER@$DOMESTIC_HOST:$remote_tmp"; then
    if ssh "${SSH_OPTS[@]}" "$DOMESTIC_USER@$DOMESTIC_HOST" "deploy $RELEASE $archive_sha"; then
      ssh "${SSH_OPTS[@]}" "$DOMESTIC_USER@$DOMESTIC_HOST" cleanup || true
      rm -f "$archive"
      echo "domestic updated to $RELEASE"
      exit 0
    fi
    ssh "${SSH_OPTS[@]}" "$DOMESTIC_USER@$DOMESTIC_HOST" "remove-tmp $RELEASE" || true
  fi

  if [ "$attempt" -lt "$RSYNC_RETRIES" ]; then
    echo "sync failed, retrying in ${RSYNC_RETRY_DELAY}s"
    sleep "$RSYNC_RETRY_DELAY"
  fi
done

echo "domestic sync failed after $RSYNC_RETRIES attempts" >&2
exit 1
