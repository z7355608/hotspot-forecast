# API 清单

> 项目对外暴露两套 API:
>
> 1. **tRPC**(主要)—— `/api/trpc/*`,前端 `@trpc/client` 直连,**类型安全**
> 2. **Legacy REST**(预测主流程)—— `/api/*`,SSE / 长流式调用
>
> 入参 schema 全部用 zod 内联在路由文件里,改 schema 直接看源码。

---

## 鉴权

3 个 procedure 类型(定义在 `server/_core/trpc.ts`):

| Procedure | 含义 | 不满足时 |
|-----------|------|---------|
| `publicProcedure` | 无需登录 | — |
| `protectedProcedure` | 必须登录(`ctx.user` 必须存在) | 抛 `UNAUTHORIZED` |
| `adminProcedure` | 管理员角色 | 抛 `FORBIDDEN` |

---

## tRPC 路由清单(`/api/trpc/*`)

**7 个领域 router 文件 + `auth` / `system`,共 62 个 endpoint**(查看时直接打开对应文件,IDE 跳转)。

### `auth`(`server/routers.ts`)

登录、设置页账号资料、通知偏好、登录设备管理。

| Endpoint | 类型 | 鉴权 | 用途 |
|----------|------|------|------|
| `me` | query | public | 当前用户；登录后附带 `phone` / `phoneMasked` |
| `phoneLogin` | mutation | public | MVP 手机号 + 固定验证码登录；写 `user_sessions` 并把 `sessionId` 放入 JWT |
| `logout` | mutation | public | 清 cookie；有 `sessionId` 时标记当前 session revoked |
| `updateProfile` | mutation | protected | 修改昵称 / 邮箱 |
| `getPreferences` | query | protected | 读取通知偏好 |
| `setPreferences` | mutation | protected | 更新通知偏好 |
| `listSessions` | query | protected | 列出当前用户未 revoked 的登录会话 |
| `revokeSession` | mutation | protected | 远程下线指定会话；不能下线当前会话 |

相关表:`user_sessions` / `user_preferences`(见 `drizzle/schema.ts`,迁移 `drizzle/0006_nostalgic_dark_phoenix.sql`)。

### `system`(`server/_core/systemRouter.ts`)

系统级轻量接口。

| Endpoint | 类型 | 鉴权 | 用途 |
|----------|------|------|------|
| `health` | query | public | tRPC 轻量健康检查 |
| `notifyOwner` | mutation | admin | 给 owner 发送通知 |

### `copywritingRouter`(`server/routers/copywriting.ts`)

文案 / 拆解 / 解析相关。

| Endpoint | 类型 | 鉴权 | 用途 |
|----------|------|------|------|
| `extract` | mutation | protected | 文案抽取 |
| `parseLink` | mutation | public | URL 解析 |
| `transcribe` | mutation | protected | 视频转写 |
| `optimize` | mutation | protected | 文案优化 + 金句 |
| `videoDownload` | mutation | protected | 视频下载(去水印) |
| `smartParse` | mutation | public | 智能解析(带平台限制检测) |
| `viralBreakdown` | mutation | protected | 爆款拆解(完整流程) |
| `viralBreakdownDirect` | mutation | protected | 爆款拆解(直传 payload) |
| `generateTitleVariants` | query | protected | 生成可复用标题变体 |

### `trendingRouter`(`server/routers/trending.ts`)

热点榜。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `hotTopics` | query | public |
| `hotKeywords` | query | public |
| `surgingTopics` | query | public |

### `lowFollowerRouter`(`server/routers/low-follower.ts`)

低粉爆款样本。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `list` | query | public |
| `stats` | query | public |
| `detail` | query | public |
| `scoreHistory` | query | public |
| `thresholds` | query | public |

### `creditsRouter`(`server/routers/credits.ts`)

积分 / 订阅 / 计费。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `getBalance` | query | protected |
| `getTransactions` | query | protected |
| `getCheckinStatus` | query | protected |
| `checkin` | mutation | protected |
| `getSubscription` | query | protected |
| `subscribe` | mutation | protected |
| `purchaseCredits` | mutation | protected |
| `deductForAnalysis` | mutation | protected |
| `getCreditPackages` | query | protected |
| `getSubscriptionPlans` | query | protected |

### `contentCalendarRouter`(`server/routers/content-calendar.ts`)

