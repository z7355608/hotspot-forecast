# CLAUDE.md

> 给 AI 协作者(Claude Code / Cursor 等)和新加入的人类开发者的"驾驶舱仪表盘"。
> **接手前请通读这一份**。所有踩过的坑、命名误导、隐性约束都写在这里,不在代码里。

---

## 一句话项目

短视频选题预测 SaaS。用户输入赛道关键词 / 竞品链接 / 账号 → 跨抖音 / 小红书 / 快手实时采样
+ LLM 打分 → **30 秒内**返回 3 个爆款选题卡片(标题、切入角度、爆发指数、对标样本)。

---

## ⚠️ 接手前必读的 4 条隐性知识

### 1. `server/` 是唯一后端主线

- **主线**:`server/`(Express + tRPC + Drizzle),最近还在改。
- 想"重构"任何东西时,先确认是改主线 `server/`,不要另起平行实现。

### 2. `server/legacy/` **不是** deprecated —— 命名误导

- **核心主流程 `runLivePrediction` 就在 [server/legacy/live-predictions.ts](server/legacy/live-predictions.ts) 里**。
- LLM 网关、payload 提取、意图 agent、低粉打标 …… 全是 `legacy/` 目录下的活代码。
- 后续可能改名 `pipeline/`,但**目前任何"清理 legacy"的冲动都是错的**。
- `server/services/` 是较新的服务层(copywriting / search / tikhub-resolver 等),
  和 `server/legacy/` 是**并存的现役代码**,不是新旧关系。

### 3. LLM 调用预算 = 单次预测典型 6–8 次,最少路径 3 次,这是性能/稳定性的主要负担

- 现状:主流程**必发 3 次**(`llmExtractAndClassify` 1 次 + 趋势机会 1 次 + 选题建议 1 次),
  再叠加语义过滤、低粉样本分析、评论等条件调用后,**整条预测链路典型 6–8 次**。
- 这是当前**超时、成本、稳定性**的主要瓶颈。
- 改动 prompt 或加新 LLM 步骤前,先想:**能不能合并、缓存、或拿规则替代?**
- 所有 LLM 调用都过 [server/legacy/llm-gateway.ts](server/legacy/llm-gateway.ts),
  改模型 / 切 SDK / 加重试,改这一处。
- **入库链路 LLM 不算主链路**:低粉库管线 A/B(ADR-0006、ADR-0007)的打标 / 预检查
  在主预测之外异步跑,**不计入** 6–8 次预算。详见 [docs/llm-budget.md](docs/llm-budget.md)
  「低粉爆款库链路 LLM 调用」一节。

### 4. 文档驱动对齐优先于直接改代码

- 当问题"越做越重"(比如要不要重构 / 拆模块 / 切模型)时,**先用文档拉齐**,
  再决定动不动代码。
- 重大改动前先看 `docs/` 下相关文档,必要时新增一份 ADR(`docs/decisions/`)。
- 不要默认开 PR 就动手——先对齐再做。

---

## 30 秒上手命令

```bash
pnpm install
cp .env.example .env       # 必填:TIKHUB_API_KEY / ARK_API_KEY / DATABASE_URL
pnpm db:push               # Drizzle 生成 + 迁移
pnpm dev                   # :3000(自动找空端口),前端 + tRPC + legacy /api 同进程
```

需要本地:**MySQL 8、Node 20+、pnpm 10**。

### 常用命令

| 命令 | 用途 |
|------|------|
| `pnpm dev` | 开发服务器(tsx watch,改完自动重启) |
| `pnpm check` | TypeScript 全项目类型检查(`tsc --noEmit`) |
| `pnpm test` | 跑全部 vitest 单测(目前 49 个 `.test.ts`) |
| `pnpm format` | Prettier 格式化全仓 |
| `pnpm build && pnpm start` | 生产构建 + 启动 |
| `pnpm seed:skills` | 初始化技能种子数据 |

---

## 代码结构速览(只列改动概率高的)

```
server/
├── _core/                    # HTTP 启动 + tRPC 聚合,入口 index.ts
├── legacy/                   # ⭐ 主流程在这里,不是 deprecated
│   ├── live-predictions.ts   # ⭐⭐ runLivePrediction 入口
│   ├── llm-gateway.ts        # ⭐⭐ 所有 LLM 调用的唯一出口
│   ├── intent-agent.ts       # 用户意图理解
│   ├── llm-extract.ts        # 通用 LLM 抽取
│   ├── payload-extractor.ts  # 抖音/小红书 payload 解析
│   ├── semantic-filter.ts    # 语义过滤
│   ├── topic-strategy-engine.ts  # 选题打分
│   └── routes/
│       └── prediction-routes.ts  # legacy /api 路由
├── services/                 # 较新服务层(与 legacy/ 并存)
│   ├── copywriting-extract.ts
│   ├── search-keyword-validator.ts
│   ├── smart-link-parser.ts
│   ├── tikhub-video-resolver.ts
│   └── viral-breakdown.ts
├── routers/                  # tRPC 路由
└── *.test.ts                 # 49 个 vitest 测试

client/                       # React 19 + Vite + Tailwind v4 + Radix UI
drizzle/                      # DB schema + 迁移
docs/                         # 流程图 / SLA / PRD / 技术说明
```

---

## 数据 / 服务依赖

| 依赖 | 用途 | 失败时 |
|------|------|--------|
| **TikHub API** | 抖音 / 小红书 / 快手聚合采样 | 见 [docs/SLA-降级表.md](docs/SLA-降级表.md) |
| **Doubao(火山方舟 ARK)** | 主用 LLM,通过 `llm-gateway.ts` | 同上 |
| **Volcengine ASR** | 视频语音转写 | 跳过转写,继续走文本路径 |
| **MySQL 8** | 业务数据 + 缓存 | 服务直接拒绝 |
| **AWS S3** | 媒体存储 | 见 SLA 表 |

