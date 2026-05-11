# AGENTS.md

> 给在本仓库工作的 AI 协作者(Claude Code / Cursor / Codex 等)和新加入的人类
> 开发者的「驾驶舱仪表盘」。**接手前必读 [CLAUDE.md](../../CLAUDE.md)**——
> 项目根的那份是更短的"4 条隐性知识 + 30 秒上手"导览;这一份是给"先想认真理解,
> 再动手"的协作者的延展版。

---

## 项目概述

短视频选题预测 SaaS「**爆款预测agent**」(`baokuan-predict-agent`)。

- **一句话定义**:输入赛道关键词 / 对标视频链接 / 账号链接,**30 秒内**返回 **3 个**爆款选题(标题 + 切入角度 + 爆发指数 + 对标样本)。
- **核心业务链路**:`runLivePrediction`([server/legacy/live-predictions.ts](../../server/legacy/live-predictions.ts))
  → 三平台(抖音 / 小红书 / 快手)并行采样 + LLM 评分 → SSE 流式回写 → 前端选题卡轮播。
- **当前版本目标**:v1.0 已**冻结**(2026-04-28),正在烧 P0 阻断 + M1–M5。
  详见 [PROJECT_BRIEF.md](PROJECT_BRIEF.md) / [SCOPE_LOCK.md](SCOPE_LOCK.md) / [todo.md](../../todo.md)。

---

## 仓库结构说明

> ⚠️ 命名误导:`server/legacy/` 不是 deprecated——主流程就在那里。详见 [ADR-0002](../decisions/0002-legacy-naming-not-renamed.md)。

```
client/                       # React 19 + Vite + Tailwind v4 + Radix UI
  src/app/pages/              # 主路由页(PredictionPage / ResultsPage / ...)
  src/app/store/              # 前端状态(prediction-types.ts:282 是 AiTopicSuggestion 字段冻结源)

server/                       # 主线
  _core/index.ts              # ⭐ Express 启动 + tRPC 挂载(requestTimeout=600s)
  legacy/                     # ⭐ 主流程在这里,不是 deprecated
    live-predictions.ts       # ⭐⭐ runLivePrediction 入口
    llm-gateway.ts            # ⭐⭐ 所有 LLM 调用的唯一出口
    intent-agent.ts           # 意图分类
    payload-extractor.ts      # 抽取(含合并版 llmExtractAndClassify)
    semantic-filter.ts        # 语义过滤(阈 7,降阈 6)
    low-follower-algorithm.ts # 小账号爆款判定
    ai-scoring-engine.ts      # 7 维打分(注:不在主预测流程内)
    routes/prediction-routes.ts  # /api/predict-sync / /predict-stream
  services/                   # 较新服务层(与 legacy/ 并存,非新旧关系)
    copywriting-extract.ts / search-keyword-validator.ts / smart-link-parser.ts /
    tikhub-video-resolver.ts / viral-breakdown.ts / comment-service.ts / ...
  routers/                    # tRPC 路由(7 领域 router + auth/system / 62 endpoint)
  *.test.ts                   # 51 个 vitest 测试

shared/                       # 前后端共享类型 / 常量
drizzle/                      # DB schema + 迁移
data/                         # 运行时态数据(账号配置 / 缓存)——untracked,不进 git
docs/                         # 文档
  PRD-v1.md / api.md / llm-budget.md / prompts.md / SLA-降级表.md / 系统流程图.md /
  business/  ─ 产品定位 / 算法白皮书 / 选题漏斗 / 采集策略 / 指标体系 / 风险登记册 / 后台调度
  decisions/ ─ ADR 决策记录
  must ask/  ─ ⭐ 上下文资产(本目录所有文件)
evals/topic-suggest/          # LLM 输出回归测试(脚手架就位,接通待做)
scripts/                      # 31 个开发期工具脚本(debug / cleanup / check / seed / probe / pipeline ...)
```

### 上下文资产文件(本目录,**接手前必读**)

