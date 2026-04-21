/**
 * monitor-report-generator.ts
 * 模块六：智能监控系统 — AI 报告生成器
 *
 * 功能：
 *   1. 将 DiffResult 增量数据输入 LLM，生成 Markdown 格式监控简报
 *   2. 支持四种任务类型：topic_watch / account_watch / content_watch / validation_watch
 *   3. 报告结构遵循扣子风格（标题/概览/详情/建议/结语）
 *   4. LLM 失败时降级到规则模板（零停机）
 *   5. 报告持久化到 MySQL（monitor_reports 表）
 */

import { callLLM } from "./llm-gateway.js";
import { createModuleLogger } from "./logger.js";
import { query } from "./database.js";

const log = createModuleLogger("MonitorReport");
import type { RowDataPacket } from "mysql2";
import type { DiffResult } from "./monitor-diff-engine.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface MonitorReport {
  reportId: string;
  taskId: string;
  runId: string;
  taskType: string;
  platform: string;
  title: string;
  markdown: string;
  signalStrength: string;
  keyFindings: string[];
  generatedAt: string;
  generationMethod: "llm" | "rule_fallback";
  llmModel?: string;
  tokensUsed?: number;
}

// ─────────────────────────────────────────────
// System Prompt（按任务类型）
// ─────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  topic_watch: `你是一位短视频赛道分析师。用户监控赛道的核心目的是：发现机会、规避风险。

报告必须围绕「发现了什么变化 → 这意味着什么 → 你应该怎么做」三步结构。

输出要求：
- Markdown 格式，简洁有力，不要套话和废话
- 每个发现必须标注信号强度（🔴强/🟡中/🟢弱）
- 数据引用要具体（如"点赞 2.3 万"），不要说"很高""较好"
- 每条建议必须是具体可执行的行动指令（如"今天内拍一条'XXX'主题的视频测试"）
- 总字数 600-1000 字，拒绝水分
- 章节：① 一句话结论（本期最重要的发现） ② 机会信号（新爆款/飙升话题/低粉异常） ③ 风险信号（赛道降温/竞争加剧） ④ 行动清单（最多 3 条，按优先级排序）`,

  account_watch: `你是一位账号运营分析师。用户监控竞品账号的核心目的是：发现可借鉴的策略、跟踪异动。

报告必须围绕「对方做了什么 → 效果如何 → 我能如何借鉴」三步结构。

输出要求：
- Markdown 格式，简洁有力，不要套话
- 重点分析：粉丝变化、发布策略变化、爆款内容特征
- 每个发现标注信号强度（🔴强/🟡中/🟢弱）
- 总字数 500-800 字
- 章节：① 一句话结论 ② 账号异动（粉丝/互动/发布频率变化） ③ 可借鉴的内容（哪条爆了、为什么） ④ 行动清单（最多 3 条）`,

  content_watch: `你是一位内容数据分析师。用户监控单条内容的核心目的是：判断内容是否还在增长、是否值得追投。

报告必须围绕「数据走势如何 → 这说明什么 → 下一步怎么做」三步结构。

输出要求：
- Markdown 格式，简洁有力
- 分析数据走势（增长期/平台期/衰退期）、峰值时间
- 总字数 400-600 字
- 章节：① 一句话结论 ② 数据走势 ③ 关键发现 ④ 行动建议（是否追投/复制/放弃）`,

  validation_watch: `你是一位预测验证分析师。用户监控验证的核心目的是：确认之前的判断是否正确，及时调整策略。

报告必须围绕「预测是否验证 → 数据证据 → 策略调整」三步结构。

