# 爆款预测 Agent 架构重构方案

**作者：Manus AI**
**日期：2026-04-22**
**版本：v1.0**

---

## 一、现有流程诊断

### 1.1 当前 Agent 执行链路

当前 `runLivePrediction` 的执行流程可以概括为以下 5 步：

1. **意图识别**（`classifyIntentWithLLM`）：LLM 判断用户想做什么（赛道分析/账号诊断/爆款拆解）
2. **关键词提取**（`extractTaskParams`）：LLM 从用户输入中提取 1-2 个搜索关键词
3. **平台数据采集**（`runWatchTaskWithFallback`）：对每个平台 × 每个关键词，按能力计划（required + optional）调用 TikHub API
4. **数据提取与汇总**（`extractAccounts` / `extractContents`）：从 API 返回的原始 JSON 中提取结构化的账号和内容数据
5. **LLM 趋势分析**（`callLLM`）：将最多 8 条内容 + 5 个账号的摘要喂给 LLM，生成 3-5 个趋势机会卡片

### 1.2 核心问题

经过深入分析，现有流程存在以下结构性缺陷：

**问题一：搜索量太小，数据样本不足以支撑"确定性"判断。** 当前每个关键词只搜索一页（`cursor: 0`），抖音搜索 API 单页返回约 10-20 条结果。2 个关键词 × 1 页 = 最多 20-40 条原始数据，去重后可能只剩 15-25 条。最终只取前 8 条内容和 5 个账号喂给 LLM，样本量严重不足。

**问题二：没有数据筛选层，"搜什么就分析什么"。** 搜索结果直接按顺序截取前 N 条，没有按播放量、互动率、发布时间等维度进行筛选和排序。这意味着 LLM 看到的可能是一堆平庸内容，而不是真正的爆款信号。

**问题三：搜索关键词单一，覆盖面窄。** 只用 1-2 个关键词搜索，无法覆盖赛道内的多种内容形态和细分方向。比如用户输入"穿搭"，只搜"穿搭"和"穿搭合集"，遗漏了"通勤穿搭"、"微胖穿搭"、"平价穿搭"等细分爆款方向。

**问题四：缺少"异常检测"逻辑。** 爆款的核心信号是"异常"——低粉高播、新号爆量、短时间互动激增。当前流程虽然有 `mapLowFollowerEvidence` 提取低粉爆款，但只是简单过滤粉丝数 ≤ 10000 的内容，没有计算播粉比、互动率异常等关键指标。

**问题五：LLM 分析缺乏结构化数据支撑。** 给 LLM 的 prompt 只包含文本摘要（标题、点赞数、播放数），没有提供统计分布（中位数、P90、增长率）、时间序列（7 天趋势）、竞争格局（头部 vs 素人占比）等结构化分析结果。LLM 只能"看着文字猜"，而不是"基于数据判断"。

**问题六：热榜数据未与搜索数据交叉验证。** 热榜（`hot_seed`）和搜索（`keyword_content_search`）是两个独立的数据源，当前只是分别计数，没有做交叉验证（如：搜索结果中有多少条命中热榜关键词？热榜话题在搜索中的内容密度如何？）。

### 1.3 现有能力路由总结

| 能力 | 抖音 API | 小红书 API | 快手 API | 当前使用方式 |
|------|----------|-----------|---------|------------|
| keyword_content_search | 综合搜索 v1/v2、视频搜索 v1 | 无（降级到热榜） | 内容搜索 v1/v2 | required，1 页，cursor=0 |
| topic_discovery | 话题搜索 v1/v2、话题推荐 | 无 | 无 | optional |
| hot_seed | 热搜榜、搜索建议 | 热榜 | 热搜榜、热门话题 | optional/required(小红书) |
| user_discovery | 用户搜索 v1/v2 | 用户搜索 | 用户搜索 | optional |
| account_profile | 用户主页 v2/v3/v4 | 用户信息 | 用户信息 | 级联补全（最多 6 个） |
| creator_posts | 用户作品列表 | 用户笔记 | 用户作品/热门作品 | optional |
| content_detail | 视频详情 v2/v3 | 笔记详情 | 视频详情 | optional |
| comments | 视频评论 | 笔记评论 | 无 | optional |
| trend_growth | 创作者数据趋势、榜单趋势 | 无 | 无 | optional（需 cookie） |
| cookie_enrich | 创作者后台数据 | 无 | 无 | optional（需 cookie） |

