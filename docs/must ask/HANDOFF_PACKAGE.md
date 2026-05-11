# 跨会话交接包

> 一份可复制 / 可迭代的"接力棒",给:
> - **新一会话的 AI 协作者**(把当前烧到一半的火接着烧)
> - **新加入的人类开发者**(快速把项目状态装进脑子)
>
> 本文件**当前快照**记录的是 2026-04-29 时的项目状态。
> 接班时,先按"模板"复制一份新交接包,把每段填上当前最新值;不要原地覆盖历史。

---

## 1. 项目一句话定义

**爆款猫(`baokuan-predict-agent`)—— 输入一个赛道关键词、一条对标视频链接,
或一个账号链接,30 秒内给出 3 个今天就能开拍的爆款选题,每个选题都附带具体
对标样本和爆发指数。**

(取自 [docs/PRD-v1.md](../PRD-v1.md) §1)

---

## 2. 当前版本目标

**v1.0**——已冻结(2026-04-28);解冻条件 = M1–M5 全部达成。

| 维度 | 内容 |
|------|------|
| **必须达成 M1–M5** | M1 端到端可用率 ≥95% / M2 稳定输出 3 张选题卡 / M3 相关性 ≥80% / M4 一键生成脚本 / M5 命中率 dashboard |
| **5 个上线前必达数** | 进站可用率 ≥95% / 预测时长 P95 ≤30s / 选题点击转化 ≥30% / 命中率 ≥40% / NPS(20 人) ≥30 |
| **核心闭环** | 输入 → 30 秒内 3 张选题卡 → 选定一张 → 一键生成开拍脚本 / 一键拆解对标样本 |

详见 [PROJECT_BRIEF.md](PROJECT_BRIEF.md) / [docs/PRD-v1.md](../PRD-v1.md)。

---

## 3. 已冻结结论

(详见 [DECISION_LOG.md](DECISION_LOG.md) / [docs/decisions/](../decisions/))

- **D-001** Doubao 是默认 LLM(火山方舟 ARK);所有 LLM 调用走 [server/legacy/llm-gateway.ts](../../server/legacy/llm-gateway.ts)
- **D-002** `server/legacy/` 暂不重命名(主流程在那里,**不是 deprecated**)
- **D-005** X 平台走 augmenter 旁路、默认关(super-sede D-004)
- **D-006** v1.0 PRD 冻结;Won't 清单字面执行(见 [docs/PRD-v1.md](../PRD-v1.md) §5)
- **D-007** 主流程 LLM 优化:Step A+B 合并为 1 次(`llmExtractAndClassify`)+ 趋势/选题改为 `Promise.all` **并行**(仍是 2 次独立 callLLM,**不是合一**);**必发 = 3 次**(extract+intent 1 + trend 1 + topic 1)
- **D-008** 单价是 Plus ¥19 / Pro ¥49(以 [server/routers/credits.ts](../../server/routers/credits.ts) 为准)
- **D-009** Express HTTP `requestTimeout = 600s`(防止长 LLM 被掐断)
- **`AiTopicSuggestion` 字段冻结**:见 [client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts)

---

## 4. 当前正在处理的问题

> **截至 2026-04-29 项目状态快照**(交班时填新值)。

### 🔴 P0 阻断(本周内必须修完,见 [todo.md](../../todo.md))

- **P0-1** 修复 manus.space **502 Bad Gateway**("健身减脂"赛道可复现)
- **P0-2** 修复 manus.space 登录卡在"正在验证登录状态"(cookie 跨域 / 反向代理)
- **P0-3** 修复 `/api` 反向代理未接通 Node 服务,端到端验证分析流程可用
- **P0-4** 修复页面反复刷新(应用代码 / Vite HMR / Manus 网关 WebSocket 代理 区分)

P0 不修完,M1–M5 全部停摆。

### 🟡 v1.0 必须达成(M1–M5)
- 状态:**未达成**(P0 是前置阻断)
- 详见 §11"验收标准"

### 文档状态
- [x] 一页纸 PRD([docs/PRD-v1.md](../PRD-v1.md))
- [ ] 部署与网关运维文档(与 P0-2/P0-3 同步沉淀)
- [ ] 前后端 + LLM 数据契约文档(含 `AiTopicSuggestion` 字段冻结版与版本号机制)

