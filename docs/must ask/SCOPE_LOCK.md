# SCOPE_LOCK.md

> v1.0 范围锁定。**冻结日期:2026-04-28**;**解冻条件:M1–M5 全部达成**(见 [PROJECT_BRIEF.md](PROJECT_BRIEF.md))。
> 任何范围变更必须经 PM 单点拍板,并在文末"范围变更记录"留痕。
> 真值同步:[docs/PRD-v1.md](../PRD-v1.md) / [todo.md](../../todo.md)。

---

## 决策门槛(Gating)

任何"想加进来"的需求,**先回答这 3 个问题**(取自 [docs/PRD-v1.md](../PRD-v1.md) §7):

1. 是否影响 M1–M5 的达成?
2. 是否动到了下面"本版本明确不做"清单?
3. 用户能不能等到 v1.1?

→ 三个回答中任意一个为"否",则进 backlog,**不进当前 sprint**。

---

## 本版本必须做(Must)

### P0 阻断(本周内修完,**否则一切其他工作暂停**)

(取自 [todo.md](../../todo.md))

- [ ] **P0-1** 修复 manus.space 502 Bad Gateway("健身减脂"赛道可复现)
- [ ] **P0-2** 修复 manus.space 登录卡在"正在验证登录状态"(cookie 跨域 / 反向代理配置)
- [ ] **P0-3** 修复 `/api` 反向代理未接通 Node 服务,端到端验证分析流程可用
- [ ] **P0-4** 修复页面反复刷新(区分应用代码 / Vite HMR / Manus 网关 WebSocket 代理)

### v1.0 必须达成 M1–M5

| # | 内容 | 验收标准 |
|---|------|---------|
| **M1** | 端到端可用率 ≥ 95% | 新用户落地→结果页 < 60s 无故障 |
| **M2** | 稳定输出 ≥ 3 张选题卡片 | 含:标题 / 切入角度 / 爆发指数 / 对标样本 / 核心标签(字段冻结,见 [client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts)) |
| **M3** | 选题相关性 ≥ 80% | 按默认验收草案抽样 50 条选题卡评估(见 [DOMAIN_RULES.md](DOMAIN_RULES.md) §4.2) |
| **M4** | 选题→生成脚本无缝衔接 | 已实现,纳入回归测试 checklist |
| **M5** | 上线命中率 dashboard | 默认复用内部受保护查询 / 后台页,能查看预测分 vs 48h 真实表现 |

### v1.0 砍而不删(Won't 的具体动作)

- [ ] 隐藏会员 / 积分入口(`subscriptions`、`credit_transactions` 相关 UI 全部隐藏)
- [ ] 隐藏内容日历入口(`content_calendar` 路由 404)
- [ ] 隐藏周度订阅入口(`weekly_topic_subscription` 路由 404)
- [ ] 移除首页 `DashboardInsights` / `ValueCarousel` 残余装饰模块
- [ ] 移动端适配从 backlog 撤出(先保证不崩)

### 上线准备

- [ ] 关键页面错误监控接入(Sentry 或同类)
- [ ] NPS 小样本内测(20 个种子用户)
- [ ] PRD 一致性自审(半天):上线前逐条核对 Must / 5 个数 / Won't / ADR 状态 / API 与系统流程图真值是否互相一致;发现冲突必须先收口,再灰度
- [ ] v1.0 灰度发布 + 回滚预案

### 文档(冻结期内**只**写这三份)

- [x] 一页纸 PRD v1.0([docs/PRD-v1.md](../PRD-v1.md))
- [ ] 部署与网关运维文档(与 P0-2/P0-3 同步沉淀)
- [ ] 前后端 + LLM 数据契约文档(含 `AiTopicSuggestion` 字段冻结版与版本号机制)

---

## 本版本可选做

只在 **Must 全部达成** 后,且评审通过后才动:

- [ ] 自动评测(`evals/topic-suggest/`)接通豆包基线
  - 价值:化解风险 [docs/business/风险登记册.md](../business/风险登记册.md) §P0-#2 "AI 模型行为悄悄变化"
  - 现状:脚手架已就位,真实样本集与 baseline 未跑通
- [ ] 单次预测成本 + 端到端速度打点(P0 在指标体系里,但**不阻断 v1.0 上线**)
  - 价值:化解 [docs/business/风险登记册.md](../business/风险登记册.md) §P1-#5 "成本失控"

> 这些会让产品健康度上一个台阶,但不影响"用户能不能完成核心闭环"——所以放可选。

---

## 本版本明确不做(Won't)

(字面同步 [docs/PRD-v1.md](../PRD-v1.md) §5,新增条目须先经 PM 同意。)

### 产品功能层

- ❌ 充值 / 会员 / 积分体系(全部隐藏入口,代码保留)
- ❌ 内容日历(`content_calendar` 路由 404)
- ❌ 周度选题订阅(`weekly_topic_subscription` 路由 404)
- ❌ 首页"赛道情报""价值轮播""DashboardInsights"等装饰性模块
- ❌ 自定义赛道(已删除,不再加回)
- ❌ 多平台前端对比(v1.0 只暴露抖音;小红书 / 快手作为隐性数据源)
- ❌ 移动端适配(桌面优先,移动端只保证不崩)
- ❌ 结果页 UI / 选题卡片 / AI 文案的任何新一轮"视觉编辑反馈"

