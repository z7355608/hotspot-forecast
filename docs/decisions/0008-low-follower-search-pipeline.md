# ADR-0008: 低粉爆款库管线 C — 搜索补样(口播 / 带货 / 干货)

- **状态**:Accepted
- **创建**:2026-04-30
- **拍板**:2026-04-30(项目 PM)
- **配套**:[ADR-0007](0007-low-follower-billboard-pipeline.md)、[topic-strategy-engine.ts](../../server/legacy/topic-strategy-engine.ts)、[low-follower-billboard-prefilter.ts](../../server/services/low-follower-billboard-prefilter.ts)
- **关系**:**扩展** ADR-0007(管线 A=seed_topic / 管线 B=billboard / 管线 **C=search**),共表共下游

---

## 背景

### 1) ADR-0007 实施后(2026-04-30 11:10)的内容生态实测

PM 在 [http://localhost:3000/low-follower-opportunities](http://localhost:3000/low-follower-opportunities) review 7 条 billboard 入库样本时发现:

> "都是符合低粉爆款的。**很多都是随拍的**。有没有那种**口播或者带货**低粉爆款呢?"

跑探针 [probe-billboard-content-mix.ts](../../server/scripts/probe-billboard-content-mix.ts) 拉 7 天榜全部 19 条候选,关键词命中分布:

| 内容类型 | 关键词命中数 | 实例 |
|---|---|---|
| **口播** | **0** | 严格意义没有 |
| **带货/测评** | **1** | 「平替👟👔找他👉@昂端制造 给娜塔莎做了件新衣服」(被 prefilter 拒,IP 嫌疑) |
| 干货 | 0 | — |
| 街访 | 1 | 人民日报转发的 10后采访 |
| **其他**(萌宠/搞笑/抽象/家庭日常) | **17** | 占 90% |

进一步 probe `fetch_hot_total_high_like_list`(全网点赞总榜):20 条里 75% 低粉,**但内容生态和 low_fan_list 高度重叠**(全是萌宠/搞笑/抽象)。

`fetch_hot_total_high_search_list` 实测**返 0 条**(可能需要其他必填参数),不可用。

### 2) 根因

抖音「低粉爆款」算法 = **按互动密度排**,而口播/带货/干货**互动天然低于情绪触发型内容**。任何 billboard 榜都解决不了这个问题——**这是平台特性,不是接口 bug**。

### 3) PM 决策

加 **管线 C**:用 `douyin_search` 按内容类型关键词搜补样(走"按内容类型"维度,绕开"按互动密度"维度)。

---

## 决定

新增"低粉库 search 入库管线"(管线 C),核心 3 步数据流(每条候选样本 **3 次 TikHub 调用**):

```
关键词 → /api/v1/douyin/search/fetch_general_search_v2  (拿 video 列表 + 部分字段)
       → /api/v1/douyin/app/v3/fetch_one_video_v2       (拿 video 真实 stats - comment/collect/share)
       → /api/v1/douyin/web/handler_user_profile_v2     (拿 author 真实 follower_count,因为搜索/视频详情都返 0)
```

### Step 1 — 关键词集合(行业 × 内容类型 矩阵)

PM 校准:不再按"内容类型"单维拍,改为**14 个常用行业 × 多种内容类型**,共 **30 个关键词**,确保覆盖面 + 类型多样性:

```ts
const SEARCH_KEYWORDS: Array<{ keyword: string; industry: string; type: string }> = [
  // —— 美食 ——
  { keyword: "美食教程",        industry: "美食",     type: "干货" },
  { keyword: "美食测评 平替",   industry: "美食",     type: "带货" },
  // —— 美妆 ——
  { keyword: "美妆干货",        industry: "美妆",     type: "口播/干货" },
  { keyword: "美妆测评 平替",   industry: "美妆",     type: "带货" },
  // —— 穿搭 ——
  { keyword: "穿搭干货",        industry: "穿搭",     type: "口播/干货" },
  { keyword: "平价穿搭 推荐",   industry: "穿搭",     type: "带货" },
  // —— 健身 ——
  { keyword: "健身干货",        industry: "健身",     type: "干货" },
  { keyword: "减脂教程",        industry: "健身",     type: "干货" },
  // —— 母婴 ——
  { keyword: "育儿干货",        industry: "母婴",     type: "口播/干货" },
  { keyword: "母婴好物 推荐",   industry: "母婴",     type: "带货" },
  // —— 数码 / AI ——
  { keyword: "数码测评",        industry: "数码",     type: "带货" },
  { keyword: "AI工具 教程",     industry: "数码/AI",  type: "干货" },
  { keyword: "AI工具 推荐",     industry: "数码/AI",  type: "带货" },
  // —— 家居 ——
  { keyword: "家居好物 推荐",   industry: "家居",     type: "带货" },
  { keyword: "收纳干货",        industry: "家居",     type: "干货" },
  // —— 汽车 ——
  { keyword: "汽车测评",        industry: "汽车",     type: "带货" },
  // —— 宠物 ——
  { keyword: "养猫干货",        industry: "宠物",     type: "干货" },
  { keyword: "养狗教程",        industry: "宠物",     type: "干货" },
  // —— 职场 / 副业 ——
  { keyword: "职场干货",        industry: "职场",     type: "口播/干货" },
  { keyword: "副业 攻略",       industry: "职场",     type: "干货" },
  // —— 教育 / 学习 ——
  { keyword: "考研干货",        industry: "教育",     type: "干货" },
  { keyword: "英语学习 教程",   industry: "教育",     type: "干货" },
  // —— 旅行 ——
  { keyword: "旅行攻略",        industry: "旅行",     type: "干货" },
  { keyword: "穷游 攻略",       industry: "旅行",     type: "干货" },
  // —— 情感心理 ——
  { keyword: "情感干货",        industry: "情感心理", type: "口播" },
  { keyword: "心理学 科普",     industry: "情感心理", type: "口播/干货" },
  // —— 生活技能 ——
  { keyword: "生活小窍门",      industry: "生活技能", type: "干货" },
  { keyword: "省钱攻略",        industry: "生活技能", type: "干货" },
  // —— 摄影 / 拍照 ——
  { keyword: "拍照教程",        industry: "摄影",     type: "干货" },
  // —— 口播专项(全行业通用)——
  { keyword: "口播文案 模板",   industry: "通用",     type: "口播" },
];
// 30 个关键词,覆盖 14 个常用行业 × 3 大内容类型(口播/带货/干货)
```

**`industry` 字段直接落 `low_follower_samples.industry_top`**(本次给该字段填上有意义的值,而不是 NULL),前端可按行业筛选展示。
**未来动态化**:由 ADR-0006 §Step C 提到的"用户输入种子词联动"自动补充(P2 todo,本 ADR 不实现)。

### Step 2 — 调用模式(沿用 [topic-strategy-engine.ts:441](../../server/legacy/topic-strategy-engine.ts:441) 的双层降级)
- L1: `fetch_general_search_v2`(POST,字符串参数:`cursor:"0"`、`sort_type:"0"`、`publish_time:"0"`、`filter_duration:"0"`、`content_type:"0"`、`search_id:""`、`backtrace:""`)
- L2 降级: `fetch_video_search_v2`(同参数)
- 走 [tikhub.ts:290 postTikHub](../../server/legacy/tikhub.ts:290),不入缓存白名单(同 ADR-0007 §Step 2 理由)

### Step 3 — 三层 enrichment(因为 search 字段不全)
| 层 | 接口 | 拿什么 | 失败时 |
|---|---|---|---|
| L1 search | `fetch_general_search_v2` | aweme_id / desc / 部分 stats / `author.uid` 或 `sec_uid` | 跳过该 keyword |
| L2 detail | `fetch_one_video_v2`(已有,backfill-billboard-stats 复用) | 真实 comment_count/collect_count/share_count/likes | 用 search 返的部分值兜底 |
| L3 author | `web/handler_user_profile_v2`(按 sec_uid)| 真实 follower_count | **降级**(PM 校准 §H):若 429 / 5xx → 用 L1 search 阶段拿到的弱 follower 兜底;**只有 follower 完全无法获取(L1+L3 都没)才丢弃**。降级入库的样本打 `prefilter_reason` 注明"follower 估算"以便回看。 |

**降级具体规则**:
1. 优先用 L3 真实 `follower_count`
2. L3 失败 → 检查 L1 search 响应里 `author.follower_count` / `mplatform_followers_count`(部分接口版本会返一个粗值)
3. 全部缺失 → **跳过该样本**
4. 整批 L3 失败率 > 30% → 触发 log.warn,人工查看是不是接口限流

### Step 4 — 过滤门槛(在 cleaner 之前)
- **后置粉丝量过滤**:`follower_count <= 50_000`(对齐 PRD 中腰部上限,与 billboard 自带"低粉"不同)
- **互动量下限**:`likes >= 1_000`(避免 SEO 堆词的低质账号)
- **LLM 预检查**:复用 [low-follower-billboard-prefilter.ts](../../server/services/low-follower-billboard-prefilter.ts),但 **prompt 加一段强约束**:
  > 排除「为搜索 SEO 堆砌关键词、内容空洞、像营销号作业」的样本。识别要点:标题/desc 里关键词堆叠 ≥ 5 个、文案明显套模板、互动率(likes/exposure)异常低。

### Step 5 — 入库(走 cleaner)
- `seedTopic = "search:" + 关键词`(便于后续按关键词复盘命中率)
- `source = 'search'`(schema enum 加值)
- `industry_top` 按关键词归属类型("口播"/"带货"/"干货"等)
- `industry_sub` 由 LLM 推断

### Step 6 — 复用 ADR-0007 现有链路
- backfill-billboard-stats:**已经做完 L2**(detail enrichment),管线 C 集成到主脚本里就不需要二次 backfill
- run-tagger(doubao):**复用**,给入库样本补 `content_form/track_tags/burst_reasons/newbie_friendly/suggestion`
- 数据库 schema:`source` ENUM 加 `'search'` 值(ALTER 一次)

### Step 7 — 调度 + 首次 backfill 模式

**模式**:
- `--backfill`(本次首跑用):**一次性大流量**,30 keyword × 2 页 × 20 条 = **1200 候选样本**,目标 PM 提到的"在基础数据少的情况下,补充优质数据"
- 默认(日常 cron):每个 keyword 1 页 × 20 条 = 600 候选

**频率**:
- 一次性 backfill:**本次手动触发**(本 ADR 落地当天)
- 日常 cron:每周一上午 09:00(避开 billboard 08:00)

**触发**:cron + tsx,与管线 B 同 worker。**去重**:与现有 `low_follower_samples.id`(`lf_${aweme_id}`)冲突时 ON DUPLICATE KEY UPDATE,但 source 优先级:billboard > search(已是 billboard 的不被 search 覆盖)。

---

## 理由

1. **为什么不是另一条 billboard**:已实测 `high_like_list` 与 `low_fan_list` 内容生态重叠,加它无益。
2. **为什么走 search**:口播/带货是**垂直内容类型**,必须按内容类型搜,不能从互动榜里筛。
3. **为什么 3 次 API 调用**:search 接口字段不全 + author follower 脱敏(实测 v3 video detail 也返 0)——必须三层 enrichment。
4. **为什么硬编码关键词**:CLAUDE.md §3「能合并/缓存/规则替代就别加 LLM」——LLM 拍关键词集合不如 PM 拍。后续可以让"用户输入种子词"动态扩,但本 ADR 不做。
5. **为什么 prefilter prompt 加 SEO 堆词约束**:搜索结果质量不如 billboard,自然有更多营销号噪音,需要 LLM 兜底强化。
6. **为什么周更不日更**:成本(每周 ~12 keyword × 20 候选 × 3 API ≈ 720 次/周 ≈ $0.72/周 = $3/月)+ 内容更新节奏不需日刷。
7. **为什么 source ENUM 加 'search' 不是 'douyin_search'**:与 'seed_topic'/'billboard' 一致的粒度,平台维度由 `platform_id` 字段表达。

---

## 后果

### 好处
- 库的内容类型多样性提升:口播 / 带货 / 干货从 0 → 估算 5-15 条/周(取决于通过率)。
- 三管线共表共下游,前端 UI 零改动(只看 `source` 字段做筛选展示即可)。
- 复用 ADR-0007 的 prefilter / cleaner / tagger / detail-stats backfill,**新增代码 < 200 行**。

### 代价 / 已知风险
- **API 成本翻倍**:3 次/样本 vs ADR-0007 的 1 次。每周 $0.7,每月 ~$3,可接受。
- **L3 author profile 接口可能频繁 429**(douyin user_profile 是热接口),需要重试 + 限流。
- **搜索结果质量参差**:SEO 堆词、营销号、低质教程多,prefilter 通过率预计 < 10%(本 ADR 报警阈值同 ADR-0007 §G,持续低就调 prompt 或换关键词)。
- **关键词偏移风险**:硬编码关键词可能不能覆盖未来出现的新内容形式(比如"AI 工具速通""年货带货")。**P2 todo**:用户输入种子词动态扩。
- **author 维度去重未做**:同账号可能多视频被搜回,本 ADR 接受(ADR-0006 §Step C 早就有"账号多内容"假设)。
- **3 次 API 串行延迟**:每样本 ≈ 1-2s,12 keyword × 20 候选 = 240 样本 ≈ 8 分钟单次跑。可接受。

### 需要联动改的文档
- [docs/llm-budget.md](../llm-budget.md):「低粉链路」表加管线 C 行
- [docs/系统流程图.md](../系统流程图.md):新增管线 C 节点
- [docs/PRD-v1.md](../PRD-v1.md) §8:补「三管线」描述
- [CLAUDE.md](../../CLAUDE.md) §3:刷新 LLM/API 调用说明
- [docs/deployment.md](../deployment.md) cron 节:加管线 C 周一 09:00 的 crontab 行
- [evals/README.md](../../evals/README.md):管线 C 的"搜索结果质量"维度

---

## PM 校准结果(2026-04-30 已拍板)

| # | 项 | 决定 |
|---|---|---|
| A | 关键词集合 | **30 个,行业×类型矩阵**(详 §Step 1) — PM 反馈"分配不合理,需覆盖常用领域行业",已扩 |
| B | 每关键词拉几页 | **首次 backfill = 2 页(40 条/kw);日常 cron = 1 页(20 条/kw)** |
| C | 后置 follower 过滤上限 | **50_000**(PRD §2 中腰部上限) |
| D | 互动量下限 | **likes >= 1_000**(防 SEO 噪音) |
| E | 调度 | **首次手动 backfill + 日常 cron 每周一 09:00** |
| F | source ENUM | **'search'** |
| G | 报警阈值 | **< 10% 通过率** |
| H | author profile 失败 | **允许降级**(PM 反馈"如果经常 429 允许降级"):优先 L3 真实 → 降级 L1 search 兜底 → 全部缺失才丢弃。详 §Step 3 降级规则 |

---

## 实施 Changelog(2026-04-30 12:20 当天落地实测)

**首次 backfill 跑通**(`run-search-pipeline.ts --backfill` + tagger):
- 30 keyword × 1 search 调用(每 keyword search 接口单次返 ~19-33 条,所以 backfill 实际 30 次 search,不是 60 次)
- 候选拉取:**982** 条 raw aweme(来自 30 keyword)
- L2+L3 enrichment 通过 `follower<=50k AND likes>=1000`:**128** 条(去重后)
- LLM 预检查通过率:**73/128 = 57.0%**(远高于 billboard 的 12-26%,说明 search + SEO 反堆词约束效果好)
- cleaner 入库:**24/73**(cleaner 的 P75 互动量基准卡了一道,余 24)
- tagger 真打 24/24(doubao,无规则降级)
- 耗时 **40 分钟**(L2/L3 串行 + 200ms 平滑;`run-tagger` 单跑额外 ~30s)
- 实际花费:**~$1.8 TikHub + $0.01 LLM = ~$1.8**

**入库样本质量验证**(7 个行业,5 种内容形式):
- 宠物 8(养猫×6+养狗×2)、家居 3(收纳/好物)、数码/AI 3(AI 工具/剪辑)、职场 2、情感 2、旅行 2、母婴/教育/美妆/穿搭 各 1
- 形式:干货 14、口播 3(职场/情感)、测评/带货 4(平价彩妆/收纳/厨房/母婴)、图文 4、剪辑 1
- **PM 提出"想要口播/带货"的诉求满足**:有"职场生存六个手段""情感观点输出""AI副业搞钱"等典型口播,以及"平价彩妆""家居好物""AI 工具集合""母婴好物"等典型带货

**实施过程发现的事实**:
- search 接口的 author.follower_count 实测**返 0**(脱敏),L2 fetch_one_video_v2 的 author.follower_count **也返 0**——必须走 L3 `app/v3/handler_user_profile`,这是唯一可靠的 follower 源
- L3 user_profile 实测**未触发 429**(30 keyword × 数十样本),PM 担心的"经常 429"未发生;降级路径(2 次重试 + 兜底)代码就绪但没用上
- search 接口的 cursor 翻页本 ADR 没实现,原因:**单次返回 ~19-33 条已足够**,且 cursor 状态管理增加复杂度(若未来要扩到日级 search 增量,再加)。`--backfill` 的"2 页"语义实际等同 1 次调用,代码已 `if (p === 0 && list.length === 0) break` 短路

---

## 相关
- [ADR-0007](0007-low-follower-billboard-pipeline.md)(本 ADR 的前置)
- [ADR-0006](0006-low-follower-library-target-alignment.md)(初始 PRD 对齐)
- [topic-strategy-engine.ts:441](../../server/legacy/topic-strategy-engine.ts:441)(现成的搜索调用模式,管线 C 复用)
- [low-follower-billboard-prefilter.ts](../../server/services/low-follower-billboard-prefilter.ts)(LLM 预检查,管线 C 复用 + 加 SEO 约束)
- [low-follower-search-pipeline.ts](../../server/services/low-follower-search-pipeline.ts)(三层 enrichment service)
- [run-search-pipeline.ts](../../server/scripts/run-search-pipeline.ts)(主调度脚本)
- [backfill-billboard-stats.ts](../../server/scripts/backfill-billboard-stats.ts)(L2 detail 已实现)