---

## 5. 已完成内容

> **历史 todo 366 行已完成项**收口在 [docs/archive/todo-2026-04-archive.md](../archive/) 内。
> 这里只列**v1.0 冻结后**的关键完成项。

- 主流程 LLM 优化:Step A+B 合并为 1 次(`llmExtractAndClassify`);趋势 / 选题改为 `Promise.all` **并行**(2 次独立 callLLM,墙钟时间 = max(30s, 20s) = 30s)→ 必发 = **3 次**(原串行 4–5 次)
  (代码:[live-predictions.ts:1548 / 1605 / 1650](../../server/legacy/live-predictions.ts);[docs/系统流程图.md](../系统流程图.md) 已同步为代码真值)
- HTTP `requestTimeout` 拉宽到 600s(commit `7514446`,防长 LLM 被掐断)
- 爆款拆解去水印路径用 TikHub 替换第三方 watermark API(commit `5968b0c`)
- 爆款拆解 LLM 调用 + 渲染层修复(commit `aca26d1`)
- 业务文档(`docs/business/`)成稿:产品定位 / 算法白皮书 / 选题漏斗 / 采集策略 / 后台调度 / 指标体系 / 风险登记册
- 决策记录(`docs/decisions/`)0001–0005 写入
- v1.0 PRD 冻结 + Won't 清单字面化
- 价格修正:从假占位 `¥99/月` 改为真实 Plus ¥19 / Pro ¥49(D-008)
- v1.0 冻结清单同步入 [todo.md](../../todo.md)

---

## 6. 未完成内容

按优先级:

### P0(本周内)
- P0-1 / P0-2 / P0-3 / P0-4(见 §4)

### Must(v1.0 上线前)
- M1 / M2 / M3 / M4 / M5(见 §11)
- 部署与网关运维文档
- 前后端 + LLM 数据契约文档(AiTopicSuggestion 版本号机制)
- 关键页面错误监控接入(Sentry 或同类)
- NPS 小样本内测(20 个种子用户)
- v1.0 灰度发布 + 回滚预案

### Won't 的具体动作(砍而不删)
- 隐藏会员 / 积分入口 / 内容日历 / 周度订阅入口
- 移除首页 DashboardInsights / ValueCarousel 残余装饰模块
- 移动端适配从 backlog 撤出

### 可选(v1.0 上线前若有余力)
- 自动评测(`evals/topic-suggest/`)接通豆包基线
- 单次预测成本 + 端到端速度打点

### v1.1 backlog(解冻后再看)
见 [SCOPE_LOCK.md](SCOPE_LOCK.md) §"延后到下一版本"。

---

## 7. 关键业务规则

(节选自 [DOMAIN_RULES.md](DOMAIN_RULES.md);完整版见该文件)

- **端到端 SLO**:P95 ≤ 30 秒;一次预测**恰好 3 条**选题
- **LLM 预算**:典型 6–8 次,最坏 10–12 次,最少 3 次;**所有调用过 [llm-gateway.ts](../../server/legacy/llm-gateway.ts)**
- **关键词扩展**:上限 5 个;数据接口请求最坏 23 次/单次预测
- **候选池**:截 30 条(去重 + 必命中关键词后)
- **语义过滤**:主阈 ≥7/10,降阈 ≥6/10
- **机会分公式**:`需求×0.35 + 黑马×0.25 + 契合×0.20 + (100−竞争)×0.20`(仅 7 维评分链路)
- **爆发指数**:对用户的展示标签;v1.0 主结果页以 `score` / `opportunityScore` 为准,不把 7 维公式当作唯一真值
- **小账号爆款**:粉丝<1万 + 互动进同赛道前 25% + 效率比≥0.5
- **TA 自己平时水平**:用户自己近 3 个月作品的前 25%(**不是绝对值**)
- **打分档位**:≥80 强推 / ≥70 可行 / ≥60 观望 / <60 不展示
- **数据接口缓存**:30 分钟 / 500 条 LRU(进程内,无共享层)
- **后台监控**:≤3 并发 + 10 次/分钟
- **TikHub 余额不足**(`httpStatus=402`):10 分钟全局冷却
- **计费规则**:基础 20 积分/次 + 每多 1 平台 +10 积分;新用户送 60 积分
- **套餐**:Plus ¥19/月 200 积分 / Pro ¥49/月 600 积分

