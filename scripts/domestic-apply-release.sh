#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/chitanda-geoip}
CURRENT=${CURRENT:-$APP_ROOT/current}
RELEASES=${RELEASES:-$APP_ROOT/releases}
INCOMING=${INCOMING:-$APP_ROOT/incoming}
LOG_DIR=${LOG_DIR:-/var/log/chitanda-geoip}
SERVICE=${SERVICE:-chitanda-geoip.service}
PORT_BASE=${PORT_BASE:-32220}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
NPM_BIN=${NPM_BIN:-$(command -v npm || true)}

FILES=(
  geolite2-city-ipv4.mmdb
  geolite2-city-ipv6.mmdb
  asn.mmdb
  geolite2-geo-whois-asn-country.mmdb
  ip2region_v4.xdb
  ip2region_v6.xdb
)

log() {
  mkdir -p "$LOG_DIR"
  printf '%s %s\n' "$(date -Is)" "$*" >> "$LOG_DIR/sync-deploy.log"
}

fail() {
  log "ERROR $*"
  echo "$*" >&2
  exit 1
}

valid_release() {
  [[ ${1:-} =~ ^[0-9]{14}$ || ${1:-} =~ ^data-[0-9]{8}$ ]]
}

valid_sha256() {
  [[ ${1:-} =~ ^[0-9a-fA-F]{64}$ ]]
}

