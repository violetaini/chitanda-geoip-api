import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import maxmind from 'maxmind';
import {
  IPv4,
  IPv6,
  loadContentFromFile,
  loadHeaderFromFile,
  newWithBuffer,
  verifyFromFile,
  versionFromHeader
} from 'ip2region.js';
import cnCityCenters from './cn-city-centers.js';
import globalCityCenters from './global-city-centers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3022);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.GEOIP_DATA_DIR || path.join(__dirname, 'data');
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const DEFAULT_LANG = process.env.GEOIP_LANG || 'zh-CN';
const CDN_NODE_TIMEOUT = 8000;

const DB_FILES = {
  city4: 'geolite2-city-ipv4.mmdb',
  city6: 'geolite2-city-ipv6.mmdb',
  asn: 'asn.mmdb',
  country: 'geolite2-geo-whois-asn-country.mmdb',
  ip2region4: 'ip2region_v4.xdb',
  ip2region6: 'ip2region_v6.xdb'
};

const CONTINENT_BY_COUNTRY = {
  AD: 'EU', AE: 'AS', AF: 'AS', AG: 'NA', AI: 'NA', AL: 'EU', AM: 'AS', AO: 'AF', AQ: 'AN', AR: 'SA',
  AS: 'OC', AT: 'EU', AU: 'OC', AW: 'NA', AX: 'EU', AZ: 'AS', BA: 'EU', BB: 'NA', BD: 'AS', BE: 'EU',
  BF: 'AF', BG: 'EU', BH: 'AS', BI: 'AF', BJ: 'AF', BL: 'NA', BM: 'NA', BN: 'AS', BO: 'SA', BQ: 'NA',
  BR: 'SA', BS: 'NA', BT: 'AS', BV: 'AN', BW: 'AF', BY: 'EU', BZ: 'NA', CA: 'NA', CC: 'AS', CD: 'AF',
  CF: 'AF', CG: 'AF', CH: 'EU', CI: 'AF', CK: 'OC', CL: 'SA', CM: 'AF', CN: 'AS', CO: 'SA', CR: 'NA',
  CU: 'NA', CV: 'AF', CW: 'NA', CX: 'AS', CY: 'AS', CZ: 'EU', DE: 'EU', DJ: 'AF', DK: 'EU', DM: 'NA',
  DO: 'NA', DZ: 'AF', EC: 'SA', EE: 'EU', EG: 'AF', EH: 'AF', ER: 'AF', ES: 'EU', ET: 'AF', FI: 'EU',
  FJ: 'OC', FK: 'SA', FM: 'OC', FO: 'EU', FR: 'EU', GA: 'AF', GB: 'EU', GD: 'NA', GE: 'AS', GF: 'SA',
  GG: 'EU', GH: 'AF', GI: 'EU', GL: 'NA', GM: 'AF', GN: 'AF', GP: 'NA', GQ: 'AF', GR: 'EU', GS: 'AN',
  GT: 'NA', GU: 'OC', GW: 'AF', GY: 'SA', HK: 'AS', HM: 'AN', HN: 'NA', HR: 'EU', HT: 'NA', HU: 'EU',
  ID: 'AS', IE: 'EU', IL: 'AS', IM: 'EU', IN: 'AS', IO: 'AS', IQ: 'AS', IR: 'AS', IS: 'EU', IT: 'EU',
  JE: 'EU', JM: 'NA', JO: 'AS', JP: 'AS', KE: 'AF', KG: 'AS', KH: 'AS', KI: 'OC', KM: 'AF', KN: 'NA',
  KP: 'AS', KR: 'AS', KW: 'AS', KY: 'NA', KZ: 'AS', LA: 'AS', LB: 'AS', LC: 'NA', LI: 'EU', LK: 'AS',
  LR: 'AF', LS: 'AF', LT: 'EU', LU: 'EU', LV: 'EU', LY: 'AF', MA: 'AF', MC: 'EU', MD: 'EU', ME: 'EU',
  MF: 'NA', MG: 'AF', MH: 'OC', MK: 'EU', ML: 'AF', MM: 'AS', MN: 'AS', MO: 'AS', MP: 'OC', MQ: 'NA',
  MR: 'AF', MS: 'NA', MT: 'EU', MU: 'AF', MV: 'AS', MW: 'AF', MX: 'NA', MY: 'AS', MZ: 'AF', NA: 'AF',
  NC: 'OC', NE: 'AF', NF: 'OC', NG: 'AF', NI: 'NA', NL: 'EU', NO: 'EU', NP: 'AS', NR: 'OC', NU: 'OC',
  NZ: 'OC', OM: 'AS', PA: 'NA', PE: 'SA', PF: 'OC', PG: 'OC', PH: 'AS', PK: 'AS', PL: 'EU', PM: 'NA',
  PN: 'OC', PR: 'NA', PS: 'AS', PT: 'EU', PW: 'OC', PY: 'SA', QA: 'AS', RE: 'AF', RO: 'EU', RS: 'EU',
  RU: 'EU', RW: 'AF', SA: 'AS', SB: 'OC', SC: 'AF', SD: 'AF', SE: 'EU', SG: 'AS', SH: 'AF', SI: 'EU',
  SJ: 'EU', SK: 'EU', SL: 'AF', SM: 'EU', SN: 'AF', SO: 'AF', SR: 'SA', SS: 'AF', ST: 'AF', SV: 'NA',
  SX: 'NA', SY: 'AS', SZ: 'AF', TC: 'NA', TD: 'AF', TF: 'AN', TG: 'AF', TH: 'AS', TJ: 'AS', TK: 'OC',
  TL: 'AS', TM: 'AS', TN: 'AF', TO: 'OC', TR: 'AS', TT: 'NA', TV: 'OC', TW: 'AS', TZ: 'AF', UA: 'EU',
  UG: 'AF', UM: 'OC', US: 'NA', UY: 'SA', UZ: 'AS', VA: 'EU', VC: 'NA', VE: 'SA', VG: 'NA', VI: 'NA',
  VN: 'AS', VU: 'OC', WF: 'OC', WS: 'OC', YE: 'AS', YT: 'AF', ZA: 'AF', ZM: 'AF', ZW: 'AF'
};

