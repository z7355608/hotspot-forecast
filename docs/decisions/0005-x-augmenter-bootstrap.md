# ADR-0005: X 平台数据源以 augmenter 旁路注入(supersedes ADR-0004)

- **状态**:Accepted
- **创建**:2026-04-29
- **决策人**:项目 owner
- **替代关系**:**Supersedes ADR-0004**(0004 是「维持现状,X 不进主流程」;0005 是「启动 B 方案,但只走旁路注入」)
- **触发**:用户要求「基于第一性原理启动 B 最小接入,不破坏原有架构,动态载入」

---

## 背景

ADR-0004 决定「维持现状」,但同时列出了启动 B(最小可行接入)的条件。本 ADR 在 owner 明确要求「启动 B」的前提下,给出**第一性原理拆解后的最小破坏方案**。

ADR-0004 列出的 B 启动条件中,**未严格满足**的有:

- 「`intent.industry` 在线上跑 ≥ 4 周稳定数据」——未度量
- 「评测集加上 AI 科技垂类专用样本」——未做

本 ADR 的方案**绕开**了这些条件,因为它**不依赖** intent.industry 作为强信号,也**不要求**评测集对齐——augmenter 是「补充候选」而非「主路由」,质量退化的下限是「等同当前」(因为打分的还是同一个 LLM,只是看到更多素材)。

---

## 第一性原理拆解(马斯克式归零)

不要从「现有数据源接入层应该如何扩展」推。归零问最本质的问题:

1. **主流程最终交付什么?** → 选题建议(标题、角度、爆发指数)。
2. **选题建议的输入是什么?** → 一组「候选 contents」喂给 trend / topic LLM。
3. **「候选 contents」本质是什么?** → 文本片段 + 互动指标 + 上下文标签。
4. **X 推文是什么?** → **同形态的「文本片段 + 互动指标」**。差异只是平台标签。
5. **那为什么需要"接入新平台"?** → 不需要。**只需要给主流程的 contents 数组多塞几条**。

**结论**:这不是一个「平台扩展」问题,是一个「候选内容补充」问题。前者要改路由、白名单、打分模型,后者只需要一个**旁路注入器**。

把假设拆到这一层后,「不破坏架构 + 动态载入」就有了纯粹的实现:

- 不抽 `PlatformAdapter`(那是 ADR-0004 的 C 方案,过度设计)
- 不改 `watch-runtime.ts` 的 `if/else` 分发
- 不改 `prediction-helpers.ts` 的平台白名单
- 不改 `topic-strategy-engine.ts` 的打分模型
- 不新增 LLM 调用(LLM 预算 0 增量,见 [docs/llm-budget.md](../llm-budget.md) §1)
- **只在主流程的 contents 聚合点之后,加一行 hook 调用旁路注入器**

---

## 决定

**采用「旁路内容注入器(content augmenter)」模式接入 X 平台数据源**,默认全程关闭,通过 env 开关动态载入。

---

## 设计

### 1. 模块结构(全部新代码,与 `legacy/` 完全隔离)

```
server/services/content-augmentation/
├── registry.ts              # Augmenter 接口 + 注册表 + 调度(fail-soft + timeout)
├── bootstrap.ts             # 启动期动态载入,默认 noop
├── providers/
│   └── x-tech-source.ts     # X 平台 AI 科技博主推文 augmenter
└── registry.test.ts         # 7 个 vitest:noop / fail-soft / timeout / 顺序合并
```

### 2. 关键不变量

- **注册表为空 → `augmentContents` 直接返回 existing**(行为完全一致)
- **任何 augmenter 失败/超时 → fail-soft**(`Promise.allSettled` + 5s 超时)
- **augmenter 不调用 LLM**(主流程 LLM 预算 0 增量)
- **env 默认 false → x-tech-source 不被 import**(0 网络/0 内存/0 副作用)

### 3. 动态载入(env 驱动)

- `X_AUGMENTER_ENABLED=false`(默认)→ `bootstrap.ts` 不进 if 分支,**`x-tech-source.ts` 永不被 import**
- `X_AUGMENTER_ENABLED=true` → 启动期 `await import("./providers/x-tech-source.js").then((m) => m.register())`
- 启动失败 → try-catch + log,不阻断 server 启动
- 关闭只需 env 改回 false + 重启

### 4. X augmenter 的实现要点(`providers/x-tech-source.ts`)

- **触发条件**:`industry / seedTopic / prompt` 包含 `ai / 人工智能 / 大模型 / LLM / agent / 科技 / openai / anthropic / claude / gpt / deepseek` 等关键词。
- **数据源**:复用 `getTikHub("/api/v1/twitter/web/fetch_user_post_tweet", ...)`(同 `creator-data-sync.ts` 的 Twitter 通道,但**完全独立**,不 import 它)。
- **Handles 来源**:`X_AUGMENTER_TECH_HANDLES` env 配置(逗号分隔),留空则 augmenter 即便注册也不出数据。
- **量级**:每个 handle 取 ≤3 条,跨 handle 整体取 top 8,按互动数排序。
- **缓存**:per-handle,1 小时 TTL,内存 Map。同 industry 的并发预测请求共享缓存。
- **跨语言**:**MVP 不翻译**——豆包能读英文,推文短(≤200 字)。下一阶段验证质量后再决定是否加翻译。
- **下游兼容**:推文的 `platform` 设为 `"X"`(不在 `"抖音/小红书/快手"` 集合中,后续 `c.platform === "抖音"` 这类比对会**自然跳过**),`authorFollowerCount` 设为大数避免被低粉算法误判。

