# 测试 (Testing)

> **51 个 `.test.ts` 文件**(全部在 `server/`),用 vitest 跑。混合单元 + 集成测试,
> **没有 e2e**,**LLM 输出质量回归靠 [evals/](../evals/)**(脚手架就位,接通待做)。

---

## 怎么跑

```bash
pnpm test                            # 全部
pnpm test <pattern>                  # 模糊匹配,例如 pnpm test copywriting
pnpm test --reporter=verbose         # 详细输出
pnpm test --watch                    # 改文件自动重跑(开发时用)
```

vitest 配置:`vitest.config.ts`(Node 环境,扫 `server/**/*.test.ts`)。

> 当前注意:部分测试直接断言真实 `.env` 或访问外部服务 / 本机 MySQL。
> 在 Codex 沙箱或离线环境下,`pnpm test` 可能因为环境而失败;提交前至少保证 `pnpm check` 通过,
> 主流程改动还要跑一次浏览器真实预测。

---

## 测试分布

按测试目标分组——**改对应模块前先看这里有没有现成 fixture**。

### AI / LLM 行为(7 个)

测 prompt 输入输出、意图识别、评分逻辑。改 prompt 时**优先关注这一组**。

- `ai-topic-suggestions.test.ts`
- `intent-recognition.test.ts`
- `comment-insight.test.ts`
- `comment-service.test.ts` — 情感分类,纯函数单测
- `creator-identifier.test.ts`
- `low-follower-tagger.test.ts`
- `third-party-llm.test.ts`

### 平台集成(8 个,主流程相关)

抖音 / 小红书 / 快手数据采集与解析。改 `services/tikhub-*` 或 payload 抽取时看这里。

- `aweme-extraction.test.ts` — 抖音
- `legacy/xiaohongshu-deep.test.ts`
- `legacy/xiaohongshu-diagnosis.test.ts`
- `legacy/xiaohongshu-integration.test.ts`
- `legacy/kuaishou-display.test.ts`
- `legacy/kuaishou-integration.test.ts`
- `multi-platform-sync.test.ts`
- `connector-integration.test.ts` — 账号绑定 + 创作中心

### 主流程 / 选题策略(5 个)

`runLivePrediction` 相关、打分、渲染。**改主流程必看**。

- `prediction-helpers.test.ts`
- `legacy/topic-strategy-engine.test.ts`
- `legacy/topic-strategy-integration.test.ts`
- `legacy/strategy-evolution.test.ts`
- `topic-strategy-renderer-logic.test.ts`

### 缓存 / 性能(4 个)

- `city-cache.test.ts`
- `content-tag-cache.test.ts`
- `legacy/performance-tracker.test.ts`
- `analysis-view-stability.test.ts`

### Auth / API / 中间件(5 个)

- `auth.logout.test.ts`
- `legacy/auth-middleware.test.ts`
- `api-proxy.test.ts`
- `account-diagnosis-routes.test.ts`
- `legacy/cors-logger.test.ts`

### 业务 / 计费 / 个人化(4 个)

- `credits.test.ts`
- `membership-plan.test.ts`
- `personalization.test.ts`
- `commercial-quality.test.ts`

### 渲染 / 结果产出(3 个)

- `legacy/result-renderer-fixes.test.ts`
- `legacy/artifacts-lookup.test.ts`
- `live-demo-preview.test.ts`

### 外部服务 / 环境(6 个)

- `volc-asr.test.ts` — 火山 ASR
- `tikhub-key-validation.test.ts`
- `feishu-app.test.ts`
- `env-data-mode.test.ts`
- `legacy-env.test.ts`
- `legacy/billboard-integration.test.ts`

### 阶段性 / 集成(4 个)

`phase` / `round` / `toolbox` 命名暗示是阶段性集成测试。

- `phase17.test.ts`
- `round11.test.ts`
- `toolbox-v2.test.ts`
- `legacy/auto-save-e2e.test.ts` — 唯一一个名字带 e2e 的

### 算法(2 个)

- `low-follower-algorithm.test.ts`
- `creator-center.test.ts`

### 文案 / 拆解(1 个)

