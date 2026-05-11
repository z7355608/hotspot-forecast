/**
 * 探针：TikHub hybrid 端点是否返回"TikHub 自己 CDN URL"（海外友好）
 * 还是仍然透传抖音原 CDN URL（douyinvod.com，海外被 GeoBlock）。
 */
import "dotenv/config";
import { getTikHub } from "../legacy/tikhub";

const SHARE_URL = "https://v.douyin.com/A0AOKnfVKB8/";
const PATHS_TO_TRY = [
  "/api/v1/hybrid/video_data",
  "/api/v1/hybrid/video_data/v1",
];

async function tryPath(apiPath: string) {
  console.log(`\n→ ${apiPath}`);
  try {
    const res = await getTikHub<any>(apiPath, {
      url: SHARE_URL,
      base64_url: false,
      minimal: false,
    });
    console.log(`  ok=${res.ok} httpStatus=${res.httpStatus} businessCode=${res.businessCode}`);
    if (res.ok && res.payload) {
      const data: any = res.payload.data ?? res.payload;
      // 关键看视频 URL 字段
      console.log(`\n  --- 视频 URL 字段 (找 douyinvod.com / tikhub.io) ---`);
      const video = data.video ?? data.aweme_detail?.video;
      if (video) {
        console.log(`  video.play_addr.url_list:`, JSON.stringify(video.play_addr?.url_list, null, 2));
        console.log(`  video.play_addr_h264.url_list:`, JSON.stringify(video.play_addr_h264?.url_list, null, 2));
        console.log(`  video.download_addr.url_list:`, JSON.stringify(video.download_addr?.url_list, null, 2));
      } else {
        console.log(`  没找到 video 字段，data keys:`, Object.keys(data));
      }
      console.log(`\n  --- 顶层 cache_url ---`);
      console.log(`  ${res.payload.cache_url ?? "(无)"}`);
    } else {
      console.log(`  payload (失败/空):`, JSON.stringify(res.payload).slice(0, 500));
    }
  } catch (e: any) {
    console.log(`  ✗ 异常: ${e?.message?.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`probe TikHub hybrid endpoint, share=${SHARE_URL}`);
  for (const p of PATHS_TO_TRY) {
    await tryPath(p);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
