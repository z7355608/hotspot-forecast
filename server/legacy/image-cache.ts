import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const COVER_CACHE_DIR = path.resolve(process.cwd(), "data", "media-cache", "covers");
const COVER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedCoverMeta = {
  sourceUrl: string;
  contentType: string;
  ext: string;
  cachedAt: number;
};

export type CachedCoverImage = {
  buffer: Buffer;
  contentType: string;
  cachedAt: number;
};

function getCacheHash(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex");
}

function getExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/avif") return "avif";
  return "jpg";
}

function getPaths(sourceUrl: string, ext?: string) {
  const hash = getCacheHash(sourceUrl);
  return {
    metaPath: path.join(COVER_CACHE_DIR, `${hash}.json`),
    imagePath: path.join(COVER_CACHE_DIR, `${hash}.${ext ?? "jpg"}`),
  };
}

export async function readCachedCoverImage(sourceUrl: string): Promise<CachedCoverImage | null> {
  try {
    const { metaPath } = getPaths(sourceUrl);
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as CachedCoverMeta;
    if (meta.sourceUrl !== sourceUrl) return null;
    if (Date.now() - meta.cachedAt > COVER_CACHE_TTL_MS) return null;

    const { imagePath } = getPaths(sourceUrl, meta.ext);
    return {
      buffer: await readFile(imagePath),
      contentType: meta.contentType,
      cachedAt: meta.cachedAt,
    };
  } catch {
    return null;
  }
}

export async function writeCachedCoverImage(
  sourceUrl: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await mkdir(COVER_CACHE_DIR, { recursive: true });
  const ext = getExtension(contentType);
  const { metaPath, imagePath } = getPaths(sourceUrl, ext);
  const meta: CachedCoverMeta = {
    sourceUrl,
    contentType,
    ext,
    cachedAt: Date.now(),
  };
  await Promise.all([
    writeFile(imagePath, buffer),
    writeFile(metaPath, JSON.stringify(meta, null, 2)),
  ]);
}