内容日历 / 订阅 / 历史反馈。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `createItems` | mutation | protected |
| `listItems` | query | protected |
| `updateItemStatus` | mutation | protected |
| `updateItem` | mutation | protected |
| `deleteItem` | mutation | protected |
| `markPublished` | mutation | protected |
| `listPublished` | query | protected |
| `recordPerformance` | mutation | protected |
| `subscribe` | mutation | protected |
| `unsubscribe` | mutation | protected |
| `listSubscriptions` | query | protected |
| `isSubscribed` | query | protected |
| `predictionAccuracy` | query | protected |
| `triggerCollection` | mutation | protected |
| `historicalFeedback` | query | protected |

### `personalizationRouter`(`server/routers/personalization.ts`)

用户画像 / 分析 / 粉丝洞察。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `getProfile` | query | protected |
| `analyze` | mutation | protected |
| `confirmProfile` | mutation | protected |
| `fanInsight` | query | protected |

### `notificationsRouter`(`server/routers/notifications.ts`)

通知。

| Endpoint | 类型 | 鉴权 |
|----------|------|------|
| `list` | query | protected |
| `unreadCount` | query | protected |
| `markRead` | mutation | protected |
| `markAllRead` | mutation | protected |
| `delete` | mutation | protected |
| `clearAll` | mutation | protected |

---

## Legacy REST 路由(`/api/*`)

定义在 [`server/legacy/routes/prediction-routes.ts`](../server/legacy/routes/prediction-routes.ts)。
**主预测流程入口**——前端 `predict-stream` 走 SSE 长连接,等几十秒拿结果。

| Path | 方法 | 用途 | 备注 |
|------|------|------|------|
| `/prepare-prediction` | POST | 预测准备(内部端点) | 鉴权 + 积分扣减预校验 |
| `/predict-sync` | GET / POST | 同步预测 | 一次性返回,**最长可能 30 秒** |
| `/predict-stream` | POST | SSE 流式预测 | 主前端调用,边算边推送 |

> 这些 path 走的是 Express 中间件,**不经过 tRPC**——所以错误格式、鉴权方式与
> tRPC 路由不同。改这边的代码不要混用 tRPC 的 helper。

---

## 怎么调

### 前端(已配好)

```ts
import { trpc } from '@/lib/trpc';
const { data } = trpc.copywriting.extract.useMutation();
```

### 外部 / 调试

tRPC 是 HTTP-friendly 的,可以直接 curl(注意 `superjson` transformer):

```bash
curl -X POST http://localhost:3000/api/trpc/copywriting.parseLink \
  -H "Content-Type: application/json" \
  -d '{"json":{"url":"https://www.douyin.com/video/..."}}'
```

REST:

```bash
curl -X POST http://localhost:3000/api/predict-sync \
  -H "Content-Type: application/json" \
  -d '{"prompt":"新手妈妈/哄睡技巧"}'
```

---

## 改 / 加 endpoint 的工作流

### 改 input schema

zod schema 改完,前端会**自动**有类型提示更新(`pnpm dev` 跑着的话)。
注意检查所有调用方,会编译失败的地方就是要改的地方。

### 加新 endpoint

1. 在合适的 `routers/<domain>.ts` 文件里加一行
2. 用 `publicProcedure` / `protectedProcedure` / `adminProcedure` 选鉴权层级
3. `input(z.object({...}))` 写 schema
4. `.query(async ({ ctx, input }) => {...})` 或 `.mutation(...)`
5. **更新这份文档的对应表**(IDE 用 `cmd+P` 找 `docs/api.md`)
6. 写测试(参照 `server/*.test.ts` 模式)

### 加新 router 文件

1. 创建 `server/routers/<domain>.ts`,模仿现有的写法
2. 在 `server/_core/index.ts` 或 `appRouter` 聚合处注册
3. 这份文档加一节

---

## 已知 API 债

- 没有 OpenAPI / 自动生成的 API 文档(tRPC 自带类型,手写表格够用,但跨语言调用不友好)
- REST 路由的入参 schema 是手工解析的,**没有 zod 校验**——容易因为前端字段改名漏改
- 没有 rate limiting 中间件——**不要**把 `publicProcedure` 暴露在公网(`hotTopics`
  / `hotKeywords` / `low-follower.list` 是面向"未登录预览",但生产环境必须前置一层)
