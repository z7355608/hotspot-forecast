# ADR-0006: 低粉爆款库合格样本定义对齐 PRD 目标人群

- **状态**:Accepted
- **创建**:2026-04-30
- **拍板**:2026-04-30(项目 PM)
- **配套**:[PRD-v1.md §2 目标用户](../PRD-v1.md)、[low-follower-algorithm.ts](../../server/legacy/low-follower-algorithm.ts)

---

## 背景

### 1) 现状观察(2026-04-30 数据快照)

低粉爆款样本库 `low_follower_samples` 共 **116 条**,通过 `server/scripts/inspect-lf-composition.ts` 调研:

| 维度 | 实测 | 是否对齐 PRD 目标人群 |
|---|---|---|
| 粉丝上限 | 算法常量 `followerCeiling = 10_000`([low-follower-algorithm.ts:169](../../server/legacy/low-follower-algorithm.ts:169)) | ❌ PRD 目标用户上限是 **50k**——10k–50k 的中腰部上半段没参考样本 |
| 种子话题 top | 「全网热门」16、「AI 科技」6、「ai」4、「旅游攻略」3、「娜塔莎」3、「轻松熊」、「猎奇」、「周皮格」、「意想不到的结局」… | ❌ 大量是 **IP/吃瓜/纯娱乐**,不是赛道关键词 |
| `track_tags` | 85 个不同标签,长尾 1 条/标签;聚焦的只有「AI 效率工具」11 条、「数码科技」9 条;出现「猎奇」「暗网」「重口」 | ❌ 极度发散 |
| `content_form` | 57%(66/116)为 null | ❌ LLM 打标管线漏掉一半 |
| `newbie_friendly`(LLM 评估的新手复刻难度,0–100) | 均值 **53.7**;**96%(111/116)落在 50–69**;只有 5 条 ≥70 | ⚠️ LLM 自己都说"不好复刻",但算法不读这个字段 |
| `viral_score = 100` 的 top8 | 包含 `ʕÖʕÖʔ。#轻松熊#鼻孔鸡`、`#猎奇#暗网#重口`、`#2018#猎奇`、`有个头晕的问题~`(seed=全网热门) | ❌ 算法判"满分爆款",对中腰部博主不可复刻 |

### 2) PRD 目标人群

[PRD-v1.md:18-26](../PRD-v1.md):**抖音/小红书中腰部自媒体创作者(粉丝 1k–50k)**,痛点是"不知道现在该拍什么",要的是"**今天就能开拍**"的可复刻选题。

### 3) 根因(三层)

1. **入库零内容过滤**:[low-follower-algorithm.ts:362-373](../../server/legacy/low-follower-algorithm.ts:362) 的判定只是 `低粉 + 加权互动≥P75 + 粉丝效率比≥0.5`——**纯互动数学**。而强情绪/猎奇/萌宠/吃瓜恰恰是低粉触发高互动的最容易路径,算法的"高分选样"和"对目标用户可复刻"完全脱钩。
2. **种子话题没收紧**:「全网热门」「娜塔莎」「猎奇」「轻松熊」这种 IP/吃瓜词被作为种子检索,搜回来的就一定是这类内容。
3. **LLM 打标是事后贴 label,没回头筛**:`newbie_friendly`、`track_tags`、`burst_reasons` 都生成了,但**既不影响入库门槛,也不影响 `viral_score` 排序**;`burst_reasons` 因 prompt 没强约束,LLM 写了 100+ 条自由短语而不是落到 prompt 列出的 10 个枚举值,事后聚合也失效了。

### 4) 候选方案

- **A. 展示层即时过滤**:库不动,在 tRPC 路由 / topic-strategy 喂样本环节,按 `newbie_friendly + seed_topic 黑名单 + 粉丝段` 过滤。立竿见影,可一天落地,但治标。
- **B. 调算法常量**(只改阈值):`followerCeiling 10k → 50k`、`minFanEfficiency 0.5 → 1.0`。能把粉丝段对齐 PRD,但**不解决"猎奇/吃瓜进库"**——这俩本来在 10k 以下就已经是高分样本。
- **C. 算法定义变更**:把"低粉爆款"重新定义为"**低粉爆款 且 对中腰部博主可复刻**"——`newbie_friendly`、`track_tags`、`seed_topic` 黑白名单**进入入库门槛**(而不是事后标签)。这是根因解,但属于算法定义变更,需要 ADR + 配套 prompt/打标管线改动。
- **D. 推倒重做**:换一套样本来源(例如只走赛道关键词搜索,不走 IP/榜单)。代价大,且与现有种子话题逻辑(`low_follower_detection_runs.seed_topic`)耦合深,不在本 ADR 讨论。