输出要求：
- Markdown 格式，简洁有力
- 明确标注每个预测的验证状态（✅已验证/⚠️需修正/❌已失效）
- 总字数 500-700 字
- 章节：① 一句话结论 ② 验证结果 ③ 策略调整建议`,
};

// ─────────────────────────────────────────────
// 数据上下文构建
// ─────────────────────────────────────────────

function buildDataContext(diff: DiffResult, taskMeta: TaskMeta): string {
  const lines: string[] = [];

  lines.push(`## 监控任务信息`);
  lines.push(`- 任务类型：${taskMeta.taskTypeLabel}`);
  lines.push(`- 监控平台：${taskMeta.platformLabel}`);
  lines.push(`- 监控目标：${taskMeta.target}`);
  lines.push(`- 本次执行时间：${new Date(diff.currentExecutedAt).toLocaleString("zh-CN")}`);
  if (diff.previousExecutedAt) {
    lines.push(`- 上次执行时间：${new Date(diff.previousExecutedAt).toLocaleString("zh-CN")}`);
  }
  lines.push(`- 是否首次执行：${diff.isFirstRun ? "是（无历史对比数据）" : "否"}`);
  lines.push(`- 综合信号强度：${SIGNAL_LABELS[diff.signalStrength]}`);
  lines.push("");

  lines.push(`## 关键发现（系统自动提取）`);
  for (const finding of diff.keyFindings) {
    lines.push(`- ${finding}`);
  }
  lines.push("");

  lines.push(`## 数据指标摘要`);
  lines.push(`- 新增爆款内容：${diff.metrics.newHotContentCount} 条`);
  lines.push(`- 消失内容：${diff.metrics.disappearedContentCount} 条`);
  lines.push(`- 热度飙升话题：${diff.metrics.surgingTopicCount} 个`);
  lines.push(`- 新入榜热搜词：${diff.metrics.newHotSearchCount} 个`);
  lines.push(`- 本期最高点赞：${diff.metrics.maxLikeCount.toLocaleString()}`);
  lines.push(`- 平均互动率：${diff.metrics.avgEngagementRate}%`);
  lines.push(`- 低粉爆款异常：${diff.metrics.lowFollowerAnomalyCount} 条`);
  lines.push("");

  if (diff.newHotContents.length > 0) {
    lines.push(`## 新增爆款内容详情（Top ${Math.min(5, diff.newHotContents.length)}）`);
    for (const content of diff.newHotContents.slice(0, 5)) {
      lines.push(`### ${content.title.slice(0, 50)}`);
      lines.push(`- 作者：${content.authorName}（粉丝 ${formatNumber(content.authorFollowers)}）`);
      lines.push(`- 点赞：${formatNumber(content.likeCount)}，评论：${formatNumber(content.commentCount)}，分享：${formatNumber(content.shareCount)}`);
      lines.push(`- 播放：${formatNumber(content.playCount)}，互动率：${(content.engagementRate * 100).toFixed(2)}%`);
      if (content.isLowFollowerAnomaly) {
        lines.push(`- ⚠️ 低粉爆款异常（粉丝 < 1 万但获得高互动），信号强度：${content.anomalyStrength}`);
      }
    }
    lines.push("");
  }

  if (diff.surgingTopics.length > 0) {
    lines.push(`## 热度飙升话题（Top ${Math.min(5, diff.surgingTopics.length)}）`);
    for (const topic of diff.surgingTopics.slice(0, 5)) {
      const growthPct = Math.round(topic.growthRate * 100);
      lines.push(
        `- 「${topic.topicName}」：热度 ${formatNumber(topic.hotValue)}（+${growthPct}%，${GROWTH_LABELS[topic.growthLabel]}）`,
      );
    }
    lines.push("");
  }

  if (diff.newHotSearches.length > 0) {
    lines.push(`## 新入榜/上升热搜词`);
    for (const search of diff.newHotSearches.slice(0, 8)) {
      const rankInfo = search.isNew
        ? "新入榜"
        : `排名上升 ${search.rankChange} 位（当前第 ${search.rank} 位）`;
      lines.push(`- 「${search.keyword}」：${rankInfo}，热度值 ${formatNumber(search.hotValue)}`);
    }
    lines.push("");
  }

  if (diff.accountChanges) {
    lines.push(`## 账号变化数据`);
    const ac = diff.accountChanges;
    lines.push(`- 粉丝变化：${ac.followerDelta >= 0 ? "+" : ""}${formatNumber(ac.followerDelta)}（${(ac.followerGrowthRate * 100).toFixed(2)}%）`);
    lines.push(`- 互动率变化：${ac.engagementRateDelta >= 0 ? "+" : ""}${(ac.engagementRateDelta * 100).toFixed(2)}%`);
    lines.push(`- 整体趋势：${TREND_LABELS[ac.trend]}`);
    lines.push("");
  }

  if (diff.disappearedContents.length > 0) {
    lines.push(`## 消失内容（可能已删除）`);
    for (const content of diff.disappearedContents.slice(0, 3)) {
      lines.push(`- 「${content.title.slice(0, 40)}」（原点赞 ${formatNumber(content.likeCount)}）`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

interface TaskMeta {
  taskTypeLabel: string;
  platformLabel: string;
  target: string;
  scheduleTierLabel: string;
  nextRunAt?: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  strong: "🔴 强信号（建议立即关注）",
  medium: "🟡 中等信号（值得关注）",
  weak: "🟢 弱信号（保持观察）",
  none: "⚪ 无明显信号（数据平稳）",
};

const GROWTH_LABELS: Record<string, string> = {
  explosive: "爆炸式增长",
  rapid: "快速增长",
  steady: "稳定增长",
};

const TREND_LABELS: Record<string, string> = {
  growing: "增长中",
  stable: "稳定",
  declining: "下降中",
};

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString();
}

// ─────────────────────────────────────────────
// 规则降级模板
// ─────────────────────────────────────────────

function generateFallbackReport(
  diff: DiffResult,
  taskMeta: TaskMeta,
): string {
  const now = new Date().toLocaleString("zh-CN");
  const signalLabel = SIGNAL_LABELS[diff.signalStrength];

  const lines: string[] = [];
  lines.push(`# ${taskMeta.target} — ${taskMeta.taskTypeLabel}简报`);
  lines.push(`> **平台**：${taskMeta.platformLabel} · **报告时间**：${now}`);
  lines.push(`> **信号强度**：${signalLabel}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 一、本期概览");
  lines.push("");

  if (diff.isFirstRun) {
    lines.push("本次为首次执行，已建立基准数据快照。下次执行时将开始增量对比分析。");
  } else {
    lines.push(`本期共检测到 **${diff.metrics.newHotContentCount} 条新爆款内容**，${diff.metrics.surgingTopicCount} 个热度飙升话题，${diff.metrics.newHotSearchCount} 个新入榜热搜词。`);
  }

  lines.push("");
  lines.push("| 指标 | 本期 |");
  lines.push("|------|------|");
  lines.push(`| 新增爆款 | ${diff.metrics.newHotContentCount} 条 |`);
  lines.push(`| 热度飙升话题 | ${diff.metrics.surgingTopicCount} 个 |`);
  lines.push(`| 新入榜热搜 | ${diff.metrics.newHotSearchCount} 个 |`);
  lines.push(`| 最高点赞 | ${formatNumber(diff.metrics.maxLikeCount)} |`);
  lines.push(`| 平均互动率 | ${diff.metrics.avgEngagementRate}% |`);
  lines.push(`| 低粉爆款异常 | ${diff.metrics.lowFollowerAnomalyCount} 条 |`);
  lines.push("");

  if (diff.newHotContents.length > 0) {
    lines.push("## 二、新增爆款内容");
    lines.push("");
    for (const content of diff.newHotContents.slice(0, 5)) {
      lines.push(`**${content.title.slice(0, 60)}**`);
      lines.push(`- 作者：${content.authorName}（粉丝 ${formatNumber(content.authorFollowers)}）`);
      lines.push(`- 点赞 ${formatNumber(content.likeCount)} · 评论 ${formatNumber(content.commentCount)} · 互动率 ${(content.engagementRate * 100).toFixed(2)}%`);
      if (content.isLowFollowerAnomaly) {
        lines.push(`- ⚠️ **低粉爆款异常**（粉丝 < 1 万）`);
      }
      lines.push("");
    }
  }

  if (diff.surgingTopics.length > 0) {
    lines.push("## 三、热度飙升话题");
    lines.push("");
    for (const topic of diff.surgingTopics.slice(0, 5)) {
      const growthPct = Math.round(topic.growthRate * 100);
      lines.push(`- **${topic.topicName}**：热度 +${growthPct}%（${GROWTH_LABELS[topic.growthLabel]}）`);
    }
    lines.push("");
  }

  lines.push("## 四、关键发现");
  lines.push("");
  for (const finding of diff.keyFindings) {
    lines.push(`- ${finding}`);
  }
  lines.push("");

  lines.push("## 五、建议行动");
  lines.push("");
  if (diff.metrics.lowFollowerAnomalyCount > 0) {
    lines.push("1. **立即关注低粉爆款**：发现低粉爆款异常信号，建议在 48 小时内研究其内容形式并测试");
  }
  if (diff.surgingTopics.length > 0) {
    lines.push(`2. **跟进飙升话题**：「${diff.surgingTopics[0].topicName}」热度快速上升，建议评估是否切入`);
  }
  if (diff.newHotSearches.filter((h) => h.isNew).length > 0) {
    const newSearch = diff.newHotSearches.find((h) => h.isNew);
    if (newSearch) {
      lines.push(`3. **关注新热搜词**：「${newSearch.keyword}」新入榜，可能是新兴需求方向`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push(`*本报告由系统自动生成（规则模式）。下次执行：${taskMeta.nextRunAt ?? "按计划"}。*`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// 主生成函数
// ─────────────────────────────────────────────

export async function generateMonitorReport(
  diff: DiffResult,
  taskMeta: TaskMeta,
): Promise<MonitorReport> {
  const reportId = `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();
  const taskType = diff.taskType;

  const systemPrompt = SYSTEM_PROMPTS[taskType] ?? SYSTEM_PROMPTS.topic_watch;
  const dataContext = buildDataContext(diff, taskMeta);

  const userPrompt = `请根据以下监控数据，生成一份专业的监控简报：

${dataContext}

请按照你的专业分析，生成完整的 Markdown 格式简报。重点突出最有价值的发现，并给出具体可执行的建议。`;

  let markdown: string;
  let generationMethod: "llm" | "rule_fallback" = "llm";
  let llmModel: string | undefined;
  let tokensUsed: number | undefined;

  try {
    const result = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      modelId: "doubao",
      temperature: 0.7,
      maxTokens: 2000,
    });

    markdown = result.content;
    llmModel = result.model;
    tokensUsed = (result.promptTokens ?? 0) + (result.completionTokens ?? 0);
  } catch (err) {
    log.warn({ err: err }, "LLM 调用失败，降级到规则模板");
    markdown = generateFallbackReport(diff, taskMeta);
    generationMethod = "rule_fallback";
  }

  const report: MonitorReport = {
    reportId,
    taskId: diff.taskId,
    runId: diff.currentRunId,
    taskType: diff.taskType,
    platform: diff.platform,
    title: `${taskMeta.target} — ${taskMeta.taskTypeLabel}简报`,
    markdown,
    signalStrength: diff.signalStrength,
    keyFindings: diff.keyFindings,
    generatedAt,
    generationMethod,
    llmModel,
    tokensUsed,
  };

  // 持久化到数据库
  await persistReport(report);

  // 创建通知
  try {
    const { createNotification } = await import("../db.js");
    await createNotification({
      userOpenId: (taskMeta as any).userOpenId || "system",
      type: "monitor_report",
      title: `监控报告已生成`,
      body: `「${report.title}」信号强度: ${report.signalStrength}/10，发现 ${report.keyFindings.length} 个关键变化。`,
      tone: Number(report.signalStrength) >= 7 ? "amber" : Number(report.signalStrength) >= 4 ? "blue" : "gray",
      relatedId: report.taskId,
      actionUrl: "/monitor",
    });
  } catch (notifErr) {
    log.warn({ err: notifErr }, "创建通知失败");
  }

  return report;
}

// ─────────────────────────────────────────────
// 数据库持久化
// ─────────────────────────────────────────────

async function persistReport(report: MonitorReport): Promise<void> {
  try {
    await query(
      `INSERT INTO monitor_reports
         (report_id, task_id, run_id, task_type, platform, title,
          markdown_content, signal_strength, key_findings,
          generated_at, generation_method, llm_model, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         markdown_content = VALUES(markdown_content),
         signal_strength  = VALUES(signal_strength),
         key_findings     = VALUES(key_findings),
         generation_method = VALUES(generation_method)`,
      [
        report.reportId,
        report.taskId,
        report.runId,
        report.taskType,
        report.platform,
        report.title,
        report.markdown,
        report.signalStrength,
        JSON.stringify(report.keyFindings),
        report.generatedAt.replace('T', ' ').replace('Z', ''),
        report.generationMethod,
        report.llmModel ?? null,
        report.tokensUsed ?? null,
      ],
    );
  } catch (err) {
    // 数据库写入失败不影响报告返回
    log.warn({ err: err }, "持久化失败");
  }
}

// ─────────────────────────────────────────────
// 报告读取
// ─────────────────────────────────────────────

export async function getLatestReport(taskId: string): Promise<MonitorReport | null> {
  try {
    interface ReportRow extends RowDataPacket {
      report_id: string;
      task_id: string;
      run_id: string;
      task_type: string;
      platform: string;
      title: string;
      markdown_content: string;
      signal_strength: string;
      key_findings: string;
      generated_at: string;
      generation_method: string;
      llm_model: string | null;
      tokens_used: number | null;
    }
    const rows = await query<ReportRow[]>(
      `SELECT * FROM monitor_reports
       WHERE task_id = ?
       ORDER BY generated_at DESC
       LIMIT 1`,
      [taskId],
    );

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      reportId: row.report_id,
      taskId: row.task_id,
      runId: row.run_id,
      taskType: row.task_type,
      platform: row.platform,
      title: row.title,
      markdown: row.markdown_content,
      signalStrength: row.signal_strength,
      keyFindings: parseJsonField<string[]>(row.key_findings, []),
      generatedAt: row.generated_at,
      generationMethod: row.generation_method as "llm" | "rule_fallback",
      llmModel: row.llm_model ?? undefined,
      tokensUsed: row.tokens_used ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function listReports(
  taskId: string,
  limit: number = 10,
): Promise<MonitorReport[]> {
  try {
    interface ReportRow2 extends RowDataPacket {
      report_id: string;
      task_id: string;
      run_id: string;
      task_type: string;
      platform: string;
      title: string;
      markdown_content: string;
      signal_strength: string;
      key_findings: string;
      generated_at: string;
      generation_method: string;
      llm_model: string | null;
      tokens_used: number | null;
    }
    const rows = await query<ReportRow2[]>(
      `SELECT * FROM monitor_reports
       WHERE task_id = ?
       ORDER BY generated_at DESC
       LIMIT ?`,
      [taskId, limit],
    );

    return rows.map((row) => ({
      reportId: row.report_id,
      taskId: row.task_id,
      runId: row.run_id,
      taskType: row.task_type,
      platform: row.platform,
      title: row.title,
      markdown: row.markdown_content,
      signalStrength: row.signal_strength,
      keyFindings: parseJsonField<string[]>(row.key_findings, []),
      generatedAt: row.generated_at,
      generationMethod: row.generation_method as "llm" | "rule_fallback",
      llmModel: row.llm_model ?? undefined,
      tokensUsed: row.tokens_used ?? undefined,
    }));
  } catch {
    return [];
  }
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// ─────────────────────────────────────────────
// 导出 TaskMeta 类型（供 API 层使用）
// ─────────────────────────────────────────────
export type { TaskMeta };
