<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/github/v/release/violetaini/chitanda-geoip-api?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/releases)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Workflow](https://img.shields.io/badge/GitHub%20Actions-daily%20build-blue?style=for-the-badge)](https://github.com/violetaini/chitanda-geoip-api/actions/workflows/release-data.yml)

</div>

[English](README.md) | [简体中文](README_zh.md) | [繁體中文](README_zh-TW.md) | [日本語](README_ja.md)

面向 [Chitanda IP Site](https://github.com/violetaini/chitanda-ip-site) 的开源 GeoIP API。

## 这是什么

这个仓库提供前端项目要用的 GeoIP 后端服务。它可以作为普通 Node.js 服务运行，也可以作为每天发布的 GitHub Release 包，或者作为两台服务器的“主节点下载、从节点同步”方案使用。

## 技术栈

- Node.js
- systemd
- Nginx 反向代理
- GitHub Actions
- GitHub Releases

## 主要功能

- 提供 `/health`、`/myip`、`/geoip/{ip}` 接口
- 兼容 `/api/*` 反代路径
- 下载公开 GeoIP 数据库
- 打包服务和脚本到 Release
- 自动清理旧版本目录

## 快速开始

```bash
npm ci
npm run download-db
npm run smoke
HOST=127.0.0.1 PORT=3022 npm start
```

从 GitHub Release 安装：

```bash
curl -fsSL https://github.com/violetaini/chitanda-geoip-api/releases/latest/download/bootstrap-linux.sh | sudo bash
```

## Release 内容

`chitanda-geoip-api-with-data.tar.gz` 包含：

- API 源码
- `package.json` 和 `package-lock.json`
- `data/` 下的公开数据库
- 安装、更新、同步脚本
- systemd 和 Nginx 示例
- 两机部署说明

## 自动化

GitHub Actions 每天构建一次，并发布新的 `data-YYYYMMDD` GitHub Release。

服务器更新流程是独立的：

1. 主节点检查最新 Release。
2. 如果有新 tag，就下载包和校验文件。
3. 校验、安装、重启、健康检查。
4. 成功后默认只保留最近 3 个版本目录。
5. 两机模式下，主节点再把校验通过的版本同步到从节点。
6. 从节点本地应用后，也默认只保留最近 3 个版本目录。

## 两机部署

详细步骤见 [Two-Node GeoIP Release Sync](docs/two-node-sync.md)。

## 给前端项目用

这个 API 是给 [chitanda-ip-site](https://github.com/violetaini/chitanda-ip-site) 用的。构建前端时，把那个项目的 `VITE_GEOIP_BASE` 指向你的 API。

## 许可证

MIT