**被禁用但可用的抖音榜单 API（DEFAULT_DISABLED_ENDPOINTS）：**

| API | 说明 | 价值 |
|-----|------|------|
| fetch_hot_total_search_list | 热搜总榜 | 全站热度信号 |
| fetch_hot_total_topic_list | 热门话题总榜 | 话题趋势 |
| fetch_hot_total_video_list | 热门视频总榜 | 爆款样本池 |
| fetch_hot_total_low_fan_list | **低粉爆款榜** | **核心：素人机会信号** |
| fetch_hot_total_high_search_list | 高搜索量榜 | 需求信号 |
| fetch_hot_total_hot_word_list | 热词榜 | 关键词扩展 |
| fetch_hot_rise_list | 飙升榜 | 趋势加速信号 |
| fetch_hot_total_list | 综合热门榜 | 全局热度 |
| fetch_hot_item_trends_list | 内容趋势榜 | 时间序列 |

---

## 二、新架构设计：确定性爆款预测

### 2.1 设计原则

> **核心理念：搜索量大、筛选严格、分析有据。** 用大量搜索数据建立统计基础，通过多维度筛选找到异常信号，再用 LLM 基于结构化数据给出确定性判断。

1. **宽进严出**：搜索阶段尽可能多拿数据（多关键词 × 多页），筛选阶段严格过滤
2. **数据先行**：在调用 LLM 之前，先用代码完成统计分析，给 LLM 提供结构化的数据摘要而非原始列表
3. **交叉验证**：热榜 × 搜索 × 榜单三个数据源互相验证，提高信号可信度
4. **异常驱动**：爆款的本质是"异常"，核心筛选指标是播粉比、互动率、增长速度

### 2.2 新的 Agent 执行流程（6 阶段）

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 1: 意图理解 + 关键词扩展               │
│  LLM 生成 4-6 个搜索关键词（核心词+细分词）    │
│  同时生成 2-3 个"反向验证词"用于竞争分析       │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 2: 大规模数据采集（并行）               │
│  ① 关键词搜索：4-6 词 × 2-3 页 = 40-90 条   │
│  ② 热榜/榜单：热搜榜+低粉爆款榜+飙升榜       │
│  ③ 话题发现：话题搜索+话题推荐               │
│  ④ 头部账号作品：搜索结果中 Top3 账号的近期作品 │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 3: 数据清洗 + 结构化提取               │
│  去重、标准化字段、补全缺失数据               │
│  提取：标题、播放量、点赞、评论、粉丝数、发布时间│
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 4: 多维度筛选 + 异常检测（代码层）       │
│  ① 播粉比筛选：播放量/粉丝数 > 10 的内容      │
│  ② 互动率筛选：(点赞+评论+收藏)/播放 > 5%    │
│  ③ 时间窗口：7天内发布且增长曲线陡峭          │
│  ④ 低粉爆款：粉丝<5万 且 播放>50万           │
│  ⑤ 热榜交叉：搜索结果标题命中热榜关键词        │
│  ⑥ 竞争度评估：头部KOL占比 vs 素人占比        │
│  输出：筛选后的"信号池"（20-30条高价值内容）    │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 5: 统计分析 + 结构化摘要（代码层）       │
│  ① 赛道热度指标：内容密度、平均播放量、中位互动率│
│  ② 异常信号统计：低粉爆款数量、播粉比分布      │
│  ③ 时间趋势：7天内容发布量变化、互动率变化      │
│  ④ 竞争格局：头部/腰部/素人内容占比           │
│  ⑤ 内容形态分布：视频时长、标题关键词聚类      │
│  输出：结构化的 JSON 统计报告                 │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Phase 6: LLM 确定性分析                      │
│  输入：结构化统计报告 + 筛选后的信号池样本      │
│  任务：基于数据判断，不是基于文字猜测          │
│  输出：确定性机会卡片（附带数据支撑）           │
└─────────────────────────────────────────────┘
```

### 2.3 Phase 1：关键词扩展策略

**现有问题：** 只生成 1-2 个关键词，覆盖面窄。

**新策略：** LLM 生成 4-6 个搜索关键词，分为三类：

| 关键词类型 | 说明 | 示例（用户输入"穿搭"） |
|-----------|------|---------------------|
| 核心词（1个） | 用户输入的原始赛道词 | 穿搭 |
| 细分热词（2-3个） | 赛道内当前可能热门的细分方向 | 通勤穿搭、微胖穿搭、平价穿搭 |
| 内容形态词（1-2个） | 赛道内常见的爆款内容形式 | 穿搭教程、一周穿搭 |

**新的 LLM Prompt 设计：**

```
你是短视频赛道分析专家。用户想分析「{seedTopic}」赛道的爆款机会。
请生成搜索关键词，用于在抖音/小红书上搜索该赛道的内容。

