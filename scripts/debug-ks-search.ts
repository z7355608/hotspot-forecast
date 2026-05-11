import "dotenv/config";
import { getTikHub, resetBalanceCooldown } from "../server/legacy/tikhub";
resetBalanceCooldown();
async function main() {
  const r = await getTikHub<Record<string, unknown>>(
    "/api/v1/kuaishou/app/search_comprehensive",
    { keyword: "美食", pcursor: "" },
  );
  const mixFeeds = ((r.payload as any)?.data?.mixFeeds) ?? [];
  console.log("mixFeeds.length:", mixFeeds.length);
  if (mixFeeds.length > 0) {
    const first = mixFeeds[0];
    console.log("\nfirst mixFeed keys:", Object.keys(first));
    // itemTransferInfo  这个 key 名字本身像视频信息载体
    if (first.itemTransferInfo) {
      console.log("itemTransferInfo type/sample:", typeof first.itemTransferInfo);
      const it = typeof first.itemTransferInfo === "string"
        ? JSON.parse(first.itemTransferInfo)
        : first.itemTransferInfo;
      console.log("itemTransferInfo keys:", Object.keys(it).slice(0, 30));
      console.log("sample:", JSON.stringify(it, null, 2).slice(0, 1500));
    }
  }
  process.exit(0);
}
main().catch(console.error);
