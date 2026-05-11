# CLAUDE.md(must ask 上下文版)

> 注意区分:
> - 仓库**根目录**的 [CLAUDE.md](../../CLAUDE.md) 是给 Claude Code / Cursor 等 AI 协作者
>   "30 秒上手 + 4 条隐性知识"的导览。
> - **本文件**是 must ask 协议下的上下文优先级 + 输出要求 + 项目关键口径——
>   每会话开工前应先复述这一份的"项目关键口径",再开始执行。
>
> 两份不冲突:根目录那份偏"踩坑提醒",本份偏"协作流程契约"。

---

## 工作原则

**先读上下文 → 计划 → 执行**。

- 遇到业务规则不明确时,**列出假设**,不要自行决定。
- 执行前给出计划,执行后给出变更摘要和测试结果。
- 文档驱动对齐优先于直接改代码——问题"越做越重"时,先用文档拉齐再决定动不动代码
  (这是 [docs/business/](../business/) 整目录的存在理由)。

---

## 上下文优先级

按优先级**从高到低**(冲突时高优先级覆盖低优先级):

1. **[SCOPE_LOCK.md](SCOPE_LOCK.md)** — v1.0 范围锁定 + Won't 清单(冻结期内字面执行)
2. **[DECISION_LOG.md](DECISION_LOG.md)** — 项目级决策一表 + ADR 索引(D-001 到 D-009)
3. **[DOMAIN_RULES.md](DOMAIN_RULES.md)** — 业务术语 / 评分口径 / 真值与反例
4. **[PROJECT_BRIEF.md](PROJECT_BRIEF.md)** — 项目最高优先级"是什么 / 给谁 / 验证什么"
5. **[USER_STORIES.md](USER_STORIES.md)** — 用户故事 + 主链路验收 + 失败兜底
6. **[AGENTS.md](AGENTS.md)** — 仓库结构 / 技术栈 / 代码规范 / Done Definition / 禁止事项
7. **当前任务说明**(用户本次给出的提示)
8. **代码注释和现有实现**(`server/legacy/live-predictions.ts` `runLivePrediction` 是真值的最终源)

> 如果当前任务说明与 1–6 冲突,**先暂停 + 在回复中点出冲突**,不擅自决定如何取舍。

---

## 需要主动检查

每次开始新任务前,主动过一遍这 6 个问题:

| 检查 | 怎么判断 | 触发动作 |
|------|--------|--------|
| **是否违反范围锁定** | 任务是否落在 [SCOPE_LOCK.md](SCOPE_LOCK.md) "本版本明确不做"或"冻结清单"内? | 是 → 暂停,在回复中说明,询问 PM |
| **是否改变已有业务规则** | 是否动 [DOMAIN_RULES.md](DOMAIN_RULES.md) 里的阈值 / 公式 / 状态流?是否改 [client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts) 的 `AiTopicSuggestion` 字段? | 是 → 必须先开 ADR;字段冻结时直接拒绝 |
| **是否缺少测试** | 改了主流程 / 算法 / LLM 调用?有没有可加的单测 / e2e?evals 是否需跑? | 改主流程 → 手动跑一次端到端;改 prompt → 跑 evals(若已接通);其余按需补单测 |
| **是否存在安全风险** | 改动是否涉及 API key / 鉴权 / 用户输入进 LLM?是否会泄漏数据? | 是 → 在 PR 描述里显式说明已做的防护 |
| **是否需要更新文档** | 改了价格 / 阈值 / 容量 / 时长 / prompt / 模型?改了大决策? | 必同步:[DOMAIN_RULES.md](DOMAIN_RULES.md) / 对应 business / [docs/prompts.md](../prompts.md) / [docs/llm-budget.md](../llm-budget.md) / 必要时 ADR |
| **是否存在待确认假设** | 任务里有没有"按经验填默认"或"代码里没明确依据"的地方? | 是 → 列入回复的"待确认"清单,不要静默决定 |

---

## 输出要求

### 开工前(每会话第一回合)

**先复述**(用户能看到、能纠正):

1. 我理解的**项目目标**(对照 [PROJECT_BRIEF.md](PROJECT_BRIEF.md))
2. 我理解的**已冻结决策**(对照 [DECISION_LOG.md](DECISION_LOG.md) + [SCOPE_LOCK.md](SCOPE_LOCK.md))
3. 我理解的**当前任务**
4. 标出的**不清楚或可能矛盾**的地方(若有)

### 执行中

- **在不改变已冻结口径的前提下**继续执行
- **不确定的内容必须列为待确认**——不要补默认值"为了文档完整"
- **不得编造缺失信息**——不在代码 / 文档 / 配置里的事实,要么标【待确认】、要么标【项目中未找到明确依据】、要么标【建议补充】

### 完成后(必须汇报)

每次任务结束输出:

| 项 | 内容 |
|---|------|
| **修改了哪些文件** | 列出每个文件 + 一句话改动摘要;链接到对应行 |
| **完成了哪些验收项** | 对照 [USER_STORIES.md](USER_STORIES.md) 主链路验收 / [SCOPE_LOCK.md](SCOPE_LOCK.md) Must 清单 / PR 任务原始要求 |
| **运行了哪些测试** | `pnpm check` 是否过;`pnpm test`(全量 / 子集)结果;手动 e2e 是否做了 |
| **未完成事项** | 哪些在原任务范围但本次没做;原因(时间 / 阻塞 / 待确认) |
| **风险和待确认问题** | 包括踩到的边界情况、看到的异常状态、未澄清的假设——按"风险 / 待确认 / 建议补充"分类 |