要求：
1. 核心词（1个）：用户输入的原始赛道词
2. 细分热词（2-3个）：该赛道内当前最可能有爆款机会的细分方向
3. 内容形态词（1-2个）：该赛道内常见的高播放内容形式
4. 反向验证词（1-2个）：用于评估竞争度的关键词（如头部账号名、品牌词）

输出 JSON：
{
  "coreKeyword": "穿搭",
  "nicheKeywords": ["通勤穿搭", "微胖穿搭", "平价穿搭"],
  "formatKeywords": ["穿搭教程", "一周穿搭"],
  "competitorKeywords": ["穿搭博主", "穿搭品牌"]
}
```

### 2.4 Phase 2：大规模数据采集策略

**核心改变：搜索量从 20-40 条提升到 100-200 条。**

#### 2.4.1 搜索层（keyword_content_search）

对每个搜索关键词，调用 2-3 页数据：

```typescript
// 新的搜索参数构建
function buildDouyinSearchPayload(keyword: string, page: number) {
  return {
    keyword,
    cursor: page * 20,       // 分页：0, 20, 40
    sort_type: "0",          // 综合排序
    publish_time: "7",       // 7天内
    filter_duration: "0",
    content_type: "0",
    search_id: "",
    backtrace: "",
  };
}

// 对每个关键词搜索 2 页
const SEARCH_PAGES = 2;
```

**预估数据量：**

| 数据源 | 关键词数 | 页数 | 单页条数 | 预估总量 |
|--------|---------|------|---------|---------|
| 核心词搜索 | 1 | 2 | 15-20 | 30-40 |
| 细分热词搜索 | 3 | 2 | 15-20 | 90-120 |
| 内容形态词搜索 | 2 | 1 | 15-20 | 30-40 |
| **搜索小计** | | | | **150-200** |

#### 2.4.2 榜单层（启用被禁用的 billboard API）

启用以下关键榜单 API，获取全站级别的热度信号：

```typescript
const BILLBOARD_APIS = [
  // 低粉爆款榜 — 最核心的素人机会信号
  "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
  // 飙升榜 — 趋势加速信号
  "/api/v1/douyin/billboard/fetch_hot_rise_list",
  // 热搜总榜 — 全站热度
  "/api/v1/douyin/billboard/fetch_hot_total_search_list",
  // 热词榜 — 关键词扩展和验证
  "/api/v1/douyin/billboard/fetch_hot_total_hot_word_list",
];
```

#### 2.4.3 话题层（topic_discovery）

话题搜索从 optional 提升为 required，用于发现赛道内的热门话题标签：

```typescript
// 话题搜索 + 话题推荐
capabilities: {
  required: ["keyword_content_search", "topic_discovery", "hot_seed"],
  optional: ["content_detail", "comments", "user_discovery"],
}
```

#### 2.4.4 级联层（account enrichment + creator_posts）

对搜索结果中播放量最高的 Top 5 账号，级联调用 `creator_posts` 获取其近期作品列表，用于分析该赛道头部内容的发布频率和内容策略：

```typescript
// 级联调用：Top 5 账号的近期作品
const topAccounts = sortedAccounts.slice(0, 5);
const creatorPostsResults = await Promise.allSettled(
  topAccounts.map(acc => fetchCreatorPosts(acc.accountId, acc.platform))
);
```

#### 2.4.5 API 调用预算控制

| 阶段 | API 调用次数 | 说明 |
|------|------------|------|
| 搜索（6 关键词 × 2 页） | 12 | 核心数据源 |
| 榜单（4 个榜单） | 4 | 全站信号 |
| 话题搜索（2 关键词） | 2 | 话题发现 |
| 热榜（1 次） | 1 | 实时热搜 |
| 账号补全（5 个） | 5 | 粉丝数补全 |
| 头部作品（3 个账号） | 3 | 竞争分析 |
| **总计** | **~27** | 可控范围 |

### 2.5 Phase 4：多维度筛选算法

**这是新架构的核心差异点。** 在 LLM 分析之前，用代码完成数据筛选，确保 LLM 看到的都是高价值信号。

#### 2.5.1 异常检测指标

```typescript
interface ContentSignal {
  // 基础数据
  contentId: string;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  authorFollowerCount: number;
  publishedAt: string;

