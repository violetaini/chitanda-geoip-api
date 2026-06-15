import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = process.env.GEOIP_DATA_DIR || path.join(root, 'data');

const cdnBase = process.env.GEOIP_CDN_BASE || 'https://cdn.jsdelivr.net/npm';
const ip2regionBase = process.env.GEOIP_IP2REGION_BASE || 'https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data';
const ip2regionV6Url = process.env.GEOIP_IP2REGION_V6_URL || 'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v6.xdb';
const retries = Number(process.env.GEOIP_DOWNLOAD_RETRIES || 6);
const retryDelayMs = Number(process.env.GEOIP_DOWNLOAD_RETRY_DELAY_MS || 5000);
const timeoutMs = Number(process.env.GEOIP_DOWNLOAD_TIMEOUT_MS || 180000);

const files = [
  {
    file: 'geolite2-city-ipv4.mmdb',
    url: `${cdnBase}/@ip-location-db/geolite2-city-mmdb/geolite2-city-ipv4.mmdb`,
    minSize: 20 * 1024 * 1024
  },
  {
    file: 'geolite2-city-ipv6.mmdb',
    url: `${cdnBase}/@ip-location-db/geolite2-city-mmdb/geolite2-city-ipv6.mmdb`,
    minSize: 10 * 1024 * 1024
  },
  {
    file: 'asn.mmdb',
    url: `${cdnBase}/@ip-location-db/asn-mmdb/asn.mmdb`,
    minSize: 5 * 1024 * 1024
  },
  {
    file: 'geolite2-geo-whois-asn-country.mmdb',
    url: `${cdnBase}/@ip-location-db/geolite2-geo-whois-asn-country-mmdb/geolite2-geo-whois-asn-country.mmdb`,
    minSize: 5 * 1024 * 1024
  },
  {
    file: 'ip2region_v4.xdb',
    url: `${ip2regionBase}/ip2region_v4.xdb`,
    minSize: 10 * 1024 * 1024
  },
  {
    file: 'ip2region_v6.xdb',
    url: ip2regionV6Url,
    minSize: 30 * 1024 * 1024
  }
];

await fs.mkdir(dataDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseContentRangeTotal(header) {
  if (!header) return undefined;
  const match = header.match(/\/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function parseContentRangeStart(header) {
  if (!header) return undefined;
  const match = header.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  return match ? Number(match[1]) : undefined;
}

async function removeTmp(tmp) {
  await fs.unlink(tmp).catch(() => {});
}

async function download({ file, url, minSize }) {
  const tmp = path.join(dataDir, `${file}.tmp`);
  const dest = path.join(dataDir, file);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const existing = await fs.stat(tmp).then((stat) => stat.size, () => 0);
    const headers = {
      'user-agent': 'chitanda-geoip-api/1.0',
      'accept-encoding': 'identity'
    };
    if (existing > 0) headers.range = `bytes=${existing}-`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`download ${url} attempt ${attempt}/${retries}${existing ? ` resume=${existing}` : ''}`);
      const response = await fetch(url, { headers, signal: controller.signal });
      if (response.status === 416) {
        console.warn(`download range rejected for ${file}, clearing partial file and restarting`);
        await removeTmp(tmp);
        lastError = new Error(`range rejected for ${file}`);
        if (attempt >= retries) {
          throw lastError;
        }
        continue;
      }

      if ((!response.ok && response.status !== 206) || !response.body) {
        throw new Error(`failed to download ${url}: ${response.status} ${response.statusText}`);
      }

      const ranged = existing > 0 && response.status === 206;
      const encoding = response.headers.get('content-encoding');
      const trustLength = !encoding || encoding.toLowerCase() === 'identity';
      if (ranged) {
        const contentRangeStart = parseContentRangeStart(response.headers.get('content-range'));
        if (contentRangeStart !== undefined && contentRangeStart !== existing) {
          console.warn(`download range mismatch for ${file}: expected start ${existing}, got ${contentRangeStart}`);
          await removeTmp(tmp);
          lastError = new Error(`range mismatch for ${file}`);
          continue;
        }
      }

      const expectedTotal = trustLength && ranged
        ? parseContentRangeTotal(response.headers.get('content-range'))
        : trustLength
          ? Number(response.headers.get('content-length')) || undefined
          : undefined;

      await pipeline(response.body, createWriteStream(tmp, { flags: ranged ? 'a' : 'w' }));
      const stat = await fs.stat(tmp);
      if (expectedTotal !== undefined && stat.size !== expectedTotal) {
        await removeTmp(tmp);
        throw new Error(`${file} incomplete: ${stat.size} < ${expectedTotal}`);
      }
      if (stat.size < minSize) {
        await removeTmp(tmp);
        throw new Error(`${file} looks too small: ${stat.size}`);
      }

      await fs.rename(tmp, dest);
      console.log(`saved ${dest} ${stat.size} bytes`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`download failed ${file} attempt ${attempt}/${retries}: ${error.message}`);
      if (attempt < retries) await sleep(retryDelayMs * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

await Promise.all(files.map(download));
