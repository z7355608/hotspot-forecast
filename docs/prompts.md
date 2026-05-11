# Prompt 资产索引

> 项目里所有 LLM prompt 的索引表(用途、入参、模型、关键参数)。
> **目的不是把 prompt 内容抄一份**——而是回答"想改 X 行为时,改哪个文件第几行?"
> prompt 文本仍然在源码里,后续会做集中化(见末尾的「下一步」)。

---

## 概念

- **prompt id**:`<文件名 stem>.<用途>`,例如 `intent-agent.classify`、`live-predictions.trend`。
- **⭐**:主流程 `runLivePrediction` 会命中的 prompt——改这些 prompt 直接影响产品输出。
- 所有 LLM 调用都过 [`server/legacy/llm-gateway.ts`](../server/legacy/llm-gateway.ts) `callLLM` /
  `streamLLM`,prompt 作为 `messages` 参数传入。
- 模型选择规则见 [llm-budget.md](llm-budget.md)。

---

## 主流程 prompt(改这些会改主产品行为)

| prompt id | 位置 | 用途 | 模型 | maxTok / temp | 入参变量 |
|-----------|------|------|------|--------------|----------|
| ⭐ `intent-agent.classify` | `server/legacy/intent-agent.ts:296` | 用户意图 8 分类 | doubao | 256 / 0.1 | `prompt`, `parsedInputSummary`, `extractedPayloadSummary`, `mediaCount` |
| ⭐ `payload-extractor.extract` | `server/legacy/payload-extractor.ts:206` | 自然语言 → URL/ID/行业 抽取 | doubao | 500 / 0 | `prompt`, `userProfile(platforms/industries)` |
| ⭐ `payload-extractor.merged` | `server/legacy/payload-extractor.ts:421` | **合并版**:抽取 + 意图(替代上两步) | doubao | 1024 / 0 | `prompt`, `userProfile`, `intentSignals`, `knownIntent` |
| ⭐ `semantic-filter.content` | `server/legacy/semantic-filter.ts:105` | 内容相关性评分(10 分制) | doubao | 4096 / 0.1 | `seedTopic`, `candidateList[id/title/tags]` |
| ⭐ `semantic-filter.keyword` | `server/legacy/semantic-filter.ts:174` | 关键词赛道相关性过滤 | doubao | 2048 / 0.1 | `seedTopic`, `keywords[]` |
| ⭐ `search-keyword-validator.validate` | `server/services/search-keyword-validator.ts:43` | 搜索词主题一致性校验 | doubao | 200 / 0.2 | `prompt`, `keywords[]` |
| ⭐ **`live-predictions.trend`** | `server/legacy/live-predictions.ts:1539` | **趋势机会**(3–5 个切入点) | doubao | 2000 / 0.3 | `seedTopic`, 热榜样本, 低粉爆款, 评论关键词 |
| ⭐ **`live-predictions.topic`** | `server/legacy/live-predictions.ts:1634` | **选题建议**(3 个具体标题) | doubao | 2000 / 0.4 | `seedTopic`, `topSampleTitles`, `commentKeywords`, `demandSignals` |

**改动这一组的 PR 必须**:
1. 配套跑 evals(`evals/topic-suggest/` 一旦建成)
2. 在 PR 描述里贴 before/after 的 5 个样本输出对比
3. 留意 token 用量是否变化

---

## 旁路 / 子功能 prompt

| prompt id | 位置 | 用途 | 模型 | maxTok / temp | 备注 |
|-----------|------|------|------|--------------|------|
| `llm-extract.payload` | `server/legacy/llm-extract.ts:231` | TikHub 响应 → 结构化数据 | forge | 16384 / — | 大 token,因为要塞整段 API 响应 |
| `topic-strategy.expand-keywords` | `server/legacy/topic-strategy-engine.ts:375` | 关键词扩展 | forge | — / — | |
| `topic-strategy.directions` | `server/legacy/topic-strategy-engine.ts:763` | 选题策略方向 + 测试计划 | forge | — / — | |
| `topic-strategy.cross-industry` | `server/legacy/topic-strategy-engine.ts:1053` | 跨行业元素迁移 | forge | — / — | |
| `copywriting-extract.optimize` | `server/services/copywriting-extract.ts:262` | 文案优化 + 金句提取 | forge | — / — | 转写文本会被截断到 5000 字 |
| `viral-breakdown.structure` | `server/services/viral-breakdown.ts:198` | 爆款视频逐镜头拆解 | apollo | 65536 / — | 最贵的一次,因为要看转写 + 帧描述 |
| `smart-link-parser.restriction` | `server/services/smart-link-parser.ts:298` | 网页限制检测(登录墙/反爬) | forge | — / — | |
| `low-follower-tagger.batch` | `server/legacy/low-follower-tagger.ts:155` | 低粉爆款批量打标 | forge | — / — | 批量处理 |
| `account-diagnosis.engagement` | `server/legacy/account-diagnosis-agent.ts:421` | 账号互动率归因 | gpt54 | 1500 / 0.3 | |
| `account-diagnosis.strategy` | `server/legacy/account-diagnosis-agent.ts:627` | 账号增长策略 | gpt54 | — / — | |
| `account-diagnosis.comment` | `server/legacy/account-diagnosis-agent.ts:786` | 评论情绪 + 需求信号 | gpt54 | — / — | |
| `title-variants.generate` | `server/services/title-variants-generator.ts:99` | featured 卡片可复用标题变体（同赛道样本不足时填补） | doubao | 600 / 0.7 | 按 featured.id 缓存 7 天（title_variants_cache 表）；JSON schema 输出 |
| `prediction-xiaohongshu-plan-v1` | `server/legacy/breakdown-agent.ts` + `server/legacy/database/seed-skills.mjs` | 爆款预测结果 → 小红书图文方案 | doubao | 3500 / — | 用户点击结果页“生成小红书图文方案”时触发 |
| `prediction-title-cover-v1` | `server/legacy/breakdown-agent.ts` + `server/legacy/database/seed-skills.mjs` | 爆款预测结果 → 标题、封面文案、图片提示词 | doubao + Apollo `gpt-image-2-all` | 2200 / — | 用户点击“生成标题与封面图”时先生成包装 brief，再调用 `/images/generations` |

