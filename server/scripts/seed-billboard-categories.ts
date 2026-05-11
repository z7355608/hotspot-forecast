/**
 * ADR-0007 Step 1 — 抖音 billboard 类目树 seed
 *
 * 拉 fetch_hot_category_list,upsert 到 douyin_billboard_categories。
 *
 * 用法:
 *   pnpm tsx server/scripts/seed-billboard-categories.ts
 *
 * 调度:
 *   - 单次手工跑(冷启动 / 类目大调整后)
 *   - run-billboard-pipeline.ts 每天跑前会先调本脚本里的 syncCategories 函数
 *
 * 响应 schema 是猜测的(billboard 一族 POST 风格 + objs/data 嵌套),
 * 第一次跑可能失败,失败时把 r.payload 完整打印出来,据此修正字段提取。
 */
import "dotenv/config";
import { getTikHub } from "../legacy/tikhub";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

const ENDPOINT = "/api/v1/douyin/billboard/fetch_hot_category_list";

interface CategoryNode {
  value: string;
  label?: string;
  children?: CategoryNode[];
}

/** 从 TikHub 响应里尽量宽地挖出类目树 */
function extractCategoryTree(payload: unknown): CategoryNode[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  // 常见 billboard 风格:payload.data.data 或 payload.data
  const candidates: unknown[] = [
    (root.data as Record<string, unknown>)?.data,
    (root.data as Record<string, unknown>)?.objs,
    (root.data as Record<string, unknown>)?.list,
    (root.data as Record<string, unknown>)?.categories,
    root.data,
    root.objs,
    root.list,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as CategoryNode[];
  }
  return [];
}

interface FlatCategory {
  topId: string;
  topName: string;
  subId: string | null;
  subName: string | null;
}

function flatten(tree: CategoryNode[]): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const top of tree) {
    const topId = String(top.value ?? "");
    const topName = String(top.label ?? top.value ?? "");
    if (!topId) continue;
    out.push({ topId, topName, subId: null, subName: null });
    if (Array.isArray(top.children)) {
      for (const sub of top.children) {
        const subId = String(sub.value ?? "");
        const subName = String(sub.label ?? sub.value ?? "");
        if (!subId) continue;
        out.push({ topId, topName, subId, subName });
      }
    }
  }
  return out;
}

export async function syncCategories(): Promise<{ topCount: number; totalRows: number }> {
  // 该 endpoint 是 GET(405 实测确认),与 fetch_hot_total_low_fan_list (POST) 不同族
  const r = await getTikHub<unknown>(ENDPOINT);
  if (!r.ok) {
    throw new Error(
      `fetch_hot_category_list failed HTTP ${r.httpStatus} businessCode ${r.businessCode}`,
    );
  }

  const tree = extractCategoryTree(r.payload);
  if (tree.length === 0) {
    console.error(
      "✗ 类目树解析空 — 打印完整 payload 用于排查 schema:",
    );
    console.error(JSON.stringify(r.payload, null, 2).slice(0, 4000));
    throw new Error("category tree extraction returned 0 rows");
  }

  const flat = flatten(tree);
  const topCount = flat.filter((f) => f.subId === null).length;
  console.log(`  · 解析到 ${topCount} 个顶级类目, 共 ${flat.length} 行(顶级+子级)`);

  for (const f of flat) {
    await execute(
      `INSERT INTO douyin_billboard_categories (top_id, top_name, sub_id, sub_name, synced_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE top_name = VALUES(top_name), sub_name = VALUES(sub_name), synced_at = NOW()`,
      [f.topId, f.topName, f.subId, f.subName],
    );
  }

  return { topCount, totalRows: flat.length };
}

async function main() {
  console.log("=== ADR-0007 类目树 seed ===\n");
  console.log(`→ POST ${ENDPOINT}`);
  const { topCount, totalRows } = await syncCategories();

  const sampleRows = await query<RowDataPacket[]>(
    `SELECT top_id, top_name, COUNT(sub_id) AS sub_count
     FROM douyin_billboard_categories
     GROUP BY top_id, top_name
     ORDER BY top_name`,
  );
  console.log(`\n✓ 入库 ${topCount} 顶级 / ${totalRows} 行(含子级)`);
  console.log(`\n顶级类目列表(top_id : top_name : sub_count):`);
  for (const r of sampleRows as Array<{ top_id: string; top_name: string; sub_count: number }>) {
    console.log(`  ${r.top_id}  ${r.top_name}  (${r.sub_count} 子)`);
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("seed-billboard-categories.ts")) {
  main().catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
}
