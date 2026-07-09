const base = process.env.GEOIP_BASE_URL || 'http://127.0.0.1:3022';
const samples = [
  '1.1.1.1',
  '1.0.0.1',
  '2606:4700:4700::1111',
  '2606:4700:4700::1001',
  '8.8.8.8',
  '2404:c804:3030:b701:be24:11ff:fedb:f7c',
  '124.127.82.2',
  '240e:3b7:3272:d8d0:db09:c067:8d59:539e'
];

for (const ip of samples) {
  const response = await fetch(`${base}/geoip/${encodeURIComponent(ip)}`, {
    headers: { accept: 'application/json', 'accept-language': 'zh-CN' }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${ip} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  for (const key of ['ip', 'asn', 'country_code']) {
    if (!(key in body)) throw new Error(`${ip} response missing ${key}: ${JSON.stringify(body)}`);
  }
  if (ip === '1.1.1.1' || ip === '1.0.0.1' || ip === '2606:4700:4700::1111' || ip === '2606:4700:4700::1001') {
    for (const key of ['region', 'city', 'latitude', 'longitude']) {
      if (!(key in body)) throw new Error(`${ip} response missing anycast fallback ${key}: ${JSON.stringify(body)}`);
    }
    if (body.country_code !== 'AU' || body.city !== 'Sydney') {
      throw new Error(`${ip} response should use Sydney anycast fallback: ${JSON.stringify(body)}`);
    }
  }
  if (ip === '124.127.82.2' || ip === '240e:3b7:3272:d8d0:db09:c067:8d59:539e') {
    for (const key of ['region', 'city']) {
      if (!(key in body)) throw new Error(`${ip} response missing ${key}: ${JSON.stringify(body)}`);
    }
    for (const key of ['latitude', 'longitude']) {
      if (!(key in body)) throw new Error(`${ip} response missing fallback ${key}: ${JSON.stringify(body)}`);
    }
    if (ip === '124.127.82.2' && (Math.floor(body.latitude) !== 39 || Math.floor(body.longitude) !== 116)) {
      throw new Error(`${ip} response should use Beijing fallback coordinates: ${JSON.stringify(body)}`);
    }
    if (ip === '240e:3b7:3272:d8d0:db09:c067:8d59:539e' && (Math.floor(body.latitude) !== 22 || Math.floor(body.longitude) !== 114)) {
      throw new Error(`${ip} response should use Shenzhen fallback coordinates: ${JSON.stringify(body)}`);
    }
  }
  console.log(ip, JSON.stringify(body));
}

for (const path of ['/api/geoip/8.8.8.8', '/api/health', '/api/myip']) {
  const response = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json', 'accept-language': 'zh-CN' }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  console.log(path, JSON.stringify(body));
}

const proxyHeaderSamples = [
  {
    name: 'aliyun-real-client-ip',
    expected: '8.8.8.8',
    headers: {
      'ali-real-client-ip': '8.8.8.8',
      'x-real-ip': '211.100.8.31',
      'x-forwarded-for': '211.100.8.31'
    }
  },
  {
    name: 'xff-before-x-real-ip',
    expected: '1.1.1.1',
    headers: {
      'x-forwarded-for': '1.1.1.1, 211.100.8.31',
      'x-real-ip': '211.100.8.31'
    }
  }
];

for (const sample of proxyHeaderSamples) {
  const response = await fetch(`${base}/api/myip`, {
    headers: {
      accept: 'application/json',
      'accept-language': 'zh-CN',
      ...sample.headers
    }
  });
  const body = await response.json();
  if (!response.ok || body.ip !== sample.expected) {
    throw new Error(`${sample.name} expected ${sample.expected}: ${JSON.stringify(body)}`);
  }
  console.log(sample.name, JSON.stringify(body));
}

const plainIpSamples = [
  {
    name: 'myip-format-text',
    path: '/api/myip?format=text',
    expected: '8.8.8.8',
    headers: {
      accept: 'application/json',
      'ali-real-client-ip': '8.8.8.8'
    }
  },
  {
    name: 'myip-accept-text',
    path: '/myip',
    expected: '1.1.1.1',
    headers: {
      accept: 'text/plain',
      'x-forwarded-for': '1.1.1.1, 211.100.8.31'
    }
  }
];

for (const sample of plainIpSamples) {
  const response = await fetch(`${base}${sample.path}`, {
    headers: sample.headers
  });
  const body = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || body !== `${sample.expected}\n` || !contentType.toLowerCase().startsWith('text/plain')) {
    throw new Error(`${sample.name} expected plain ${sample.expected}: ${JSON.stringify({ body, contentType })}`);
  }
  console.log(sample.name, JSON.stringify(body));
}