  // 计算指标
  engagementRate: number;    // (like + comment + collect) / view
  viewFanRatio: number;      // view / authorFollower（播粉比）
  interactionDensity: number; // (comment + share) / like（互动深度）
  ageHours: number;          // 发布至今的小时数
  velocityScore: number;     // view / ageHours（增长速度）

  // 信号标签
  isLowFanViral: boolean;    // 低粉爆款：粉丝<5万 且 播放>50万
  isHighEngagement: boolean; // 高互动：互动率 > 5%
  isRapidGrowth: boolean;    // 快速增长：24h内播放>10万
  isHotlistMatch: boolean;   // 命中热榜关键词
}
```

#### 2.5.2 筛选漏斗

```
原始搜索结果（150-200条）
    │
    ▼ 去重（按 contentId）
去重后（100-150条）
    │
    ▼ 基础过滤（播放量 > 1000，有标题）
有效内容（80-120条）
    │
    ▼ 计算所有指标
    │
    ▼ 异常检测筛选（满足以下任一条件）
    │   ├── 播粉比 > 10（内容传播超出粉丝基数）
    │   ├── 互动率 > 5%（用户参与度异常高）
    │   ├── 低粉爆款（粉丝<5万 且 播放>50万）
    │   ├── 快速增长（发布<48h 且 播放>10万）
    │   └── 热榜交叉命中
    │
信号池（20-40条高价值内容）
    │
    ▼ 按 opportunityScore 排序
    │
Top 15 信号 → 喂给 LLM
```

#### 2.5.3 综合评分公式

```typescript
function calculateOpportunityScore(content: ContentSignal): number {
  let score = 0;

  // 播粉比权重 30%
  if (content.viewFanRatio > 100) score += 30;
  else if (content.viewFanRatio > 50) score += 25;
  else if (content.viewFanRatio > 20) score += 20;
  else if (content.viewFanRatio > 10) score += 15;
  else score += 5;

  // 互动率权重 25%
  if (content.engagementRate > 0.10) score += 25;
  else if (content.engagementRate > 0.05) score += 20;
  else if (content.engagementRate > 0.03) score += 15;
  else score += 5;

  // 增长速度权重 20%
  if (content.velocityScore > 10000) score += 20;  // 每小时1万播放
  else if (content.velocityScore > 5000) score += 15;
  else if (content.velocityScore > 1000) score += 10;
  else score += 5;

  // 低粉爆款加成 15%
  if (content.isLowFanViral) score += 15;
  else if (content.authorFollowerCount < 50000) score += 8;

  // 热榜交叉验证 10%
  if (content.isHotlistMatch) score += 10;

  return Math.min(100, score);
}
```

### 2.6 Phase 5：结构化统计分析

**在调用 LLM 之前，用代码生成以下统计报告：**

```typescript
interface TrackAnalyticsReport {
  // 赛道热度
  totalContentCount: number;        // 搜索到的总内容数
  avgViewCount: number;             // 平均播放量
  medianViewCount: number;          // 中位数播放量
  p90ViewCount: number;             // P90 播放量
  avgEngagementRate: number;        // 平均互动率

  // 异常信号
  lowFanViralCount: number;         // 低粉爆款数量
  highEngagementCount: number;      // 高互动内容数量
  rapidGrowthCount: number;         // 快速增长内容数量
  hotlistMatchCount: number;        // 热榜交叉命中数

  // 竞争格局
  headKolRatio: number;             // 头部KOL内容占比
  kocRatio: number;                 // KOC/素人内容占比
  avgAuthorFollowers: number;       // 平均作者粉丝数
  newAuthorRatio: number;           // 新账号（粉丝<1万）占比