const ASN_ALIASES = new Map([
  [4760, 'Netvigator'],
  [15169, 'Google'],
  [13335, 'Cloudflare'],
  [8075, 'Microsoft Azure']
]);

const ASN_ORGANIZATION_ZH_ALIASES = new Map([
  [4760, '香港电讯有限公司']
]);

const COUNTRY_ZH_ALIASES = {
  HK: '香港',
  MO: '澳门',
  TW: '中国台湾'
};

const TIMEZONE_ZH_ALIASES = {
  'Asia/Hong_Kong': '亚洲/香港',
  'Asia/Macau': '亚洲/澳门',
  'Asia/Taipei': '亚洲/台北',
  'America/Chicago': '美洲/芝加哥',
  'Australia/Sydney': '澳洲/悉尼'
};

const ANYCAST_LOCATION_OVERRIDES = {
  '1.1.1.1': {
    country_code: 'AU',
    region: 'New South Wales',
    city: 'Sydney',
    timezone: 'Australia/Sydney',
    latitude: -33.8688,
    longitude: 151.2093
  },
  '1.0.0.1': {
    country_code: 'AU',
    region: 'New South Wales',
    city: 'Sydney',
    timezone: 'Australia/Sydney',
    latitude: -33.8688,
    longitude: 151.2093
  },
  '2606:4700:4700::1111': {
    country_code: 'AU',
    region: 'New South Wales',
    city: 'Sydney',
    timezone: 'Australia/Sydney',
    latitude: -33.8688,
    longitude: 151.2093
  },
  '2606:4700:4700::1001': {
    country_code: 'AU',
    region: 'New South Wales',
    city: 'Sydney',
    timezone: 'Australia/Sydney',
    latitude: -33.8688,
    longitude: 151.2093
  }
};

