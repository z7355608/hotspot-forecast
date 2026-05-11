import "dotenv/config";
import { getTikHub, resetBalanceCooldown } from "../server/legacy/tikhub";
resetBalanceCooldown();
async function main() {
  const r = await getTikHub<Record<string, unknown>>(
    "/api/v1/kuaishou/app/search_comprehensive",
    { keyword: "美食", pcursor: "" },
  );
  console.log("ok:", r.ok);
  const mix = (r.payload as any)?.data?.mixFeeds ?? [];
  console.log("mixFeeds:", mix.length);
  for (let i = 0; i < Math.min(3, mix.length); i++) {
    const feed = mix[i];
    console.log(`\n--- mixFeed[${i}] keys: ${Object.keys(feed)} ---`);
    let iti = feed.itemTransferInfo;
    console.log(`itemTransferInfo type: ${typeof iti}`);
    if (typeof iti === "string") {
      try { iti = JSON.parse(iti); } catch (e) { console.log("parse error:", e); }
    }
    if (typeof iti === "object" && iti) {
      console.log("iti keys:", Object.keys(iti).slice(0, 25));
      console.log("iti sample:", JSON.stringify(iti, null, 2).slice(0, 1500));
    }
  }
  process.exit(0);
}
main().catch(console.error);
