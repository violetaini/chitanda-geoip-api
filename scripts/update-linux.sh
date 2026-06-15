#!/usr/bin/env bash
set -euo pipefail

REPO=${REPO:-violetaini/chitanda-geoip-api}
APP_ROOT=${APP_ROOT:-/opt/chitanda-geoip-api}
CURRENT=${CURRENT:-$APP_ROOT/current}
RELEASES_DIR=${RELEASES_DIR:-$APP_ROOT/releases}
SERVICE_NAME=${SERVICE_NAME:-chitanda-geoip-api.service}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
NPM_BIN=${NPM_BIN:-$(command -v npm || true)}
KEEP_RELEASES=${KEEP_RELEASES:-3}
BASE_URL=${BASE_URL:-http://127.0.0.1:3022}

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

export PATH="$(dirname "$NODE_BIN"):$(dirname "$NPM_BIN"):$PATH"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required" >&2
    exit 1
  }
}

need curl
need tar
need sha256sum
need rsync

LOCK_FILE=/run/chitanda-geoip-api-update.lock
CURRENT_RELEASE_FILE="$CURRENT/.release-tag"

exec 9>"$LOCK_FILE"
flock -n 9 || {
  echo "another update is running" >&2
  exit 1
}

tmp_dir=$(mktemp -d)
stage=""
backup=""
cleanup() {
  rm -rf "$tmp_dir"
  if [ -n "$stage" ] && [ -d "$stage" ]; then
    rm -rf "$stage"
  fi
  if [ -n "$backup" ] && [ -d "$backup" ]; then
    rm -rf "$backup"
  fi
}
trap cleanup EXIT

rollback() {
  if [ -n "${target:-}" ] && [ -n "$backup" ] && [ -d "$backup" ]; then
    rm -rf "$target"
    mv "$backup" "$target"
    backup=""
    ln -sfn "$target" "$CURRENT"
  elif [ -n "${previous:-}" ] && [ -d "$previous" ]; then
    if [ -n "${target:-}" ] && [ "$previous" != "$target" ]; then
      rm -rf "$target"
    fi
    ln -sfn "$previous" "$CURRENT"
  fi

  systemctl restart "$SERVICE_NAME" || true
}

validate_service() {
  for _ in $(seq 1 40); do
    if curl -fsS "$BASE_URL/health" >/dev/null \
      && curl -fsS -H 'Accept-Language: zh-CN' "$BASE_URL/geoip/1.1.1.1" | grep -q '"city":"Sydney"' \
      && curl -fsS -H 'Accept-Language: zh-CN' "$BASE_URL/geoip/8.8.8.8" | grep -q '"country_code":"US"'; then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

api_url="https://api.github.com/repos/$REPO/releases/latest"
latest_json="$tmp_dir/latest.json"
curl -fsSL --retry 3 --retry-delay 3 \
  -H 'Accept: application/vnd.github+json' \
  -o "$latest_json" "$api_url"

tag=$("$NODE_BIN" -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(j.tag_name || '')" "$latest_json")
if [ -z "$tag" ]; then
  echo "latest release tag not found" >&2
  exit 1
fi

current_tag=""
if [ -f "$CURRENT_RELEASE_FILE" ]; then
  current_tag=$(cat "$CURRENT_RELEASE_FILE")
fi

if [ "$tag" = "$current_tag" ] && [ "${FORCE_UPDATE:-0}" != "1" ]; then
  echo "already up to date: $tag"
  exit 0
fi

base_url="https://github.com/$REPO/releases/download/$tag"
archive="$tmp_dir/chitanda-geoip-api-with-data.tar.gz"
checksum="$tmp_dir/chitanda-geoip-api-with-data.tar.gz.sha256"

curl -fL --retry 3 --retry-delay 3 -o "$archive" "$base_url/chitanda-geoip-api-with-data.tar.gz"
curl -fL --retry 3 --retry-delay 3 -o "$checksum" "$base_url/chitanda-geoip-api-with-data.tar.gz.sha256"
(cd "$tmp_dir" && sha256sum -c "$(basename "$checksum")")

extract_dir="$tmp_dir/extract"
mkdir -p "$extract_dir"
tar -xzf "$archive" -C "$extract_dir"

install -d -m 0755 "$RELEASES_DIR"
stage=$(mktemp -d "$RELEASES_DIR/.staging-$tag.XXXXXX")
rsync -a --delete "$extract_dir/chitanda-geoip-api/" "$stage/"

(cd "$stage" && "$NODE_BIN" --check server.js)
if [ -f "$stage/scripts/download-db.js" ]; then
  (cd "$stage" && "$NODE_BIN" --check scripts/download-db.js)
fi
(cd "$stage" && "$NPM_BIN" ci --omit=dev)

previous=$(readlink -f "$CURRENT" 2>/dev/null || true)
target="$RELEASES_DIR/$tag"

if [ -d "$target" ]; then
  backup=$(mktemp -d "$RELEASES_DIR/.rollback-$tag.XXXXXX")
  rmdir "$backup"
  mv "$target" "$backup"
fi
mv "$stage" "$target"
stage=""
ln -sfn "$target" "$CURRENT"
printf '%s\n' "$tag" > "$target/.release-tag"

if ! systemctl restart "$SERVICE_NAME"; then
  rollback
  echo "service restart failed, rolled back" >&2
  exit 1
fi

if ! validate_service; then
  rollback
  echo "service validation failed, rolled back" >&2
  exit 1
fi

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | sort | head -n "-$KEEP_RELEASES" | xargs -r rm -rf

echo "updated to $tag"
