# ADR-0004: X 平台(Twitter)数据源暂不进入主预测流程

- **状态**:Superseded by ADR-0005
- **创建**:2026-04-29
- **决策人**:项目 owner
- **触发**:用户提问「之前验证过的 X 平台科技博主话题预测,为什么没接入 agent 主流程」

---

## 背景

### 1. 已经存在的能力

仓库里 **已经有 Twitter / X 数据采集代码**,而且是活的——但只服务于「创作者中心(Creator Center)」侧线,不在爆款预测主流程里:

| 能力 | 位置 | 出口 |
|------|------|------|
| `syncTwitterOverview` — 拉用户 profile | [server/legacy/creator-data-sync.ts:1908](../../server/legacy/creator-data-sync.ts) | TikHub `/api/v1/twitter/web/fetch_user_profile` |
| `syncTwitterWorks` — 拉推文时间线 | [server/legacy/creator-data-sync.ts:1944](../../server/legacy/creator-data-sync.ts) | TikHub `/api/v1/twitter/web/fetch_user_post_tweet` |
| 平台白名单含 `twitter` | [server/legacy/creator-data-sync.ts:2185](../../server/legacy/creator-data-sync.ts) — `SUPPORTED_SYNC_PLATFORMS` | — |
| 调用方 | `creator-center-api.ts` + `account-diagnosis-agent.ts` | REST,**不在 `runLivePrediction` 调用链** |

### 2. 主预测流程的现状

[server/legacy/live-predictions.ts:179](../../server/legacy/live-predictions.ts) `runLivePrediction` 的数据源采样,**完全只走 TikHub 的国内三平台**:

- 平台分发硬编码在 [server/legacy/watch-runtime.ts:635-638](../../server/legacy/watch-runtime.ts):
  ```ts
  if (platform === "douyin")   return DOUYIN_ROUTES;
  if (platform === "kuaishou") return KUAISHOU_ROUTES;
  return XHS_ROUTES;
  ```
- 平台白名单在 [server/legacy/prediction-helpers.ts:86-103](../../server/legacy/prediction-helpers.ts),只接受 `douyin / xiaohongshu / kuaishou`,默认兜底抖音。
- 意图识别 [server/legacy/intent-agent.ts:79](../../server/legacy/intent-agent.ts) 有 `industry` 字段,**只写日志,不驱动数据源 / prompt 切换**。
- 没有「AI 科技」这种垂类的专门召回路径,垂类标签只用来给 TikHub 互动率榜单加 `tags` 参数。

### 3. 为什么会出现"做了一半"的状态

历史上把 Twitter 加进 `creator-data-sync.ts` 是为了「创作者诊断中心」——给用户看自己账号在多平台的基础数据。这条路径只需要「按 handle 拉数据」,**不需要**:

- 跨语言话题映射(英文推文 → 中文短视频选题)
- 针对 X 的语义过滤阈值与垂类标签体系
- 趋势热度模型(转评赞 vs 互动率,定义不同)

而这些恰恰是「把 X 数据喂进爆款预测」必须解决的事——所以接到了诊断侧线就停下,没有继续往主流程推。

### 4. 候选方案

- **A. 保持现状**:X 只服务创作者诊断,不进主预测流程。明示这是有意为之。
- **B. 最小可行接入(MVP)**:在 `runLivePrediction` 加一个开关——当 `intent.industry` 命中「AI / 科技」垂类时,**复用已有的 `syncTwitterWorks`**,把推文作为补充召回喂给 `topic-strategy-engine`,**不新增独立的 LLM 步骤**。
- **C. 完整接入**:抽 `PlatformAdapter` 接口,X 作为一等公民平台,独立路由 + 独立 prompt + 跨语言话题映射。

---

## 决定

**选 A:维持现状,X 平台不进入主预测流程**——但**显式登记**这个状态,并写出 B / C 的启动条件。

未来要走 B 或 C,**必须先写 ADR-00xx superseded 这一份**,不要悄悄塞进主流程。

---

## 理由

