# ADR-0007: 低粉爆款库 billboard 双管线 + LLM 预检查门槛

- **状态**:Accepted
- **创建**:2026-04-30
- **拍板**:2026-04-30(项目 PM)
- **配套**:[ADR-0006](0006-low-follower-library-target-alignment.md)、[low-follower-algorithm.ts](../../server/legacy/low-follower-algorithm.ts)、[seed-from-tikhub.ts](../../server/scripts/seed-from-tikhub.ts)
- **关系**:**扩展** ADR-0006(不替代),并**部分推翻** ADR-0006 §候选方案 D「换数据源不在本 ADR 讨论」的边界

---

## 背景

### 1) 现状(2026-04-30)
- ADR-0006 已确定低粉库内容质量根因(见 §3 三层根因),并给出 Step A(展示层过滤)+ Step C(算法定义变更/原 seed_topic 路打标提前)的解。
- 但 ADR-0006 §候选方案 D 把"换样本来源"明确**踢出讨论范围**(代价大、与 seed_topic 耦合深)。
- **新事实**:`fetch_hot_total_low_fan_list`(抖音官方"低粉爆款榜")**已在 4 月被验证可用**([todo-2026-04-archive.md:153](../archive/todo-2026-04-archive.md:153)),且 [seed-from-tikhub.ts:29](../../server/scripts/seed-from-tikhub.ts:29) 已经在一次性 seed 时调用——**只是没接入定时入库管线**。
- 现状缺失:
  1. 不是定时拉取(只在 seed 脚本里调一次)
  2. **不分行业**(`tags` 参数没传,只能拿全站默认排序)
  3. 没有 LLM 预检查门槛(直接入库或丢弃,缺中间过滤层)
  4. 入库后**没有 source 字段标识来源**(无法和 seed_topic 路区分)

### 2) PM 决策升级
PM 在 2026-04-30 拍板:把官方榜接入**作为新的入库管线**(管线 B),与 seed_topic 检索(管线 A,由 ADR-0006 §Step C 继续修缮)**双轨并存**。

### 3) 与 ADR-0006 的边界
| 维度 | 管线 A(seed_topic) | 管线 B(billboard,本 ADR) |
|---|---|---|
| 数据源 | 用户输入种子词 → TikHub 检索 | `fetch_hot_total_low_fan_list` 按行业拉 |
| 入库门槛 | ADR-0006 §Step C.2 完整打标(`newbie_friendly ≥ 70` + 赛道判定 + 白名单交集) | **本 ADR**:LLM 预检查(标题+tags+类目 → `is_target_audience`) |
| 后续打标 | (含在入库门槛里) | 入库后异步走 ADR-0006 §Step C 同一套打标管线(保持下游消费一致) |
| 反映什么 | 实际用户在产品里输入的赛道(需求侧) | 全网当前低粉爆款的全貌(供给侧) |
| 调度 | 用户预测请求触发(实时) | **本 ADR**:每天 1 次(批) |

---

## 决定

新增"低粉库 billboard 入库管线"(管线 B),实施 7 步:

### Step 1 — 类目树 seed(每天刷新)
- 每天调一次 `mcp__tikhub-douyin__douyin_billboard_fetch_hot_category_list`(走 server 端的 REST 等价接口,**不走 MCP**——见 CLAUDE.md MCP 章节"不该用"原则)。
- 写入新表 `douyin_billboard_categories`(字段:`top_id`, `top_name`, `sub_id`, `sub_name`, `synced_at`)。
- **行业范围 = 全量类目**(PM 已拍,不预设硬编码黑名单)。后续如发现某类目持续噪音,由 LLM 预检查兜底,不靠运营维护黑名单。

### Step 2 — billboard 按行业批拉
- 对每个 `top_id`,按 `tags={"value":"<top_id>","children":[]}` 调 `POST /api/v1/douyin/billboard/fetch_hot_total_low_fan_list`,`date_window=2`(按天),`page_size=20`。
- **页数策略(分阶段)**:
  - **初始阶段(本 ADR 落地起)**:每类目 **1 页/天**(20 条),用最小流量验证管线 + LLM 预检查通过率。
  - **正常运营**:**每类目拉到接口最大上限**(实测确认上限——TikHub 文档没明示,实施时 `page=1..K` 直到接口返回空 / `has_more=false`,记下 K 作为常态值)。**切换条件**:连续 3 天 LLM 预检查通过率稳定在 ≥ 报警线(见 §Step 3 / G 项)且无类目级异常。