---

## 8. 禁止改变的决策

(节选自 [CLAUDE.md](CLAUDE.md) §项目关键口径)

| # | 决策 | 不允许 |
|---|------|------|
| D-001 | Doubao 是默认 LLM | 不允许默默改默认值;切模型必须新写 ADR |
| D-002 | `server/legacy/` 不重命名 | 不允许改名 / 删文件;命名误导只靠文档兜底 |
| D-005 | X 平台走 augmenter 旁路且默认关 | 不允许在主预测流程内接 X / 视频号 |
| D-006 | v1.0 PRD 冻结 + Won't 清单 | 不允许动 Won't 清单内的功能 / 字段 |
| D-007 | 主流程 LLM 必发 = **3 次**(extract+intent 合并 1 + trend 并行 1 + topic 并行 1) | 不允许在主流程加新 LLM 调用,除非合并 / 替换一个老的 |
| D-009 | HTTP `requestTimeout = 600s` | 不允许默默改回 Node 默认 60s |
| `AiTopicSuggestion` 字段 | 冻结于 [client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts) | v1.0 内不允许加 / 改字段 |

---

## 9. 需要你继续完成的任务

> 接班 AI / 开发者最优先要做的事(交班时填具体任务)。

**当前默认接力顺序**(无具体任务时按这个走):

1. **先看 P0-1**(manus.space 502)——能否在本地或 staging 复现"健身减脂"赛道触发的 502;
   定位是 Node 服务挂了 / 反向代理 502 / LLM 超时层导致——见 [docs/SLA-降级表.md](../SLA-降级表.md) /
   [docs/runbook.md](../runbook.md) 已有的故障应对段。
2. **同步看 P0-3**(`/api` 反向代理)——若 P0-1 根因在反向代理层,这两条是同一件事。
3. **完成 1+3 后看 P0-2 / P0-4**——登录态 + 页面反复刷新通常和 cookie / WebSocket 代理同源。
4. **P0 全部修完后**:
   - 跑 [docs/PRD-v1.md](../PRD-v1.md) M1 / M2 / M3 验收;
   - 接通命中率 dashboard(M5);
   - 上线前的错误监控 / NPS / 灰度。

**不要做**(冻结期内不动):
- [SCOPE_LOCK.md](SCOPE_LOCK.md) §"本版本明确不做"清单内的任何项
- 任何"用户视觉编辑反馈 v4 / v5 / v6"
- 加新 LLM 调用到主流程

---

## 10. 输出格式要求

每次完成任务必须输出(参照 [CLAUDE.md](CLAUDE.md) §完成后必须汇报):

```markdown
## 变更摘要
- 修改文件:<file:line> — <一句话>
- 业务影响:<用户能看到的变化>

## 验收
- [x] M1 / M3 / 用户故事 X 项
- [x] `pnpm check` 通过
- [x] `pnpm test` 通过(N 个测试,无新增红色)
- [ ] 主流程手动 e2e:[做了/未做+原因]
- [ ] evals:[跑了/未跑+原因]

## 未完成
- ...

## 风险 / 待确认
- 风险:...
- 待确认:...
- 建议补充:...
```

PR 描述要回答"为什么改 + 测了什么",而不只是"改了什么"——diff 已经告诉别人改了什么
(见 [CONTRIBUTING.md](../../CONTRIBUTING.md) §3)。

---

## 11. 验收标准

(取自 [docs/PRD-v1.md](../PRD-v1.md) §4 / §6)

### M1–M5(上线必须)

| # | 项 | 验收 |
|---|---|------|
| M1 | 服务端到端可用 | manus.space 域名下,新用户从打开到拿到结果页 < 60s,无 502 / 不刷新 / 不卡登录 |
| M2 | 3 张选题卡片 | 每次预测稳定输出 ≥ 3 张,字段齐全(标题 / 切入角度 / 爆发指数 / 对标样本 / 核心标签) |
| M3 | 数据相关性 ≥ 80% | LLM 语义过滤后,按默认验收草案抽样 50 条选题卡;相关率 ≥ 80%(见 [DOMAIN_RULES.md](DOMAIN_RULES.md) §4.2) |
| M4 | 一键生成脚本 | 点击"生成开拍脚本"必须跳到脚本编辑器并预填该选题上下文 |
| M5 | 命中率可观测 | 默认复用内部受保护查询 / 后台页,能查看"预测分 vs 48h 后真实表现"的最近样本与命中率 |