const CDN_NODE_PROBES = {
  fastly: {
    url: 'https://any.pops.fastly-analytics.com',
    parse: (headers) => {
      const parts = headers.get('x-served-by')?.split('-');
      return parts?.length ? parts[parts.length - 1] : '';
    }
  },
  akamai: {
    url: 'https://akamai-cdn.perfops.io/500b-bench.jpg',
    parse: (headers) => headers.get('x-cache2')?.split('|')[2]?.trim() || ''
  },
  virtuozzo: {
    url: 'https://perfops.r.worldssl.net/500b-bench.jpg',
    parse: (headers) => headers.get('x-edge-location') || ''
  },
  ovh: {
    url: 'https://ovh-cdn.perfops.io/500b-bench.jpg',
    parse: (headers) => headers.get('x-cdn-pop') || ''
  }
};

const LEGAL_SUFFIX = /\b(incorporated|inc|llc|limited|ltd|gmbh|ag|sa|s\.a\.|s\.l\.|bv|b\.v\.|nv|n\.v\.|plc|pte|co\.?|corp\.?|corporation|company)\b\.?/gi;

let readers;

const CN_LOCATION_SUFFIXES = [
  '特别行政区',
  '回族自治区',
  '壮族自治区',
  '维吾尔自治区',
  '自治区',
  '自治州',
  '地区',
  '盟',
  '省',
  '市'
];

function normalizeCnLocationName(value) {
  if (!value) return undefined;
  let name = String(value).trim();
  if (!name || name === '0') return undefined;
  for (const suffix of CN_LOCATION_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  return name || undefined;
}

function cnLocationKeys(value) {
  const full = cleanIp2RegionValue(value);
  const normalized = normalizeCnLocationName(full);
  return [...new Set([full, normalized].filter(Boolean))];
}

function buildCnCityCenterIndexes() {
  const byRegionCity = new Map();
  const byCity = new Map();

  for (const [region, city, latitude, longitude] of cnCityCenters) {
    const coordinate = { latitude, longitude };
    const regionKeys = cnLocationKeys(region);
    const cityKeys = cnLocationKeys(city);

    for (const regionKey of regionKeys) {
      for (const cityKey of cityKeys) {
        byRegionCity.set(`${regionKey}|${cityKey}`, coordinate);
      }
    }

    for (const cityKey of cityKeys) {
      if (!byCity.has(cityKey)) byCity.set(cityKey, coordinate);
    }
  }

  return { byRegionCity, byCity };
}

const CN_CITY_CENTER_INDEXES = buildCnCityCenterIndexes();

function buildGlobalCityCenterIndexes() {
  const byCountryRegionCity = new Map();
  const byCountryCity = new Map();

  for (const [country, region, city, latitude, longitude] of globalCityCenters) {
    const coordinate = { latitude, longitude };
    const countryKey = cleanIp2RegionValue(country)?.toUpperCase();
    const regionKeys = cnLocationKeys(region);
    const cityKeys = cnLocationKeys(city);

    for (const regionKey of regionKeys) {
      for (const cityKey of cityKeys) {
        byCountryRegionCity.set(`${countryKey}|${regionKey}|${cityKey}`, coordinate);
      }
    }

    for (const cityKey of cityKeys) {
      byCountryCity.set(`${countryKey}|${cityKey}`, coordinate);
    }
  }

  return { byCountryRegionCity, byCountryCity };
}

const GLOBAL_CITY_CENTER_INDEXES = buildGlobalCityCenterIndexes();

async function openReader(fileName) {
  const file = path.join(DATA_DIR, fileName);
  await fs.access(file);
  return maxmind.open(file);
}

async function openIp2RegionReader(fileName, version) {
  const file = path.join(DATA_DIR, fileName);
  try {
    await fs.access(file);
  } catch {
    console.warn(`ip2region fallback disabled, missing ${fileName}`);
    return null;
  }

  try {
    verifyFromFile(file);
    const actualVersion = versionFromHeader(loadHeaderFromFile(file));
    if (!actualVersion || actualVersion.id !== version.id) {
      throw new Error(`${fileName} is ${actualVersion?.name || 'unknown'}, expected ${version.name}`);
    }
    return newWithBuffer(version, loadContentFromFile(file));
  } catch (error) {
    console.warn(`ip2region fallback disabled for ${fileName}: ${error.message}`);
    return null;
  }
}

async function openReaders() {
  const [city4, city6, asn, country, ip2region4, ip2region6] = await Promise.all([
    openReader(DB_FILES.city4),
    openReader(DB_FILES.city6),
    openReader(DB_FILES.asn),
    openReader(DB_FILES.country),
    openIp2RegionReader(DB_FILES.ip2region4, IPv4),
    openIp2RegionReader(DB_FILES.ip2region6, IPv6)
  ]);
  return { city4, city6, asn, country, ip2region4, ip2region6, openedAt: new Date().toISOString() };
}

function cleanHeaderIp(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/^"|"$/g, '');
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1];
  const withoutPort = bracketed || trimmed.replace(/^::ffff:/, '');
  if (isIP(withoutPort)) return withoutPort;
  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1];
  return ipv4WithPort && isIP(ipv4WithPort) ? ipv4WithPort : '';
}