- **不**给 `children` 传子级——避免数据稀疏。子类目用入库后字段 `industry_sub` 反向追溯(LLM 预检查可顺手判)。
- 在 [tikhub.ts](../../server/legacy/tikhub.ts) 新增 `postTikHub<T>(endpoint, body)` helper(当前只有 `getTikHub`),支持 POST + 同样的超时/重试/审计入库。
- billboard 调用**不入** [tikhub.ts:151](../../server/legacy/tikhub.ts:151) 的可缓存白名单——按天数据每天都要新鲜,不能跨天命中缓存。

### Step 3 — LLM 预检查(入库门槛)
- 在 [llm-gateway.ts](../../server/legacy/llm-gateway.ts) 之上,新建 `server/services/low-follower-billboard-prefilter.ts`。
- **批处理:每批 10 条**。
- **关闭思考(thinking)模式**(硬约束):预检查是简单的二分类判定,**不需要 reasoning**。Doubao thinking 会显著增加时延和成本——调用 [llm-gateway.ts](../../server/legacy/llm-gateway.ts) 时显式 `thinking: { type: "disabled" }` 或对应等价参数。如果 gateway 当前不支持,实施时一并扩参数。
- **输入**:`[{title, tags[], industry_top, industry_sub_guess}]` 数组。
- **输出**:`[{platform_id, is_target_audience: bool, reason: string ≤ 30 字, industry_sub_refined: string}]`,严格 JSON schema 校验,失败重试 1 次后丢弃整批。
- **prompt 核心约束**:
  > 目标用户 = 抖音/小红书中腰部自媒体创作者(粉丝 1k–50k),想要"今天就能开拍"的可复刻选题。
  > 标记 `is_target_audience=true` 必须满足:**该选题对目标用户来说有学习/复刻价值**,而不是"目标用户可能爱看"。
  > 排除:纯娱乐/猎奇/吃瓜/IP 周边/纯萌宠/明星八卦/暗网重口/纯搞笑段子。
- **入库规则**:`is_target_audience=true` 才入库,`source='billboard'`,`reason` 写入 `prefilter_reason` 字段(留回看)。
- **入库后 enrichment**:沿用 ADR-0006 §Step C 的 [low-follower-tagger.ts](../../server/legacy/low-follower-tagger.ts) 异步打标,补 `newbie_friendly`/`track_tags`/`burst_reasons`——**保证管线 A/B 进库后的字段口径一致**。

### Step 4 — schema 扩展
[low_follower_samples](../../drizzle) 增加字段:
| 字段 | 类型 | 说明 |
|---|---|---|
| `source` | ENUM('seed_topic','billboard') NOT NULL DEFAULT 'seed_topic' | 入库管线来源 |
| `industry_top` | VARCHAR(64) NULL | billboard 顶级类目名 |
| `industry_sub` | VARCHAR(64) NULL | billboard 子级类目(LLM 精化) |
| `prefilter_reason` | TEXT NULL | LLM 预检查理由(管线 B 才有) |

### Step 5 — 历史 116 条处理
- 按 ADR-0006 §Step C.5 统一标 `viral_score_trend = 'expired'`(**不物理删除**,PM 已确认)。
- 保留 `expired` 行,future-proof:如果发现 LLM 预检查太严杀掉了好样本,可以从 expired 池回捞。

### Step 6 — 调度
- 新建 `server/scripts/run-billboard-pipeline.ts`(沿用 [scripts](../../server/scripts) 命名风格)。
- **频率:每天 1 次,上午 08:00**(与 `date_window=2` 按天对齐;PM 选 08:00 而非凌晨,便于人工早晨观测当天结果)。
- **触发方式:系统 cron + tsx**——最简,部署期再视情况切 k8s CronJob。crontab 行示例:
  ```
  0 8 * * *  cd /path/to/repo && pnpm tsx server/scripts/run-billboard-pipeline.ts >> /var/log/lf-billboard.log 2>&1
  ```

### Step 7 — LLM 预算登记
在 [docs/llm-budget.md](../llm-budget.md) 新增"低粉链路 LLM 调用"小节:

