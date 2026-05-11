# ADR-0002: `server/legacy/` 暂不重命名

- **状态**:Accepted
- **创建**:2026-04-28
- **决策人**:项目 owner

---

## 背景

`server/legacy/` 这个名字**严重误导**——目录下有项目最核心的代码:

- `live-predictions.ts` `runLivePrediction` —— 主预测流程入口
- `llm-gateway.ts` —— 所有 LLM 调用的唯一出口
- `intent-agent.ts` / `payload-extractor.ts` / `semantic-filter.ts` 等 —— 主流程依赖

新接手的人(尤其是 AI 协作者)看到 `legacy/` 会本能想"清理它"——这会直接破坏产品。

历史成因:早期项目分了 `legacy/`(旧代码) vs `services/`(新代码),计划逐步把
旧代码迁出。但**主流程从未迁完**,反而新加的核心逻辑因为依赖关系也落到了 legacy/。

候选方案:

- A. 保持现状,在 README / CLAUDE.md 显眼处警告
- B. 大重命名 `legacy/` → `pipeline/` 或 `core/`,一次性 PR
- C. 渐进迁移:每次改某个文件,顺带迁到合适的目录

---

## 决定

**当前选 A**:保持 `legacy/` 名字不动,通过 [README.md](../../README.md) /
[CLAUDE.md](../../CLAUDE.md) / [ARCHITECTURE.md](../../ARCHITECTURE.md) 显眼标注
"legacy/ 不是 deprecated"。重命名延后到下一次有大模块拆分动作时一并做。

---

## 理由

1. **重命名是巨大的 diff**:`legacy/` 有 100+ 文件,跨越 import 关系。
   一次性重命名会让所有 in-flight 分支冲突,影响多人协作。
2. **改名不解决根因**:真正的问题是"主流程和服务层混杂",光改名不重构,新名字也会
   再次劣化(比如 `core/` 里又混进新代码)。
3. **当前优先级**:产品在 v1.0 冻结期,做这种"零产品价值的清理"不是好时机。
4. **文档驱动可以兜底**:CLAUDE.md / README.md / ARCHITECTURE.md 三处显式提醒,
   AI 协作者和新人都会看到,不至于踩坑。
5. **未来的拆分动作时一并做更经济**:下一次主流程要做架构级改动(例如拆出独立 worker、
   或者把 LLM 调用合并),trivially 把 `legacy/` 改名 `pipeline/`。

---

## 后果

### 好处

- 不引入巨大冲突 PR
- 不假装"重构了"实则只换名字
- 文档层面的提示成本极低,见效极快

### 代价 / 已知风险

- **AI 协作者初次接手仍可能误判**——所以 [CLAUDE.md](../../CLAUDE.md) 列了 4 条隐性
  知识,把这一条放在最前面。
- **新人首次入职**:CONTRIBUTING.md 强制要求先读 CLAUDE.md。
- **搜索 / IDE 提示**:有人搜 `legacy` 可能误删——只能靠 code review 兜底。

### 触发重命名的条件

满足任一条,就立刻提一份新 ADR superseded 本文,执行重命名:

- 主流程要做大拆分(独立 worker / 队列 / 子服务化)
- AI 协作者**反复**踩这个坑(超过 3 次明显失误)
- 新增团队成员时,onboarding 卡在这一点超过半天

---

## 相关

- [CLAUDE.md](../../CLAUDE.md) §1 "legacy/ 不是 deprecated"
- [ARCHITECTURE.md](../../ARCHITECTURE.md) §"模块边界" / "已知架构债"
- [README.md](../../README.md) "目录说明" 段