- `copywriting.test.ts`

---

## 测试风格 / mock 策略

vitest,**没有统一的 mock setup**。每个文件自己处理,模式不一致:

| 模式 | 文件示例 | 评价 |
|------|---------|------|
| **真实 API 调用** | `copywriting.test.ts`(去水印 API + 火山 ASR) | 跑前要环境变量,CI 难复现 |
| **纯函数单测** | `comment-service.test.ts` | 最稳,改这种 case 优先 |
| **手工构造 fixture** | `connector-integration.test.ts`(`mockDiagnosisPayload`) | 中间路径,够用 |
| **`vi.mock` / `vi.spyOn`** | 仅 4 个文件用 | 项目里少见 |

> 集成测试因为依赖真实外部服务,**离线 / CI 环境会跳过或失败**——这是已知约束,
> 还没系统化处理。

---

## 缺什么

按重要性排:

1. **e2e 测试**:目前只有 `legacy/auto-save-e2e.test.ts` 一个名字带 e2e,
   主流程 `runLivePrediction` 没有端到端覆盖。改主流程必须**人工跑一次浏览器验证**。
2. **LLM 输出质量回归**:单测覆盖不了"prompt 改了之后输出变烂"——
   这个由 [evals/](../evals/) 接管,但目前 runner 还是 skeleton。
3. **统一 mock 层**:LLM gateway / TikHub / DB 应该有一份共享的 mock,各 test
   不再各自造轮子。建议 `server/_test-helpers/`。
4. **CI 集成**:目前没有 GitHub Actions(见 P2 todo),改完代码完全靠人脑记得跑测试。
5. **覆盖率统计**:没有 `vitest --coverage`,不知道哪些代码没被覆盖。
6. **跳过策略**:依赖外部 API 的测试应当 `it.skipIf(!process.env.X)`,而不是
   "环境没配就报错"。

## 手动探针脚本

`server/scripts/probe-*.ts` 不是 vitest,不会被 `pnpm test` 自动跑。它们用于开发期诊断真实链路:

| 脚本 | 用途 |
|------|------|
| `probe-tikhub-hybrid.ts` | 看 TikHub hybrid 是否返回海外友好的视频 URL / cache URL |
| `probe-amemv-url.ts` | 对比 amemv / CDN URL 在不同视频理解模型里的可下载性 |
| `probe-real-breakdown.ts` | 复刻真实爆款拆解调用,检查 prompt / videoUrl / apollo 返回 |
| `probe-gemini-2-5.ts` | 直连 Apollo 试 Gemini 候选模型和 json_schema |
| `probe-stress-test.ts` | Apollo 模型多轮稳定性压测 |

这些脚本会读取 `.env` 并调用真实 DB / TikHub / Apollo,不要在 CI 默认跑。

---

## 改测试 / 加测试的指引

### 新加一个测试

1. 模仿同类文件(测 LLM 行为 → 看 `comment-service.test.ts`;测路由 → 看
   `account-diagnosis-routes.test.ts`)。
2. **不要 mock LLM 的具体输出文本**——它会随模型升级失效。
   要测的应是**"调用了 LLM 几次 / 调用方式对不对"**,内容质量交给 evals。
3. 用真实外部 API 的测试,加 `it.skipIf(!process.env.VOLC_ASR_APP_KEY)` 让它在 CI 跳过。

### 改了 prompt

1. 单测里**没法**验证 prompt 改对了——别在 test 里嵌入大段 prompt 字符串。
2. 跑 `evals/topic-suggest/`(接通后)→ 比 baseline 分数。
3. PR 描述里贴 5 个样本输出对比。

### 改了主流程

1. 跑 `pnpm test` 看回归。
2. **跑前端手动验证一次预测**(浏览器 → 输入关键词 → 看结果)。
3. 看时延 / token / 失败率有没有变差。

---

## 相关

- vitest 配置:`vitest.config.ts`
- LLM 评测集:[evals/README.md](../evals/README.md)
- 主流程入口:[`server/legacy/live-predictions.ts`](../server/legacy/live-predictions.ts)
- LLM 调用预算:[docs/llm-budget.md](llm-budget.md)