### 5 个数(任意一个不达标 → v1.0 不上线)

1. 进站可用率 ≥ 95%
2. 预测时长 P95 ≤ 30 秒
3. 选题点击转化 ≥ 30%
4. 预测命中率 ≥ 40%(48h 后赛道点赞中位数提升 ≥ 30% 的样本占比)
5. NPS(20 人小样本) ≥ 30

### 任务级 Done Definition

(取自 [AGENTS.md](AGENTS.md) §Done Definition)

1. 功能按验收标准完成
2. `pnpm check` 过 + `pnpm test` 不增红 + 主流程手动 e2e
3. 无明显安全 / 隐私 / 合规风险
4. 不破坏既有功能和已冻结业务规则
5. 更新必要文档(改了价格 / 阈值 / 容量 / 时长 / prompt / 模型 → 同步改对应文档)
6. 输出变更摘要、测试结果和剩余风险

---

## 12. 相关文件路径

> 接手新任务时**至少读这些**——按"先文档对齐,再看代码"顺序。

### 文档(must ask 上下文资产)

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目最高优先级
- [SCOPE_LOCK.md](SCOPE_LOCK.md) — v1.0 范围 + Won't 清单
- [DECISION_LOG.md](DECISION_LOG.md) — 决策一表
- [DOMAIN_RULES.md](DOMAIN_RULES.md) — 业务规则与评分口径
- [USER_STORIES.md](USER_STORIES.md) — 用户故事 + 主链路验收
- [CLAUDE.md](CLAUDE.md) — AI 协作工作原则
- [AGENTS.md](AGENTS.md) — 驾驶舱仪表盘

### 文档(项目层)

- [README.md](../../README.md) / [CLAUDE.md](../../CLAUDE.md) / [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/PRD-v1.md](../PRD-v1.md) — 一页纸 PRD(冻结版)
- [docs/系统流程图.md](../系统流程图.md) — 主流程时序
- [docs/SLA-降级表.md](../SLA-降级表.md) — 外部依赖故障行为
- [docs/llm-budget.md](../llm-budget.md) — LLM 调用预算 + 超时矩阵
- [docs/prompts.md](../prompts.md) — 19 条 prompt 索引
- [docs/api.md](../api.md) — tRPC + REST 路由清单(52 个 tRPC endpoint + 3 个 legacy REST path)
- [docs/runbook.md](../runbook.md) — 故障应急 8 段
- [docs/deployment.md](../deployment.md) — 部署 / 网关 / 多服务器瓶颈
- [docs/testing.md](../testing.md) — 测试约定与 fixture
- [docs/business/](../business/) — 7 份业务文档(产品定位 / 算法白皮书 / 选题漏斗 / 采集策略 / 后台调度 / 指标体系 / 风险登记册)
- [docs/decisions/](../decisions/) — ADR 0001–0005

### 代码核心入口

- 主预测流程:[server/legacy/live-predictions.ts](../../server/legacy/live-predictions.ts) `runLivePrediction`
- LLM 网关(唯一出口):[server/legacy/llm-gateway.ts](../../server/legacy/llm-gateway.ts)
- HTTP 入口:[server/_core/index.ts](../../server/_core/index.ts)
- Legacy REST 路由:[server/legacy/routes/prediction-routes.ts](../../server/legacy/routes/prediction-routes.ts)
- tRPC 路由(7 领域 router + auth/system):[server/routers/](../../server/routers/) + [server/routers.ts](../../server/routers.ts)
- 算法核心:
  - [server/legacy/ai-scoring-engine.ts](../../server/legacy/ai-scoring-engine.ts) — 7 维打分(注:**仅 trend-api 用,不在主预测路径**)
  - [server/legacy/low-follower-algorithm.ts](../../server/legacy/low-follower-algorithm.ts) — 小账号爆款判定
  - [server/legacy/semantic-filter.ts](../../server/legacy/semantic-filter.ts) — 语义过滤