---

## 改 prompt 的工作流

### 调一句话(微调)

1. 在文件里直接改 system / user template。
2. **本地用代表性输入跑一遍**,看输出有没有按预期变化。
3. 在 commit message 里说**改了什么 + 为什么**,例:
   `tweak: intent-agent.classify 强调"娱乐内容"也算合规`
4. 主流程 prompt(⭐):配套跑 evals(将来)+ PR 里贴 5 个样本对比。

### 加新 prompt

**优先考虑能不能不加**——参见 [llm-budget.md](llm-budget.md) 的 checklist。
如果确实要加:

1. 用 `gateway.callLLM` / `streamLLM`,**不要绕过 gateway**。
2. 设业务层超时(短于 gateway 默认 60s)。
3. 给它一个 prompt id,在这份索引里加一行。
4. 在 [llm-budget.md](llm-budget.md) 的调用清单里加一行。
5. 记得 `maxTokens` 估算,过宽会浪费成本和延时。

### 切模型

整体切见 [model-swap.md](model-swap.md)(待写);单个 prompt 切模型只需改 `model` 字段,
但**注意 prompt 兼容性**(尤其是 JSON 输出格式约束、中文表现力差异)。

---

## 已知 prompt 健康问题

- ⚠️ **prompt 散落在十几个文件里**——同一个产品决策可能要改多个文件。
- ⚠️ **没有 prompt 版本号**——改完没法回滚到上一版,只能查 git。
- ⚠️ **没有评测集**——改 prompt 是裸奔,只能靠人工"看一下"。
- ⚠️ **token 用量没打点**——不知道哪个 prompt 在烧钱。
- ⚠️ **`maxTokens` 不一致**:从 200 到 65536 跨度大,大部分凭直觉而非测量。

---

## 集中化:实际现状(部分已做)

仓库里**已经**有一套 prompt 模板系统:[`server/legacy/prompt-engine.ts`](../server/legacy/prompt-engine.ts),
通过 `resolveSystemPrompt(templateId, modelId, context, fallback)` 从 MySQL 的
`prompt_templates` 表加载。

| 已做 | 描述 |
|------|------|
| ✅ template id 体系 | 用 `topic-strategy-v1` / `intent-agent-v1` 等 id 索引 |
| ✅ 多模型适配 | 同一 id 可对不同 model 选不同 system prompt |
| ✅ 变量注入 | `{{variable}}` 占位符 + RenderContext |
| ✅ 必需 / 可选参数校验 | 缺关键变量会 warn |
| ✅ 调用层广覆盖 | intent-agent / semantic-filter / topic-strategy / ai-scoring / 等 12+ 文件已用 |

### Seed 现状(已进 git)

`prompt_templates` 表的真值**就在 git 里**——
[`server/legacy/database/seed-skills.mjs`](../server/legacy/database/seed-skills.mjs)
内嵌了 26+ 个 template 的完整定义(id、version、system prompt、user prompt 模板、参数等)。

工作流:

```bash
# 修改 prompt:改 seed-skills.mjs 里对应的 templates.push({...})
$EDITOR server/legacy/database/seed-skills.mjs

# 同步到本地 DB
pnpm seed:skills

# 提 PR——diff 干净,review 可看
git diff server/legacy/database/seed-skills.mjs
```

### 仍缺的是什么

| 缺口 | 影响 |
|------|------|
| 🟠 没有 dump 脚本 | DB 里 prompt 被人手改后,无法快速对比 seed 看差异 |
| 🟠 user prompt 仍硬编码在 .ts 调用方 | system prompt 走 template,user prompt 仍在调用方拼接(`live-predictions.topic` 已抽到 `prompts/topic-prompt-builder.ts`,其他 18 条仍待) |
| 🟠 prompt 版本变更日志 | 改了什么 / 为什么改——靠 git log,没有更细粒度的注释 |
| 🟢 模板已进 git | 历史误判已修正(原以为只在 DB)|

### 推荐的渐进路径

1. **加一个 `pnpm prompts:dump` 脚本**:从 DB 把当前 prompt 全量导出到
   `server/legacy/database/prompts-snapshot.json`(只读 snapshot,用于 review
   "线上 DB 跟 seed 是否一致")。已加。
2. **PR 模板加一行**:改了 seed-skills.mjs 里 `prompt_templates` 段 → 必须在 PR
   描述贴前后 diff。
3. **user prompt 渐进抽出**(`prompts/<topic>-prompt-builder.ts`)
   ——已抽 `live-predictions.topic`,其他按需。
4. **接通 evals 时**:跑分钉到 prompt template 版本,而不是 git commit。