1. **LLM 预算已经紧到红线**(见 [docs/llm-budget.md](../llm-budget.md) §1):典型 6–8 次,最坏 10–12 次,P95 端到端 30 秒就是上限。X 接入若按 C 方案做,至少 +2–3 次 LLM(推文清洗 / 翻译 / 跨语种话题映射),会把 SLA 直接打穿。
2. **CLAUDE.md §3 的红线**:「不要为了"代码整洁"在主流程里加新的 LLM 调用——预算已经紧」。X 接入是「新增 LLM 步骤 + 新增数据通道」的双重负担,典型必须先写 ADR 的场景。
3. **架构上没有 provider/adapter 抽象**:[watch-runtime.ts:635-638](../../server/legacy/watch-runtime.ts) 是硬编码 `if/else` 分发。强行塞 X 等于在主流程里再叠一层 `if (platform === "twitter")`,加深技术债。要做就做对——抽 adapter,但这是 C 方案的工作量。
4. **场景路由缺失,B 方案有隐患**:`intent.industry` 当前只写日志,没有产线验证过它的稳定性。把"是否接 X"绑在一个未稳的字段上,生产不会稳。要做 B,必须先把 `intent.industry` 升级成稳定的"垂类路由信号"。
5. **数据源差异大,不是简单加平台**:抖音/小红书/快手的"播放、点赞、评论、互动率"和 X 的"曝光、转评赞、引用"指标体系完全不同,趋势打分模型 [topic-strategy-engine.ts](../../server/legacy/topic-strategy-engine.ts) 的权重需要重新校准。这是产品决策,不是工程决策,需要 owner / 产品介入。
6. **创作者诊断的 Twitter 数据采集没浪费**:它本身满足创作者中心的需求,而且未来 B / C 启动时,`syncTwitterWorks` 可以直接复用——属于"接入已就绪,业务还没准备好"。

---

## 后果

### 好处

- **预测主流程的 LLM 预算与 SLO 不被破坏**——这是 v1.0 冻结期的首要约束。
- **架构债不滚雪球**——避免再叠一层硬编码 `if`。
- **明示"是有意为之",而非遗忘**——后续无论是 AI 还是新人,都不会再问「为什么 X 没接」。
- **创作者诊断的 Twitter 数据继续可用**,不影响。

### 代价 / 已知风险

- **AI 科技垂类的预测质量上限受限**:这个赛道的真实热点在 X / Reddit / Hacker News 上首发,国内三平台是滞后传播。这是已知的产品天花板。
- **"我们能预测 AI 科技选题"是对外能力的一项缺口**:销售 / 客户沟通时要避免承诺这个能力。
- **侧线代码长期不被主流程消费,可能腐化**:`syncTwitterWorks` 的字段结构若未来变更,主流程接入时要重做适配。`server/multi-platform-sync.test.ts` 现在已是死测试,只覆盖结构、不覆盖语义。

### 启动 B(最小可行接入)的条件

满足**以下全部**,可以考虑启动 B,**且必须先写 ADR superseded 本份**:

- 「AI / 科技」垂类的客户付费意愿 / 流失率数据明确指向「缺 X 是关键短板」(产品侧给数据,不是工程拍脑袋)
- `intent-agent.industry` 字段在线上跑出 ≥ 4 周稳定数据,误判率可量化
- 设计出「不新增 LLM 步骤」的接入方式(例如:推文文本直接拼进现有的趋势机会 prompt,而非独立调用)
- 评测集 `evals/topic-suggest/` 加上「AI 科技垂类」专用样本

### 启动 C(完整接入)的条件

满足**以下全部**:

- B 已上线且数据验证有效
- 有专人专项做平台 adapter 抽象重构(预计 1–2 周纯净时间)
- LLM 预算降到典型 ≤ 6 次(腾出预算给跨语种映射)
- 跨语言话题映射的 prompt 经过评测,质量基线明确

### 禁止条件(写在这里防止悄悄启动)

- 「客户问了一句要不要 X」——不构成启动 B/C 的理由,先收集数据。
- 「代码看起来很容易塞进去」——这是诱惑,不是理由。架构债是真实成本。
- 「竞品有了我们就要有」——先评估是否影响留存,再决策。

---

## 相关

- [CLAUDE.md](../../CLAUDE.md) §3 LLM 调用预算红线
- [docs/llm-budget.md](../llm-budget.md) — 预算详细矩阵
- [docs/系统流程图.md](../系统流程图.md) — 当前主流程数据源接入位置
- 主流程入口:[server/legacy/live-predictions.ts:179](../../server/legacy/live-predictions.ts) `runLivePrediction`
- 平台分发硬编码:[server/legacy/watch-runtime.ts:635-638](../../server/legacy/watch-runtime.ts)
- Twitter 数据采集(已就绪、未被主流程消费):[server/legacy/creator-data-sync.ts:1908-1991](../../server/legacy/creator-data-sync.ts)
- 创作者诊断侧线消费方:`server/legacy/creator-center-api.ts`、`server/legacy/account-diagnosis-agent.ts`
