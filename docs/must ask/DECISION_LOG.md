# DECISION_LOG.md

> 项目级关键决策一表。**每条决策的"为什么 + 反对意见 + 是否可逆"才是这个文件的核心**——
> 简单"做了什么"在 git log / PR 里就能查到。
>
> 架构层面的、需要 6 个月后还能复盘的决定,**写完整 ADR**(放 `docs/decisions/`),
> 这里只留索引行。

---

## 关键决策记录

| 决策编号 | 决策日期 | 决策主题 | 最终结论 | 备选方案 | 选择原因 | 反对意见 | 影响范围 | 决策人 | 是否可逆 |
|---|---|---|---|---|---|---|---|---|---|
| **D-001** | 2026-04-28 | 默认 LLM 选型 | **Doubao(火山方舟 ARK)** 作为主用 LLM,GPT-5.4 / Claude 4.6 / Apollo 作为可选备份;Forge 作为最终 fallback | OpenAI GPT-4 / GPT-5.4、Claude 4.6、Apollo、本地开源模型 | ① 中文短视频语境贴合度优于 GPT/Claude;② 数据不出境,合规底线;③ 国内调用 P95 时延优于跨境;④ 通过 `llm-gateway.ts` 单点抽象,切模型不影响业务层 | ① 复杂推理(如 `viral-breakdown.structure`)上不如 Claude 4.6,目前用 Apollo 兜底;② 多模态弱于 GPT-4V,视频帧描述也走 Apollo;③ Doubao 模型升级不受我方控制,有过悄悄改行为案例 | LLM 网关层 + 主流程所有 LLM 调用 | 项目 owner | **可逆**——所有调用过 [server/legacy/llm-gateway.ts](../../server/legacy/llm-gateway.ts),改 model 参数即可;但回滚需配套跑 evals 防退化 |
| **D-002** | 2026-04-28 | `server/legacy/` 目录暂不重命名 | **保持 `legacy/` 名字不动**,通过 [README.md](../../README.md) / [CLAUDE.md](../../CLAUDE.md) / [ARCHITECTURE.md](../../ARCHITECTURE.md) 显眼标注"legacy/ 不是 deprecated" | A. 大重命名 `legacy/` → `pipeline/` 一次性 PR;C. 渐进迁移(改某文件时顺带迁) | ① 100+ 文件重命名导致跨 import 巨大冲突;② 改名不解决"主流程和服务层混杂"的根因;③ v1.0 冻结期不做零产品价值清理;④ 文档驱动可低成本兜底 | ① AI 协作者初次接手仍可能误判("看到 legacy 想清理");② IDE 搜索 `legacy` 仍可能误删 | 全 `server/` 主流程入口 | 项目 owner | **可逆**——任何时候提一份 ADR superseded 0002 即可执行重命名 |
| **D-004** | 2026-04-29 | X 平台暂不进入主预测流程 | **不在主预测流程接入 X(Twitter)** | A. X 同抖音 / 小红书 / 快手并列进主流程;B. 完全不接 X | ① 国内创作者用户群基本不依赖 X 内容;② 加进主流程会让 LLM 预算和端到端 SLO 双双吃紧;③ 主流程 LLM 已经 6–8 次,加平台等于加 LLM 调用 | ① 跨境内容迁移机会(Twitter 起势 → 国内平台跟进)被错过 | 主流程 `runLivePrediction` | 项目 owner | **已被 D-005 supersede**(改为 augmenter 旁路) |
| **D-005** | 2026-04-29 | X 平台以 augmenter 旁路注入(默认关) | **新建 `augmenters` 旁路**,X 数据按需注入,**默认关闭**,需 feature flag 开 | A. 维持 D-004 完全不接;B. 直接进主流程 | ① 既保留实验空间又不污染主流程;② 默认关 = 不影响 v1.0 SLO;③ feature flag 可灰度 | ① 多一份代码维护负担;② 旁路接口与主流程数据契约不一致风险 | 数据采集层 + 新增 `augmenters/` 目录 | 项目 owner | **可逆**——撤掉 augmenter 即回到 D-004 状态 |
| **D-006** | 2026-04-28 | v1.0 PRD 冻结 + Won't 清单字面化 | **PRD 冻结至 M1–M5 全部达成**;Won't 清单写进 [PRD-v1.md](../PRD-v1.md) §5 | 不冻结,持续迭代视觉 / UI / 字段 | ① 多轮"用户视觉编辑反馈 v3/v4/v5"导致结果页反复重做;② 需要硬冻结才能让团队精力集中到 P0 阻断和 M1–M5 | ① 用户体感反馈无法即时迭代;② "用户能不能等到 v1.1"决策门槛较保守 | 全产品 | 项目 PM(单点拍板) | **可逆**——v1.0 上线后即解冻 |
| **D-007** | 2026-04-28 | 主流程 LLM 调用优化(合并 + 并行) | ① **Step A + Step B 合并**为 `llmExtractAndClassify` 一次调用(`extractTaskParams` + 意图分类);② **趋势机会 + 选题建议**两次 LLM 调用改为 `Promise.all` **并行执行**(注:**不是合并为 1 次,仍是 2 次独立 callLLM**);整体效果:必发 LLM 从原 4–5 次串行 → **3 次**(extract+intent 合并 1 + trend 并行 1 + topic 并行 1) | 维持各步独立串行调用 | ① 端到端时延接近 30s SLO 上限,无空间;② 合并 extract+intent 同一语义不损失质量;③ trend / topic 并行使墙钟时间 = max(30s, 20s) = 30s,而非 50s 串行 | ① 合并版 token 翻倍,失败时影响面更大;② 需配套跑 evals 验证质量未退化(脚手架在 `evals/topic-suggest/`);③ trend/topic 任一失败会让对应数组为空(降级行为) | [server/legacy/live-predictions.ts:1548 / 1605 / 1650](../../server/legacy/live-predictions.ts) / [server/legacy/payload-extractor.ts:421](../../server/legacy/payload-extractor.ts) | 项目 PM + 技术 | **可逆**——拆回去成本低,但回滚后 SLO 重新告紧 |
| **D-008** | 2026-04-29 | 定价从 `¥99/月` 修正为 Plus ¥19 / Pro ¥49 | 单价以 `server/routers/credits.ts` 为准:Plus ¥19、Pro ¥49 | 维持假占位价 ¥99/月 | ① 真实定价已实现在代码,文档凭直觉用 ¥99 与代码差 4–6 倍;② 单位经济模型估值因此错算 | (无强烈反对——属于纠错) | 商业模型 / [docs/business/产品定位.md](../business/产品定位.md) / [docs/business/指标体系.md](../business/指标体系.md) | 项目 owner | **可逆**——但要回到 ¥99 必须先改代码,再改文档 |
| **D-009** | 2026-04-23 之前 | HTTP 请求层 `requestTimeout` 拉宽到 600s | `server/_core/index.ts` `requestTimeout = 600s` | 维持 Node 默认 60s | ① 主流程 LLM 调用最长 30s,加上 SSE 流式推送和 TikHub,总耗时偶发 60–120s,被 Node 默认掐断;② commit `7514446` "服务端拉宽 requestTimeout 防止长 LLM 调用被掐断" | ① 慢请求堆积时占用更多 socket;② 没有 per-request 预算,极端场景一次请求耗时不可控(已记入 [docs/llm-budget.md](../llm-budget.md) §6 待办) | HTTP 层 + 主预测路径 | 技术 | **可逆**——改 1 个常量即回滚,但回滚后会重新触发 LLM 被掐断的 bug |

