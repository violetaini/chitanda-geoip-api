#!/usr/bin/env bash
set -euo pipefail

REPO=${REPO:-violetaini/chitanda-geoip-api}
INSTALL_SCRIPT=${INSTALL_SCRIPT:-scripts/install-linux.sh}

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root, for example: curl -fsSL ... | sudo bash" >&2
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required" >&2
    exit 1
  }
}

need curl
need sed
need tar
need sha256sum

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

latest_json="$tmp_dir/latest.json"
archive="$tmp_dir/chitanda-geoip-api-with-data.tar.gz"
checksum="$tmp_dir/chitanda-geoip-api-with-data.tar.gz.sha256"
extract_dir="$tmp_dir/extract"

echo "downloading latest Chitanda GeoIP API release from $REPO"
curl -fsSL --retry 3 --retry-delay 3 \
  -H 'Accept: application/vnd.github+json' \
  -o "$latest_json" "https://api.github.com/repos/$REPO/releases/latest"
tag=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$latest_json" | head -n 1)
if [ -z "$tag" ]; then
  echo "latest release tag not found" >&2
  exit 1
fi

base_url="https://github.com/$REPO/releases/download/$tag"
curl -fL --retry 3 --retry-delay 3 -o "$archive" "$base_url/chitanda-geoip-api-with-data.tar.gz"
curl -fL --retry 3 --retry-delay 3 -o "$checksum" "$base_url/chitanda-geoip-api-with-data.tar.gz.sha256"
(cd "$tmp_dir" && sha256sum -c "$(basename "$checksum")")

mkdir -p "$extract_dir"
tar -xzf "$archive" -C "$extract_dir"

if [ ! -f "$extract_dir/chitanda-geoip-api/$INSTALL_SCRIPT" ]; then
  echo "install script not found in release package: $INSTALL_SCRIPT" >&2
  exit 1
fi

PACKAGE_ARCHIVE="$archive" PACKAGE_TAG="$tag" bash "$extract_dir/chitanda-geoip-api/$INSTALL_SCRIPT"