---

## 决定(待拍板)

**A + C 两步走**,A 短期止损、C 中期根因解。**B 不单独做**(因为 B 不解决内容类型问题,且 C 包含 B)。

### Step A — 展示层即时过滤(可在 ADR Accepted 当天落地)

不改算法、不改库,**在样本进入下游前过滤**:

1. **位置**:`server/routers/low-follower.ts` 查询路径 + `server/legacy/topic-strategy-bridge.ts`(把样本喂给主预测流程的接合点)。两处都加同一份过滤函数,集中维护。
2. **过滤规则(已确定)**:
   - `newbie_friendly >= 70`(当前 116 条中只有 5 条满足——**接受样本量大幅下降**,见"代价"节)
   - **`seed_topic` 黑名单改为 LLM 理解驱动**:不维护硬编码列表,由 LLM 判定一个 `seed_topic` 是"赛道型"(可服务 PRD 目标用户)还是"IP/吃瓜/猎奇型"(应被过滤)。结果**按 `seed_topic` 字符串缓存**(MySQL 表或 KV),同一个 `seed_topic` 全生命周期只调一次 LLM。
     - 输入:`seed_topic` 文本 + 该 topic 下样本的代表性 `track_tags` 聚合
     - 输出:`is_track_topic: boolean` + 一句解释(便于回看判错样本)
     - 模型:Doubao(沿用 [llm-gateway.ts](../../server/legacy/llm-gateway.ts))
3. **不动数据库**:被过滤掉的样本不删,只是不进下游;后续算法变更(C 阶段)如果重新放宽,数据还在。
4. **降级策略**(因为阈值 70 会让可用样本接近 0):
   - 当主链路拿到的低粉样本数 < `MIN_LF_SAMPLES`(初值建议 3)时,**结果页低粉证据条降级**为"暂无符合的低粉对标,本次预测以中粉/趋势数据为主"。
   - 不要回退到放宽阈值——回退会把 ADR 决议悄悄稀释。

### Step C — 算法定义变更(需先合并本 ADR,再改代码)

把入库判定从纯数学改为"数学条件 + 内容类型门槛":

1. **粉丝上限保持 `followerCeiling = 10_000`**(已确定)。理由:"低粉爆款库"的语义是"**比目标用户更低的对标**"——给 1k–50k 中腰部博主看 0–10k 账号怎么爆出圈,不是给 10k 用户看 10k–50k 账号。这个语义和 PRD 目标人群上限 50k 不冲突。
2. **入库新增门槛**(在 [`runLowFollowerAlgorithm`](../../server/legacy/low-follower-algorithm.ts:310) 里):
   - 必须先经 LLM 打标(`tagger.tagSamplesWithLLM`),拿到 `newbie_friendly` / `track_tags` / `burst_reasons` 后再做最终判定。
   - 必须满足:`newbie_friendly >= 70` **且** `seed_topic` 经 LLM 判定为赛道型(复用 Step A 的判定缓存)**且** `track_tags 与最近 N 天活跃用户输入的种子词` 至少有一个交集。
   - **赛道白名单不预定义**——动态来自"实际用户输入种子词联动":取最近 30 天产品里所有用户输入过的赛道关键词(去重 + 频次 ≥2),自动构成白名单。这样产品有什么用户,库就服务什么赛道,不会出现"我们 PM 想象的赛道"和"用户实际想拍的赛道"错位。
   - 实现位置:在 [`live-predictions.ts`](../../server/legacy/live-predictions.ts) 提取用户输入入参时,顺手写一张 `user_seed_keyword_recent_30d` 物化表(每日刷新即可)。
3. **打标提前用 Doubao**(已确定):沿用 [`llm-gateway.ts`](../../server/legacy/llm-gateway.ts) 的默认模型,不引新模型。
4. **prompt 强约束**:[low-follower-tagger.ts:57-93](../../server/legacy/low-follower-tagger.ts:57) 的 `TAGGER_SYSTEM_PROMPT` 必须强约束 `burst_reasons` 落到 10 个枚举值里(当前实测 LLM 没遵守,导致 100+ 条自由短语)。改 prompt + JSON schema 校验。
5. **数据补救**:对**已入库 116 条**,跑一次回填脚本,按新规则筛选 / 补打标 / 标记 `expired`(不删除,与 `low_follower_samples.viral_score_trend = 'expired'` 机制一致)。
6. **LLM 预算登记**:Step C 把打标从"事后"提前到"入库前",新增 LLM 调用主要发生在**入库阶段**(批处理,每批 5 条,见 [low-follower-tagger.ts:104](../../server/legacy/low-follower-tagger.ts:104))——**不在主预测链路的 6–8 次预算内**,不会推高 P95 时延。Step A 的 LLM 赛道判定调用频次 = 不重复的 `seed_topic` 数量(当前 60+ unique),全生命周期一次性调用 + 缓存,可忽略。但仍需在 [`docs/llm-budget.md`](../llm-budget.md) 单独登记一节"低粉链路 LLM 调用",由本 ADR 实施时一并补上。