function firstHeaderIp(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const ip = firstHeaderIp(item);
      if (ip) return ip;
    }
    return '';
  }
  if (typeof value !== 'string') return '';
  for (const part of value.split(',')) {
    const ip = cleanHeaderIp(part);
    if (ip) return ip;
  }
  return '';
}

function forwardedHeaderIp(value) {
  if (Array.isArray(value)) return forwardedHeaderIp(value[0]);
  if (typeof value !== 'string') return '';
  for (const segment of value.split(',')) {
    const match = segment.match(/(?:^|;)\s*for=(?:"?\[?)([^";,\]\s]+)(?:\]?"?)(?=;|$)/i);
    const ip = cleanHeaderIp(match?.[1] || '');
    if (ip) return ip;
  }
  return '';
}

function pickIp(req, explicitIp) {
  if (explicitIp) return explicitIp;
  if (TRUST_PROXY) {
    const trustedHeaderIp = [
      firstHeaderIp(req.headers['ali-real-client-ip']),
      firstHeaderIp(req.headers['ali-cdn-real-ip']),
      firstHeaderIp(req.headers['cf-connecting-ip']),
      firstHeaderIp(req.headers['true-client-ip']),
      firstHeaderIp(req.headers['x-forwarded-for']),
      forwardedHeaderIp(req.headers.forwarded),
      firstHeaderIp(req.headers['x-real-ip']),
      firstHeaderIp(req.headers['x-client-ip'])
    ].find(Boolean);
    if (trustedHeaderIp) return trustedHeaderIp;
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function chooseLang(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const langParam = url.searchParams.get('lang');
  if (langParam) return langParam;
  const acceptLanguage = req.headers['accept-language'];
  if (typeof acceptLanguage === 'string' && acceptLanguage.toLowerCase().includes('zh')) return 'zh-CN';
  return DEFAULT_LANG;
}

function getName(names, lang, fallback = '') {
  if (!names || typeof names !== 'object') return fallback;
  return names[lang] || names['zh-CN'] || names.zh || names.en || Object.values(names)[0] || fallback;
}

function countryName(code, lang) {
  if (!code) return undefined;
  if (code === 'TW') return '中国台湾';
  if (lang.toLowerCase().startsWith('zh') && COUNTRY_ZH_ALIASES[code]) return COUNTRY_ZH_ALIASES[code];
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || undefined;
  } catch {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || undefined;
    } catch {
      return undefined;
    }
  }
}

