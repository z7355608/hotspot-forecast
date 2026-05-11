import { useState, type ImgHTMLAttributes } from "react";

const ERROR_IMG_SRC =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==";

/**
 * 把图片 URL 中平台特定的不兼容格式参数改成浏览器通用格式。
 *
 * - xhscdn.com 的小红书图片默认 `format/heif`（HEIF 是苹果生态格式，Chrome/
 *   Firefox/Edge 都不解码 → 用户看到空白），强制改成 `format/webp`。
 * - 其它平台（B 站 hdslb / 抖音 douyinpic）默认就是 jpg/webp，原样返回。
 */
function normalizeImageUrl(src: string | undefined | null): string | undefined {
  if (typeof src !== "string" || !src) return src ?? undefined;
  if (src.includes("xhscdn.com")) {
    return src.replace(/format\/heif/g, "format/webp");
  }
  return src;
}

export function ImageWithFallback(
  props: ImgHTMLAttributes<HTMLImageElement>,
) {
  const [didError, setDidError] = useState(false);
  const { src: rawSrc, alt, style, className, ...rest } = props;
  // 把 xhscdn 的 heif 参数改成 webp，让 Chrome/Firefox/Edge 能渲染
  const src = normalizeImageUrl(typeof rawSrc === "string" ? rawSrc : undefined);

  if (didError) {
    return (
      <div
        className={`inline-block bg-gray-100 align-middle ${className ?? ""}`}
        style={style}
      >
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={ERROR_IMG_SRC}
            alt="Error loading image"
            data-original-url={src}
            {...rest}
          />
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      // 不发送 Referer，绕过 xhs / B 站 / 抖音的图片防盗链（403 Forbidden）。
      // 平台检查 Referer 是否来自自家域名；no-referrer 时按"直接打开"处理放行。
      referrerPolicy="no-referrer"
      onError={() => setDidError(true)}
      {...rest}
    />
  );
}
