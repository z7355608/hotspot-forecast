import "dotenv/config";
import { getTikHub, resetBalanceCooldown } from "../server/legacy/tikhub";
resetBalanceCooldown();
async function main() {
  const r = await getTikHub<Record<string, unknown>>(
    "/api/v1/xiaohongshu/app/search_notes",
    { keyword: "美食", page: 1, sort: "general" },
  );
  const items = ((r.payload as any)?.data?.data?.items) ?? [];
  if (items.length > 0) {
    const note = items[0].note;
    console.log("note keys:", Object.keys(note ?? {}));
    console.log("note sample:", JSON.stringify(note, null, 2).slice(0, 1500));
  }
  process.exit(0);
}
main().catch(console.error);
