# 爆款预测agent

短视频选题预测 SaaS。用户输入赛道关键词 / 竞品链接 / 账号链接，系统跨抖音 / 小红书实时采样 + LLM 打分，给出当下「最值得拍什么」的选题方向和低粉爆款样本参考。

## 怎么跑起来

```bash
pnpm install
cp .env.example .env       # 填入 TIKHUB_API_KEY / ARK_API_KEY / DATABASE_URL 等
pnpm db:push               # 生成并执行 Drizzle 迁移
pnpm dev                   # 启动 :3000，前端 + tRPC + legacy /api 同进程
```

需要本地：MySQL 8、Node 20+、pnpm 10。

## 目录说明

| 目录 | 说明 |
|------|------|
| `client/` | 前端（React 19 + Vite） |
| `server/` | 后端（Express + tRPC + Drizzle）。`pnpm dev` 跑的就是它。 |
| `server/legacy/` | **不是 deprecated**。`runLivePrediction` 主流程就在这里（[live-predictions.ts](server/legacy/live-predictions.ts)），命名误导。后续考虑改名 `pipeline/`。 |
| `server/services/` | 较新的服务层（copywriting-extract / search-keyword-validator / tikhub-video-resolver 等）。 |
| `server/routers/` | tRPC 领域路由；根 `server/routers.ts` 还内联 `auth` 账号 / 会话 / 偏好接口。 |
| `drizzle/` | 数据库 schema 与迁移。 |
| `docs/must ask/` | 交接上下文资产（项目简报、领域规则、范围锁、决策日志等），给 AI 协作者和新成员快速对齐。 |
| `server/scripts/probe-*.ts` | 本地诊断探针，只用于开发期验证 TikHub / Apollo / 爆款拆解链路，不进入生产运行路径。 |

## 技术栈

- **前端**：React 19 + Vite + Tailwind v4 + Radix UI + TanStack Query + tRPC client
- **后端**：Node 20 + Express + tRPC v11 + Drizzle + MySQL 2 + node-cron
- **AI**：GPT-5.5（默认用户模型）+ Doubao（火山方舟 ARK，现有主流程兼容）+ Volcengine ASR
- **数据源**：TikHub（聚合抖音 / 小红书）+ AWS S3（媒体）

## 入口指引

- 主预测流程：[server/legacy/live-predictions.ts](server/legacy/live-predictions.ts) `runLivePrediction`
- LLM 网关（所有 LLM 调用都过这里）：[server/legacy/llm-gateway.ts](server/legacy/llm-gateway.ts)
- HTTP 入口：[server/_core/index.ts](server/_core/index.ts)（tRPC）+ [server/legacy/routes/prediction-routes.ts](server/legacy/routes/prediction-routes.ts)（legacy /api）
- tRPC 路由：[server/routers/](server/routers/) + [server/routers.ts](server/routers.ts)（auth / system / low-follower / copywriting / credits / trending / personalization / content-calendar / notifications）
- 设置页账号持久化：`auth.updateProfile` / `auth.getPreferences` / `auth.listSessions` 等，数据表见 `user_preferences` / `user_sessions`

## 文档

| 文档 | 用途 |
|------|------|
| [docs/系统流程图.md](docs/系统流程图.md) | 一次预测的全链路图，每条边标注超时和降级 |
| [docs/SLA-降级表.md](docs/SLA-降级表.md) | 每个外部调用挂掉时会发生什么 |
| [docs/爆款预测系统技术说明文档.md](docs/爆款预测系统技术说明文档.md) | 算法和评分细节（已有） |
| [docs/agent-architecture-redesign.md](docs/agent-architecture-redesign.md) | 历史架构改进诊断（已有） |
| `爆款预测agent_·_AI_爆款预测_Agent_—_项目汇报方案（完整版）_v2.docx` | 产品方案文档 |

## 常用命令

```bash
pnpm dev               # 开发服务（:3000 自动找空端口）
pnpm build && pnpm start
pnpm check             # tsc --noEmit
pnpm test              # vitest
pnpm seed:skills       # 初始化技能数据
```

## 本地诊断脚本

`server/scripts/probe-*.ts` 是一次性诊断工具，默认会读取 `.env` 并调用真实 TikHub / Apollo / MySQL。
运行前先确认 key 和数据库是测试可用的，不要把脚本里的固定样例链接当成生产配置。

```bash
pnpm tsx server/scripts/probe-tikhub-hybrid.ts
pnpm tsx server/scripts/probe-real-breakdown.ts
pnpm tsx server/scripts/probe-stress-test.ts
```