| 文件 | 用途 |
|------|------|
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | 项目最高优先级"是什么 / 给谁 / 验证什么" |
| [SCOPE_LOCK.md](SCOPE_LOCK.md) | v1.0 范围锁定 + Must / Won't 清单 |
| [DECISION_LOG.md](DECISION_LOG.md) | 项目级关键决策一表(D-001 到 D-009) |
| [DOMAIN_RULES.md](DOMAIN_RULES.md) | 业务术语 / 评分口径 / 真值与反例 |
| [USER_STORIES.md](USER_STORIES.md) | 用户故事 + 主链路验收 + 失败兜底 |
| [HANDOFF_PACKAGE.md](HANDOFF_PACKAGE.md) | 跨会话交接包(给下一会话 / 下一个 AI) |
| [CLAUDE.md](CLAUDE.md) | AI 协作工作原则 + 上下文优先级 + 项目关键口径 |
| [AGENTS.md](AGENTS.md) | 本文件——驾驶舱仪表盘 |

### 禁止随意修改的目录 / 文件

- `server/legacy/` 整目录(改名 / 删文件需新 ADR)—— [ADR-0002](../decisions/0002-legacy-naming-not-renamed.md)
- `client/src/app/store/prediction-types.ts:282–305`(`AiTopicSuggestion` 字段冻结)—— [PRD §8](../PRD-v1.md)
- `.env` / `data/connector-secrets.json` / 任何含密钥的文件(不进 git)—— [README.md](../../README.md)
- `.mcp.json`(只允许 `${VAR}` 引用,不允许字面量密钥)

---

## 技术栈

(取自 [README.md](../../README.md) / [package.json](../../package.json))

- **前端**:React 19 + Vite 7 + Tailwind v4 + Radix UI + TanStack Query + tRPC client + wouter(路由)
- **后端**:Node 20 + Express 4 + tRPC v11 + Drizzle ORM + mysql2 + node-cron
- **数据库**:MySQL 8(本地需起一个;`pnpm db:push` 跑迁移)
- **任务队列**:**无独立队列**,主预测是 HTTP 请求 inline 完成的;后台定时用 `node-cron` 同进程跑(`maxConcurrent=3`)
- **模型服务**:
  - 主用 LLM:**Doubao(火山方舟 ARK)**——见 [ADR-0001](../decisions/0001-doubao-as-default-llm.md)
  - 备选:GPT-5.4 / Claude 4.6 / Apollo(同 gateway 内切换)
  - 最终 fallback:Forge
  - 语音转写:Volcengine ASR(失败时跳过转写,继续走文本路径)
- **部署方式**:**单进程 Express :3000**(端口被占自动找下一个);Dockerfile 见仓库根
- **第三方服务**:
  - **TikHub**(数据接口供应商,聚合抖音 / 小红书 / 快手 / TikTok 等)
  - **AWS S3**(媒体文件:转写音频 / 视频帧抽取产物)

---

## 运行命令

(取自 [package.json:scripts](../../package.json) / [CONTRIBUTING.md](../../CONTRIBUTING.md))

| 用途 | 命令 |
|------|------|
| 安装依赖 | `pnpm install`(锁了 pnpm,**不要用 npm / yarn**) |
| 启动开发环境 | `pnpm dev`(端口 :3000,自动找空端口) |
| 运行测试 | `pnpm test`(全部 vitest 单测) / `pnpm test <pattern>` |
| 运行 lint / 类型检查 | `pnpm check`(`tsc --noEmit`) |
| 格式化 | `pnpm format`(Prettier) |
| 构建命令 | `pnpm build`(Vite + esbuild)/ `pnpm start`(生产启动) |
| 数据库迁移 | `pnpm db:push`(`drizzle-kit generate && drizzle-kit migrate`) |
| 种子数据 | `pnpm seed:skills`(初始化技能种子) |
| Prompt dump | `pnpm prompts:dump`(导出 prompt 模板) |
| 自动评测(已就位,接通待做) | `pnpm eval:topic`(→ `tsx evals/topic-suggest/run.ts`) |