- 数据源:[server/legacy/tikhub.ts](../../server/legacy/tikhub.ts)
- 前端类型冻结源:[client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts) `AiTopicSuggestion`
- DB schema:[drizzle/schema.ts](../../drizzle/schema.ts)
- 套餐 / 积分包真值:[server/routers/credits.ts](../../server/routers/credits.ts)

---

## 13. 测试结果 / 运行结果

> **2026-04-29 快照**(交班时填新值)。

| 测试 / 检查 | 结果 |
|------------|------|
| `pnpm check`(类型) | 【待确认:本次会话未实际运行;最近一次提交 `68c99b2` 通过 git hooks】 |
| `pnpm test`(51 个 vitest 单测) | 【待确认:本次会话未实际运行】 |
| 主流程手动 e2e | ❌ 受 P0 阻断,manus.space 上"健身减脂"赛道触发 502 |
| evals(`evals/topic-suggest/`) | 🔴 脚手架就位,**未跑通基线**——见 [evals/README.md](../../evals/README.md) |
| 真实 LLM 调用次数打点 | 🔴 未实施(已记入 [docs/llm-budget.md](../llm-budget.md) §6 待办) |
| 真实单次预测成本打点 | 🔴 未实施(已记入 [docs/business/指标体系.md](../business/指标体系.md) §当前打点缺口 P0) |

---

## 14. 待确认问题

> 接班时把这些问题主动澄清(向 PM / 项目 owner)。

### 业务 / 产品

- [ ] 🔴 **命中率口径冲突(M5 vs KPI #4)** — **张月光必拍 / v1.0 灰度前必收口**:PRD §4 M5 已默认按代码 `computePredictionAccuracy`(predictedScore vs actualScore 单条比较)落地,**可执行**;但 PRD §6 KPI #4 仍写"赛道点赞中位数 48h 提升 ≥ 30% 的样本占比 ≥ 40%",**不可判定**(没数据源)。两个选项:① 改 KPI #4 与现有算法对齐(默认建议)/ ② 补赛道中位数采集 3–5 天工作量。详见 [DOMAIN_RULES.md](DOMAIN_RULES.md) §3.7 / [DECISION_LOG.md](DECISION_LOG.md) §待补充决策第一行
- [ ] **P0-1 502 的根因**:是 Node 服务挂(资源不足 / 异常崩溃) / 是反向代理 502 / 是 LLM 超时层透到客户端?——决定接下来怎么修
- [ ] **M5 呈现形态**:默认先复用受保护内部查询 / 后台页;是否额外做独立 admin 页,由 PM 再拍板
- [ ] **NPS 内测的 20 个种子用户来源**:从哪个渠道招募?

### 技术 / 算法

- [ ] **`evals/topic-suggest/` 接通豆包基线**:基线样本集是否已经落库?baseline 成绩怎么定?
- [ ] **多样性硬约束**:[docs/business/指标体系.md](../business/指标体系.md) §效果指标列了"多样性分 ≥ 0.7"——什么时候开始打点?
- [ ] **prompt 级缓存**:加不加?TTL?(已记入 [DECISION_LOG.md](DECISION_LOG.md) §待补充决策)
- [ ] **多服务器部署时机**:目前单服务器,什么时候做状态外移?(待 1,000 日活)

### 流程 / 文档

- [ ] **生产环境日志保留期 / 归档策略**:代码层未见明确规则——【建议补充】
- [ ] **AI 输出敏感词词典**:目前无,P2 风险撞上时由 PM + 法务定
- [ ] **prompt injection 防护层**:用户输入直接进 LLM,无防护——撞上时新 ADR

---

## 配套阅读

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
- [SCOPE_LOCK.md](SCOPE_LOCK.md)
- [DECISION_LOG.md](DECISION_LOG.md)
- [DOMAIN_RULES.md](DOMAIN_RULES.md)
- [USER_STORIES.md](USER_STORIES.md)
- [CLAUDE.md](CLAUDE.md)
- [AGENTS.md](AGENTS.md)
- [todo.md](../../todo.md)
