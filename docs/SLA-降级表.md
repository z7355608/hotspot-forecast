# SLA / 降级表

> 每条外部调用挂掉时**会发生什么**。改任何一处调用之前，先来看一眼这张表。
>
> 配套读物：[系统流程图](系统流程图.md)。

## 主预测路径

> 2026-04-28 经过 Phase 5 合并：原 Step A + Step B 两次 LLM 合一；趋势机会 + 选题建议两次 LLM 合一。

| # | 调用 | 超时 | 失败行为 | 用户感知 | 实现位置 |
|---|------|------|---------|---------|---------|
| 1 | **`llmExtractAndClassify`（Step A+B 合并）** | 12_000 ms | `timeoutPromise` 返回 `null` → `extractTaskParams` 走自身内部 LLM（兜底），意图走 `classifyIntentWithLLM` | 慢但仍可成功；快速路径 fallback 用关键词兜底 | live-predictions.ts L255–276 |
| 2 | `parseInput` 多模态解析 | 6_000 ms | 返回 `null`，意图识别拿不到 parsedInputSummary | 链接 / 视频内容信号丢失，但仍可预测 | live-predictions.ts L256 |
| 3 | `validateSearchKeywords` | LLM 默认 60s | `try/catch` 兜底，保留提取词 | 无感知 | search-keyword-validator.ts |
| 4 | TikHub 搜索建议 / 话题建议 | 20_000 ms | `Promise.allSettled` 两路独立，任一挂掉只丢扩展词 | 候选关键词变少 | live-predictions.ts |
| 5 | 平台 watchTask（抖音 / 小红书） | 内部多步，单 LLM ≤ 30s | 该平台标 `executionStatus=failed`，merge 其他平台 | 数据样本变少 | live-predictions.ts |
| 6 | 快手搜索 | 30_000 ms | 同上 | 同上 | tikhub.ts L680 |
| 7 | **全平台失败** | — | 检测 `httpStatus=402`：抛「TikHub 余额不足」错；否则尝试 connectedPlatforms 里的备用平台；再失败则**降级为热榜信号模式继续 LLM 分析** | 余额不足时直接报错；否则结果质量下降但能给出 | live-predictions.ts |
| 8 | 账号信息补全 | TikHub 20s × 6 并发 | `allSettled`，单条失败丢弃 | 部分账号缺少补充信息 | live-predictions.ts |
| 9 | **趋势机会 + 选题建议合并 LLM** | 35_000 ms | 整段 `try/catch`：失败时 `trendOpportunities`/`aiTopicSuggestions` 都为空数组 | 趋势卡片和选题建议都消失，但其余结果仍能展示 | live-predictions.ts L1571 |
| 文 | 文案生成 | 60_000 ms | 抛错 → 返回基础结果（无文案） | 用户看到选题但没有现成文案 | copywriting-extract.ts L262 |
| - | 7 维评分 LLM | 60_000 ms | **不在主预测路径**（仅 trend-api.ts 用），失败时走规则评分兜底 | 仅 trend-api 路径感知 | ai-scoring-engine.ts L298–311 |

## LLM 网关层（横切）

| 行为 | 值 | 实现位置 |
|------|---|---------|
| 默认 `timeoutMs` | 60_000 ms | llm-gateway.ts L137 |
| 流式 `timeoutMs` | 90_000 ms | llm-gateway.ts L242 |
| 中断机制 | `AbortController` + `setTimeout` | llm-gateway.ts L158, L250 |
| Warmup 探活 | 15_000 ms | llm-gateway.ts L459 |
| 请求级 budget | ❌ 暂无 | — |

**计划中的兜底**：在 LLM 网关引入 per-request `llmBudget` 计数器，单次预测 ≥ N 次时强制走关键词兜底（避免极端场景一次预测打 10+ 次 LLM）。

## TikHub 层

| 行为 | 值 | 实现位置 |
|------|---|---------|
| 默认请求超时 | 20_000 ms（`TIKHUB_REQUEST_TIMEOUT_MS` env 可覆盖） | tikhub.ts L8 |
| 中断机制 | `AbortSignal.timeout()` | tikhub.ts L228 |
| 余额不足 | 返回 `httpStatus=402`，主流程显式抛错 | live-predictions.ts L566 |

## 后台 Monitor 调度

> 不属于主预测路径，但**和主预测共享 TikHub 配额**。

| 行为 | 值 | 实现位置 |
|------|---|---------|
| 最大并发 | 3 | monitor-scheduler.ts L41 |
| 速率限制 | 10 次 TikHub / 分钟 | monitor-scheduler.ts L105 |
| 单任务超时 | 120_000 ms | monitor-scheduler.ts |
| 重试 | 最多 2 次，指数退避 5s 起始 | monitor-scheduler.ts |

## 改动这块代码前的检查清单

- [ ] 这次改动会**新增** LLM 调用次数吗？看 [系统流程图.md](系统流程图.md) 的「LLM 调用预算」表 —— 每加一次都要审视。
- [ ] 你新增的外部调用**有超时**吗？默认 LLM 60s 通常太长，业务侧应显式传更短。
- [ ] 失败时会**降级**还是**抛错**？非关键路径优先 `Promise.allSettled` + 兜底，不要让单点失败拖垮主流程。
- [ ] 改了超时值？同步更新本文档。
- [ ] 涉及 TikHub 调用？确认是否会被 Monitor 调度的速率限制（10/min）挤掉。
