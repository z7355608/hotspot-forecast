# 架构决策记录 (ADR)

> 记录关键技术/架构决定。每条 ADR 是一份**独立的、不可变的**小文档。
> 决定改了不要改 ADR——**新建一份 superseded 它**。

---

## 写作风格(MADR-lite)

每份 ADR 有 5 段:

1. **状态** — Accepted / Superseded by ADR-0XXX / Deprecated
2. **背景** — 决定面对的问题、约束、当时的事实
3. **决定** — 我们选了什么(一句话)
4. **理由** — 为什么这样选,关键权衡
5. **后果** — 这个决定带来的好处和代价(含已知技术债)

---

## 编号规则

`NNNN-kebab-case-title.md`,从 0001 开始,连续递增,**不复用废弃编号**。

---

## 索引

| # | 标题 | 状态 | 创建 |
|---|------|------|------|
| [0001](0001-doubao-as-default-llm.md) | Doubao 作为默认 LLM | Accepted | 2026-04-28 |
| [0002](0002-legacy-naming-not-renamed.md) | `legacy/` 暂不重命名 | Accepted | 2026-04-28 |
| [0004](0004-x-platform-not-in-main-flow.md) | X 平台(Twitter)数据源暂不进入主预测流程 | Superseded by [ADR-0005](0005-x-augmenter-bootstrap.md) | 2026-04-29 |
| [0005](0005-x-augmenter-bootstrap.md) | X 平台以 augmenter 旁路注入(动态载入,默认关) | Accepted | 2026-04-29 |
| [0006](0006-low-follower-library-target-alignment.md) | 低粉爆款库合格样本定义对齐 PRD 目标人群 | Accepted | 2026-04-30 |
| [0007](0007-low-follower-billboard-pipeline.md) | 低粉爆款库 billboard 双管线 + LLM 预检查门槛 | Accepted | 2026-04-30 |
| [0008](0008-low-follower-search-pipeline.md) | 低粉爆款库管线 C — 搜索补样(口播/带货/干货) | Accepted | 2026-04-30 |

---

## 什么时候新写一份 ADR

- 选了一个会**长期影响**项目结构的方案(模型 / 框架 / 数据存储 / 主流程拆分)
- 有人会在 6 个月后问"为什么是这样":写 ADR
- 决定违反了"看上去更合理"的方案:写 ADR(避免被回滚)
- 临时性 hack 不写 ADR,但要在 todo 里记跟进

不需要为日常 PR 决定写 ADR——只为**会被反复质疑**的决定写。