| 调用源 | 频次 | 触发 | 是否在主链路预算内? |
|---|---|---|---|
| 管线 A 入库打标(ADR-0006 §Step C) | 每条样本 1 次(批 5 条) | 实时 | ❌ 不在 |
| 管线 A 赛道判定(ADR-0006 §Step A) | 每个唯一 seed_topic 1 次,缓存 | 实时,长尾 | ❌ 不在 |
| **管线 B 预检查(本 ADR)** | 初始阶段 **60 类目 × 1 页 × 20 / 10 = 120 次/天**;正常阶段视接口上限,估 360–600 次/天。**关闭 thinking 节省成本/时延** | 每天批 | ❌ 不在 |
| 管线 B 入库后打标 | 每条入库样本 1 次(批 5 条) | 异步,每天批 | ❌ 不在 |

**主预测链路 6–8 次/请求 的预算不变**——本 ADR 所有 LLM 调用都在入库链路、批处理、与请求异步,不会推高 P95 时延。

---

## 理由

1. **为什么走 billboard 不只修缮 seed_topic**:抖音官方榜已经做了一轮"低粉 + 高互动 + 类目锚定"的筛选,**质量基线天然高于 seed_topic 检索**(后者是 ADR-0006 §3 列出的噪音根源)。补一条管线 B 比把管线 A 修到完美更经济。
2. **为什么管线 A 不下线**:seed_topic 反映**实际用户输入的赛道**(产品有什么用户,库就服务什么赛道),管线 B 反映**全网当前热门**——两者互补,不冗余。下线 A 会丢"用户兴趣→样本"的反馈环。
3. **为什么 billboard 也要 LLM 预检查**:官方榜按"低粉+互动"算的,**不保证可复刻**——数码、生活、汽车类目下都能混进搞笑/猎奇视频。LLM 是兜底,不是冗余。
4. **为什么不预设黑名单**:CLAUDE.md §3「能合并/缓存/规则替代就别加 LLM」的反向论证——**这里 LLM 判定的成本(≈0.3 USD/天)远低于运营人工维护类目黑名单的成本**,且更鲁棒(类目漂移时 LLM 自适应)。
5. **为什么批处理 10 条**:管线 B 每天估 ~3600 条,单条/调一次 = 3600 次 LLM/天 = 不可接受;批 10 = 360 次/天,主流上下文足够装下 10 条标题+tags+类目而不掉精度。
6. **为什么不删历史 116 条**:呼应 ADR-0006 §Step C.5——保留 expired 池,留算法回滚的逃生口。物理 DELETE 不可逆。
7. **为什么不在 ADR-0006 上修补,要新写 ADR-0007**:ADR-0006 §候选方案 D 明确"换样本来源不在本 ADR 讨论",且 ADR 一旦 Accepted **不应改写**(README §写作风格)——新决定就开新 ADR,本 ADR 显式声明扩展关系。

---

## 后果

### 好处
- 库样本质量基线大幅提升(官方榜 + LLM 兜底)。
- **行业覆盖均衡**——不再被 seed_topic 长尾(ADR-0006 §1 实测的「全网热门 16 / 娜塔莎 3 / 猎奇 / 轻松熊」)主导。
- 双管线互补:A = 需求侧、B = 供给侧。
- 下游消费透明:管线 B 入库后走相同打标管线,`low_follower_samples` 表结构稳定,topic-strategy / tRPC 查询路径**零改动**。
- ADR-0006 §代价节"样本量大幅下降→频繁触发降级文案"的风险**显著缓解**——管线 B 预计每天 ≥ 100 条进库(预检查通过率假设 30%)。

### 代价/已知风险
- **LLM 预算新增**:管线 B 入库链路 ~ 360+ 次/天 LLM 调用,~0.3 USD/天(Doubao);**不在主链路 6–8 次预算内**,但要登记 [docs/llm-budget.md](../llm-budget.md)。
- **TikHub API 预算**:类目树 1 次/天 + 60 类目 × 3 页 = 181 次/天 × 0.001 USD = ~0.18 USD/天。可接受。
- **LLM 预检查可能太严**:第一次跑预计通过率低于直觉。需观察 1 周,看是否要调 prompt 或放宽。回看靠 `prefilter_reason` 字段。
- **类目树漂移**:抖音可能调整类目;每天 seed 一次兜底,但**新增类目当天数据可能为 0**(LLM 预检查无历史 prompt 校准)。可接受。
- **管线 A 的赛道白名单机制(ADR-0006 §Step C.2)在管线 B 不适用**——管线 B 用类目筛代替了"用户输入种子词联动"的赛道白名单。这个差异要在打标管线代码里显式处理(否则 ADR-0006 §Step C 的入库判定会把所有 billboard 样本拒掉)。
- **scripts 目录已经 22+ 个**(根据 commit 68c99b2),再加 `run-billboard-pipeline.ts` 会更挤——后续可能要分子目录(本 ADR 不处理,留给下一次重构)。

