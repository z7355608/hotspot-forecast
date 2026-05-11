/**
 * 临时验证脚本:端到端跑一次 x-tech-source augmenter,
 * 确认 env 读取、TikHub Twitter 调用、字段映射都正常。
 *
 * 跑法:pnpm tsx scripts/verify-x-augmenter.ts
 */
import "dotenv/config";
import { register } from "../server/services/content-augmentation/providers/x-tech-source.js";
import {
  augmentContents,
  _resetForTest,
} from "../server/services/content-augmentation/registry.js";

async function main() {
  _resetForTest();
  register();

  const out = await augmentContents([], {
    industry: "AI",
    seedTopic: "AI 大模型",
    prompt: "AI 大模型最新进展",
    traceId: "verify-script",
  });

  console.log(`\n=== augmenter 输出 ${out.length} 条 ===\n`);
  for (const c of out) {
    console.log(
      `- ${c.authorName} | likes=${c.likeCount} views=${c.viewCount}\n  title: ${c.title.slice(0, 100)}\n  url: ${c.contentUrl}\n  platform: ${c.platform} publishedAt: ${c.publishedAt}\n`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("verify failed:", err);
    process.exit(1);
  });
