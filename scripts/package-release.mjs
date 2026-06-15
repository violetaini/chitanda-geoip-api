import { createHash } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'release');
const stagingDir = path.join(outDir, 'chitanda-geoip-api');
const archiveName = 'chitanda-geoip-api-with-data.tar.gz';
const archivePath = path.join(outDir, archiveName);
const checksumPath = `${archivePath}.sha256`;

const paths = [
  'server.js',
  'cn-city-centers.js',
  'global-city-centers.js',
  'package.json',
  'package-lock.json',
  'README.md',
  'LICENSE',
  'scripts/download-db.js',
  'scripts/install-linux.sh',
  'scripts/smoke.js',
  'scripts/update-linux.sh',
  'deploy/chitanda-geoip-api.service',
  'deploy/chitanda-geoip-api-update.service',
  'deploy/chitanda-geoip-api-update.timer',
  'deploy/nginx.example.conf',
  'data/geolite2-city-ipv4.mmdb',
  'data/geolite2-city-ipv6.mmdb',
  'data/asn.mmdb',
  'data/geolite2-geo-whois-asn-country.mmdb',
  'data/ip2region_v4.xdb',
  'data/ip2region_v6.xdb'
];

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

async function copyEntry(relativePath) {
  const src = path.join(root, relativePath);
  const dest = path.join(stagingDir, relativePath);
  if (!(await exists(src))) {
    throw new Error(`missing release entry: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      stdio: 'inherit'
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });

for (const relativePath of paths) {
  await copyEntry(relativePath);
}

await run('tar', ['-czf', archivePath, '-C', outDir, 'chitanda-geoip-api']);

const hash = createHash('sha256');
const stream = (await import('node:fs')).createReadStream(archivePath);
for await (const chunk of stream) {
  hash.update(chunk);
}
await new Promise((resolve, reject) => {
  const out = createWriteStream(checksumPath);
  out.on('error', reject);
  out.on('finish', resolve);
  out.end(`${hash.digest('hex')}  ${archiveName}\n`);
});

console.log(`wrote ${archivePath}`);
console.log(`wrote ${checksumPath}`);