---

## 待补充决策(尚未冻结但会影响交付)

下列议题已在团队视野中,但**还没有形式化结论**——撞上时优先决策。

| 议题 | 关键阻塞 | 触发讨论的信号 | 建议形式 |
|------|---------|--------------|---------|
| 🔴 **命中率口径冲突(M5 实现 ≠ KPI #4 业务定义)** | PRD-v1.md **自身第 4 节 vs 第 6 节**已撞车:M5(§4 / L48 / L54)默认按代码 [`computePredictionAccuracy`](../../server/legacy/performance-tracker.ts) 落地(单条内容口径:`accuracy = 100 − \|predictedScore − actualScore\|`,LIMIT 50);但 §6 KPI #4 仍写"赛道点赞中位数 48h 提升 ≥ 30% 的样本占比 ≥ 40%"(赛道维度统计学完全不同的口径)。**M5 已可执行**(代码已实现);**KPI #4 不可判定**(没有"赛道中位数"数据采集) | v1.0 灰度发布前必须收口,否则上线 5 个数第 4 项无法判定 → 触发"5 个数不全 → v1.0 不上线" | **张月光二选一**:① **改 KPI #4 口径**(改 PRD §6 第 4 项为现有算法的阈值 — 例如 `overallAccuracy ≥ 70` 或"accuracy ≥ 80 的样本占比 ≥ 40%");② **补采集 + 报表**(`published_content` 表加"赛道维度"字段、cron 拉每个赛道 48h 中位数、新建 `track_baseline` 表;预估 3–5 工作日,需排进 v1.0 上线前 sprint)。**默认建议**:倾向 ①——②的工作量挤 v1.0 sprint,且"赛道中位数"缺乏明确赛道枚举源(目前赛道是 LLM 抽取的自由文本) |
| **第二数据源调研** | TikHub 单点依赖,无备用源 | 供应商出现 1 次 > 6 小时全停 → 立刻启动 | 写新 ADR(对比候选供应商 / 自建有限范围爬虫) |
| **prompt 级缓存(gateway 层)** | 同 prompt + 相同输入仍打 LLM,浪费成本 | 单次预测成本打点上线后,看是否值得 | 写 ADR(缓存键 / TTL / 失效策略) |
| **独立 worker / 队列拆出** | 长任务挤占 HTTP 请求线程;`runLivePrediction` 是 inline 完成的 | 单服务器 CPU/内存常态 > 70%,或请求堆积告警 | 写 ADR(队列选型 / 进程模型) |
| **多服务器部署 + 共享缓存** | 当前单服务器,本地状态(账号绑定 / 缓存 / 定时任务)无法漂移 | 用户量到 1,000 日活 | 写 ADR(状态外移到 DB / Redis 选型 / 定时任务单服务器化) |
| **用户反馈闭环接回算法** | 用户拍了选题之后好坏,系统不知道——算法学不到真值 | v1.1 解冻后第一优先 | 写 ADR(打点设计 + 离线训练 vs 阈值微调) |
| **个性化模块接入主流程** | 当前 7 维打分**只看赛道,不看个人** | 用户量到一定规模,赛道平均效果稳定后 | 写 ADR(画像数据源 / 个性化层与主流程边界) |
| **AI 输出敏感词 / 合规过滤** | 暂无系统化过滤层,落入 P2 风险([docs/business/风险登记册.md](../business/风险登记册.md)) | 任何一次 AI 输出引发投诉 / 平台问询 | 写 ADR(过滤层位置 / 敏感词词典 / 用户协议同步) |
| **主流程接入 prompt injection 防护** | 用户输入 prompt / URL 直接进 LLM,无防护 | 任何一次明显的 prompt 注入事件 | 写 ADR(白名单字段 / 输入消毒 / 输出截断) |

---

## 决策复核机制

| 维度 | 规则 |
|------|------|
| **复核周期** | 每月一次"团队 review",整张表过一遍;每季度战略层重评等级 |
| **复核负责人** | 项目 PM(单点拍板);技术决策由技术 lead + PM 共同 review |
| **触发复核条件** | ① 任一 P0 风险触发信号出现(详见 [docs/business/风险登记册.md](../business/风险登记册.md));② 任意"待补充决策"的关键阻塞被撞到;③ 已通过决策的"反对意见"实际发生 |
| **超过决策范围的需求** | 走 PRD 决策门槛(见 [SCOPE_LOCK.md](SCOPE_LOCK.md) "决策门槛")或新开 ADR |
| **决策修改方式** | **不就地改已 Accepted 的决策**——写新 ADR + 在表内追加新 D-XXX 行,并把旧行的"是否可逆"列标"被 D-YYY 取代" |

---

## 完整 ADR(架构层面)

| # | 标题 | 状态 | 文件 |
|---|------|------|------|
| 0001 | Doubao 作为默认 LLM | Accepted | [docs/decisions/0001-doubao-as-default-llm.md](../decisions/0001-doubao-as-default-llm.md) |
| 0002 | `server/legacy/` 暂不重命名 | Accepted | [docs/decisions/0002-legacy-naming-not-renamed.md](../decisions/0002-legacy-naming-not-renamed.md) |
| 0004 | X 平台数据源暂不进入主预测流程 | Superseded by 0005 | [docs/decisions/0004-x-platform-not-in-main-flow.md](../decisions/0004-x-platform-not-in-main-flow.md) |
| 0005 | X 平台以 augmenter 旁路注入(动态载入,默认关) | Accepted | [docs/decisions/0005-x-augmenter-bootstrap.md](../decisions/0005-x-augmenter-bootstrap.md) |

---

## 配套阅读

- [SCOPE_LOCK.md](SCOPE_LOCK.md) — v1.0 范围锁定 + 范围变更记录
- [DOMAIN_RULES.md](DOMAIN_RULES.md) — 业务规则与评分口径
- [docs/decisions/](../decisions/) — 完整 ADR
- [docs/business/风险登记册.md](../business/风险登记册.md) — 触发待补充决策的信号源
