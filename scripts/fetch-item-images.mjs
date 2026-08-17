import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const manifestPath = resolve('public/assets/item-images/source-manifest.json');
const publicRoot = resolve('public');
const sourceRoot = resolve('scripts/item-image-sources');
const discover = process.argv.slice(2).includes('--discover');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--discover');
const userAgent = 'WesterosChroniclesItemArtFetcher/1.0 (+https://github.com/Aca233/westeros-chronicles)';

if (unknownArguments.length > 0) throw new Error(`未知参数：${unknownArguments.join(', ')}`);

function requireHttps(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${label} 必须使用 HTTPS：${value}`);
  return url;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function readTagAttributes(tag) {
  const attributes = new Map();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

function discoverOpenGraphImage(html, sourcePage) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = readTagAttributes(match[0]);
    if (attributes.get('property')?.toLowerCase() !== 'og:image') continue;
    const content = attributes.get('content');
    if (content) return requireHttps(new URL(content, sourcePage).href, 'og:image').href;
  }
  throw new Error(`${sourcePage} 没有 canonical og:image`);
}

class RemoteFetchError extends Error {
  constructor(url, response) {
    super(`下载失败 ${response.status} ${response.statusText}：${url}`);
    this.status = response.status;
    this.cloudflareChallenge = response.headers.get('cf-mitigated') === 'challenge';
  }
}

async function fetchBytes(url, accept) {
  const remoteUrl = requireHttps(url, '远程资源');
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(remoteUrl, {
        headers: { Accept: accept, 'User-Agent': userAgent },
        redirect: 'follow',
      });
      if (!response.ok) {
        const error = new RemoteFetchError(url, response);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } else {
        requireHttps(response.url, '重定向后的远程资源');
        return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
      }
    } catch (error) {
      if (error instanceof RemoteFetchError && error.status !== 429 && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
  }
  throw lastError;
}

async function fetchImageBytes(sourceImage) {
  try {
    return (await fetchBytes(sourceImage, 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8')).bytes;
  } catch (error) {
    if (!(error instanceof RemoteFetchError) || error.status !== 403 || !error.cloudflareChallenge) throw error;
    const sourceUrl = requireHttps(sourceImage, 'Wiki 原图');
    const proxyUrl = new URL('https://images.weserv.nl/');
    proxyUrl.searchParams.set('url', `${sourceUrl.host}${sourceUrl.pathname}${sourceUrl.search}`);
    proxyUrl.searchParams.set('output', 'png');
    const proxied = await fetchBytes(proxyUrl.href, 'image/png,image/*;q=0.8');
    const canonical = proxied.headers.get('link') ?? '';
    if (!canonical.includes(`<${sourceUrl.href}>`) || !canonical.includes('rel="canonical"')) {
      throw new Error(`${sourceImage} 的只读代理未返回匹配的 canonical 来源`);
    }
    return proxied.bytes;
  }
}

async function canonicalizeSourceImage(sourceBytes) {
  return sharp(sourceBytes).rotate().png({ compressionLevel: 9 }).toBuffer();
}

async function normalizeImage(sourceBytes) {
  return sharp(sourceBytes)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
}

function containedPath(root, relativePath, requiredPrefix, label) {
  if (!relativePath.startsWith(requiredPrefix)) throw new Error(`${label}路径不合法：${relativePath}`);
  const filePath = resolve(relativePath);
  if (!filePath.startsWith(`${root}/`)) throw new Error(`${label}路径越界：${relativePath}`);
  return filePath;
}

function localFilePath(localPath) {
  if (!localPath.startsWith('/assets/item-images/')) throw new Error(`本地图片路径不合法：${localPath}`);
  const filePath = resolve(publicRoot, localPath.slice(1));
  if (!filePath.startsWith(`${publicRoot}/`)) throw new Error(`本地图片路径越界：${localPath}`);
  return filePath;
}

function sourceFilePath(localSourcePath) {
  return containedPath(sourceRoot, localSourcePath, 'scripts/item-image-sources/', '来源缓存');
}

async function atomicWrite(filePath, bytes) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, filePath);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.items)) throw new Error('图片来源清单格式无效');

const prepared = [];
for (const entry of manifest.items) {
  const sourcePage = requireHttps(entry.sourcePage, `${entry.itemId} sourcePage`).href;
  let sourceImage = entry.sourceImage;
  if (discover) {
    try {
      const pageResponse = await fetchBytes(sourcePage, 'text/html,application/xhtml+xml');
      sourceImage = discoverOpenGraphImage(pageResponse.bytes.toString('utf8'), sourcePage);
    } catch (error) {
      const hasAuditedImage = typeof sourceImage === 'string' && sourceImage.length > 0;
      if (!(error instanceof RemoteFetchError) || error.status !== 403 || !error.cloudflareChallenge || !hasAuditedImage) throw error;
      console.warn(`${entry.itemId} 的来源页触发 Cloudflare 挑战，保留清单中已审定的原图 URL。`);
    }
  } else if (!sourceImage) {
    throw new Error(`${entry.itemId} 缺少已提交的 sourceImage，请先运行 --discover`);
  }

  sourceImage = requireHttps(sourceImage, `${entry.itemId} sourceImage`).href;
  const cachePath = sourceFilePath(entry.localSourcePath);
  const sourceBytes = discover ? await canonicalizeSourceImage(await fetchImageBytes(sourceImage)) : await readFile(cachePath);
  const sourceDigest = sha256(sourceBytes);
  if (!discover && sourceDigest !== entry.sourceSha256) {
    throw new Error(`${entry.itemId} 来源缓存哈希不匹配：预期 ${entry.sourceSha256}，实际 ${sourceDigest}`);
  }
  const outputBytes = await normalizeImage(sourceBytes);
  const outputDigest = sha256(outputBytes);
  if (!discover && outputDigest !== entry.sha256) {
    throw new Error(`${entry.itemId} 标准化结果哈希不匹配：预期 ${entry.sha256}，实际 ${outputDigest}`);
  }
  prepared.push({ entry, sourceImage, sourceBytes, sourceDigest, outputBytes, outputDigest, cachePath, filePath: localFilePath(entry.localPath) });
}

for (const item of prepared) {
  if (discover) await atomicWrite(item.cachePath, item.sourceBytes);
  await atomicWrite(item.filePath, item.outputBytes);
}

if (discover) {
  const retrievedAt = new Date().toISOString();
  for (const item of prepared) {
    item.entry.sourceImage = item.sourceImage;
    item.entry.retrievedAt = retrievedAt;
    item.entry.sourceSha256 = item.sourceDigest;
    item.entry.sha256 = item.outputDigest;
  }
  await atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
}

console.log(`${prepared.length} 张 Wiki 物品图片已${discover ? '发现、缓存、标准化并登记' : '从来源缓存确定性复验'}。`);