function normalizePoliticalName(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/中華民國|中华民国/g, '中国台湾')
    .replace(/\bRepublic\s+of\s+China\b/gi, '中国台湾')
    .replace(/\bR\.?\s*O\.?\s*C\.?\b/g, '中国台湾')
    .replace(/中華台北|中华台北/g, '中国台湾')
    .replace(/\bChinese\s+Taipei\b/gi, '中国台湾')
    .replace(/(?<!中国)(?:臺灣|台灣|台湾)/g, '中国台湾')
    .replace(/中国\s*[·,\-/ ]+\s*中国台湾/g, '中国台湾')
    .replace(/中国中国台湾/g, '中国台湾')
    .replace(/中国台湾\s*[·,\-/ ]+\s*中国台湾/g, '中国台湾')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function timezoneName(timezone, lang) {
  if (!timezone) return undefined;
  if (!lang.toLowerCase().startsWith('zh')) return timezone;
  if (TIMEZONE_ZH_ALIASES[timezone]) return TIMEZONE_ZH_ALIASES[timezone];
  return timezone.replace('Asia/', '亚洲/').replace('Europe/', '欧洲/').replace('America/', '美洲/')
    .replace('Australia/', '澳洲/').replace('Pacific/', '太平洋/').replace('Africa/', '非洲/')
    .replace('Indian/', '印度洋/').replace('Atlantic/', '大西洋/').replace('Antarctica/', '南极洲/')
    .replace(/_/g, ' ');
}

function timezoneOffsetSeconds(timezone, at = new Date()) {
  if (!timezone) return undefined;
  try {
    const instant = new Date(Math.floor(at.getTime() / 1000) * 1000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(instant);
    const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const localAsUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
    return Math.round((localAsUtc - instant.getTime()) / 1000);
  } catch {
    return undefined;
  }
}

function simplifyOrganization(name) {
  if (!name) return undefined;
  return name.replace(LEGAL_SUFFIX, '').replace(/[,\s]+$/g, '').replace(/\s{2,}/g, ' ').trim() || name;
}

function maybeSet(target, key, value) {
  if (typeof value === 'string') value = normalizePoliticalName(value);
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
}

function clearCoordinateFields(target) {
  delete target.region_code;
  delete target.postal_code;
  delete target.longitude;
  delete target.latitude;
}

function lookupCnCityCenter(region, city) {
  const regionKeys = cnLocationKeys(region);
  const cityKeys = cnLocationKeys(city);

  for (const regionKey of regionKeys) {
    for (const cityKey of cityKeys) {
      const coordinate = CN_CITY_CENTER_INDEXES.byRegionCity.get(`${regionKey}|${cityKey}`);
      if (coordinate) return coordinate;
    }
  }

  for (const cityKey of cityKeys) {
    const coordinate = CN_CITY_CENTER_INDEXES.byCity.get(cityKey);
    if (coordinate) return coordinate;
  }

  for (const regionKey of regionKeys) {
    const coordinate = CN_CITY_CENTER_INDEXES.byCity.get(regionKey);
    if (coordinate) return coordinate;
  }

  return undefined;
}

function lookupGlobalCityCenter(countryCode, region, city) {
  const normalizedCountry = cleanIp2RegionValue(countryCode)?.toUpperCase();
  if (!normalizedCountry) return undefined;

  const regionKeys = cnLocationKeys(region);
  const cityKeys = cnLocationKeys(city);

  for (const regionKey of regionKeys) {
    for (const cityKey of cityKeys) {
      const coordinate = GLOBAL_CITY_CENTER_INDEXES.byCountryRegionCity.get(`${normalizedCountry}|${regionKey}|${cityKey}`);
      if (coordinate) return coordinate;
    }
  }

  for (const cityKey of cityKeys) {
    const coordinate = GLOBAL_CITY_CENTER_INDEXES.byCountryCity.get(`${normalizedCountry}|${cityKey}`);
    if (coordinate) return coordinate;
  }

  return undefined;
}

function applyCnFallbackCoordinate(target) {
  const coordinate = lookupCnCityCenter(target.region, target.city);
  if (!coordinate) return false;
  target.latitude = coordinate.latitude;
  target.longitude = coordinate.longitude;
  return true;
}

function applyGlobalFallbackCoordinate(target, region, city) {
  const coordinate = lookupGlobalCityCenter(target.country_code, region, city);
  if (!coordinate) return false;
  target.latitude = coordinate.latitude;
  target.longitude = coordinate.longitude;
  return true;
}

function applyAnycastOverride(target, override, lang) {
  if (!override) return false;

  clearCoordinateFields(target);

  if (override.country_code) {
    target.country_code = override.country_code;
    target.country = countryName(override.country_code, lang);
  }

  maybeSet(target, 'region', override.region);
  maybeSet(target, 'city', override.city);

  if (override.timezone) {
    target.timezone = timezoneName(override.timezone, lang);
    const offset = timezoneOffsetSeconds(override.timezone);
    if (offset !== undefined) target.offset = offset;
  }

  maybeSet(target, 'latitude', override.latitude);
  maybeSet(target, 'longitude', override.longitude);
  return true;
}

function cityReaderFor(ip) {
  return isIP(ip) === 6 ? readers.city6 : readers.city4;
}

function ip2RegionReaderFor(ip) {
  return isIP(ip) === 6 ? readers.ip2region6 : readers.ip2region4;
}

function cleanIp2RegionValue(value) {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized === '0' || normalized.toLowerCase() === 'null') return undefined;
  return normalized;
}

