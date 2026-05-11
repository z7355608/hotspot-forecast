/**
 * 探测 TikHub 是否有"按 aweme_id 取视频详情"的端点。
 * 如果有，可以替代 watermark API 这一跳。
 */
import "dotenv/config";

async function main() {
  const apiKey = process.env.TIKHUB_API_KEY!;
  const base = process.env.TIKHUB_BASE_URL || "https://api.tikhub.io";
  const awemeId = "7629821103762688377";

  const candidates = [
    `/api/v1/douyin/web/fetch_one_video?aweme_id=${awemeId}`,
    `/api/v1/douyin/app/v3/fetch_one_video?aweme_id=${awemeId}`,
    `/api/v1/douyin/web/fetch_video_detail?aweme_id=${awemeId}`,
    `/api/v1/douyin/app/v1/fetch_one_video?aweme_id=${awemeId}`,
  ];

  for (const path of candidates) {
    console.log(`\n--- ${path}`);
    try {
      const r = await fetch(base + path, {
        headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
      });
      const text = await r.text();
      console.log(`status=${r.status}`);
      if (r.ok) {
        const j = JSON.parse(text);
        const detail = j.data?.aweme_detail || j.data;
        const video = detail?.video;
        if (video) {
          console.log("video keys:", Object.keys(video).slice(0, 20));
          for (const k of ["play_addr", "play_addr_h264", "play_addr_lowbr", "download_addr", "play_url", "download_url"]) {
            const v = video[k];
            if (v) {
              const urls = Array.isArray(v?.url_list) ? v.url_list : (Array.isArray(v) ? v : null);
              if (urls && urls.length > 0) {
                console.log(`  ${k}.url_list[0]: ${urls[0].slice(0, 100)}`);
              } else if (typeof v === "string") {
                console.log(`  ${k}: ${v.slice(0, 100)}`);
              } else {
                console.log(`  ${k} keys: ${Object.keys(v).slice(0, 6).join(",")}`);
              }
            }
          }
        } else {
          console.log("no video field; detail top keys:", Object.keys(detail || {}).slice(0, 20));
        }
      } else {
        console.log("body:", text.slice(0, 240));
      }
    } catch (e: any) {
      console.log("ERROR=" + (e?.message ?? e));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
