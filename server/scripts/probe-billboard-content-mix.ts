/** 探针:拉 7 天 billboard 全部样本,人工扫标题判断内容形式分布。
 * 不入库,不跑 prefilter,只展示原始数据 + 关键词命中提示。
 */
import "dotenv/config";
import { postTikHub } from "../legacy/tikhub";

const ENDPOINT = "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list";

interface BillboardItem {
  item_id?: string;
  item_title?: string;
  nick_name?: string;
  fans_cnt?: number;
  like_cnt?: number;
}

function inferType(title: string): string[] {
  const tags: string[] = [];
  // 口播迹象
  if (/[#]?口播|讲讲|来说|说一下|为什么|教你|分享|你以为|你知道|分享一个|聊聊/.test(title)) tags.push("口播?");
  // 带货迹象
  if (/平替|链接|低至|测评|开箱|种草|入手|购买|价格|榜单|安利|对比|推荐|必入|抢到|攻略/.test(title)) tags.push("带货/测评?");
  // 干货迹象
  if (/干货|攻略|清单|方法|技巧|经验|科普|总结|笔记/.test(title)) tags.push("干货?");
  // 剧情迹象
  if (/[#]?剧情|短剧|搞笑|沙雕|短片|演绎|出演|反转|结局/.test(title)) tags.push("剧情?");
  // 街访
  if (/街访|采访|路人|街头|问答|蹲守/.test(title)) tags.push("街访?");
  return tags;
}

async function main() {
  const dwArg = process.argv.find((a) => a.startsWith("--date-window=")) ?? "--date-window=168";
  const dateWindow = Number(dwArg.split("=")[1]) || 168;
  const pages = Number((process.argv.find((a) => a.startsWith("--pages=")) ?? "--pages=5").split("=")[1]) || 5;

  console.log(`=== probe billboard content mix | date_window=${dateWindow}h pages=${pages} ===\n`);
  const all: BillboardItem[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await postTikHub<any>(ENDPOINT, { page, page_size: 20, date_window: dateWindow });
    if (!r.ok) { console.warn(`page ${page} failed`); break; }
    const objs = r.payload?.data?.data?.objs ?? [];
    if (!Array.isArray(objs) || objs.length === 0) break;
    all.push(...objs);
    if (objs.length < 20) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const dedup = new Map<string, BillboardItem>();
  for (const it of all) if (it.item_id) dedup.set(String(it.item_id), it);

  const counters: Record<string, number> = { 口播: 0, "带货/测评": 0, 干货: 0, 剧情: 0, 街访: 0, 其他: 0 };
  console.log(`共 ${dedup.size} 条候选(全部展示):\n`);
  for (const [, it] of dedup) {
    const types = inferType(it.item_title ?? "");
    if (types.length === 0) counters["其他"]++;
    else for (const t of types) counters[t.replace("?", "")]++;
    const tagStr = types.length > 0 ? ` 【${types.join(",")}】` : "";
    console.log(`  ${(it.item_title ?? "").slice(0, 70)}${tagStr}`);
    console.log(`    fans=${it.fans_cnt} likes=${it.like_cnt}\n`);
  }

  console.log("\n=== 关键词命中分布(粗判,可重复计数)===");
  console.table(counters);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