### 需要联动改的文档
- [docs/llm-budget.md](../llm-budget.md):本 ADR §Step 7 表格落地
- [docs/PRD-v1.md](../PRD-v1.md):§8 补一条"低粉库走双管线,源标识 = source 字段"
- [docs/系统流程图.md](../系统流程图.md):新增"管线 B"节点(每天定时,与主链路异步)
- [docs/爆款预测系统技术说明文档.md](../爆款预测系统技术说明文档.md):算法章节同步
- [CLAUDE.md](../../CLAUDE.md) §3:LLM 调用次数说明刷新(增"入库链路"分类)
- [evals/README.md](../../evals/README.md):管线 B 单独评测维度

---

## PM 校准结果(2026-04-30 已拍板)

| # | 项 | 决定 |
|---|---|---|
| A | 单类目拉几页 | **初始 1 页/天;稳定后拉到接口最大上限** |
| B | LLM 预检查批大小 | **10 条/批** |
| B+| LLM thinking 模式 | **关闭** |
| C | 调度频率 + 时间 | **每天 1 次,上午 08:00** |
| D | 调度触发方式 | **系统 cron + tsx** |
| E | 历史 116 条是否走预检查回捞 | **否,全部直接 expired** |
| F | 管线 A 是否暂时下线让 B 单跑观察 | **并存,各自打 source 标记** |
| G | 预检查通过率报警阈值 | **< 10% 报警**(通常说明 prompt 或类目漂移) |

---

## 实施 Changelog(2026-04-30 当天落地实测)

落地时与 ADR 原稿有 **3 处现实偏差**,已在代码 / 文档里反映,未来读 ADR 的人请以本节为准:

1. **`fetch_hot_total_low_fan_list` 不支持 `tags` 参数**——所有结构(integer/string/array of {value,children})实测都返回 `data.code=5 "参数不合法"`。
   - **后果**:管线 B 降级为"**全网拉,不分行业**",LLM 预检查兜底;`industry_top` 字段本次填 NULL。
   - 类目 seed 脚本([seed-billboard-categories.ts](../../server/scripts/seed-billboard-categories.ts))和 `douyin_billboard_categories` 表保留但不用,作为未来 TikHub 增强 tags 支持时的探针。
   - PM 校准 §A "拉满接口最大上限" 含义改为:翻页直到 `objs` 空或不满 page_size。
2. **`date_window` 不是"1=按小时 2=按天",而是预定义枚举(实测可用值:24=近 1 天、168=近 7 天)**——用户原始引用的 TikHub 文档与现实不符。
   - **后果**:本管线用 `date_window=24`(近 24 小时,语义最接近 PM "按天"原意)。
3. **Doubao endpoint 不支持 `response_format`(任何 type:`json_schema` / `json_object` 都拒)**——只能靠 prompt 强约束 + 解析容错(剥 markdown 围栏 / 截首尾大括号)。
   - **后果**:[low-follower-billboard-prefilter.ts](../../server/services/low-follower-billboard-prefilter.ts) 不传 responseFormat,prompt 里写明"必须是单个 JSON 对象,不要 markdown 围栏"。

**首跑实测**(2026-04-30 10:05):
- 拉 16 条候选,LLM 预检查通过 **2 条 (12.5%)**——略高于 10% 报警线,样本质量看 `prefilter_reason` 都是"可复刻角度"型,符合预期。
- LLM 成本 2 批 ≈ $0.00035,远低于 ADR §LLM 预算估算的 $0.04/天(因 Doubao 输入便宜)。
- 116 条历史样本全部标 `expired`,新表结构 `source` 字段把双管线物理隔离。

### 当天 review + 4 项追加修复(2026-04-30 10:30-10:40)