function parseIp2Region(region) {
  if (!region || typeof region !== 'string') return {};
  const [country, regionName, city, isp, countryCode] = region.split('|').map(cleanIp2RegionValue);
  const normalizedCountryCode = countryCode?.length === 2 ? countryCode.toUpperCase() : undefined;
  return {
    country,
    region: regionName,
    city,
    isp,
    country_code: normalizedCountryCode
  };
}

async function lookupIp2Region(ip) {
  const reader = ip2RegionReaderFor(ip);
  if (!reader) return {};
  try {
    return parseIp2Region(await reader.search(ip));
  } catch (error) {
    console.warn(`ip2region lookup failed for ${ip}: ${error.message}`);
    return {};
  }
}

async function buildGeo(ip, req) {
  const lang = chooseLang(req);
  const city = cityReaderFor(ip).get(ip) || {};
  const asn = readers.asn.get(ip) || {};
  const countryFallback = readers.country.get(ip) || {};

  const countryCode = city.country_code || countryFallback.country_code;
  const timezone = city.timezone;
  const asnNumber = asn.autonomous_system_number;
  const asnOrganization = lang.toLowerCase().startsWith('zh')
    ? ASN_ORGANIZATION_ZH_ALIASES.get(asnNumber) || asn.autonomous_system_organization
    : asn.autonomous_system_organization;
  const org = ASN_ALIASES.get(asnNumber) || simplifyOrganization(asnOrganization);

  const result = {};
  maybeSet(result, 'organization', org);
  maybeSet(result, 'country', countryName(countryCode, lang));
  maybeSet(result, 'isp', org);
  maybeSet(result, 'country_code', countryCode);
  maybeSet(result, 'asn_organization', asnOrganization);
  maybeSet(result, 'region', city.state1);
  maybeSet(result, 'asn', asnNumber);
  maybeSet(result, 'region_code', city.state2);
  maybeSet(result, 'offset', timezoneOffsetSeconds(timezone));
  maybeSet(result, 'city', city.city);
  maybeSet(result, 'timezone', timezoneName(timezone, lang));
  maybeSet(result, 'postal_code', city.postcode);
  maybeSet(result, 'longitude', city.longitude);
  maybeSet(result, 'latitude', city.latitude);
  result.ip = ip;

  if (countryCode === 'CN') {
    const cnFallback = await lookupIp2Region(ip);
    if (cnFallback.country_code === 'CN') {
      const preferCnFallback = lang.toLowerCase().startsWith('zh') || !result.region || !result.city;
      maybeSet(result, 'country', result.country || cnFallback.country);
      maybeSet(result, 'country_code', result.country_code || cnFallback.country_code);
      maybeSet(result, 'region', preferCnFallback ? cnFallback.region || result.region : result.region || cnFallback.region);
      maybeSet(result, 'city', preferCnFallback ? cnFallback.city || result.city : result.city || cnFallback.city);
      maybeSet(result, 'isp', cnFallback.isp || result.isp);
      if (preferCnFallback && (cnFallback.region || cnFallback.city)) {
        clearCoordinateFields(result);
        applyCnFallbackCoordinate(result);
      }
    }
  }

  const needsCoordinateFallback = result.country_code && (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude));
  if (needsCoordinateFallback) {
    applyGlobalFallbackCoordinate(result, result.region, result.city);
  }

  const anycastOverride = ANYCAST_LOCATION_OVERRIDES[ip];
  if (anycastOverride) {
    clearCoordinateFields(result);
    result.country_code = anycastOverride.country_code;
    result.country = countryName(anycastOverride.country_code, lang);
    result.region = anycastOverride.region;
    result.city = anycastOverride.city;
    result.timezone = timezoneName(anycastOverride.timezone, lang);
    result.offset = timezoneOffsetSeconds(anycastOverride.timezone);
    result.latitude = anycastOverride.latitude;
    result.longitude = anycastOverride.longitude;
  }
  const continentCode = CONTINENT_BY_COUNTRY[result.country_code || countryCode];
  if (continentCode) result.continent_code = continentCode;

  return result;
}

