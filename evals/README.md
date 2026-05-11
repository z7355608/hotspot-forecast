# Evals

> **Eval = "改了 LLM 之后,自动化看输出有没有变烂"。**
> 单元测试覆盖代码正确性,evals 覆盖 **AI 输出质量**——这是两件事。

---

## 为什么要这一层

主流程的两个⭐ prompt(`live-predictions.trend` / `live-predictions.topic`)
是产品**输出质量的命门**——但它们没有代码层面的"对错",只有"好/不好"。

没有 evals,意味着:

- 改 prompt 一句话 → 不知道是变好了还是变烂了
- 切模型(Doubao → Claude)→ 不知道质量持平还是下滑
- LLM 厂商悄悄升级模型 → 不知道行为有没有偏移

→ 评测集是 vibecoding 项目的**护城河**。

---

## 当前状态

- 🟡 **`evals/topic-suggest/`** — 脚手架就位,需要补样本 + 接通 runner(见目录内 README)
- ⏳ `evals/intent-classify/` — 计划中
- ⏳ `evals/semantic-filter/` — 计划中

---

## 怎么跑

```bash
# 还没接通,见 evals/topic-suggest/README.md 里的 TODO
# 接通后:
pnpm eval:topic            # 单跑 topic-suggest
pnpm eval                  # 全部
```

---

## 加 / 改 case 的规则

1. **每个 case 必须可复现**——固定的 input,不依赖外部时刻数据。
2. **每个 case 标注 expected qualities**(定性 rubric),不要写"必须输出 X"那种死答案。
3. **case 数量 > 30 是质量门槛**——≤10 条是冒烟,过不了"统计意义"。
4. **每改一次 prompt,跑全量 eval,把 before/after 报告附在 PR 里**。

---

## 看 rubric

每个 eval 子目录里有 `rubric.md`,定义评分维度。LLM-as-judge 模型可以引用 rubric,
人工 spot-check 也参考它。

---

## 未来方向

- **LLM-as-judge**:用更强的模型给输出打分(用 rubric 当 prompt)
- **diff 报告**:跑完输出 markdown 报告,对比基线版本
- **CI 集成**:PR 触发,自动跑 + 评论分数(token 成本可控之后)
