# LLM 调用预算 (LLM Budget)

> 单次 `runLivePrediction` 的 LLM 调用预算、超时矩阵、重试策略、降级路径。
> 这是项目当前**性能 / 成本 / 稳定性的主要负担**——所有改 LLM 调用的 PR 都该参照这份。

---

## TL;DR

| 维度 | 数值 |
|------|------|
| **一次预测 LLM 调用次数** | 最少 **3** 次,典型 **6–8** 次,最坏 **10–12** 次(无缓存命中) |
| **唯一调用出口** | [`server/legacy/llm-gateway.ts`](../server/legacy/llm-gateway.ts) `callLLM` / `streamLLM` |
| **关键约束** | P95 端到端 ≤ 30 秒(产品承诺),**最贵两步 trend + topic 并行** |
| **改动指引** | **不要**给主流程**新增** LLM 步骤——除非合并/替换一个老的 |

---

## 1. 调用清单(主流程 `runLivePrediction`)

按调用顺序列出。括号内是**触发条件**——大部分调用是有条件的,典型路径不是全跑。

| # | 步骤 | 调用点 | 模型 / 超时 | 触发条件 |
|---|------|--------|-----------|--------|
| 1 | **意图分类 + payload 抽取(合并)** | `llmExtractAndClassify` → `callLLM` | doubao / 12s | fast-path 失败时(规则匹配命中可省) |
| 2 | **垂类标签** | `mapPromptToTag` → `callLLM` | doubao | 缓存未命中 |
| 3 | **城市抽取** | `extractCityFromPrompt` → `callLLM` | doubao | 缓存未命中 |
| 4 | **搜索词校验** | `validateSearchKeywords` → `callLLM` | doubao | `trustExtractor=false` |
| 5 | **语义过滤(主)** | `filterContentsByRelevance` (阈值 7) → `callLLM` | doubao | 总是 |
| 6 | **语义过滤(降阈)** | `filterContentsByRelevance` (阈值 6) → `callLLM` | doubao | 上一步过滤后 < 3 条 |
| 7 | **评论高频词采集** | `fetchCommentInsight` → `callLLM` | doubao | 命中评论补采策略 |
| 8 | **评论高频词过滤** | `filterKeywordsByRelevance` → `callLLM` | doubao | 上一步有高频词 |
| 9 | **P3 低粉样本拆解** | `analyzeSampleReplicability` → `callLLM` | doubao | `lowFollowerEvidence > 0` |
| **A** | ⭐ **趋势机会生成(并行)** | `callLLM`(`maxTokens=2000`, `temp=0.3`, **30s**) | doubao | 总是 |
| **B** | ⭐ **选题建议生成(并行)** | `callLLM`(`maxTokens=2000`, `temp=0.4`, **20s**) | doubao | 总是 |

**A 和 B 并行**,这一段的实际墙钟时间 ≈ `max(30s, 20s) = 30s`。这就是端到端时延的瓶颈。

### 几条节流路径(已实现)

- **fast-path 规则命中** → 省 #1
- **`mapPromptToTag` / `extractCityFromPrompt` 缓存命中** → 省 #2、#3
- **`trustExtractor=true`** → 省 #4
- **过滤后样本充足** → 省 #6
- **无评论补采或无高频词** → 省 #7、#8
- **`lowFollowerEvidence=0`** → 省 #9

最少路径(几乎全命中缓存 / 信任 extractor):**只剩 1 + A + B = 3 次**。

### 旁路 LLM 调用(不走 `runLivePrediction`,不进上面的预算账)

按需触发,各自缓存,**不计入**主流程 3–12 次预算。

| 调用 | 入口 | 模型 / 业务超时 | 触发条件 | 缓存 |
|------|------|-----------------|---------|------|
| 文案优化 + 金句提取 | `copywriting.optimize` → `optimizeCopywriting` | forge / — | 用户手动点「文案提取」 | 无 |
| 爆款拆解(逐镜头) | `copywriting.viralBreakdownDirect` → `analyzeViralBreakdown` | apollo / — | 用户点「深度拆解」 | `viral_breakdown_cache` 7 天 |
| **可复用标题变体** | `copywriting.generateTitleVariants` → `generateTitleVariants` | doubao / 8s | featured 卡片同赛道样本 = 0 时自动触发 | `title_variants_cache` 7 天 |