### 5. 主流程 hook(**唯一的侵入点,1 行**)

**位置**:[server/legacy/live-predictions.ts:890](../../server/legacy/live-predictions.ts) 之后(`supportingContents` 形成完毕)、line 891 「关联过滤」之前。

**精确 patch**(等待 owner 拍板后再 apply):

```diff
   } else {
     supportingContents = candidateContents.slice(0, 10);
   }
+  // 旁路注入(默认 noop,详见 docs/decisions/0005-x-augmenter-bootstrap.md)
+  supportingContents = await augmentContents(supportingContents, {
+    industry: intent.industry ?? null,
+    seedTopic: effectiveSeedTopic ?? "",
+    prompt: draft.prompt ?? null,
+    traceId: traceId ?? null,
+  });
   // 关联过滤：只保留相关内容的作者账号
```

加 `import { augmentContents } from "../services/content-augmentation/registry.js";` 到顶部 import 区。

**这一行的安全性**:
- `augmentContents` 在注册表为空(默认)时直接返回 existing,**行为完全等同当前**
- 即便注册表非空,失败/超时也 fail-soft 返回 existing
- 不抛错,不阻断,不重试 LLM

### 6. 适用边界(2026-04-29 真实测试后补)

**初版盲区**:第一次设计时假设「prompt 含 AI / 科技关键词 → 注入 X 推文必有用」,但实际产品有两条主流场景,**对 X 高粉名人推文的需求是相反的**:

| 用户意图 | augmenter 行为 | 原因 |
|---|---|---|
| **趋势预判 / 选题前瞻 / 新机会** | ✅ 注入 | X 高粉博主是领先信号源 |
| **低粉爆款 / 素人样本 / 可复刻方向** | ❌ 必须跳过 | 高粉名人推文是反向素材,会污染「找素人样本」的 LLM prompt |

**实现**:`shouldRun` 加反向关键词列表,命中即跳过(优先级高于 TECH_KEYWORDS):

```ts
const ANTI_KEYWORDS = ["低粉", "素人", "可复制", "复刻", "对标账号"];
```

代码位置:[server/services/content-augmentation/providers/x-tech-source.ts](../../server/services/content-augmentation/providers/x-tech-source.ts) `shouldRun`。
单测覆盖:[providers/x-tech-source.test.ts](../../server/services/content-augmentation/providers/x-tech-source.test.ts)(10 个 case,含反向命中)。

**触发盲区的真实 case**:
> 用户 prompt:`ai科技最近7天有哪些低粉爆款？帮我分析可复制的方向`
>
> 加反向关键词前:augmenter 触发,注入 8 条 elonmusk/sama/karpathy 推文 → LLM 看到也不引用(答非所问)→ 用户感觉「X 接入毫无影响」
>
> 加反向关键词后:augmenter 直接跳过,prompt 干净,无影响

### 7. 已就位、未激活的状态

本 ADR 提交后,以下文件已就位但**主流程 hook 未 apply**:

- `server/services/content-augmentation/{registry,bootstrap}.ts` ✅
- `server/services/content-augmentation/providers/x-tech-source.ts` ✅
- `server/services/content-augmentation/registry.test.ts` ✅(覆盖 noop / fail-soft / timeout)
- `server/services/content-augmentation/providers/x-tech-source.test.ts` ✅(覆盖正反向关键词)
- `server/_core/env.ts` 加 3 个 env 字段 ✅
- `server/_core/index.ts` 加 `await bootstrapAugmenters()` 调用 ✅(默认 noop)
- `server/legacy/live-predictions.ts` 加 hook ❌(留给 owner review 后另起一次提交)

---

## 理由

1. **第一性原理切分**:把「平台接入」重新归为「候选内容补充」,问题维度从架构级降到模块级。这是马斯克式归零的直接结果——质疑「我们一定要做一个 PlatformAdapter 吗」这个隐含假设。
2. **0 LLM 增量**:augmenter 只往 contents 数组里塞条目,不新增任何 LLM 调用。不打穿 [docs/llm-budget.md](../llm-budget.md) §1 的预算红线(也就解决了 ADR-0004 决定「维持现状」时最重的那一个理由)。
3. **0 主流程结构改动**:不动 `watch-runtime` 的 `if/else`、不动平台白名单、不动打分模型。**唯一侵入点是主流程的 1 行 hook,且默认 noop**。
4. **动态载入 = 真零成本**:env 默认 false → 整个 augmenter 模块永不被 import,运行时无任何痕迹。这比「import 后 if 跳过」更彻底。
5. **fail-soft 是默认行为**:任何 augmenter 异常都不会传播到主流程。最差结果 ≡ 当前行为。
6. **实验快、回滚快**:激活只需切 env;关闭只需切回 + 重启。无 schema 变更、无数据迁移、无依赖锁定。
7. **绕过 ADR-0004 的「未满足条件」是合理的**:0004 的条件是为「主路由级接入」设计的;augmenter 是「补充候选」,质量下限 ≡ 当前,不需要那么强的前置条件。

