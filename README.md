<div align="center">

# Chitanda GeoIP API

Self-hosted GeoIP HTTP API for [Chitanda IP Site](https://github.com/violetaini/chitanda-ip-site).

</div>

## What It Provides

This project is the open-source GeoIP API used by Chitanda IP Site. It can run as a local Node.js service behind Nginx, or be downloaded as a daily GitHub Release package with public IP databases already included.

The API is compatible with the front-end `VITE_GEOIP_BASE` setting in `chitanda-ip-site`.

## Endpoints

```text
GET /health
GET /myip
GET /geoip
GET /geoip/{ip}

GET /api/health
GET /api/myip
GET /api/geoip
GET /api/geoip/{ip}
```

The `/api/*` routes are aliases for deployments where Nginx forwards public `/api/...` paths to this service.

Example:

```bash
curl -fsS http://127.0.0.1:3022/health
curl -fsS -H "Accept-Language: zh-CN" http://127.0.0.1:3022/geoip/8.8.8.8
curl -fsS -H "Accept-Language: en" http://127.0.0.1:3022/api/geoip/1.1.1.1
```

Typical response:

```json
{
  "organization": "Google",
  "country": "United States",
  "isp": "Google",
  "country_code": "US",
  "asn_organization": "Google LLC",
  "asn": 15169,
  "ip": "8.8.8.8",
  "region": "California",
  "city": "Mountain View",
  "timezone": "America/Los_Angeles",
  "offset": -25200,
  "latitude": 37.3861,
  "longitude": -122.0839,
  "continent_code": "NA"
}
```

Fields may be omitted when the upstream database does not know that value.

## Data Sources

The download script fetches public databases from these upstream sources:

| File | Source | Purpose |
| --- | --- | --- |
| `geolite2-city-ipv4.mmdb` | `@ip-location-db/geolite2-city-mmdb` | IPv4 city lookup |
| `geolite2-city-ipv6.mmdb` | `@ip-location-db/geolite2-city-mmdb` | IPv6 city lookup |
| `asn.mmdb` | `@ip-location-db/asn-mmdb` | ASN lookup |
| `geolite2-geo-whois-asn-country.mmdb` | `@ip-location-db/geolite2-geo-whois-asn-country-mmdb` | country/ASN fallback |
| `ip2region_v4.xdb` | `lionsoul2014/ip2region` | Mainland China IPv4 text fallback |
| `ip2region_v6.xdb` | `lionsoul2014/ip2region` | Mainland China IPv6 text fallback |

The source code is MIT licensed. Database files are governed by their upstream licenses and terms. Check the upstream projects before redistributing or using the data commercially:

- `sapics/ip-location-db`
- `lionsoul2014/ip2region`
- MaxMind GeoLite2 license and EULA where applicable

## Quick Start From Source

Requirements:

- Node.js 20 or newer
- npm
- `tar` if you want to create release packages

Install and download databases:

```bash
npm ci
npm run download-db
npm run smoke
```

Start the service:

```bash
HOST=127.0.0.1 PORT=3022 npm start
```

PowerShell example:

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "3022"
npm start
```

## Quick Start From Daily Release

Every day, GitHub Actions can build a package named:

```text
chitanda-geoip-api-with-data.tar.gz
```

That package contains:

- API source code
- `package.json` and `package-lock.json`
- public database files under `data/`
- systemd and Nginx examples

Install on a Linux server with one command:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh | sudo bash
```

The bootstrap script downloads the latest Release package, verifies its `.sha256`, extracts it in a temporary directory, and runs the packaged installer.

If Node.js is installed through a non-standard path such as `nvm`, pass explicit paths:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh \
  | sudo NODE_BIN=/root/.nvm/versions/node/v22.16.0/bin/node \
    NPM_BIN=/root/.nvm/versions/node/v22.16.0/bin/npm \
    bash
```

The installer places versioned packages under `/opt/chitanda-geoip-api/releases`, points `/opt/chitanda-geoip-api/current` at the active release, creates `chitanda-geoip-api.service`, installs the updater, and enables `chitanda-geoip-api-update.timer`.

Manual install:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/chitanda-geoip-api-with-data.tar.gz \
  -o /tmp/chitanda-geoip-api-with-data.tar.gz
mkdir -p /tmp/chitanda-geoip-api
tar -xzf /tmp/chitanda-geoip-api-with-data.tar.gz -C /tmp/chitanda-geoip-api --strip-components=1
sudo bash /tmp/chitanda-geoip-api/scripts/install-linux.sh
```
 
Manual systemd setup:

```bash
sudo mkdir -p /opt/chitanda-geoip-api/releases/manual
sudo tar -xzf chitanda-geoip-api-with-data.tar.gz -C /opt/chitanda-geoip-api/releases/manual --strip-components=1
sudo ln -sfn /opt/chitanda-geoip-api/releases/manual /opt/chitanda-geoip-api/current
cd /opt/chitanda-geoip-api/current
npm ci --omit=dev
sudo cp deploy/chitanda-geoip-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chitanda-geoip-api.service
curl -fsS http://127.0.0.1:3022/health
```

Then add an Nginx reverse proxy based on `deploy/nginx.example.conf` and reload Nginx.

## Automatic Server Updates

The release package includes:

```text
scripts/domestic-apply-release.sh
scripts/install-linux.sh
scripts/sync-domestic-from-current.sh
scripts/update-linux.sh
deploy/chitanda-geoip-api-update-primary.service
deploy/chitanda-geoip-api-update.service
deploy/chitanda-geoip-api-update.timer
```

After `install-linux.sh` runs, the server checks GitHub Releases every day at about `11:17` local time, with a randomized delay. The updater:

1. Reads the latest GitHub Release tag.
2. Downloads `chitanda-geoip-api-with-data.tar.gz` and its `.sha256`.
3. Verifies the checksum.
4. Installs the package into a versioned release directory.
5. Runs syntax checks and `npm ci --omit=dev`.
6. Switches `/opt/chitanda-geoip-api` to the new release.
7. Restarts `chitanda-geoip-api.service`.
8. Runs health and sample GeoIP checks.
9. Rolls back to the previous release if restart or validation fails.

Useful commands:

```bash
systemctl status chitanda-geoip-api.service --no-pager
systemctl status chitanda-geoip-api-update.timer --no-pager
systemctl list-timers --all chitanda-geoip-api-update.timer
sudo systemctl start chitanda-geoip-api-update.service
journalctl -u chitanda-geoip-api-update.service -n 100 --no-pager
```

For a two-node setup, run `scripts/update-linux.sh` on the primary node and run `scripts/sync-domestic-from-current.sh` after a successful primary update. The secondary node can use `scripts/domestic-apply-release.sh` as the restricted receiver behind a dedicated SSH user. This avoids forcing a mainland China node to download the large GitHub Release asset directly.

See [Two-Node GeoIP Release Sync](docs/two-node-sync.md) for the full primary-download, secondary-sync deployment method.

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | bind address |
| `PORT` | `3022` | listen port |
| `GEOIP_DATA_DIR` | `./data` | database directory |
| `GEOIP_LANG` | `zh-CN` | default response language |
| `TRUST_PROXY` | `1` | trust proxy headers for `/myip`; set `0` to disable |
| `GEOIP_CDN_BASE` | `https://cdn.jsdelivr.net/npm` | npm CDN base for MMDB packages |
| `GEOIP_IP2REGION_BASE` | `https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data` | ip2region IPv4 data base URL |
| `GEOIP_IP2REGION_V6_URL` | GitHub raw URL | ip2region IPv6 data URL |
| `GEOIP_DOWNLOAD_RETRIES` | `6` | database download retry count |
| `GEOIP_DOWNLOAD_RETRY_DELAY_MS` | `5000` | base retry delay |
| `GEOIP_DOWNLOAD_TIMEOUT_MS` | `180000` | per-request timeout |

## Nginx Reverse Proxy

The service intentionally binds to `127.0.0.1` by default. Expose it through HTTPS using Nginx:

```nginx
location ^~ /api/geoip/ {
    proxy_pass http://127.0.0.1:3022/geoip/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

See `deploy/nginx.example.conf` for the complete route set.

## Connect Chitanda IP Site

In `chitanda-ip-site`, point the front end to your API before building:

```bash
VITE_GEOIP_BASE=https://your-domain.example/api/geoip npm run build
```

Or edit `.env.production`:

```env
VITE_GEOIP_BASE=https://your-domain.example/api/geoip
```

If your API is served from the same origin and path as `/api/geoip`, you can leave `VITE_GEOIP_BASE` empty.

## Daily Data Release Workflow

`.github/workflows/release-data.yml` runs every day and can also be triggered manually. It does this:

1. Installs dependencies.
2. Downloads public IP databases.
3. Starts the API locally and runs smoke tests.
4. Creates `release/chitanda-geoip-api-with-data.tar.gz`.
5. Publishes or updates a daily GitHub Release named `data-YYYYMMDD`.

This matches the deployment idea where the front-end project can point users to a separate open GeoIP API project, while that project continuously packages current public databases.

## Coordinate Fallbacks

Some GeoIP databases return a city or country but no coordinates. The service applies two fallbacks:

- Mainland China addresses using `ip2region` are paired with local city-center coordinates from `cn-city-centers.js`.
- A small global city-center table in `global-city-centers.js` fills known non-CN cities when latitude/longitude are missing.

There are also explicit anycast overrides for Cloudflare public resolver IPs such as `1.1.1.1` and `2606:4700:4700::1111`, so the front-end map always receives a stable city and coordinate pair.

## Security Notes

- Do not commit private database credentials, paid database keys, private probe endpoints, SSH keys, or server panel credentials.
- Keep the API bound to localhost and expose it through HTTPS reverse proxy.
- Only enable `TRUST_PROXY=1` behind a proxy you control.
- Validate upstream data licenses before redistributing packaged database files.

## License

The source code is released under the [MIT License](LICENSE).