`.env` 必填(见 [.env.example](../../.env.example)):`TIKHUB_API_KEY` / `ARK_API_KEY` / `DATABASE_URL` / `JWT_SECRET`。

---

## 代码规范

### 命名规则

- 文件名:多数 kebab-case(`live-predictions.ts` / `low-follower-algorithm.ts`),React 组件 PascalCase(`PredictionPage.tsx`)
- TypeScript 接口 / 类型 PascalCase;函数 camelCase
- 数据库列 camelCase(`createdAt` / `updatedAt`,见 [drizzle/schema.ts](../../drizzle/schema.ts) 注释)
- 测试文件:`<topic>.test.ts`,放在与被测代码同级或 `server/` 根

### 组件规则(前端)

- UI 基元来自 Radix UI + 自定义包装,放 `client/src/components/ui/`
- 业务组件放 `client/src/components/` 或 `client/src/app/pages/<Page>/components/`
- 状态管理:**TanStack Query**(用于 tRPC 数据)+ 局部 React state;无 Redux

### 接口规则(tRPC)

(详见 [docs/api.md](../api.md))

- 7 个领域 router 文件,每个聚焦一个领域(copywriting / trending / credits / ...);auth/system 在 `server/routers.ts`
- 鉴权层级:`publicProcedure` / `protectedProcedure` / `adminProcedure`(见 [server/_core/trpc.ts](../../server/_core/trpc.ts))
- input 用 zod 内联 schema 定义,output 由 TS 类型推导
- Legacy REST(`/api/*`)**不经过 tRPC**——错误格式 / 鉴权 / 入参校验都不一样

### 错误处理

- 业务层超时**必须**短于 gateway 默认 60s
- 失败时优先 `Promise.allSettled` + 兜底,**不要让单点失败拖垮主流程**
- TikHub 余额不足(`httpStatus=402`)→ 显式抛 + 10 分钟冷却
- 主流程的 `degraded` 不等于 `failed`——部分模块为空数组仍展示其他模块

### 日志规则

- 后端:**pino**(本地用 pino-pretty)
- 关键打点缺口:**LLM 调用 token / 耗时**目前没有结构化打点(已知,见 [docs/llm-budget.md](../llm-budget.md) §5)

### 测试规则

- vitest 单元测试为主,**集成测试缺位**——改主流程必须**手动跑一次端到端**
- LLM 输出回归走 `evals/topic-suggest/`(脚手架就位,接通待做)

### 文档更新规则

- 改代码改了价格 / 阈值 / 容量 / 时长 → **必须同步改对应文档**
  - 真值出处:`server/routers/credits.ts`(套餐价 + 积分包)、`server/legacy/llm-gateway.ts`(模型/超时)、`server/legacy/database/seed-skills.mjs`(prompt 模板)、`server/legacy/tikhub.ts`(单价 / 缓存 TTL / 超时)
- 改大决策(切模型 / 切架构 / 拆模块)→ **先开 ADR**(放 [docs/decisions/](../decisions/))再写代码
- 改 prompt 或 LLM 调用 → 留意 token / 时延的影响,在 PR 描述里写明

---

## 产品规则

### 核心业务对象

| 对象 | 含义 | 出处 |
|------|------|------|
| `AiTopicSuggestion` | 一条爆款选题(标题 / 切入角度 / 爆发指数 / 对标样本 / 标签 / conclusion / howToShoot / whyNow) | [client/src/app/store/prediction-types.ts:282](../../client/src/app/store/prediction-types.ts) **字段已冻结** |
| `runLivePrediction` 输出 | 一次预测的完整产物(含 3 张选题卡 + 趋势机会 + 评论洞察 + 市场证据 + 等等) | [server/legacy/live-predictions.ts](../../server/legacy/live-predictions.ts) |
| User / Subscription / CreditTransaction | 用户 / 订阅 / 积分流水 | [drizzle/schema.ts](../../drizzle/schema.ts) |

### 核心业务规则