  // 内容形态
  avgDuration: number;              // 平均视频时长
  topKeywords: string[];            // 高频标题关键词 Top 10
  topHookTypes: string[];           // 常见钩子类型

  // 时间趋势（7天）
  dailyContentCount: number[];      // 每天发布量 [d-7, d-6, ..., d-1, d0]
  dailyAvgViews: number[];          // 每天平均播放量

  // 信号池摘要
  signalPool: ContentSignal[];      // 筛选后的高价值内容（Top 15）
  signalPoolStats: {
    avgScore: number;
    topScore: number;
    dominantPattern: string;        // 主导模式（如"低粉开箱"、"教程类"）
  };
}
```

### 2.7 Phase 6：LLM 确定性分析 Prompt

**核心改变：给 LLM 提供结构化统计数据，而非原始内容列表。**

```
你是专业的短视频内容趋势分析师。以下是「{seedTopic}」赛道的真实数据分析报告。

【赛道热度概览】
- 7天内搜索到 {totalContentCount} 条相关内容
- 平均播放量 {avgViewCount}，中位数 {medianViewCount}，P90 {p90ViewCount}
- 平均互动率 {avgEngagementRate}%

【异常信号（确定性依据）】
- 低粉爆款：{lowFanViralCount} 条（粉丝<5万，播放>50万）
  典型样本：{lowFanViralSamples}
- 高互动内容：{highEngagementCount} 条（互动率>5%）
- 快速增长：{rapidGrowthCount} 条（48h内播放>10万）
- 热榜交叉命中：{hotlistMatchCount} 条

【竞争格局】
- 头部KOL内容占比：{headKolRatio}%
- KOC/素人内容占比：{kocRatio}%
- 新账号（<1万粉）占比：{newAuthorRatio}%

【内容形态分析】
- 高频标题关键词：{topKeywords}
- 平均视频时长：{avgDuration}秒

【7天趋势】
- 日均发布量变化：{dailyContentCount}（是否在增长？）
- 日均播放量变化：{dailyAvgViews}（是否在加速？）

【高价值信号池 Top 10】
{signalPoolDetails}

【任务】
基于以上结构化数据，给出确定性的爆款机会判断。

判断标准：
1. "确定性高"：低粉爆款≥3条 + 互动率>5%的内容≥5条 + 素人占比>40%
2. "确定性中"：低粉爆款1-2条 + 有热榜交叉命中 + 日均发布量在增长
3. "确定性低"：仅有热度但缺乏素人跑通样本，或头部KOL占比>60%

