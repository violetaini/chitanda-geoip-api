# Two-Node GeoIP Release Sync

This document describes the deployment model where one primary node downloads the daily GitHub Release package and a secondary node receives the verified package from the primary node.

The design is useful when the secondary node has poor or unreliable connectivity to GitHub Release assets. Only the primary node needs to download from GitHub.

## Architecture

```text
GitHub Actions
  -> GitHub Release: chitanda-geoip-api-with-data.tar.gz
  -> primary node: scripts/update-linux.sh
  -> secondary node: scripts/sync-domestic-from-current.sh over rsync/SSH
```

Primary node:

- Runs `chitanda-geoip-api-update.timer`.
- Downloads the latest package from `https://github.com/<repo>/releases/download/<tag>/`.
- Verifies the `.sha256` file.
- Installs into a versioned release directory.
- Restarts and validates the local GeoIP API service.
- Keeps the newest 3 successful release directories.
- Runs `scripts/sync-domestic-from-current.sh` after a successful local update.

Secondary node:

- Does not download the package from GitHub.
- Accepts an archive from the primary node through a restricted SSH user.
- Verifies the SHA256 sent by the primary node.
- Installs into a versioned release directory.
- Restarts and validates the local GeoIP API service.
- Rolls back if validation fails.
- Keeps the newest 3 successful release directories.

## Prerequisites

Both nodes need:

- Linux with systemd
- Node.js 20 or newer
- npm
- `curl`
- `tar`
- `rsync`
- `sha256sum`

The examples below use:

```text
Primary app root: /opt/chitanda-geoip
Secondary app root: /opt/chitanda-geoip
Service name: chitanda-geoip.service
API port: 3022
SSH sync user on secondary: geoipsync
```

Change those values if your deployment uses different paths or service names.

## 1. Install The API On Both Nodes

Install the service once on both nodes. The public one-command installer uses `/opt/chitanda-geoip-api` by default, so pass explicit names if you want to use `/opt/chitanda-geoip`:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh \
  | sudo APP_ROOT=/opt/chitanda-geoip \
    CURRENT=/opt/chitanda-geoip/current \
    RELEASES_DIR=/opt/chitanda-geoip/releases \
    SERVICE_NAME=chitanda-geoip.service \
    TIMER_NAME=chitanda-geoip-api-update.timer \
    bash
```

On the secondary node, disable the local GitHub updater after the initial install:

```bash
sudo systemctl disable --now chitanda-geoip-api-update.timer
```

The secondary node will be updated by the primary node instead.

## 2. Prepare The Secondary SSH Receiver

Create a restricted sync user on the secondary node:

```bash
sudo useradd --system --home-dir /var/lib/geoipsync --create-home --shell /bin/sh geoipsync
sudo install -d -m 0750 -o geoipsync -g geoipsync /opt/chitanda-geoip/incoming
sudo install -d -m 0700 -o geoipsync -g geoipsync /var/lib/geoipsync/.ssh
```

Install the receiver scripts:

```bash
sudo install -m 0755 /opt/chitanda-geoip/current/scripts/domestic-apply-release.sh /usr/local/sbin/chitanda-geoip-apply-release
```

Create `/usr/local/sbin/chitanda-geoip-sync-shell`:

```bash
sudo tee /usr/local/sbin/chitanda-geoip-sync-shell >/dev/null <<'EOF'
#!/bin/sh
set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
INCOMING=/opt/chitanda-geoip/incoming
APPLY=/usr/local/sbin/chitanda-geoip-apply-release

reject() {
  echo "chitanda geoip sync: $*" >&2
  exit 1
}

cmd=${SSH_ORIGINAL_COMMAND:-}
[ -n "$cmd" ] || reject "interactive login is disabled"

case "$cmd" in
  true)
    exit 0
    ;;
  "rsync --server "*)
    exec /usr/bin/rrsync -wo -no-del "$INCOMING"
    ;;
esac