PM 在 [http://localhost:3000/low-follower-opportunities](http://localhost:3000/low-follower-opportunities) review 发现「页面里还有猎奇」,定位到 **3 处遗漏**和 **1 项决议反转**:

1. **router 漏过滤 expired** — ADR-0006 §Step C.5 标 expired 后,[low-follower.ts:91](../../server/routers/low-follower.ts:91) 的查询条件没排 expired,导致 115 条历史"猎奇/IP/吃瓜"样本仍在前端展示。**修复**:WHERE 加 `viral_score_trend != 'expired'`(默认隐藏 expired,不影响 SELECT * BY ID 的回看路径)。

2. **router 硬过滤 `comment > 0 AND collect > 0` 漏 billboard** — billboard 接口 payload 实测**不返 comment_cnt / collect_cnt**(只有 like / play / fans),导致 billboard 入库样本被该硬过滤全删。**修复**:WHERE 加 `(source = 'billboard' OR ...)`,语义:LLM 预检查已替代了"低质素材过滤"的目的。

3. **forge API key 401**(预存问题,本 ADR 无关)— `low-follower-tagger.ts` 默认走 forge 模型,实测 401。tagger 有规则降级机制(`tagSampleByRules`),所以打标"成功"但是用关键词规则版而非 LLM 版。**留给后续单独修**(切换 tagger 模型到 doubao,与 prefilter 一致)。

4. **PM 反转 ADR-0006 §Step C.5「不删只标 expired」决议** — PM 在 review 时下达"清除所有不合规样本",改为**物理 DELETE**。理由:这些样本业务上不再使用,留着增加表体积 + DB 备份成本。新建 [delete-expired-samples.ts](../../server/scripts/delete-expired-samples.ts),同步删 `low_follower_score_history` 孤儿。**不可逆,且推翻先前 ADR**——以本节为准。

**二次 backfill 实测**(2026-04-30 10:37,DELETE 后跑 7 天榜):
- `--date-window=168` 拉 19 条候选,LLM 预检查通过 **5 条 (26.3%)**——比 24h 榜的 12.5% 高,因 7 天累积爆款样本更多更精。
- 新建 `--date-window=N` CLI 参数支持 backfill,**默认仍是 24**(cron 日常用)。
- 最终库 7 条 billboard / new 全部对齐 PRD 目标人群:美食创意吃法、校园生活记录、情侣拍照、闺蜜日常、人群街访、生活观点、美食摆盘。

### 三次追加修复(2026-04-30 10:50,review 数据细节后)

PM 检查 7 条入库数据时发现 **2 个数据完整性问题**,触发 3 项追加改动:

5. **tagger 从 forge 切到 doubao**(`low-follower-tagger.ts`)— 解决前面 §4 提到的 forge 401 → 规则降级问题。Doubao endpoint 不支持 `response_format`,改成纯 prompt + 解析容错(复用 prefilter 的 `stripJsonFences`)。**质量验证**:7 条样本的 `suggestion` 全部不重复且可执行(规则版只有 4 条固定模板),`content_form` 多样(图文/口播/竖屏混合),`newbie_friendly` 75-95 符合"低粉可复刻"目标。

6. **billboard 接口不返 comment / collect / share** — billboard payload 实测只有 `like_cnt / play_cnt / fans_cnt / follow_cnt`,导致入库样本这三个统计字段全是 0,前端显示"互动 0"。**修复**:新建 [backfill-billboard-stats.ts](../../server/scripts/backfill-billboard-stats.ts),用 `fetch_one_video_v2` 按 `video_id` 拉真实 `aweme_detail.statistics`,UPDATE `video_likes/comments/collects/shares/views + weighted_interaction`(后者按 like + comment×3 + collect×2 + share×4 现算)。**调用预算**:每条样本 1 次 TikHub ≈ $0.001,7 条 ≈ $0.007。

7. **管线时序固化**:`pipeline → backfill-stats → tagger` 三步串行(backfill 必须在 tagger 之前,因为 tagger 输入用到 commentCount/saveCount,数据真实化对打标质量直接影响)。本顺序也写入 cron 部署文档。

**关于 router 的 `(source='billboard' OR ...)` 绕过 hack**(§4 §2):**保留**。理由:入库 → backfill 是 2 步,中间有时间差;backfill 可能因 TikHub API 错或 video_id 失效失败。保留 OR 让未补到的 billboard 样本也能展示——LLM prefilter 已保证语义干净,interaction 数缺失的展示问题相对小。

---

## 相关
- [ADR-0006](0006-low-follower-library-target-alignment.md)(本 ADR 的前置)
- [PRD-v1.md §2 目标用户](../PRD-v1.md)
- [low-follower-algorithm.ts](../../server/legacy/low-follower-algorithm.ts)
- [seed-from-tikhub.ts](../../server/scripts/seed-from-tikhub.ts)(将被升级为 `run-billboard-pipeline.ts`)
- [tikhub.ts](../../server/legacy/tikhub.ts)(需新增 POST helper)
- [docs/agent-architecture-redesign.md:59](../agent-architecture-redesign.md:59)(早期对 billboard 的规划)
