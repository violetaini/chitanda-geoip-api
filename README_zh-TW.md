<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Frelease.json%3Fv%3Ddata-20260703&cacheSeconds=300)](https://github.com/violetaini/chitanda-geoip-api/releases)
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

- 提供 `/health`、`/myip`、`/geoip/{ip}`、`/cdn-node/{provider}` 介面
- 相容 `/api/*` 反代路徑
- 下載公開 GeoIP 資料庫
- 將服務與腳本打包到 Release
- 自動清理舊版本目錄

## API 組成

- 健康檢查：`GET /health` 和 `GET /api/health` 回傳服務可用狀態與資料庫開啟時間。
- 用戶端 IP：`GET /myip` 和 `GET /api/myip` 回傳訪問者 IP。`TRUST_PROXY` 不為 `0` 時，會優先讀取常見代理標頭，再回退到連線位址。
- GeoIP 查詢：`GET /geoip/{ip}`、`GET /geoip?ip=...`、`GET /api/geoip/{ip}`、`GET /api/geoip?ip=...` 回傳標準化 IP 資訊。
- 當前訪問者查詢：`GET /geoip` 和 `GET /api/geoip` 會用訪問者 IP 查詢，並回傳同樣的 GeoIP 欄位。
- CDN 節點探測：`GET /cdn-node/{provider}` 和 `GET /api/cdn-node/{provider}` 支援 `fastly`、`akamai`、`virtuozzo`、`ovh`，回傳探測到的邊緣節點。
- 回傳欄位：查詢結果可能包含 `ip`、`country`、`country_code`、`region`、`region_code`、`city`、`postal_code`、`asn`、`asn_organization`、`organization`、`isp`、`timezone`、`offset`、`latitude`、`longitude`、`continent_code`。
- 資料庫讀取層：啟動時開啟 IPv4/IPv6 GeoLite2 City MMDB、ASN MMDB、Geo-Whois ASN Country MMDB、ip2region IPv4/IPv6 XDB，並在請求間重複使用。
- 回退邏輯：中國大陸 IP 可用 ip2region 補充中文省市與營運商；當資料庫缺少座標時，用中國與全球城市中心表補齊經緯度。
- 本地化與 HTTP 行為：`Accept-Language` 和 `GEOIP_LANG` 會影響可用的本地化名稱；JSON 回應允許跨域，並設定 `cache-control: no-store`。

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
- 安裝與更新所需的部署腳本
- 兩機同步所需的腳本
- 安裝或更新服務所需的最小檔案集

## 自動化

GitHub Actions 每天建置一次，並發佈新的 `data-YYYYMMDD` GitHub Release。
Release 建立成功後，工作流程會更新 `.github/badges/release.json` 和 README 徽章快取參數，讓徽章顯示已發佈的 tag，同時避免使用 Shields 的 GitHub API 路由。

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
