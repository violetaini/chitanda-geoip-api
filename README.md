<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Frelease.json%3Fv%3Ddata-20260701&cacheSeconds=300)](https://github.com/violetaini/chitanda-geoip-api/releases)
[![Node.js](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Fnode.json&cacheSeconds=3600)](package.json)
[![License](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Flicense.json&cacheSeconds=3600)](LICENSE)
[![Workflow](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Fworkflow.json&cacheSeconds=3600)](https://github.com/violetaini/chitanda-geoip-api/actions/workflows/release-data.yml)

</div>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README_zh.md">简体中文</a> |
  <a href="README_zh-TW.md">繁體中文</a> |
  <a href="README_ja.md">日本語</a>
</p>

Open-source GeoIP API for [Chitanda IP Site](https://github.com/violetaini/chitanda-ip-site).

## What This Is

This repository provides the GeoIP backend used by the front-end project. It can run as a normal Node.js service, as a daily GitHub Release package with public databases included, or as a two-node primary-download / secondary-sync setup.

## Stack

- Node.js
- systemd
- Nginx reverse proxy
- GitHub Actions
- GitHub Releases

## Main Features

- `/health`, `/myip`, `/geoip/{ip}`, and `/cdn-node/{provider}`
- `/api/*` aliases for reverse-proxy deployments
- public GeoIP database downloads
- release packaging with service scripts and examples
- automatic cleanup of older release directories

## API Components

- Health check: `GET /health` and `GET /api/health` return service readiness and the database open time.
- Client IP endpoint: `GET /myip` and `GET /api/myip` return the caller IP. When `TRUST_PROXY` is not `0`, proxy headers are honored before the socket address.
- GeoIP lookup: `GET /geoip/{ip}`, `GET /geoip?ip=...`, `GET /api/geoip/{ip}`, and `GET /api/geoip?ip=...` return a normalized IP profile.
- Current visitor lookup: `GET /geoip` and `GET /api/geoip` resolve the caller IP with the same GeoIP response fields.
- CDN node probe: `GET /cdn-node/{provider}` and `GET /api/cdn-node/{provider}` probe `fastly`, `akamai`, `virtuozzo`, or `ovh` and return the detected edge node.
- Response fields: lookup responses may include `ip`, `country`, `country_code`, `region`, `region_code`, `city`, `postal_code`, `asn`, `asn_organization`, `organization`, `isp`, `timezone`, `offset`, `latitude`, `longitude`, and `continent_code`.
- Database readers: IPv4/IPv6 GeoLite2 City MMDB, ASN MMDB, Geo-Whois ASN Country MMDB, and ip2region IPv4/IPv6 XDB are opened on startup and shared by requests.
- Fallback logic: Mainland China records can use ip2region for Chinese region/city/ISP text; city-center tables fill missing coordinates for China and global locations.
- Localization and HTTP behavior: `Accept-Language` and `GEOIP_LANG` control localized names where available; JSON responses are CORS-enabled and use `cache-control: no-store`.

## Quick Start

```bash
npm ci
npm run download-db
npm run smoke
HOST=127.0.0.1 PORT=3022 npm start
```

Daily GitHub Release install:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh | sudo bash
```

## Release Contents

`chitanda-geoip-api-with-data.tar.gz` includes:

- API source code
- `package.json` and `package-lock.json`
- public database files in `data/`
- install and update scripts needed for deployment
- two-node sync scripts for the primary/secondary setup
- the minimum files required to install or update the service

## Automation

GitHub Actions builds the package once per day and publishes a new `data-YYYYMMDD` GitHub Release.
After the Release is created, the workflow updates `.github/badges/release.json` and the README badge cache key so the badge shows the published tag without using Shields' GitHub API route.

Server updates are separate:

1. The primary node checks the latest release.
2. If a newer tag exists, it downloads the package and checksum.
3. It verifies, installs, restarts, and health-checks the service.
4. After success, it keeps only the newest 3 release directories.
5. In the two-node setup, the primary node syncs the verified package to the secondary node.
6. The secondary node applies the package locally and also keeps only the newest 3 release directories.

## Two-Node Setup

See [Two-Node GeoIP Release Sync](docs/two-node-sync.md).

## For the Front End

This API is meant for [chitanda-ip-site](https://github.com/violetaini/chitanda-ip-site). Point that project’s `VITE_GEOIP_BASE` at your API before building the front end.

## License

MIT
