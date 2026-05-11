# ADR-0001: Doubao 作为默认 LLM

- **状态**:Accepted
- **创建**:2026-04-28
- **决策人**:项目 owner

---

## 背景

主流程 `runLivePrediction` 一次会调 6–8 次 LLM(典型,见
[docs/llm-budget.md](../llm-budget.md))。LLM 选型直接影响:

- **成本**:每次预测的 token 烧钱速率
- **时延**:30 秒端到端 SLO 的最大变量
- **中文输出质量**:产品针对国内短视频赛道,需要非常本地化的中文生成
- **合规与可用性**:涉及国内业务,数据出境受限

候选方案:Doubao(火山方舟 ARK)、OpenAI GPT-4 / GPT-5.4、Claude 4.6、Apollo、本地开源模型。

---

## 决定

**默认 LLM = Doubao(火山方舟 ARK)**,通过 [`server/legacy/llm-gateway.ts`](../../server/legacy/llm-gateway.ts) 集中调用。
GPT-5.4 / Claude 4.6 / Apollo 作为可选备份(同 gateway 内切换)。Forge 作为最终 fallback。

---

## 理由

1. **中文短视频语境**:Doubao 在国内平台风格、热梗、口语化表达上**贴合度优于 GPT/Claude**。
   产品输出直接面向小红书 / 抖音用户,翻译腔会破坏体验。
2. **数据合规**:用户上传的内容(含未公开账号数据)**不出境**——这是 P0 合规底线。
3. **成本**:Doubao 价格在国内主流模型中具竞争力,且火山方舟有按量计费可控。
4. **时延**:国内调用 ARK 网络更稳,P95 优于跨境调用 OpenAI / Anthropic。
5. **gateway 抽象**:即使绑定 Doubao,业务代码只看到 `callLLM({model})`,
   切模型不影响业务层(见 [docs/prompts.md](../prompts.md) 提到的 model-swap 工作流)。

---

## 后果

### 好处

- 中文输出质量稳定,不需要每次靠 prompt 补"用中文回答"。
- 数据不出境,业务可在国内合规上线。
- 通过 `llm-gateway` 单点切换,**任何时候都能换回 GPT/Claude**——决策不是 lock-in。

### 代价 / 已知风险

- **Doubao 模型升级不受我方控制**——历史上有过同名模型悄悄改变行为的案例。
  应对:`evals/topic-suggest/` 评测集会在 LLM 输出回归时报警(脚手架已就位,接通待做)。
- **复杂推理任务上,Doubao 不如 Claude 4.6**——例如 `viral-breakdown.structure`
  这种长文本结构化拆解,目前用的是 **Apollo**(见 [docs/prompts.md](../prompts.md) 旁路 prompt 表)。
- **多模态能力弱于 GPT-4V / Claude**——影响视频帧理解,目前帧描述仍走 Apollo。

### 不影响这个决定的事

- OpenAI / Anthropic 模型如果因为价格 / 时延 / 合规策略变化变得更优——**写一份新 ADR
  superseded 这一份**,不要默默改默认值。
- 测试期间用任意模型实验都可以,gateway 已经支持。

---

## 相关

- 路径:[`server/legacy/llm-gateway.ts`](../../server/legacy/llm-gateway.ts)
- 调用预算:[docs/llm-budget.md](../llm-budget.md)
- 模型切换工作流:`docs/model-swap.md`(待写)
