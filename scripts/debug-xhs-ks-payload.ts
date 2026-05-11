import "dotenv/config";
import { getTikHub, resetBalanceCooldown } from "../server/legacy/tikhub";

resetBalanceCooldown();

async function main() {
  console.log("=== xhs search_notes payload (top-level keys) ===");
  const xhs = await getTikHub<Record<string, unknown>>(
    "/api/v1/xiaohongshu/app/search_notes",
    { keyword: "美食", page: 1, sort: "general" },
  );
  console.log("ok:", xhs.ok, "businessCode:", xhs.businessCode);
  if (xhs.payload) {
    const top = xhs.payload as Record<string, unknown>;
    console.log("top-level keys:", Object.keys(top));
    const data = top.data as Record<string, unknown> | undefined;
    if (data) {
      console.log("data keys:", Object.keys(data));
      // Recursively pick first record-like array
      function findArrays(obj: unknown, path: string, depth = 0): void {
        if (depth > 4) return;
        if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "object") {
          const sample = obj[0] as Record<string, unknown>;
          console.log(`  array @ ${path}: len=${obj.length}, keys=${Object.keys(sample).slice(0, 12).join(",")}`);
        } else if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            findArrays(v, `${path}.${k}`, depth + 1);
          }
        }
      }
      findArrays(data, "data");
    }
  }

  console.log("\n=== ks fetch_kuaishou_hot_list_v2 (raw) ===");
  const ks = await getTikHub<Record<string, unknown>>(
    "/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2",
    { board_type: "1" },
  );
  console.log("ok:", ks.ok, "businessCode:", ks.businessCode, "httpStatus:", ks.httpStatus);
  if (ks.payload) {
    const top = ks.payload as Record<string, unknown>;
    console.log("top keys:", Object.keys(top));
    const data = top.data as Record<string, unknown> | undefined;
    if (data) {
      console.log("data keys:", Object.keys(data));
      const inner = data.data as Record<string, unknown> | undefined;
      if (inner) console.log("inner keys:", Object.keys(inner));
      console.log("data.code:", data.code, "data.message:", data.message);
      console.log("hots first item:", inner?.hots ? JSON.stringify((inner.hots as unknown[])[0], null, 2)?.slice(0, 400) : "(no hots)");
    }
  }

  console.log("\n=== ks search_comprehensive (sample) ===");
  const ksSearch = await getTikHub<Record<string, unknown>>(
    "/api/v1/kuaishou/app/search_comprehensive",
    { keyword: "美食", pcursor: "" },
  );
  console.log("ok:", ksSearch.ok, "businessCode:", ksSearch.businessCode);
  if (ksSearch.payload) {
    const top = ksSearch.payload as Record<string, unknown>;
    console.log("top keys:", Object.keys(top));
    const data = top.data as Record<string, unknown> | undefined;
    if (data) {
      console.log("data keys:", Object.keys(data));
      function findArrays(obj: unknown, path: string, depth = 0): void {
        if (depth > 4) return;
        if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "object") {
          const sample = obj[0] as Record<string, unknown>;
          console.log(`  array @ ${path}: len=${obj.length}, keys=${Object.keys(sample).slice(0, 12).join(",")}`);
        } else if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            findArrays(v, `${path}.${k}`, depth + 1);
          }
        }
      }
      findArrays(data, "data");
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
// done