set -f
set -- $cmd
case "${1:-}" in
  deploy)
    [ "$#" -eq 3 ] || reject "usage: deploy RELEASE SHA256"
    exec sudo -n "$APPLY" deploy "$2" "$3"
    ;;
  cleanup)
    [ "$#" -eq 1 ] || reject "usage: cleanup"
    exec sudo -n "$APPLY" cleanup
    ;;
  current)
    [ "$#" -eq 1 ] || reject "usage: current"
    exec sudo -n "$APPLY" current
    ;;
  health)
    [ "$#" -eq 1 ] || reject "usage: health"
    exec sudo -n "$APPLY" health
    ;;
  remove-tmp)
    [ "$#" -eq 2 ] || reject "usage: remove-tmp RELEASE"
    exec sudo -n "$APPLY" remove-tmp "$2"
    ;;
  *)
    reject "command is not allowed"
    ;;
esac
EOF
sudo chmod 0755 /usr/local/sbin/chitanda-geoip-sync-shell
```

Allow the sync shell to run only the receiver actions:

```bash
sudo tee /etc/sudoers.d/chitanda-geoip-sync >/dev/null <<'EOF'
geoipsync ALL=(root) NOPASSWD: /usr/local/sbin/chitanda-geoip-apply-release deploy *, /usr/local/sbin/chitanda-geoip-apply-release cleanup, /usr/local/sbin/chitanda-geoip-apply-release current, /usr/local/sbin/chitanda-geoip-apply-release health, /usr/local/sbin/chitanda-geoip-apply-release remove-tmp *
EOF
sudo chmod 0440 /etc/sudoers.d/chitanda-geoip-sync
```

Restrict SSH for the sync user:

```bash
sudo tee /etc/ssh/sshd_config.d/99-geoipsync.conf >/dev/null <<'EOF'
Match User geoipsync
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    AllowTcpForwarding no
    X11Forwarding no
    ForceCommand /usr/local/sbin/chitanda-geoip-sync-shell
EOF
sudo systemctl reload sshd
```

Generate a key on the primary node and add its public key to the secondary node:

```bash
sudo ssh-keygen -t ed25519 -N '' -f /root/.ssh/chitanda_geoip_sync
```

On the secondary node:

```bash
sudo tee -a /var/lib/geoipsync/.ssh/authorized_keys < chitanda_geoip_sync.pub
sudo chown geoipsync:geoipsync /var/lib/geoipsync/.ssh/authorized_keys
sudo chmod 0600 /var/lib/geoipsync/.ssh/authorized_keys
```

## 3. Configure The Primary Node

Install the updater and sync script:

```bash
sudo install -m 0755 /opt/chitanda-geoip/current/scripts/update-linux.sh /usr/local/sbin/chitanda-geoip-api-update
sudo install -m 0755 /opt/chitanda-geoip/current/scripts/sync-domestic-from-current.sh /usr/local/sbin/chitanda-geoip-sync-domestic-from-current
```

Create `/etc/systemd/system/chitanda-geoip-api-update.service`:

```ini
[Unit]
Description=Update Chitanda GeoIP API package from GitHub Release and sync secondary node
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=REPO=violetaini/chitanda-geoip-api
Environment=APP_ROOT=/opt/chitanda-geoip
Environment=CURRENT=/opt/chitanda-geoip/current
Environment=RELEASES_DIR=/opt/chitanda-geoip/releases
Environment=SERVICE_NAME=chitanda-geoip.service
Environment=NODE_BIN=/usr/bin/node
Environment=NPM_BIN=/usr/bin/npm
Environment=BASE_URL=http://127.0.0.1:3022
Environment=KEEP_RELEASES=3
Environment=DOMESTIC_HOST=SECONDARY_SERVER_IP
Environment=DOMESTIC_PORT=22
Environment=DOMESTIC_USER=geoipsync
Environment=SYNC_KEY=/root/.ssh/chitanda_geoip_sync
ExecStart=/usr/local/sbin/chitanda-geoip-api-update
ExecStartPost=/usr/local/sbin/chitanda-geoip-sync-domestic-from-current
TimeoutStartSec=30min
```

Create `/etc/systemd/system/chitanda-geoip-api-update.timer`:

```ini
[Unit]
Description=Daily Chitanda GeoIP API package update from GitHub Release