- 主流程 P95 ≤ **30 秒**;一次预测**恰好输出 3 条**选题
- 主流程 LLM 调用**典型 6–8 次,最坏 10–12 次,最少 3 次**(详见 [docs/llm-budget.md](../llm-budget.md))
- 关键词扩展上限 **5 个**;数据接口请求最坏 **23 次/单次预测**
- 单次预测成本目标 ≤ **¥3**(数据源 ¥0.4–2 + AI ¥0.4–1)
- 完整规则见 [DOMAIN_RULES.md](DOMAIN_RULES.md) §2

### 权限规则

3 个 procedure(`server/_core/trpc.ts`):
- `publicProcedure`:无需登录(注意 rate-limit 缺口,详见 [docs/api.md](../api.md))
- `protectedProcedure`:必须登录,失败抛 `UNAUTHORIZED`
- `adminProcedure`:管理员角色,失败抛 `FORBIDDEN`

### 状态流规则

`AgentRunStatus`(见 [client/src/app/store/prediction-types.ts:25](../../client/src/app/store/prediction-types.ts)):
```
queued → running → completed
                 → degraded   (部分模块降级,仍给用户结果)
                 → failed     (TikHub 余额不足 / 主流程整体异常)
```

### 异常规则

详见 [docs/SLA-降级表.md](../SLA-降级表.md)。优先级:
1. **降级**(部分功能失败,主功能能给) > 整体抛错
2. 业务层超时 < gateway 默认超时(60s)< HTTP 层超时(600s)
3. TikHub 402 必须显式阻断 + 全局冷却(不要静默重试)

### 数据保留规则

- 业务主库 MySQL 长期保存
- `viral_breakdown_cache` / `title_variants_cache` MySQL 7 天 TTL
- 数据接口缓存进程内 LRU,30 分钟 / 500 条
- `data/` 整目录 untracked,不进 git
- API key 不进 git(`.gitignore` 已覆盖)

---

## AI 能力规则

### 模型调用方式

- **唯一出口**:[server/legacy/llm-gateway.ts](../../server/legacy/llm-gateway.ts) `callLLM` / `streamLLM`
- 业务代码**不允许**直接 `fetch` 模型 API(切模型 / 重试 / fallback 全部失效)
- 默认 LLM = Doubao(见 [ADR-0001](../decisions/0001-doubao-as-default-llm.md));备选 GPT-5.4 / Claude 4.6 / Apollo;最终 fallback Forge

### Prompt 存放位置

- 19 条 prompt 索引见 [docs/prompts.md](../prompts.md)
- prompt 文本目前**散落在源码里**(已知架构债,后续会做集中化)
- 主流程 prompt(改这些直接影响产品输出)集中在:
  - `intent-agent.ts:296` / `payload-extractor.ts:206 / 421` / `semantic-filter.ts:105 / 174` / `live-predictions.ts:1539 / 1634`

### 输出格式要求

- 选题输出 JSON 数组,字段对齐 `AiTopicSuggestion`(已冻结)
- 评分输出 0–10 / 0–100 数值
- LLM 输出**必须**走业务层 try/catch 解析,解析失败时降级路径接管

### JSON Schema 要求

- 主要靠 zod 校验(tRPC 入参 / 结构化输出)
- LLM 直接输出的 JSON 没有强 schema 校验,业务层手工解析(已知约束)

### 失败兜底

- 模型超时:业务层短超时触发降级(详见 [docs/SLA-降级表.md](../SLA-降级表.md))
- 模型返回非合法 JSON:`try/catch` 解析,失败走降级
- 模型全停:gateway 自动 fallback Forge

### 禁止编造

- 选题中的对标样本(`referenceTitle` / `referenceId` / `referenceAuthor`)**必须**引用真实采集到的样本
- LLM 不得为了"输出更完整"而虚构不存在的对标视频 / 账号
- ⚠️ 当前**没有强校验**,依赖 prompt 要求 + evals 抽查发现——已知风险

### AI eval 要求