### 爆款拆解旁路补充(不进主预测预算)

- `apollo` 是视频理解专用模型路径,优先读取 `THIRD_PARTY_LLM_VIDEO_API_KEY`,缺失时回退 `THIRD_PARTY_LLM_API_KEY`。
- `apollo` 失败时**不自动降级到 doubao**:doubao 不支持把 mp4 当 `image_url` 输入,上层应捕获失败并提示用户重试。
- `fetchSingleVideoComments` 可按单条抖音 `aweme_id` 拉 Top 热评、轻量情绪和高频词；它不调用 LLM,只算 TikHub 调用预算。

### 低粉爆款库链路 LLM 调用(ADR-0006 + ADR-0007,完全离线)

低粉库的入库 / 打标全部在**主预测链路之外**跑,**不计入**主流程 3–12 次预算。

| 调用 | 入口 | 模型 | 频次估算 | 关键约束 |
|------|------|------|----------|---------|
| 管线 A — 入库前打标(ADR-0006 §Step C) | seed_topic 检索后 → `tagSamplesWithLLM` | forge | 每条样本 1 次,批 5 | strict json_schema |
| 管线 A — 赛道判定(ADR-0006 §Step A) | `seed_topic` 首次出现时 | doubao | 每个唯一 `seed_topic` 1 次,**全生命周期缓存** | 缓存命中后零调用 |
| **管线 B — 预检查(ADR-0007 §Step 3)** | `prefilterBillboardSamples` | **doubao**(thinking 默认关) | **初始阶段 60 类目 × 1 页 × 20 / 10 ≈ 120 次/天**;正常阶段视接口上限,估 360–600 次/天 | strict json_schema, 批 10, 失败整批丢弃 |
| 管线 B — 入库后 enrichment | 复用 `tagSamplesWithLLM` | doubao(从 forge 切换,见 ADR-0007 changelog §5) | 每条入库样本 1 次,批 5,异步 | 同管线 A 打标 |
| **管线 C — 预检查(ADR-0008 §Step 4)** | `prefilterBillboardSamples` + `SEARCH_EXTRA_INSTRUCTIONS` | doubao | 30 keyword × 20 候选 / 10 = ~60 次/周(backfill ~120 次) | 复用同 service,加 SEO 反堆词 prompt |
| 管线 C — 入库后 enrichment | 复用 `tagSamplesWithLLM` | doubao | 每条入库样本 1 次,周更 | 同管线 B 打标 |

**总成本估算(管线 B,初始阶段)**:120 次 × 1.5k token × $0.21/1M ≈ **$0.04/天**(doubao 输出)。+ TikHub billboard 调用 ~60 类目 × $0.001 ≈ **$0.06/天**。整条管线 B 日成本 < $0.15。

---

## 2. 超时矩阵

| 层 | 超时 | 来源 | 备注 |
|---|------|------|------|
| HTTP 请求层(Express) | **600s** | `server/_core/index.ts:79` `requestTimeout` | 拉宽防止长 LLM 被掐断(commit 7514446) |
| 业务层 — 意图+抽取合并 | 12s | `live-predictions.ts:264` | 原 6s,合并后翻倍 |
| 业务层 — 趋势机会 | **30s** | `live-predictions.ts:1547` | 主瓶颈步骤 A |
| 业务层 — 选题建议 | **20s** | `live-predictions.ts:1642` | 主瓶颈步骤 B |
| 业务层 — `parseInput` | 6s | `live-predictions.ts:214` | |
| LLM gateway — `callLLM` 默认 | **60s** | `llm-gateway.ts:244` | 业务层不传时 fallback |
| LLM gateway — `streamLLM` 默认 | 90s | `llm-gateway.ts:245` | 流式比非流式宽 |
| LLM gateway — `checkGatewayHealth` | 15s | `llm-gateway.ts:543` | 探活,`max_tokens=1` |
| 数据源 — TikHub | 20s | `tikhub.ts:228`(env 可配) | 拉数据,不算 LLM |

**业务层 < gateway 层 < HTTP 层**——分层兜底,业务层超时不会泄漏到上层。

---

## 3. 重试与降级

### 重试

