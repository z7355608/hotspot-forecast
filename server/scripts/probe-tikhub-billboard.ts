/**
 * 探针：dump full payload from TikHub billboard
 */
import "dotenv/config";
import { postTikHub } from "../legacy/tikhub";

async function main() {
  const r = await postTikHub<any>(
    "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
    { page: 1, page_size: 10, date_window: 168 },
  );
  console.log("ok:", r.ok, "status:", r.httpStatus);
  console.log("FULL payload (first 4000 chars):");
  console.log(JSON.stringify(r.payload, null, 2).slice(0, 4000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
