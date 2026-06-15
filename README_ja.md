<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/github/v/release/violetaini/chitanda-geoip-api?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/releases)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Workflow](https://img.shields.io/badge/GitHub%20Actions-daily%20build-blue?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/actions/workflows/release-data.yml)

</div>

[English](README.md) | [简体中文](README_zh.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md)

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

- `/health`、`/myip`、`/geoip/{ip}` を提供
- `/api/*` 互換のリバースプロキシ構成
- 公開 GeoIP データベースのダウンロード
- サービス用スクリプトを含む Release パッケージ
- 古いリリースディレクトリの自動整理

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
- install / update / sync スクリプト
- systemd と Nginx のサンプル
- 2 台構成の導入ガイド

## 自動化

GitHub Actions は 1 日 1 回ビルドし、新しい `data-YYYYMMDD` GitHub Release を公開します。

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
