/**
 * 封面 URL 兜底：TikHub / 解析接口未返回封面时，用平台可推断的静态规则补全。
 */

/** 抖音 aweme_id → byteimg CDN 缩略图（多 host 轮询由浏览器/上游择优） */
export function douyinByteimgCoverCandidates(awemeId: string): string[] {
  const id = awemeId.trim();
  if (!/^\d{10,}$/.test(id)) return [];
  const hosts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `p${n}-dy.byteimg.com`);
  return hosts.map((h) => `https://${h}/aweme/100x100/${id}.jpeg`);
}

export function pickDouyinCoverFallback(awemeId: string): string | null {
  const list = douyinByteimgCoverCandidates(awemeId);
  return list[0] ?? null;
}

/** 从抖音分享/视频 URL 提取 aweme_id */
export function extractDouyinAwemeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const video = u.pathname.match(/\/video\/(\d+)/);
    if (video) return video[1];
    const v = u.searchParams.get("modal_id") ?? u.searchParams.get("aweme_id");
    if (v && /^\d{10,}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}
