<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Frelease.json%3Fv%3Ddata-20260717&cacheSeconds=300)](https://github.com/violetaini/chitanda-geoip-api/releases)
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

[Chitanda IP Site](https://github.com/violetaini/chitanda-ip-site) 向けのオープンソース GeoIP API です。

## これは何か

このリポジトリは、フロントエンドで使う GeoIP バックエンドを提供します。通常の Node.js サービスとしても、公開データベース付きの毎日更新 GitHub Release パッケージとしても、2 台構成の「親ノードがダウンロードし、子ノードへ同期する」構成としても使えます。

## 技術スタック

- Node.js
- systemd
- Nginx リバースプロキシ
- GitHub Actions
- GitHub Releases

## 主な機能

- `/health`、`/myip`、`/geoip/{ip}`、`/cdn-node/{provider}` を提供
- CLI プローブ向けのプレーンテキスト client IP 出力
- `/api/*` 互換のリバースプロキシ構成
- 公開 GeoIP データベースのダウンロード
- サービス用スクリプトを含む Release パッケージ
- 古いリリースディレクトリの自動整理

## API 構成

- ヘルスチェック: `GET /health` と `GET /api/health` はサービス状態とデータベースを開いた時刻を返します。
- クライアント IP: `GET /myip` と `GET /api/myip` はアクセス元 IP を返します。`TRUST_PROXY` が `0` でない場合、接続元アドレスより先に一般的なプロキシヘッダーを参照します。
- プレーンテキスト client IP: `GET /myip?format=text`、`GET /api/myip?format=text`、または `/myip` に `Accept: text/plain` を送ると、アクセス元 IP だけを `text/plain` で返します。
- GeoIP 検索: `GET /geoip/{ip}`、`GET /geoip?ip=...`、`GET /api/geoip/{ip}`、`GET /api/geoip?ip=...` は正規化された IP 情報を返します。
- 現在の訪問者検索: `GET /geoip` と `GET /api/geoip` はアクセス元 IP を検索し、同じ GeoIP フィールドを返します。
- CDN ノード検出: `GET /cdn-node/{provider}` と `GET /api/cdn-node/{provider}` は `fastly`、`akamai`、`virtuozzo`、`ovh` を検出し、見つかったエッジノードを返します。
- レスポンス項目: 検索結果には `ip`、`country`、`country_code`、`region`、`region_code`、`city`、`postal_code`、`asn`、`asn_organization`、`organization`、`isp`、`timezone`、`offset`、`latitude`、`longitude`、`continent_code` が含まれる場合があります。
- データベース読み込み層: 起動時に IPv4/IPv6 GeoLite2 City MMDB、ASN MMDB、Geo-Whois ASN Country MMDB、ip2region IPv4/IPv6 XDB を開き、リクエスト間で共有します。
- フォールバック処理: 中国本土の IP では ip2region で中国語の省・市・ISP 情報を補えます。座標が不足する場合は、中国とグローバルの都市中心テーブルで緯度経度を補います。
- ローカライズと HTTP 動作: `Accept-Language` と `GEOIP_LANG` は利用可能なローカライズ名に影響します。JSON レスポンスは CORS を許可し、`cache-control: no-store` を設定します。

## クイックスタート

```bash
npm ci
npm run download-db
npm run smoke
HOST=127.0.0.1 PORT=3022 npm start
```

GitHub Release から導入する場合:

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh | sudo bash
```

## Release の内容

`chitanda-geoip-api-with-data.tar.gz` には次が含まれます:

- API ソースコード
- `package.json` と `package-lock.json`
- `data/` 配下の公開データベース
- install / update 用のデプロイスクリプト
- 2 台構成の同期スクリプト
- 導入・更新に必要な最小ファイル群

## 自動化

GitHub Actions は 1 日 1 回ビルドし、新しい `data-YYYYMMDD` GitHub Release を公開します。
Release の作成後、ワークフローは `.github/badges/release.json` と README バッジのキャッシュキーを更新し、Shields の GitHub API ルートを使わずに公開済み tag を表示します。

サーバー更新は別の処理です:

1. 親ノードが最新 Release を確認します。
2. 新しい tag があれば、パッケージと checksum を取得します。
3. 検証、インストール、再起動、ヘルスチェックを行います。
4. 成功後は既定で最新 3 個のリリースディレクトリだけを残します。
5. 2 台構成では、親ノードが検証済みパッケージを子ノードへ同期します。
6. 子ノード側でも同様に、最新 3 個だけを残します。

## 2 台構成

詳細は [Two-Node GeoIP Release Sync](docs/two-node-sync.md) を参照してください。

## フロントエンド向け

この API は [chitanda-ip-site](https://github.com/violetaini/chitanda-ip-site) 向けです。フロントエンドをビルドする前に、そのプロジェクトの `VITE_GEOIP_BASE` をこの API に向けてください。

## ライセンス

MIT