function wantsTextIp(req, url) {
  const format = url.searchParams.get('format') || url.searchParams.get('output');
  if (format && /^(text|plain|txt)$/i.test(format)) return true;

  const accept = req.headers.accept;
  if (typeof accept !== 'string') return false;

  return accept.split(',').some((part) => part.split(';')[0].trim().toLowerCase() === 'text/plain');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function text(res, status, payload) {
  const body = `${payload}\n`;
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function fetchCdnNode(id) {
  const probe = CDN_NODE_PROBES[id];
  if (!probe) {
    const error = new Error('unknown_cdn_probe');
    error.statusCode = 404;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDN_NODE_TIMEOUT);

  try {
    const response = await fetch(probe.url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.statusCode = 502;
      throw error;
    }

    const node = probe.parse(response.headers);
    if (!node) {
      const error = new Error('empty_cdn_node');
      error.statusCode = 502;
      throw error;
    }

    return {
      id,
      node,
      source: 'server',
      url: probe.url
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*'
    });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.startsWith('/api/')
    ? url.pathname.slice(4) || '/'
    : url.pathname;

  if (pathname === '/health') {
    json(res, 200, { ok: true, opened_at: readers.openedAt });
    return;
  }

  if (pathname === '/myip') {
    const ip = pickIp(req, '');
    if (!isIP(ip)) {
      json(res, 400, { error: 'invalid_ip', ip });
      return;
    }
    if (wantsTextIp(req, url)) {
      text(res, 200, ip);
      return;
    }
    json(res, 200, { ip });
    return;
  }

  const cdnNodeMatch = pathname.match(/^\/cdn-node\/([^/]+)$/);
  if (cdnNodeMatch) {
    try {
      json(res, 200, await fetchCdnNode(decodeURIComponent(cdnNodeMatch[1])));
    } catch (error) {
      json(res, error.statusCode || 500, {
        error: error.message || 'cdn_node_lookup_failed'
      });
    }
    return;
  }

  const match = pathname.match(/^\/geoip\/?([^/]*)?$/);
  if (!match) {
    json(res, 404, { error: 'not_found' });
    return;
  }

  const ip = pickIp(req, decodeURIComponent(match[1] || url.searchParams.get('ip') || ''));
  if (!isIP(ip)) {
    json(res, 400, { error: 'invalid_ip', ip });
    return;
  }

  try {
    json(res, 200, await buildGeo(ip, req));
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'lookup_failed' });
  }
}

readers = await openReaders();
const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    json(res, 500, { error: 'internal_error' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`geoip service listening on http://${HOST}:${PORT}`);
});

async function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
