/**
 * Direct Result Markdown Generator
 * =================================
 * 当爆款预测 Agent 判断用户输入的是"直接需求"（不适合结构化卡片渲染）时，
 * 将 ResultRecord 的所有信息转化为一份完整的 Markdown 报告，
 * 用于在 CozeEditorDrawer 中以编辑器模式展示。
 */

import type { ResultRecord } from "../store/app-data";

export function generateDirectResultMarkdown(result: ResultRecord): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const sections: string[] = [];

  // 标题
  sections.push(`# ${result.title || result.opportunityTitle || "分析报告"}`);
  sections.push("");
  sections.push(`> **查询**：${result.query} · **生成时间**：${dateStr}`);
  sections.push(`> **平台**：${result.platform.join(" / ")} · **模型**：${result.modelId}`);
  sections.push("");
  sections.push("---");
  sections.push("");

  // 核心结论
  sections.push("## 核心结论");
  sections.push("");
  sections.push(result.summary || result.coreBet || "暂无核心结论");
  sections.push("");

  // 判断边界
  if (result.decisionBoundary) {
    sections.push("## 判断边界");
    sections.push("");
    sections.push(result.decisionBoundary);
    sections.push("");
  }

  // 适配说明
  if (result.fitSummary) {
    sections.push("## 适配说明");
    sections.push("");
    sections.push(result.fitSummary);
    sections.push("");
  }

  // 为什么现在做
  if (result.whyNowItems.length > 0) {
    sections.push("## 为什么现在做");
    sections.push("");
    sections.push("| 来源 | 事实 | 推断 | 对你的影响 |");
    sections.push("|------|------|------|-----------|");
    for (const item of result.whyNowItems) {
      sections.push(`| ${item.sourceLabel} | ${item.fact} | ${item.inference} | ${item.userImpact} |`);
    }
    sections.push("");
  }

  // 如果不做会错过什么
  if (result.missIfWait) {
    sections.push("## 如果现在不做");
    sections.push("");
    sections.push(result.missIfWait);
    sections.push("");
  }

  // 最佳行动
  if (result.bestActionNow) {
    sections.push("## 建议行动");
    sections.push("");
    sections.push(`**${result.bestActionNow.title}**`);
    sections.push("");
    sections.push(result.bestActionNow.description);
    sections.push("");
    if (result.bestActionNow.reason) {
      sections.push(`> ${result.bestActionNow.reason}`);
      sections.push("");
    }
  }

  // 主卡片预览
  if (result.primaryCard.previewSections.length > 0) {
    sections.push("## 详细分析");
    sections.push("");
    for (const section of result.primaryCard.previewSections) {
      sections.push(`### ${section.title}`);
      sections.push("");
      for (const item of section.items) {
        sections.push(`- ${item}`);
      }
      sections.push("");
    }
  }

  // 继续做 / 停下来
  if (result.continueIf.length > 0 || result.stopIf.length > 0) {
    sections.push("## 决策参考");
    sections.push("");
    if (result.continueIf.length > 0) {
      sections.push("### 继续做的条件");
      sections.push("");
      for (const item of result.continueIf) {
        sections.push(`- ${item}`);
      }
      sections.push("");
    }
    if (result.stopIf.length > 0) {
      sections.push("### 调整优化的信号");
      sections.push("");
      for (const item of result.stopIf) {
        sections.push(`- ${item}`);
      }
      sections.push("");
    }
  }

  // 适合谁 / 不适合谁
  if (result.bestFor.length > 0 || result.notFor.length > 0) {
    sections.push("## 适用范围");
    sections.push("");
    if (result.bestFor.length > 0) {
      sections.push("### 最适合");
      sections.push("");
      for (const item of result.bestFor) {
        sections.push(`- ${item}`);
      }
      sections.push("");
    }
    if (result.notFor.length > 0) {
      sections.push("### 换个角度切入");
      sections.push("");
      for (const item of result.notFor) {
        sections.push(`- ${item}`);
      }
      sections.push("");
    }
  }

  // 市场证据
  const me = result.marketEvidence;
  if (me.kolCount > 0 || me.kocCount > 0 || me.similarContentCount > 0) {
    sections.push("## 市场证据");
    sections.push("");
    sections.push("| 指标 | 数值 |");
    sections.push("|------|------|");
    sections.push(`| 证据窗口 | ${me.evidenceWindowLabel} |`);
    sections.push(`| KOL 数量 | ${me.kolCount} |`);
    sections.push(`| KOC 数量 | ${me.kocCount} |`);
    sections.push(`| 新创作者 | ${me.newCreatorCount} |`);
    sections.push(`| 同类内容 | ${me.similarContentCount} |`);
    sections.push(`| 7日增长 | ${me.growth7d}% |`);
    sections.push(`| 低粉异常比 | ${(me.lowFollowerAnomalyRatio * 100).toFixed(1)}% |`);
    sections.push("");
    if (me.timingLabel) {
      sections.push(`> ${me.timingLabel}`);
      sections.push("");
    }
  }

  // 可进一步探索的方向
  if (result.evidenceGaps.length > 0) {
    sections.push("## 可以进一步探索的方向");
    sections.push("");
    for (const item of result.evidenceGaps) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  // 推荐下一步
  if (result.recommendedNextTasks.length > 0) {
    sections.push("## 推荐下一步");
    sections.push("");
    sections.push("| 任务 | 说明 | 行动 |");
    sections.push("|------|------|------|");
    for (const task of result.recommendedNextTasks) {
      sections.push(`| ${task.title} | ${task.reason} | ${task.actionLabel} |`);
    }
    sections.push("");
  }

  // 运营面板
  if (result.operatorPanel) {
    sections.push("## 运营视角");
    sections.push("");
    sections.push(`**汇报摘要**：${result.operatorPanel.reportSummary}`);
    sections.push("");

    const panels = [
      { title: "证据来源", items: result.operatorPanel.sourceNotes },
      { title: "平台差异说明", items: result.operatorPanel.platformNotes },
      { title: "对标样本方向", items: result.operatorPanel.benchmarkHints },
      { title: "需要关注的点", items: result.operatorPanel.riskSplit },
      { title: "反证条件", items: result.operatorPanel.counterSignals },
      { title: "可补充的数据", items: result.operatorPanel.dataGaps },
    ];

    for (const panel of panels) {
      if (panel.items.length > 0) {
        sections.push(`### ${panel.title}`);
        sections.push("");
        for (const item of panel.items) {
          sections.push(`- ${item}`);
        }
        sections.push("");
      }
    }
  }

  // 分类原因
  if (result.classificationReasons.length > 0) {
    sections.push("---");
    sections.push("");
    sections.push("*分类原因：" + result.classificationReasons.join("；") + "*");
    sections.push("");
  }

  sections.push("---");
  sections.push("");
  sections.push("*本报告由 AI 自动生成，建议结合实际情况参考使用。*");

  return sections.join("\n");
}