- `evals/topic-suggest/`:LLM 输出回归测试(脚手架就位,接通待做)
- 改 prompt 的 PR 必须:① 配套跑 evals;② 在 PR 描述里贴 before/after 5 条样本对比;③ 留意 token 用量变化

---

## Done Definition

任务完成必须满足:

1. 功能按验收标准完成(对应 M1–M5 / 用户故事 / DOMAIN_RULES 的可观测项)。
2. 测试通过:
   - `pnpm check` 必须过(类型)
   - `pnpm test` 不增加红色测试
   - 改了主流程或 UI → **手动跑一次端到端**(golden path + 一两个边界)
3. 无明显安全 / 隐私 / 合规风险:
   - API key 没进 git
   - `protectedProcedure` 该用就用
   - 用户输入 prompt / URL 进 LLM 之前已知风险已被 PR 审视
4. 不破坏既有功能和已冻结业务规则:
   - 不动 [SCOPE_LOCK.md](SCOPE_LOCK.md) §"明确不做"
   - 不改 `AiTopicSuggestion` 字段(冻结)
5. 更新必要文档:
   - 改了价格 / 阈值 / 容量 / 时长 → 同步改 [DOMAIN_RULES.md](DOMAIN_RULES.md) / 对应业务文档
   - 改了 prompt → 在 [docs/prompts.md](../prompts.md) 索引 + [docs/llm-budget.md](../llm-budget.md) 调用清单同步
   - 改了大决策 → 新建 ADR
6. 输出变更摘要、测试结果和剩余风险(写到 PR 描述里,而不是 commit 里)。

---

## 禁止事项

- 禁止未经确认改动核心架构(包括重命名 `server/legacy/`、把 LLM 调用绕过 gateway)
- 禁止删除已有数据结构(MySQL 列只能加,不能默默删——drizzle 迁移脚本要先评审)
- 禁止绕过 `protectedProcedure` / `adminProcedure` 鉴权
- 禁止硬编码密钥(`TIKHUB_API_KEY` / `ARK_API_KEY` / 任何含密信息)进 git 追踪文件
- 禁止编造业务规则(数值 / 阈值 / 流程 / 第三方服务能力——不在代码或文档里就标"待确认")
- 禁止在未测试情况下宣称完成("通过类型检查"不等于"功能可用")
- 禁止修改已冻结范围(M1–M5 / Won't 清单 / `AiTopicSuggestion` 字段),除非 PM 明确批准
- 禁止 `--no-verify` 跳 hook、`--force` 推 main、`reset --hard` 别人的工作
- 禁止给 `server/legacy/` 改名或大规模"现代化"
- 禁止为了"代码整洁"在主流程里加新的 LLM 调用——预算已经紧
- 禁止在生产代码路径中改用 `.mcp.json` 的 tikhub-* MCP server(MCP 仅供开发期手动验证;运行时仍走 [server/legacy/tikhub.ts](../../server/legacy/tikhub.ts))

---

## 配套阅读

- [CLAUDE.md](../../CLAUDE.md) — 项目根的 AI 协作者上下文(更短的 4 条隐性知识 + 30 秒上手)
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目最高优先级
- [SCOPE_LOCK.md](SCOPE_LOCK.md) — 本版本范围
- [DOMAIN_RULES.md](DOMAIN_RULES.md) — 业务规则与评分口径
- [DECISION_LOG.md](DECISION_LOG.md) — 决策一表
- [docs/llm-budget.md](../llm-budget.md) — LLM 调用预算 + 超时矩阵
- [docs/prompts.md](../prompts.md) — 19 条 prompt 索引
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — 静态结构 + 调用方向
- [docs/系统流程图.md](../系统流程图.md) — 主流程时序
- [docs/SLA-降级表.md](../SLA-降级表.md) — 外部依赖故障行为
- [docs/api.md](../api.md) — tRPC + REST 路由清单(52 个 tRPC endpoint + 3 个 legacy REST path)
- [docs/decisions/](../decisions/) — ADR 0001–0005