---

## 后果

### 好处

- AI 科技垂类预测能拿到 X 上的领先信号(国内三平台的滞后被部分补上)。
- v1.0 SLO 不被破坏(LLM 预算、时延、失败率)。
- augmenter 框架本身可复用——未来要加 Reddit / Hacker News / 微博热搜 augmenter,**只需新增一个 provider 文件**,bootstrap 加一行 import。
- ADR-0004 的「侧线代码长期不被消费」风险被部分化解(尽管 augmenter 是独立通道,但 X 数据通过 TikHub 这一层共享认证 + 配额)。

### 代价 / 已知风险

- **prompt token 上涨**:每条推文 ≤200 字 × ≤8 条 = ~600 tokens 进 trend / topic prompt。可控,但要观察。
- **跨语言污染**:中文 prompt 里夹英文推文,豆包输出可能偶发英文片段。MVP 阶段接受,质量验证后再决定是否加翻译。
- **时延 +2-5s**:augmenter 串行在 `supportingContents` 形成之后。后续可优化为「与主采样并行触发」。MVP 阶段接受。
- **handles 是手工维护的列表**:不可扩展到「全网搜推文」。这是 MVP 的有意约束——动态搜索是下一阶段。
- **augmenter 的 contents 没有 `supportingAccounts` 对应项**:line 891-904 的「关联过滤」会保留但不增加账号样本。MVP 阶段接受。
- **下游对 `c.platform` 的字符串比对依赖**:目前下游用 `c.platform === "抖音"` 这种硬比对(line 907 / 1056 等)。X 内容设 `platform="X"` 自然跳过,**安全**;但若未来有人写「除 X 外」的逻辑没把 X 列入,会有意外。建议未来抽 `isAugmenterContent(c)` helper。

### 激活路线(分阶段灰度)

| 阶段 | 动作 | 验证 |
|------|------|------|
| **0(本 ADR 提交后)** | 仅就位,主流程 hook 未 apply | `pnpm check` / `pnpm test`(新加测试通过)|
| **1** | apply 主流程 hook(1 行 + 1 import),env 仍 OFF | 全量回归:与上线前主流程行为完全一致 |
| **2** | 测试环境 `X_AUGMENTER_ENABLED=true` + 配 3-5 个 handle | 抽样 10 条 AI 科技垂类的 prompt,人工对比有 / 无 augmenter 的输出质量 |
| **3** | 生产灰度 5% 流量 | 监控 P95 时延、prompt token、用户满意度反馈 |
| **4** | 全量 / 回滚 | 视阶段 3 数据决定 |

### 回滚

- **运行时回滚**:`X_AUGMENTER_ENABLED=false` + 重启。即时生效。
- **代码回滚**:revert 主流程 hook 那一行,augmenter 模块代码留着不影响主流程。
- **完全卸载**:删除 `server/services/content-augmentation/` 整个目录 + revert 3 处 env / index / live-predictions 改动。

### 何时要写新 ADR superseded 0005

- 决定加翻译步骤(违反「0 LLM 增量」)→ 新 ADR
- 决定抽 `PlatformAdapter` 接口(走 ADR-0004 的 C 方案)→ 新 ADR
- 决定让 augmenter 影响打分权重(不只是补 contents)→ 新 ADR
- 决定加第二个 augmenter(Reddit / HN / 微博)→ **不需要新 ADR**,本 ADR 框架已涵盖

---

## 相关

- [ADR-0004](0004-x-platform-not-in-main-flow.md) — 被本 ADR superseded 的「维持现状」决定
- [CLAUDE.md](../../CLAUDE.md) §3 LLM 预算红线
- [docs/llm-budget.md](../llm-budget.md) §1 调用清单
- 注册表实现:[server/services/content-augmentation/registry.ts](../../server/services/content-augmentation/registry.ts)
- X augmenter:[server/services/content-augmentation/providers/x-tech-source.ts](../../server/services/content-augmentation/providers/x-tech-source.ts)
- Bootstrap:[server/services/content-augmentation/bootstrap.ts](../../server/services/content-augmentation/bootstrap.ts)
- 主流程 hook 位置:[server/legacy/live-predictions.ts:890](../../server/legacy/live-predictions.ts)
- env 配置:[server/_core/env.ts](../../server/_core/env.ts)(`xAugmenterEnabled` / `xAugmenterTechHandles` / `augmenterTimeoutMs`)