detect_tools() {
  if [ -z "$NODE_BIN" ]; then
    NODE_BIN=$(find /usr/local/bin /usr/bin /root/.nvm/versions/node /opt -path '*/bin/node' -type f 2>/dev/null | sort -V | tail -n 1 || true)
  fi
  [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || fail "node executable not found"

  if [ -z "$NPM_BIN" ]; then
    if [ -x "$(dirname "$NODE_BIN")/npm" ]; then
      NPM_BIN="$(dirname "$NODE_BIN")/npm"
    else
      NPM_BIN=$(find /usr/local/bin /usr/bin /root/.nvm/versions/node /opt -path '*/bin/npm' -type f 2>/dev/null | sort -V | tail -n 1 || true)
    fi
  fi

  export PATH="$(dirname "$NODE_BIN"):${NPM_BIN:+$(dirname "$NPM_BIN"):}$PATH"
}

archive_paths_ok() {
  local archive=$1
  local entry normalized

  while IFS= read -r entry; do
    normalized=${entry#./}
    [ -n "$normalized" ] || continue
    case "$normalized" in
      .|chitanda-geoip-api/)
        ;;
      /*|../*|*/../*|*\\*)
        fail "unsafe archive entry: $entry"
        ;;
    esac
  done < <(tar -tzf "$archive")
}

payload_dir() {
  local extract=$1

  if [ -f "$extract/server.js" ]; then
    printf '%s\n' "$extract"
  elif [ -f "$extract/chitanda-geoip-api/server.js" ]; then
    printf '%s\n' "$extract/chitanda-geoip-api"
  else
    fail "archive payload does not contain server.js"
  fi
}

require_file() {
  local file=$1
  local min_size=$2
  [ -s "$file" ] || fail "missing file: $file"
  local size
  size=$(stat -c '%s' "$file")
  [ "$size" -ge "$min_size" ] || fail "file too small: $file $size < $min_size"
}

wait_http() {
  local url=$1
  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

validate_release_dir() {
  local dir=$1

  require_file "$dir/server.js" 1000
  require_file "$dir/package.json" 100
  require_file "$dir/package-lock.json" 100
  require_file "$dir/data/geolite2-city-ipv4.mmdb" 20000000
  require_file "$dir/data/geolite2-city-ipv6.mmdb" 10000000
  require_file "$dir/data/asn.mmdb" 5000000
  require_file "$dir/data/geolite2-geo-whois-asn-country.mmdb" 5000000
  require_file "$dir/data/ip2region_v4.xdb" 10000000
  require_file "$dir/data/ip2region_v6.xdb" 30000000

  "$NODE_BIN" --check "$dir/server.js" >/dev/null
  if [ -f "$dir/scripts/download-db.js" ]; then
    "$NODE_BIN" --check "$dir/scripts/download-db.js" >/dev/null
  fi

  if [ ! -d "$dir/node_modules" ]; then
    [ -n "$NPM_BIN" ] && [ -x "$NPM_BIN" ] || fail "npm executable not found"
    (cd "$dir" && "$NPM_BIN" ci --omit=dev)
  fi

  local port pid
  port=$((PORT_BASE + RANDOM % 1000))
  (
    cd "$dir"
    HOST=127.0.0.1 PORT="$port" "$NODE_BIN" server.js
  ) &
  pid=$!
  trap 'kill "$pid" 2>/dev/null || true' RETURN
  wait_http "http://127.0.0.1:$port/health" || fail "staged service health check failed"
  curl -fsS -H 'Accept-Language: zh-CN' "http://127.0.0.1:$port/geoip/8.8.8.8" | grep -q '"country_code":"US"' || fail "staged IPv4 smoke test failed"
  curl -fsS -H 'Accept-Language: zh-CN' "http://127.0.0.1:$port/geoip/1.1.1.1" | grep -q '"city":"Sydney"' || fail "staged coordinate fallback test failed"
  kill "$pid" 2>/dev/null || true
  trap - RETURN
}

restart_and_check() {
  systemctl restart "$SERVICE"
  wait_http http://127.0.0.1:3022/health || return 1
  curl -fsS -H 'Accept-Language: zh-CN' http://127.0.0.1:3022/geoip/8.8.8.8 | grep -q '"country_code":"US"'
}

cleanup_old() {
  mkdir -p "$RELEASES" "$INCOMING"
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | sort | head -n -5 | xargs -r rm -rf
  find "$INCOMING" -maxdepth 1 -type f -name 'chitanda-geoip-*.tgz*' -mtime +7 -delete
}

deploy_release() {
  local release=$1
  local sha=$2
  valid_release "$release" || fail "invalid release: $release"
  valid_sha256 "$sha" || fail "invalid sha256"
  detect_tools

  exec 9>/run/chitanda-geoip-deploy.lock
  flock -n 9 || fail "another deploy is running"

  mkdir -p "$RELEASES" "$INCOMING"
  chown geoipsync:geoipsync "$INCOMING" 2>/dev/null || true
  chmod 0750 "$INCOMING"

  local tmp archive extract payload stage target previous backup
  tmp="$INCOMING/chitanda-geoip-$release.tgz.tmp"
  archive="$INCOMING/chitanda-geoip-$release.tgz"
  extract=$(mktemp -d "$RELEASES/.extract-$release.XXXXXX")
  stage=$(mktemp -d "$RELEASES/.staging-$release.XXXXXX")
  target="$RELEASES/$release"
  previous=$(readlink -f "$CURRENT" 2>/dev/null || true)
  backup=""
  trap 'rm -rf "$extract" "$stage" "$backup"' EXIT

  [ -f "$tmp" ] || fail "archive tmp not found: $tmp"
  printf '%s  %s\n' "$sha" "$tmp" | sha256sum -c - >/dev/null || {
    rm -f "$tmp"
    fail "archive checksum mismatch"
  }
  mv -f "$tmp" "$archive"

  archive_paths_ok "$archive"
  tar --no-same-owner -xzf "$archive" -C "$extract"
  payload=$(payload_dir "$extract")
  rsync -a --delete "$payload/" "$stage/"
  printf '%s\n' "$release" > "$stage/.release-tag"
  validate_release_dir "$stage"

  if [ -d "$target" ]; then
    backup=$(mktemp -d "$RELEASES/.rollback-$release.XXXXXX")
    rmdir "$backup"
    mv "$target" "$backup"
  fi
  mv "$stage" "$target"
  stage=""
  ln -sfn "$target" "$CURRENT"

  if ! restart_and_check; then
    if [ -n "$backup" ] && [ -d "$backup" ]; then
      rm -rf "$target"
      mv "$backup" "$target"
      backup=""
      ln -sfn "$target" "$CURRENT"
      restart_and_check || true
    elif [ -n "$previous" ] && [ -d "$previous" ]; then
      ln -sfn "$previous" "$CURRENT"
      restart_and_check || true
    fi
    fail "deployed service check failed, rolled back"
  fi

  rm -rf "$backup" "$extract" "$archive"
  backup=""
  extract=""
  cleanup_old
  log "deployed release=$release sha=$sha"
  echo "deployed $release"
  trap - EXIT
}

remove_tmp() {
  local release=$1
  valid_release "$release" || fail "invalid release: $release"
  rm -f "$INCOMING/chitanda-geoip-$release.tgz.tmp"
}

case "${1:-}" in
  deploy)
    [ "$#" -eq 3 ] || fail "usage: deploy RELEASE SHA256"
    deploy_release "$2" "$3"
    ;;
  cleanup)
    [ "$#" -eq 1 ] || fail "usage: cleanup"
    cleanup_old
    ;;
  current)
    [ "$#" -eq 1 ] || fail "usage: current"
    readlink -f "$CURRENT"
    ;;
  health)
    [ "$#" -eq 1 ] || fail "usage: health"
    systemctl is-active "$SERVICE"
    curl -fsS http://127.0.0.1:3022/health
    ;;
  remove-tmp)
    [ "$#" -eq 2 ] || fail "usage: remove-tmp RELEASE"
    remove_tmp "$2"
    ;;
  *)
    fail "usage: $0 deploy|cleanup|current|health|remove-tmp"
    ;;
esac