---

## 文档地图(改动前先翻)

| 文档 | 什么时候看 |
|------|-----------|
| [README.md](README.md) | 第一次进项目 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 想理解模块边界 / 调用方向 / 已知架构债 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 第一次提 PR 前(分支规范、commit、PR checklist) |
| [docs/api.md](docs/api.md) | 改 / 加 tRPC 或 REST endpoint 前(52 个 endpoint 全表) |
| [docs/llm-budget.md](docs/llm-budget.md) | **加 / 改任何 LLM 调用前**(超时矩阵 + checklist) |
| [docs/prompts.md](docs/prompts.md) | 改 prompt 前(19 条 prompt 索引) |
| [docs/PRD-v1.md](docs/PRD-v1.md) | 想加 / 改产品功能前(v1.0 已冻结) |
| [docs/系统流程图.md](docs/系统流程图.md) | 改主流程任何一步前(每条边标了超时和降级) |
| [docs/SLA-降级表.md](docs/SLA-降级表.md) | 外部依赖故障的**技术行为** |
| [docs/runbook.md](docs/runbook.md) | 服务在烧时(故障应急 8 段) |
| [docs/deployment.md](docs/deployment.md) | 上线 / 改部署 / 写 Dockerfile 前 |
| [docs/testing.md](docs/testing.md) | 写测试 / 改测试 / 找现成 fixture |
| [docs/decisions/](docs/decisions/) | 看历史架构决策(为什么是 Doubao / 为什么不改 legacy/) |
| [docs/爆款预测系统技术说明文档.md](docs/爆款预测系统技术说明文档.md) | 改打分 / 算法前 |
| [evals/README.md](evals/README.md) | 改主流程 prompt 想做回归前 |
| [data/README.md](data/README.md) | 看运行时数据的来源/字段 |
| [todo.md](todo.md) | 看当前正在烧什么火 |

---

## 给 AI 协作者的明确禁区

- **不要**给 `server/legacy/` 改名或大规模"现代化",这是活代码。
- **不要**为了"代码整洁"在主流程里加新的 LLM 调用——预算已经紧。
- **不要** `--no-verify` 跳 hook、`--force` 推 main、`reset --hard` 别人的工作。
- **不要**把 API key / TIKHUB_API_KEY / ARK_API_KEY 写进任何被 git 追踪的文件。

---

## TikHub MCP 服务(给 AI 协作者用,不是给生产代码用)

项目根 [.mcp.json](.mcp.json) 声明了 16 个 `tikhub-*` MCP server,Authorization header
统一用 `${TIKHUB_API_KEY}` 变量替换——配置文件本身**不含**任何密钥,可以安全提交。

### 16 个服务

| MCP server | 平台 | MCP server | 平台 |
|------------|------|------------|------|
| `tikhub-douyin` | 抖音 | `tikhub-tiktok` | TikTok |
| `tikhub-xiaohongshu` | 小红书 | `tikhub-kuaishou` | 快手 |
| `tikhub-bilibili` | 哔哩哔哩 | `tikhub-weibo` | 微博 |
| `tikhub-zhihu` | 知乎 | `tikhub-wechat` | 微信 |
| `tikhub-youtube` | YouTube | `tikhub-instagram` | Instagram |
| `tikhub-twitter` | Twitter / X | `tikhub-threads` | Threads |
| `tikhub-reddit` | Reddit | `tikhub-linkedin` | LinkedIn |
| `tikhub-tikhub` | TikHub 自身能力 | `tikhub-others` | 其他平台聚合 |

### 启动方式(必读)

`.mcp.json` 里是 `${TIKHUB_API_KEY}`,**Claude Code 启动时从 shell 环境读**——
所以启动 `claude` **之前**这个变量必须已经在当前 shell 里。最简单的方式:

```bash
set -a; source .env; set +a; claude
```

(或者把 `export TIKHUB_API_KEY=...` 加进 `~/.zshrc`,但**不要**写到任何 git 追踪的文件里。)

启动后在会话里跑 `/mcp`,应能看到 16 个 `tikhub-*` 全部 connected。

### 用 / 不用 的边界(关键)

- ✅ **该用**:开发期手动验证、对单条 URL/账号一次性抓取、跨平台对比研究、prompt
  调试时构造样本、写新 service 前的探路。
- ❌ **不该用**:**任何运行时代码路径**——`server/legacy/live-predictions.ts`、
  `server/legacy/tikhub.ts`、`server/services/*` 都**不要**改成走 MCP。
  原因:MCP 远程的超时、配额、错误码、降级行为和生产 SLA(见
  [docs/SLA-降级表.md](docs/SLA-降级表.md))**不对齐**;`server/legacy/tikhub.ts` 是
  现役主线采样链路,有自己的 20s 超时和重试。
- 真要把 MCP 引入生产链路前,先起一个 ADR(`docs/decisions/`)拉齐。

### 安全回链

呼应上一节禁区第 5 条:**API key / TIKHUB_API_KEY 不要落到任何被 git 追踪的文件**。
本项目唯一合法的存放位置是 `.env`(已 gitignored)。`.mcp.json` 只准用 `${...}` 引用,
不准粘字面量。

---

## 改完之后

- `pnpm check` 必须过(类型)。
- `pnpm test` 不能新增红色——动了主流程的话,跑一次前端**手动验证一次预测**。
- 如果改了 prompt 或 LLM 调用,留意 token / 时延的影响。
- 提交前看一眼 `git status` 和 `git diff`,别把调试代码、`.env`、临时文件带上去。