---

## 理由

1. **为什么不直接动算法(跳过 A 直接做 C)**:C 涉及 prompt 改造、打标管线提前、库回填,**至少 2–3 天工期**;而库里 90% 噪音内容今天就在污染主预测链路。A 当天可落地,先把噪音掐掉,再慢慢做 C。
2. **为什么不只做 A**:A 是过滤层,会把"满足 PRD 但被算法漏标"和"不满足 PRD 但混进库的"两类问题都往展示层堆。长期会让"低粉库"和"实际可用样本池"分裂——可观测性变差,后续再做评估和回归会卡住。**算法定义必须改**。
3. **为什么必须 ADR**:这是**算法定义变更**——把"低粉爆款 = 低粉高互动"改成"低粉爆款 = 低粉高互动 **且** 对中腰部可复刻"。CLAUDE.md §4 明确"重大改动前先看 docs/,必要时新增一份 ADR"。算法定义改了,验收标准、回归测试、`docs/爆款预测系统技术说明文档.md` 都要跟着改。
4. **为什么 `newbie_friendly` 阈值不一步到位 70**:LLM 当前打分均值 53.7、96% 在 50–69——这个分布说明 LLM **要么本身打分偏保守,要么 prompt 引导不够区分**。直接用 70 会把库砍到 5 条,过狠;先用 60 留 25% 左右,边用边校准 LLM prompt。

---

## 后果

### 好处
- 主预测链路收到的低粉样本与 PRD 目标用户对齐——M3 的"相关性 ≥80%"验收会更容易过。
- 库里"看起来满分但其实是猎奇吃瓜"的噪音从展示层被掐住。
- 算法定义被显式记录,后面任何想"放宽筛选拿更多样本"的冲动都得回过头来读这份 ADR。

### 代价 / 已知风险
- **样本量大幅下降**(已知且接受):`newbie_friendly ≥ 70` 一刀下去,116 条只剩 5 条;再叠加 LLM 赛道判定,**估计 ≤ 3 条可用**。低粉证据条会**频繁触发降级文案**——这是 PM 拍板时已知的权衡:**宁可没有,不要错的**。
- **LLM 调用新增**:Step C 入库阶段每条样本一次打标(批处理),不在主链路预算内;Step A 每个唯一 `seed_topic` 一次赛道判定,缓存复用。需登记 [`docs/llm-budget.md`](../llm-budget.md)。
- **赛道白名单的"冷启动"问题**:产品早期用户少、种子词样本不足时,白名单会很窄,导致库可用样本接近 0。需要在 Step C 实施时定义"用户种子词频次 ≥2 + 总词数 ≥10" 之类的最小启动条件,否则降级为 LLM 单独判赛道。
- **历史样本回填工作量**:116 条不算多,但需要写脚本 + 跑一次,有出错可能。
- **LLM 判错的回看机制**:Step A 的 LLM 赛道判定结果要存"判定理由"字段——以后发现误判可以反查 prompt + 修正。

### 需要联动改的文档
- [docs/PRD-v1.md](../PRD-v1.md):§8「与现有代码资产的关系」补一条"低粉爆款库合格样本定义按 ADR-0006"
- [docs/爆款预测系统技术说明文档.md](../爆款预测系统技术说明文档.md):算法章节加 `newbie_friendly + 赛道白名单`
- [docs/llm-budget.md](../llm-budget.md):登记 Step C 引入的打标提前
- [CLAUDE.md](../../CLAUDE.md) §3:LLM 调用次数说明刷新
- [evals/README.md](../../evals/README.md):新增"低粉样本可复刻性"评测维度

---

## 相关
- [PRD-v1.md §2 目标用户](../PRD-v1.md)
- [low-follower-algorithm.ts](../../server/legacy/low-follower-algorithm.ts)、[low-follower-tagger.ts](../../server/legacy/low-follower-tagger.ts)
- [server/scripts/inspect-lf-composition.ts](../../server/scripts/inspect-lf-composition.ts)(本 ADR 的数据来源,可重复运行)