---

## 项目关键口径

每会话开工前**复述这 5 条**给用户,确保你和用户对齐了同一套基准。

### 项目一句话定义

**输入一个赛道关键词、一条对标视频链接,或一个账号链接 —— 30 秒内,
给出 3 个今天就能开拍的爆款选题,每个选题都附带具体对标样本和爆发指数。**

(取自 [docs/PRD-v1.md](../PRD-v1.md) §1)

### 当前版本目标

**v1.0**——已冻结(2026-04-28)。当前在烧:

- 🔴 P0 阻断 4 项(manus.space 502 / 登录卡 / `/api` 反向代理 / 页面反复刷新)——见 [todo.md](../../todo.md)
- 🟡 M1–M5 必须达成(端到端可用 / 3 张选题卡 / 相关性 ≥80% / 一键脚本 / 命中率 dashboard)
- 5 个上线前必达数:进站可用率 ≥95% / P95 ≤30s / 选题点击转化 ≥30% / 命中率 ≥40% / NPS ≥30

### 已冻结范围

(详见 [SCOPE_LOCK.md](SCOPE_LOCK.md) §"本版本明确不做")

- ❌ 充值 / 会员 / 积分入口(代码保留,UI 隐藏)
- ❌ 内容日历 / 周度选题订阅(路由 404)
- ❌ 首页装饰模块(DashboardInsights / ValueCarousel)
- ❌ 自定义赛道(已删除,不加回)
- ❌ 多平台前端对比(只暴露抖音;小红书 / 快手作为隐性数据源)
- ❌ 移动端适配
- ❌ 结果页 UI / 选题卡片 / AI 文案的视觉编辑反馈
- ❌ `AiTopicSuggestion` 字段新增
- ❌ 主流程新增 LLM 调用
- ❌ 主流程接入 X 平台 / 视频号(走旁路 augmenter,默认关)
- ❌ 重命名 `server/legacy/` 或绕过 LLM gateway

### 核心业务规则(详见 [DOMAIN_RULES.md](DOMAIN_RULES.md))

- 主预测端到端 SLO **≤ 30 秒**(P95)
- 一次预测**输出恰好 3 条**选题
- 主流程 LLM 调用**典型 6–8 次**;最坏 10–12 次;最少路径 3 次
- 所有 LLM 调用**必须**经过 [server/legacy/llm-gateway.ts](../../server/legacy/llm-gateway.ts)
- 关键词扩展上限 **5 个**;数据接口请求最坏 **23 次/单次预测**
- 候选池**截 30 条**;语义过滤主阈 ≥7,降阈 ≥6
- 「**爆发指数**」是对用户展示的机会评分标签;7 维评分链路里可解释为机会分,但 v1.0 主结果页以各卡片返回分值为准
- 「**小账号爆款**」= 粉丝<1万 + 互动量进同赛道前 25% + 效率比≥0.5
- 「**TA 自己平时水平**」= 用户自己近 3 个月作品的前 25%(**不是绝对值**)

### 禁止改变的决策(详见 [DECISION_LOG.md](DECISION_LOG.md) / [docs/decisions/](../decisions/))

| # | 决策 | 不允许 |
|---|------|------|
| D-001 | Doubao 是默认 LLM | 不允许默默改默认值;切模型必须新写 ADR |
| D-002 | `server/legacy/` 不重命名 | 不允许改名 / 删文件;命名误导只靠文档兜底 |
| D-005 | X 平台走 augmenter 旁路且默认关 | 不允许在主预测流程内接 X / 视频号 |
| D-006 | v1.0 PRD 冻结 + Won't 清单 | 不允许动 Won't 清单内的功能 / 字段 |
| D-007 | 主流程 LLM 必发 = **3 次**(extract+intent 合并 1 + trend 并行 1 + topic 并行 1) | 不允许在主流程加新 LLM 调用,除非合并 / 替换一个老的 |
| D-009 | HTTP `requestTimeout = 600s` | 不允许默默改回 Node 默认 60s |

---

## 完成后必须汇报(模板)

```markdown
## 变更摘要
- 修改文件:[file1](path:line) — 一句话;[file2](path:line) — 一句话
- 业务影响:[改了什么用户能看到的行为]

## 验收
- [x] 对应 M1 / M3 / 用户故事的 X 项
- [x] `pnpm check` 通过
- [x] `pnpm test` 通过(N 个测试,无新增红色)
- [ ] 主流程手动 e2e:[做了/未做+原因]
- [ ] evals:[跑了/未跑+原因]

## 未完成
- [...]

## 风险 / 待确认
- 风险:[...]
- 待确认:[xxx 没找到代码依据,标记【待确认】等用户决策]
- 建议补充:[...]
```

---

## 配套阅读

- [AGENTS.md](AGENTS.md) — 驾驶舱仪表盘(更长版,含技术栈 / 代码规范 / Done Definition / 禁止事项)
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目最高优先级
- [SCOPE_LOCK.md](SCOPE_LOCK.md) — v1.0 范围锁定
- [DECISION_LOG.md](DECISION_LOG.md) — 决策一表
- [DOMAIN_RULES.md](DOMAIN_RULES.md) — 业务规则与评分口径
- [USER_STORIES.md](USER_STORIES.md) — 用户故事 + 主链路验收
- [HANDOFF_PACKAGE.md](HANDOFF_PACKAGE.md) — 跨会话交接包模板(交班用)
- 仓库根 [CLAUDE.md](../../CLAUDE.md) — 4 条隐性知识 + 30 秒上手