[Timer]
OnCalendar=*-*-* 11:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
```

Enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chitanda-geoip-api-update.timer
```

## 4. Verify The Sync Path

From the primary node, verify the restricted SSH receiver:

```bash
sudo ssh -i /root/.ssh/chitanda_geoip_sync -o IdentitiesOnly=yes geoipsync@SECONDARY_SERVER_IP true
sudo ssh -i /root/.ssh/chitanda_geoip_sync -o IdentitiesOnly=yes geoipsync@SECONDARY_SERVER_IP current
sudo ssh -i /root/.ssh/chitanda_geoip_sync -o IdentitiesOnly=yes geoipsync@SECONDARY_SERVER_IP health
```

Run a manual update and sync:

```bash
sudo systemctl start chitanda-geoip-api-update.service
sudo systemctl status chitanda-geoip-api-update.service --no-pager -l
```

Expected result:

- `ExecStart` exits with `status=0/SUCCESS`.
- `ExecStartPost` exits with `status=0/SUCCESS`.
- Primary `/health` returns `{"ok":true,...}`.
- Secondary `/health` returns `{"ok":true,...}`.
- Both nodes point to the same release tag, for example `data-YYYYMMDD`.

Check release tags:

```bash
readlink -f /opt/chitanda-geoip/current
cat /opt/chitanda-geoip/current/.release-tag
```

On the secondary node:

```bash
readlink -f /opt/chitanda-geoip/current
cat /opt/chitanda-geoip/current/.release-tag
```

## Update Flow

Daily flow:

1. GitHub Actions builds `data-YYYYMMDD`.
2. Primary timer runs after the GitHub package should already exist.
3. Primary downloads `chitanda-geoip-api-with-data.tar.gz` and `.sha256`.
4. Primary validates and switches local service.
5. Primary archives its current release and sends it to the secondary node with `rsync --partial --append-verify`.
6. Secondary validates SHA256, extracts, starts a staged service, checks sample lookups, switches current symlink, and restarts its service.

## Retry And Resume Behavior

Primary GitHub download:

- Uses `curl --retry 3 --retry-delay 3`.
- Verifies `.sha256`.
- Does not use range resume for the GitHub Release package.

Primary to secondary sync:

- Uses `rsync --partial --append-verify`.
- Defaults to `RSYNC_RETRIES=10`.
- Defaults to `RSYNC_RETRY_DELAY=180`.
- Defaults to `RSYNC_IO_TIMEOUT=180`.

Secondary deployment:

- Verifies the SHA256 sent by the primary node.
- Rejects unsafe tar paths.
- Validates required database files and minimum sizes.
- Runs syntax and API smoke checks.
- Rolls back if service restart or validation fails.

## Operations

Primary status:

```bash
systemctl status chitanda-geoip.service --no-pager
systemctl status chitanda-geoip-api-update.timer --no-pager
systemctl list-timers --all chitanda-geoip-api-update.timer
journalctl -u chitanda-geoip-api-update.service -n 100 --no-pager
```

Secondary status:

```bash
systemctl status chitanda-geoip.service --no-pager
journalctl -u chitanda-geoip.service -n 100 --no-pager
tail -n 100 /var/log/chitanda-geoip/sync-deploy.log
```

Manual primary-to-secondary sync without downloading from GitHub again:

```bash
sudo /usr/local/sbin/chitanda-geoip-sync-domestic-from-current
```

## Notes

- Keep the secondary local GitHub updater disabled if this two-node model is used.
- The secondary node only trusts archives sent through the restricted SSH user and validated by SHA256.
- The primary node remains the only node that needs reliable access to GitHub Release assets.
- Replace `SECONDARY_SERVER_IP`, SSH port, Node path, npm path, and service paths to match your environment.
