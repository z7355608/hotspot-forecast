export function getProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/image-proxy")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