### 技术 / 数据契约层

- ❌ 任何新字段加到 `AiTopicSuggestion`(字段已冻结,见 [client/src/app/store/prediction-types.ts:282–305](../../client/src/app/store/prediction-types.ts))
- ❌ 任何新折叠区加到结果页
- ❌ 任何新 LLM 调用加到主链路(预算见 [docs/llm-budget.md](../llm-budget.md):典型 6–8 次,最坏 10–12 次)
- ❌ 主流程接入 X 平台 / 视频号(见 [ADR-0004](../decisions/0004-x-platform-not-in-main-flow.md) / [ADR-0005](../decisions/0005-x-augmenter-bootstrap.md))
- ❌ 重命名 `server/legacy/` 目录(见 [ADR-0002](../decisions/0002-legacy-naming-not-renamed.md))

### 强阻断变体(冻结清单字面禁止,**PM 一句话回"冻结期,进 backlog"**)

(取自 [todo.md](../../todo.md) §冻结清单)

- 结果页 UI / 选题卡片任何视觉变更
- AI 文案 / 字段任何新增
- 任何"用户视觉编辑反馈 v4 / v5 / v6"类需求
- 任何"参考某 Canvas / Figma 重构卡片"
- 充值、会员、内容日历、周度订阅相关任何开发
- 多平台前端对比(小红书、视频号等)
- 首页新增板块

---

## 延后到下一版本(v1.1 backlog)

(取自 [todo.md](../../todo.md) §v1.1 backlog,**不开工**,记录在这里防遗忘。)

- 「下一步动作」区域:标题改"下一步动作"+ 副标题"不是建议,是直接执行清单"
- 「下一步动作」区域:右侧"随当前内容变化"标签
- 多平台前端对比
- 移动端适配
- 内容日历重启
- 周度选题订阅重启
- 充值会员体系激活
- 用户反馈闭环(用户拍了选题之后好不好,接回算法迭代,见 [docs/business/算法白皮书.md](../business/算法白皮书.md) §6)
- 个性化模块接入主流程(同上)
- 趋势 + 选题合并为单次 LLM 调用(优化方向,见 [docs/llm-budget.md](../llm-budget.md) §7)
- 第二数据源调研(化解 [docs/business/风险登记册.md](../business/风险登记册.md) §P0-#1)

---

## 已废弃想法

| 想法 | 废弃时间 | 废弃理由 | 形式化决策 |
|------|--------|---------|----------|
| 自定义赛道 | v1.0 前 | 用户决策成本高,产品边界模糊;小创作者赛道相对稳定,枚举 + AI 兜底已够 | [docs/PRD-v1.md](../PRD-v1.md) §5 |
| X 平台(Twitter)进入主预测流程 | 2026-04-29 | 海外平台与国内创作者用户群不重合;走 augmenter 旁路注入,主流程不动 | [ADR-0004](../decisions/0004-x-platform-not-in-main-flow.md)(被 [ADR-0005](../decisions/0005-x-augmenter-bootstrap.md) supersede) |
| `¥99/月` 单价定价 | 2026-04-29 | 真实定价是 Plus ¥19 / Pro ¥49,旧假数让月营收估值差 4 倍 | [docs/business/产品定位.md](../business/产品定位.md) §定价 |

---

## 范围变更记录

| 日期 | 变更 | 原因 | 影响范围 | 决策人 | 状态 |
|------|------|------|---------|-------|------|
| 2026-04-28 | v1.0 范围冻结(M1–M5 锁定;Won't 清单正式记录) | 多轮"用户视觉编辑反馈"导致结果页反复重做,需要硬冻结 | 全产品 | 项目 PM | Accepted |
| 2026-04-28 | 主流程 LLM 调用合并(Step A+B 合一;趋势+选题合一) | 端到端时延不达标,LLM 预算紧 | `server/legacy/live-predictions.ts` | 项目 PM + 技术 | Accepted(已实施,见 [docs/系统流程图.md](../系统流程图.md)) |
| 2026-04-29 | X 平台改为旁路 augmenter(默认关) | 海外平台不在 v1.0 用户群;但保留实验空间 | 数据采集层 | 项目 owner | Accepted([ADR-0005](../decisions/0005-x-augmenter-bootstrap.md)) |
| 2026-04-29 | 单价模型从 `¥99/月` 修正为 Plus ¥19 / Pro ¥49 | 旧假数与代码不符,单位经济模型错算 | 商业模型 / [docs/business/产品定位.md](../business/产品定位.md) | 项目 owner | Accepted |

> 新增条目格式:**绝对日期 / 一句话变更 / 一句话原因 / 受影响目录或文档 / 决策人 / Accepted-Pending-Rejected**。

---

## 配套阅读

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目最高优先级"是什么 / 给谁 / 验证什么"
- [DECISION_LOG.md](DECISION_LOG.md) — 项目级决策一表
- [docs/PRD-v1.md](../PRD-v1.md) — 一页纸 PRD(冻结版)
- [todo.md](../../todo.md) — 当前 sprint 烧的 P0 + Must
- [docs/decisions/](../decisions/) — 架构 / 数据源 / 模型选型 ADR
