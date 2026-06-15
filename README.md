<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/github/v/release/violetaini/chitanda-geoip-api?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/releases)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Workflow](https://img.shields.io/badge/GitHub%20Actions-daily%20build-blue?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/actions/workflows/release-data.yml)

</div>

[English](README.md) | [简体中文](README_zh.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md)

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

- `/health`, `/myip`, and `/geoip/{ip}`
- `/api/*` aliases for reverse-proxy deployments
- public GeoIP database downloads
- release packaging with service scripts and examples
- automatic cleanup of older release directories

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