输出 JSON（同现有格式，但 evidenceSummary 必须引用具体数据）
```

### 2.8 新的能力计划（Task Plan）

```typescript
function getTaskPlan_v2(platform: SupportedPlatform, taskType: WatchTaskType) {
  if (platform === "douyin") {
    return {
      required: [
        "keyword_content_search",   // 多关键词 × 多页搜索
        "topic_discovery",           // 话题发现（从 optional 提升）
        "hot_seed",                  // 热搜榜
      ],
      optional: [
        "billboard_low_fan",         // 新增：低粉爆款榜
        "billboard_rise",            // 新增：飙升榜
        "billboard_hot_word",        // 新增：热词榜
        "content_detail",            // 详情补全
        "comments",                  // 评论分析
        "creator_posts",             // 头部账号作品
        "cookie_enrich",             // Cookie 增强数据
      ],
    };
  }
  // 快手和小红书类似调整...
}
```

---

## 三、API 调用成本与效率优化

### 3.1 并行策略

所有数据采集在 Phase 2 中**完全并行**执行：

```typescript
const [searchResults, billboardResults, topicResults, hotSeedResults] = await Promise.allSettled([
  // 搜索层：所有关键词 × 所有页并行
  Promise.allSettled(allSearchTasks),
  // 榜单层：所有榜单并行
  Promise.allSettled(billboardTasks),
  // 话题层
  Promise.allSettled(topicTasks),
  // 热榜
  fetchHotSeed(platform),
]);
```

### 3.2 缓存策略

| 数据类型 | 缓存时间 | 说明 |
|---------|---------|------|
| 热榜/榜单 | 30 分钟 | 已有缓存机制，保持不变 |
| 搜索结果 | 15 分钟 | 同一关键词短时间内不重复搜索 |
| 账号信息 | 1 小时 | 粉丝数变化慢 |
| 内容详情 | 2 小时 | 播放量持续增长但短期变化小 |

### 3.3 预估 API 成本

| 场景 | 调用次数 | TikHub 费用（约） |
|------|---------|-----------------|
| 单次分析（当前） | 5-8 次 | ~$0.01-0.02 |
| 单次分析（新方案） | 25-30 次 | ~$0.05-0.08 |
| 每日 100 次分析 | 2500-3000 次 | ~$5-8 |

成本增加约 3-4 倍，但数据质量和预测确定性大幅提升。可通过缓存复用降低实际调用量。

---

## 四、数据监控与持续跟踪

### 4.1 分析结果持久化

分析完成后，将结构化结果保存到数据库（而非仅存 localStorage）：

```sql
CREATE TABLE prediction_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userOpenId VARCHAR(128) NOT NULL,
  seedTopic VARCHAR(128) NOT NULL,
  searchKeywords JSON,
  analyticsReport JSON,          -- Phase 5 的统计报告
  signalPool JSON,               -- 筛选后的信号池
  trendOpportunities JSON,       -- LLM 生成的机会卡片
  totalContentScanned INT,
  lowFanViralCount INT,
  overallCertainty ENUM('high', 'medium', 'low'),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (userOpenId),
  INDEX idx_topic (seedTopic),
  INDEX idx_created (createdAt)
);
```

### 4.2 趋势监控（后续迭代）

对用户关注的赛道，定期（每 6 小时）自动重新采集数据，对比变化：

- 新增低粉爆款数量变化
- 日均播放量趋势
- 新入场账号数量
- 热榜命中频率变化

---

## 五、实施路线图

### Phase A：核心重构（优先级最高）

1. **关键词扩展**：修改 `payload-extractor.ts`，LLM 生成 4-6 个分类关键词
2. **多页搜索**：修改 `watch-runtime.ts` 中的 `buildDouyinSearchPayload`，支持分页参数
3. **启用榜单 API**：从 `DEFAULT_DISABLED_ENDPOINTS` 中移除低粉爆款榜、飙升榜、热词榜
4. **筛选算法**：在 `prediction-helpers.ts` 中新增 `filterAndScoreContents` 函数
5. **统计分析**：新增 `buildAnalyticsReport` 函数，在 LLM 调用前生成结构化报告
6. **LLM Prompt 重写**：修改 `live-predictions.ts` 中的趋势分析 prompt

### Phase B：数据持久化

7. **结果保存到数据库**：分析完成后自动写入 `prediction_results` 表
8. **结果页从数据库加载**：`/results/{id}` 从数据库读取，不再依赖 localStorage

### Phase C：体验优化

9. **前端进度展示优化**：展示"已搜索 X 条内容，发现 Y 个异常信号"
10. **信号池可视化**：在结果页展示筛选漏斗和关键指标

---

## 六、总结

| 维度 | 现有方案 | 新方案 |
|------|---------|-------|
| 搜索关键词 | 1-2 个 | 4-6 个（分类） |
| 搜索数据量 | 20-40 条 | 150-200 条 |
| 数据筛选 | 无（按顺序截取） | 多维度异常检测 |
| LLM 输入 | 8 条内容文本摘要 | 结构化统计报告 + 15 条高价值信号 |
| 热榜利用 | 仅计数 | 交叉验证 + 关键词扩展 |
| 榜单数据 | 全部禁用 | 启用低粉爆款榜等 3 个核心榜单 |
| 结果确定性 | LLM 主观判断 | 数据驱动 + LLM 解读 |
| 结果持久化 | localStorage | 数据库 |
| API 调用量 | 5-8 次/分析 | 25-30 次/分析 |

**新架构的核心价值：** 通过"宽搜索 → 严筛选 → 结构化分析 → LLM 确定性判断"的流程，将爆款预测从"LLM 猜测"升级为"数据驱动的确定性判断"。用户看到的每一个机会卡片，都有具体的数据支撑（X 条低粉爆款、Y% 互动率、Z 条热榜命中），而不是 LLM 编造的泛泛之谈。