| 模型 | 重试次数 | 退避 | 触发条件 |
|------|--------|------|--------|
| doubao / gpt54 / claude46 | 2 次 | `[1000ms]` | HTTP 429 / 5xx |
| apollo | 3 次 | `[2000ms, 6000ms]` | 同上；视频理解专用,失败不降级到 doubao |
| forge | 1 次 | 无 | **所有模型失败时的最终 fallback** |

### 降级路径

- **`streamLLMToSSE` 流式失败** → 自动切 `forge` 非流式重试一次
- **`apollo` 视频理解失败** → 不降级到 doubao,由上层返回友好错误 / 引导重试
- **意图分类失败** → fast-path 规则兜底(关键词匹配)
- **语义过滤主阈失败** → 自动降阈到 6
- **评论补采失败** → 跳过,不阻断主流程

外部依赖故障的完整应对见 [SLA-降级表](SLA-降级表.md)。

---

## 4. 缓存

| 位置 | 类型 | 覆盖 |
|------|------|------|
| `content-tag-cache.ts` | 内存 LRU | `mapPromptToTag` |
| `city-cache.ts` | 内存 LRU | `extractCityFromPrompt` |
| `viral_breakdown_cache` 表 | MySQL,7 天 TTL | 爆款拆解结果(`copywriting.viralBreakdownDirect`) |
| `title_variants_cache` 表 | MySQL,7 天 TTL | 可复用标题变体(`copywriting.generateTitleVariants`,旁路) |
| **`llm-gateway.ts` 本身** | **无** | 无请求级缓存,依赖上游 |

**当前没有 prompt 级缓存(同 prompt 命中跳过 LLM)**——这是一个未做的优化方向。

---

## 5. 预算 SLO(建议作为约束)

> 以下是**目标**,不是当前已经稳态满足的现状。改动 LLM 调用的 PR 应当不让任何一项变差。

| 指标 | 目标 | 当前(粗估) |
|------|------|----------|
| 单次预测 P95 端到端时延 | ≤ 30 秒 | 接近上限,趋势+选题并行是瓶颈 |
| 单次预测 LLM 调用数(典型) | ≤ 8 | 6–8 |
| 单次预测 LLM 调用数(最坏) | ≤ 12 | ~10–12 |
| 单次预测 token 用量(总) | TBD,需打点统计 | 未度量 |
| 单次预测成本(¥) | TBD | 未度量 |

> **行动项**:在 `llm-gateway.ts` 加 token / 耗时打点,落到 pino 日志里,用于回归对比。

---

## 6. 改 LLM 调用前的 checklist

加 / 改一处 LLM 调用之前,逐项过:

- [ ] 这次调用是**必须**的吗?能否用规则、缓存、或合并到已有调用里替代?
- [ ] 走的是 [`llm-gateway.ts`](../server/legacy/llm-gateway.ts) 吗?(不要绕过它直接 fetch ARK)
- [ ] 设了**业务层超时**(短于 gateway 默认 60s)吗?
- [ ] `maxTokens` 是不是真的需要 2000?能不能压到更低?
- [ ] 失败时主流程能否降级而不是整体崩?
- [ ] 改完之后,**典型路径调用次数**有没有变?在 PR 描述里写出来。
- [ ] 有 evals 集的话(`evals/topic-suggest/`)跑一遍,看输出质量没退化。

---

## 7. 已知优化方向(还没做的)

按 ROI 高到低排:

1. **趋势 + 选题合并为单次调用**(用 structured output 一次出两段):省最贵的那一段时延。
2. **gateway 加 prompt 级缓存**(可配 TTL,默认 5 分钟):同 prompt 直接返回。
3. **token / 耗时打点 + pino 结构化日志**:做基线,然后才能持续优化。
4. **更激进的 fast-path**:意图分类规则覆盖更多 case,把 #1 跳过的概率拉到 50%+。
5. **A/B 切小模型(deepseek-v3 / 国产更便宜)** 做语义过滤这种"低难度高频"的步骤。

---

## 引用

- 主流程:[`server/legacy/live-predictions.ts`](../server/legacy/live-predictions.ts) `runLivePrediction`
- LLM 网关:[`server/legacy/llm-gateway.ts`](../server/legacy/llm-gateway.ts)
- HTTP 层超时拉宽 commit:`7514446` (`fix: 服务端拉宽 requestTimeout 防止长 LLM 调用被掐断`)
- 外部依赖降级:[`docs/SLA-降级表.md`](SLA-降级表.md)
