<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/github/v/release/violetaini/chitanda-geoip-api?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/releases)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Workflow](https://img.shields.io/badge/GitHub%20Actions-daily%20build-blue?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/actions/workflows/release-data.yml)

</div>

[English](README.md) | [简体中文](README_zh.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md)

面向 [Chitanda IP Site](https://github.com/violetaini/chitanda-ip-site) 的開源 GeoIP API。

## 這是什麼

這個倉庫提供前端專案要用的 GeoIP 後端服務。它可以作為一般 Node.js 服務執行，也可以作為每天發佈的 GitHub Release 包，或作為兩台伺服器的「主節點下載、從節點同步」方案使用。

## 技術棧

- Node.js
- systemd
- Nginx 反向代理
- GitHub Actions
- GitHub Releases

## 主要功能

- 提供 `/health`、`/myip`、`/geoip/{ip}` 介面
- 相容 `/api/*` 反代路徑
- 下載公開 GeoIP 資料庫
- 將服務與腳本打包到 Release
- 自動清理舊版本目錄

## 快速開始

```bash
npm ci
npm run download-db
npm run smoke
HOST=127.0.0.1 PORT=3022 npm start
```

從 GitHub Release 安裝：

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh | sudo bash
```

## Release 內容

`chitanda-geoip-api-with-data.tar.gz` 包含：

- API 原始碼
- `package.json` 和 `package-lock.json`
- `data/` 下的公開資料庫
- 安裝、更新、同步腳本
- systemd 與 Nginx 範例
- 兩機部署說明

## 自動化

GitHub Actions 每天建置一次，並發佈新的 `data-YYYYMMDD` GitHub Release。

伺服器更新流程是獨立的：

1. 主節點檢查最新 Release。
2. 若有新 tag，就下載包與校驗檔。
3. 校驗、安裝、重啟、健康檢查。
4. 成功後預設只保留最近 3 個版本目錄。
5. 兩機模式下，主節點再把校驗通過的版本同步到從節點。
6. 從節點本地套用後，也預設只保留最近 3 個版本目錄。

## 兩機部署

詳細步驟見 [Two-Node GeoIP Release Sync](docs/two-node-sync.md)。

## 給前端專案用

這個 API 是給 [chitanda-ip-site](https://github.com/violetaini/chitanda-ip-site) 用的。建置前端時，把那個專案的 `VITE_GEOIP_BASE` 指向你的 API。

## 授權

MIT
