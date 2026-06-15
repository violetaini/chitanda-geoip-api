#!/usr/bin/env bash
set -euo pipefail

REPO=${REPO:-violetaini/chitanda-geoip-api}
APP_ROOT=${APP_ROOT:-/opt/chitanda-geoip-api}
CURRENT=${CURRENT:-$APP_ROOT/current}
RELEASES_DIR=${RELEASES_DIR:-$APP_ROOT/releases}
SERVICE_NAME=${SERVICE_NAME:-chitanda-geoip-api.service}
TIMER_NAME=${TIMER_NAME:-chitanda-geoip-api-update.timer}
UPDATE_BIN=${UPDATE_BIN:-/usr/local/sbin/chitanda-geoip-api-update}
UPDATE_SERVICE_NAME=${UPDATE_SERVICE_NAME:-chitanda-geoip-api-update.service}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
NPM_BIN=${NPM_BIN:-$(command -v npm || true)}
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-3022}

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "node executable not found; install Node.js 20+ first" >&2
  exit 1
fi

if [ -z "$NPM_BIN" ] && [ -x "$(dirname "$NODE_BIN")/npm" ]; then
  NPM_BIN="$(dirname "$NODE_BIN")/npm"
fi

if [ -z "$NPM_BIN" ] || [ ! -x "$NPM_BIN" ]; then
  echo "npm executable not found; install npm first" >&2
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required" >&2
    exit 1
  }
}

need curl
need rsync
need tar
need sha256sum

install -d -m 0755 "$RELEASES_DIR"

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

base_url="https://github.com/$REPO/releases/latest/download"
archive="$tmp_dir/chitanda-geoip-api-with-data.tar.gz"
checksum="$tmp_dir/chitanda-geoip-api-with-data.tar.gz.sha256"
latest_json="$tmp_dir/latest.json"

curl -fsSL --retry 3 --retry-delay 3 \
  -H 'Accept: application/vnd.github+json' \
  -o "$latest_json" "https://api.github.com/repos/$REPO/releases/latest"
tag=$("$NODE_BIN" -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(j.tag_name || '')" "$latest_json")
if [ -z "$tag" ]; then
  echo "latest release tag not found" >&2
  exit 1
fi
curl -fL --retry 3 --retry-delay 3 -o "$archive" "$base_url/chitanda-geoip-api-with-data.tar.gz"
curl -fL --retry 3 --retry-delay 3 -o "$checksum" "$base_url/chitanda-geoip-api-with-data.tar.gz.sha256"
(cd "$tmp_dir" && sha256sum -c "$(basename "$checksum")")

rm -rf "$tmp_dir/extract"
mkdir -p "$tmp_dir/extract"
tar -xzf "$archive" -C "$tmp_dir/extract"
stage="$RELEASES_DIR/$tag"
rm -rf "$stage"
mkdir -p "$stage"
rsync -a --delete "$tmp_dir/extract/chitanda-geoip-api/" "$stage/"
printf '%s\n' "$tag" > "$stage/.release-tag"

(cd "$stage" && "$NPM_BIN" ci --omit=dev)
ln -sfn "$stage" "$CURRENT"

cat >"/etc/systemd/system/$SERVICE_NAME" <<EOF
[Unit]
Description=Chitanda GeoIP API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$CURRENT
Environment=HOST=$HOST
Environment=PORT=$PORT
Environment=GEOIP_DATA_DIR=$CURRENT/data
Environment=TRUST_PROXY=1
ExecStart=$NODE_BIN $CURRENT/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

install -m 0755 "$CURRENT/scripts/update-linux.sh" "$UPDATE_BIN"

cat >"/etc/systemd/system/$UPDATE_SERVICE_NAME" <<EOF
[Unit]
Description=Update Chitanda GeoIP API package
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=REPO=$REPO
Environment=APP_ROOT=$APP_ROOT
Environment=SERVICE_NAME=$SERVICE_NAME
Environment=NODE_BIN=$NODE_BIN
Environment=NPM_BIN=$NPM_BIN
Environment=BASE_URL=http://$HOST:$PORT
ExecStart=$UPDATE_BIN
EOF

cat >"/etc/systemd/system/$TIMER_NAME" <<EOF
[Unit]
Description=Daily Chitanda GeoIP API package update

[Timer]
OnCalendar=*-*-* 04:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
systemctl enable --now "$TIMER_NAME"

for _ in $(seq 1 40); do
  if curl -fsS "http://$HOST:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

curl -fsS "http://$HOST:$PORT/health"
echo
systemctl list-timers --all "$TIMER_NAME" --no-pager
