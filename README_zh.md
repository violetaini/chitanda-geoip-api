<div align="center">

<img src="docs/avatar.webp" alt="Chitanda GeoIP API" width="120" />

# **Chitanda GeoIP API**

[![Release](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fraw.githubusercontent.com%2Fvioletaini%2Fchitanda-geoip-api%2Fmain%2F.github%2Fbadges%2Frelease.json%3Fv%3Ddata-20260716&cacheSeconds=300)](https://github.com/violetaini/chitanda-geoip-api/releases)
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

- 提供 `/health`、`/myip`、`/geoip/{ip}`、`/cdn-node/{provider}` 接口
- 支持面向命令行探针的纯文本客户端 IP 输出
- 兼容 `/api/*` 反代路径
- 下载公开 GeoIP 数据库
- 打包服务和脚本到 Release
- 自动清理旧版本目录

## API 组成

- 健康检查：`GET /health` 和 `GET /api/health` 返回服务可用状态和数据库打开时间。
- 客户端 IP：`GET /myip` 和 `GET /api/myip` 返回访问者 IP。`TRUST_PROXY` 不为 `0` 时，会优先读取常见代理头，再回退到连接地址。
- 纯文本客户端 IP：`GET /myip?format=text`、`GET /api/myip?format=text`，或对 `/myip` 发送 `Accept: text/plain`，只返回 `text/plain` 格式的访问者 IP。
- GeoIP 查询：`GET /geoip/{ip}`、`GET /geoip?ip=...`、`GET /api/geoip/{ip}`、`GET /api/geoip?ip=...` 返回标准化 IP 信息。
- 当前访问者查询：`GET /geoip` 和 `GET /api/geoip` 会用访问者 IP 查询，并返回同样的 GeoIP 字段。
- CDN 节点探测：`GET /cdn-node/{provider}` 和 `GET /api/cdn-node/{provider}` 支持 `fastly`、`akamai`、`virtuozzo`、`ovh`，返回探测到的边缘节点。
- 返回字段：查询结果可能包含 `ip`、`country`、`country_code`、`region`、`region_code`、`city`、`postal_code`、`asn`、`asn_organization`、`organization`、`isp`、`timezone`、`offset`、`latitude`、`longitude`、`continent_code`。
- 数据库读取层：启动时打开 IPv4/IPv6 GeoLite2 City MMDB、ASN MMDB、Geo-Whois ASN Country MMDB、ip2region IPv4/IPv6 XDB，并在请求间复用。
- 回退逻辑：中国大陆 IP 可用 ip2region 补充中文省市和运营商；当数据库缺少坐标时，用中国和全球城市中心表补齐经纬度。
- 本地化和 HTTP 行为：`Accept-Language` 和 `GEOIP_LANG` 会影响可用的本地化名称；JSON 响应允许跨域，并设置 `cache-control: no-store`。

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
- 安装和更新所需的部署脚本
- 两机同步所需的脚本
- 安装或更新服务所需的最小文件集

## 自动化

GitHub Actions 每天构建一次，并发布新的 `data-YYYYMMDD` GitHub Release。
Release 创建成功后，工作流会更新 `.github/badges/release.json` 和 README 徽章缓存参数，让徽章显示已发布的 tag，同时避免使用 Shields 的 GitHub API 路由。

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
