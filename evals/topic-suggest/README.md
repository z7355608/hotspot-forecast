# Eval: 选题建议(`live-predictions.topic`)

测的对象:[`server/legacy/live-predictions.ts:1634`](../../server/legacy/live-predictions.ts) 的
`live-predictions.topic` prompt——产品最关键的一次 LLM 调用,直接决定用户看到的 3 个选题卡。

---

## 文件

| 文件 | 用途 |
|------|------|
| `cases.jsonl` | 输入样本(每行一个 case,JSON) |
| `rubric.md` | 评分维度定义 |
| `run.ts` | Runner(目前是 stub,见下面 TODO) |
| `baseline.json` | 上一次基线分数(暂无,跑出第一次后存) |
| `reports/` | 历史报告(暂无) |

---

## case 格式(`cases.jsonl`)

每行一个 JSON:

```json
{
  "id": "mom-baby-newborn-routine",
  "input": {
    "prompt": "新手妈妈/哄睡技巧",
    "userProfile": { "platforms": ["xhs", "douyin"], "industries": ["母婴"] }
  },
  "context_hint": "典型母婴新手用户,平台覆盖小红书+抖音",
  "expected_qualities": [
    "标题至少有一个具体痛点(哭闹/不睡/夜醒)",
    "切入角度提到具体月龄段(新生儿/3个月/半岁)",
    "至少一个标题是数字承诺式(\"3个动作\"\"5分钟\")",
    "不输出过度医疗化建议"
  ]
}
```

`expected_qualities` 是**定性 rubric**,不是死答案。LLM-as-judge 或人工评审照这个打分。

---

## Runner(目前是 stub)

`run.ts` 现在是骨架,**还没接通真实 gateway**。要让它跑通,需要:

### TODO

1. 从 `server/legacy/live-predictions.ts:1634` 抽出 topic prompt 的构造函数
   (现在是行内 template literal),变成可复用的 `buildTopicPrompt(input, context)`。
2. `run.ts` 里 import 它 + `callLLM`(从 [`server/legacy/llm-gateway.ts`](../../server/legacy/llm-gateway.ts))。
3. 准备 mock 的"上下文"(`topSampleTitles` / `commentKeywords` / `demandSignals`)——
   要么固定一份 fixture,要么允许 case 里传入。
4. 跑完每个 case,把 LLM 输出写到 `reports/<timestamp>.jsonl`。
5. 跑 LLM-as-judge(可用 Claude / GPT)对照 `rubric.md` 打分,落 `reports/<timestamp>.summary.json`。

> **为什么不一次性写完**:抽取 prompt 构造函数会动主流程代码,不该在加 evals 这一步顺手做。
> 先把脚手架立起来,后续单独提一个 PR 做 prompt 集中化(见 [docs/prompts.md](../../docs/prompts.md)
> 末尾的「下一步」)。

---

## 接通之后的工作流

```bash
# 改 prompt 之前
pnpm eval:topic --tag baseline

# 改 prompt
$EDITOR server/legacy/live-predictions.ts

# 改 prompt 之后
pnpm eval:topic --tag after-tweak

# 看对比
pnpm eval:diff baseline after-tweak
```

报告里有每个 case 的:
- 输入 prompt
- LLM 输出
- judge 打分(每个 quality 维度 0/1 或 0–5)
- 总分 + 与 baseline 的 delta

PR 描述里贴 diff 摘要(分数变化 + 几个值得看的样本对比)。

---

## 当前 case 数量

10 条(见 `cases.jsonl`)——只是冒烟级别。
**要做到 PR 能基于分数 ship,需要 30+ 条**,覆盖各赛道、各 prompt 长度、edge cases。
