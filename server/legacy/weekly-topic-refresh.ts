/**
 * weekly-topic-refresh.ts
 * ═══════════════════════════════════════════════════════════════
 * P2-10: 每周自动更新选题推荐 + 通知
 *
 * 功能：
 * 1. 扫描所有启用的 weekly_topic_subscription 记录
 * 2. 对每个订阅，调用选题策略 V2 引擎生成新的选题方向
 * 3. 将结果摘要通过 notifyOwner 发送通知
 * 4. 更新订阅记录的 lastRunAt 和 lastRunSummary
 * ═══════════════════════════════════════════════════════════════
 */
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("WeeklyTopicRefresh");
import { query, execute } from "./database";
import type { RowDataPacket } from "./database";
import { notifyOwner } from "../_core/notification";
import { runTopicStrategyV2 } from "./topic-strategy-engine";
import type { SupportedPlatform } from "./types";

interface SubscriptionRow extends RowDataPacket {
  id: number;
  userOpenId: string;
  track: string;
  platforms: string | null;
  accountStage: string | null;
  enabled: number;
  lastRunAt: Date | null;
}

/**
 * 执行每周选题推荐刷新
 * 应由 cron job 每周调用一次（建议周一早上 8:00）
 */
export async function runWeeklyTopicRefresh(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  let total = 0;
  let success = 0;
  let failed = 0;

  try {
    // 查找所有启用的订阅
    const subscriptions = await query<SubscriptionRow[]>(
      `SELECT * FROM weekly_topic_subscription WHERE enabled = 1`,
      []
    );

    total = subscriptions.length;
    log.info(`找到 ${total} 个活跃订阅`);

    for (const sub of subscriptions) {
      try {
        log.info(`处理订阅 #${sub.id}: ${sub.track} (${sub.userOpenId})`);

        // 构建参数
        const validPlatforms: SupportedPlatform[] = ["douyin", "xiaohongshu", "kuaishou"];
        const platforms: SupportedPlatform[] = sub.platforms
          ? sub.platforms.split(",").map(p => p.trim()).filter((p): p is SupportedPlatform => validPlatforms.includes(p as SupportedPlatform))
          : ["douyin"];
        const accountStage = sub.accountStage || "new";

        // 调用选题策略 V2 引擎
        const result = await runTopicStrategyV2({
          track: sub.track,
          platforms,
          accountStage,
          userOpenId: sub.userOpenId,
        });

        // 构建摘要
        const topDirections = result.directions
          .sort((a, b) => b.validationScore - a.validationScore)
          .slice(0, 3);

        const summary = topDirections.map((d, i) =>
          `${i + 1}. ${d.directionName}（验证分 ${d.validationScore}）\n   可执行选题：${d.executableTopics.slice(0, 2).map(t => t.title).join("、")}`
        ).join("\n\n");

        const fullSummary = `【${sub.track}】本周选题推荐\n\n${summary}\n\n共 ${result.directions.length} 个方向，${result.directions.reduce((s, d) => s + d.executableTopics.length, 0)} 个可执行选题。`;

        // 更新订阅记录
        await execute(
          `UPDATE weekly_topic_subscription SET lastRunAt = NOW(), lastRunSummary = ? WHERE id = ?`,
          [fullSummary, sub.id]
        );

        // 发送通知
        await notifyOwner({
          title: `📋 ${sub.track} 每周选题更新`,
          content: fullSummary,
        });

        success++;
        log.info(`订阅 #${sub.id} 完成，${result.directions.length} 个方向`);

        // 避免 API 限流
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        failed++;
        log.error({ err: err }, `订阅 #${sub.id} 失败`);

        // 记录失败
        await execute(
          `UPDATE weekly_topic_subscription SET lastRunAt = NOW(), lastRunSummary = ? WHERE id = ?`,
          [`执行失败: ${err instanceof Error ? err.message : String(err)}`, sub.id]
        ).catch(() => {});
      }
    }
  } catch (err) {
    log.error({ err: err }, "任务异常");
  }

  log.info(`完成: total=${total} success=${success} failed=${failed}`);
  return { total, success, failed };
}
