# 部署 (Deployment)

> 把这个项目跑到生产环境。本地开发看 [README.md](../README.md) / [CONTRIBUTING.md](../CONTRIBUTING.md)。
> 故障应急看 [docs/runbook.md](runbook.md)。

---

## TL;DR

```bash
# 1. 配齐 .env(见下面"环境变量"段)
# 2. 起 MySQL 8(自管或 RDS)
# 3. 构建镜像
docker build -t baokuan-predict-agent:latest .
# 4. 跑容器(把 .env 和 data/ 挂进去)
docker run -d \
  --name baokuan \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  baokuan-predict-agent:latest
# 5. 跑迁移(首次 / 升级时)
docker exec baokuan node -e 'import("drizzle-kit/api").then(m=>m.migrate())' \
  || # 或者直接在 host 上 pnpm db:push
  pnpm db:push
```

---

## 构建产物

`pnpm build` 在 host 跑会产出:

```
dist/
├── index.js           # esbuild 打包的 server(esm),`pnpm start` 用
├── index.js.map
└── public/            # vite 构建的前端静态文件
    ├── index.html
    └── assets/
```

`server/_core/index.ts` 是 esbuild 入口,`--packages=external` 表示 `node_modules` 仍要带在运行时。
所以镜像里**既有 dist 又有 prod node_modules**。

---

## Docker 镜像

仓库根有 [`Dockerfile`](../Dockerfile) 三阶段:

1. **builder**:`pnpm install` + `pnpm build`(完整 deps 跑 vite + esbuild)
2. **prod-deps**:`pnpm install --prod`(只装运行时依赖,缩 node_modules)
3. **runner**:`node:20-alpine` + dist + 精简 node_modules,**非 root 用户运行**

镜像大小估算:~200–250 MB(基于 alpine + node 20)。

构建:

```bash
docker build -t baokuan-predict-agent:$(git rev-parse --short HEAD) .
docker tag baokuan-predict-agent:$(git rev-parse --short HEAD) baokuan-predict-agent:latest
```

---

## 环境变量

完整表见 [`.env.example`](../.env.example)。**生产必填**:

### 必填

| 变量 | 用途 | 示例 |
|------|------|------|
| `NODE_ENV` | 生产必须 `production` | `production` |
| `PORT` | 监听端口 | `3000` |
| `DATABASE_URL` | MySQL 连接串(优先于 `DB_*`) | `mysql://user:pass@host:3306/db` |
| `JWT_SECRET` | 鉴权签名密钥(**至少 32 字节随机**) | `openssl rand -hex 32` |
| `CONNECTOR_SECRET_KEY` | 第三方账号凭证加密(AES-GCM) | `openssl rand -hex 32` |
| `APP_PUBLIC_BASE_URL` | 前端可见的对外 URL | `https://baokuan.example.com` |
| `TIKHUB_API_KEY` | 数据源 | TikHub 控制台 |
| `ARK_API_KEY` | Doubao LLM | 火山方舟控制台 |
| `ARK_DOUBAO_ENDPOINT_ID` | Doubao 端点 ID | 同上 |
| `VOLC_ASR_APP_KEY` / `VOLC_ASR_ACCESS_KEY` | 火山 ASR | 火山引擎控制台 |

### 可选

| 变量 | 用途 |
|------|------|
| `THIRD_PARTY_LLM_BASE_URL` / `THIRD_PARTY_LLM_API_KEY` | 第三方 LLM(GPT / Claude 等代理) |
| `APOLLO_IMAGE_BASE_URL` / `APOLLO_IMAGE_API_KEY` | Apollo 图片生成分组；结果页“生成标题与封面图”会调用 `gpt-image-2-all`，缺失时复用 `THIRD_PARTY_LLM_*` |
| `THIRD_PARTY_LLM_VIDEO_API_KEY` | Apollo 视频理解专用分组 key；`apollo` 模型优先用它，缺失时回退 `THIRD_PARTY_LLM_API_KEY` |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Forge fallback |
| `OAUTH_SERVER_URL` / `VITE_OAUTH_PORTAL_URL` | OAuth 集成 |
| `TIKHUB_REQUEST_TIMEOUT_MS` | 覆盖 TikHub 默认 20s 超时 |
| `VITE_APP_ID` / `APP_ID` | 应用标识 |

### 不要泄漏

- 任何 `*_KEY` / `*_SECRET` / `DATABASE_URL` 都**必须只在容器 env 里**
- **不要**通过 `docker history` 把它们烤进镜像层
- 用 secret 管理工具(Vault / AWS Secrets Manager / Kubernetes Secret),不要 `.env` 进 git

---

## 数据库迁移

Drizzle 管理 schema,`drizzle/*.sql` + `drizzle/meta/` 是迁移文件。

### 首次部署

```bash
# 在 host 跑(需要 pnpm)
pnpm db:push
```

`db:push` = `drizzle-kit generate && drizzle-kit migrate`,会把 schema 同步到 MySQL。

### 升级部署

**先迁移再切流量**:

1. 拉新版本镜像
2. 先在测试库跑 `pnpm db:push`,验证 schema 兼容旧代码
3. 上线新代码 + 跑 `pnpm db:push` 在生产库
4. 验证健康检查通过

**回滚**:Drizzle 没有自动 down 迁移——要回滚必须手工写反向 SQL。
**不向后兼容的 schema 改动需要分两次发布**(扩展 → 迁移 → 收口)。

### 当前账号设置相关表

迁移 `0006_nostalgic_dark_phoenix` 新增:

| 表 | 用途 | 代码入口 |
|----|------|----------|
| `user_sessions` | 设置页"登录设备管理";JWT payload 带 `sessionId`,鉴权时校验未 revoked | `server/db.ts` / `server/_core/sdk.ts` / `server/routers.ts` |
| `user_preferences` | 设置页通知偏好开关 | `server/db.ts` / `server/routers.ts` |

---

## 持久化数据

容器内有 3 类需要持久化的状态:

| 路径 | 内容 | 处理 |
|------|------|------|
| `/app/data/` | 运行时 JSON(账号绑定、缓存) | **挂载 volume** 或主机 bind mount |
| MySQL | 业务主库 | 外部托管(RDS / 自管),容器只是客户端 |
| AWS S3 | 媒体文件 | 外部托管 |

`data/` 必须挂出来——见 [data/README.md](../data/README.md)。
没挂的话每次重启用户就要重新绑定账号。

---

## 健康检查

服务提供进程级健康检查:

```bash
curl -s http://localhost:3000/healthz
```

返回 `ok / ts / uptime / pid`。它故意**不探测 DB / LLM / TikHub**:只证明进程已启动、事件循环可响应。
外部依赖健康要看各自接口 / 日志 / 控制台,不要把慢外部依赖塞进 `/healthz`。

---

## 反向代理 / TLS

容器只暴露 HTTP `:3000`。生产**必须**前置反向代理(nginx / Caddy / Traefik / 云 LB)处理:

- TLS 终结
- HTTP/2 / SSE keep-alive(`/api/predict-stream` 是 SSE,**`proxy_buffering off`**!)
- 适当的 `proxy_read_timeout`(LLM 调用可能 30s,网关默认 60s 不够,设 **120s+**)
- 静态资源缓存(`/assets/*` 长 cache)

nginx SSE 关键配置:

```nginx
location /api/predict-stream {
  proxy_pass http://baokuan:3000;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;             # ← 必须
  proxy_cache off;
  proxy_read_timeout 120s;
  chunked_transfer_encoding off;
}
```

不配 `proxy_buffering off`,SSE 会等 buffer 满才 flush——用户看起来"卡住不推"。

---

## 部署形态推荐

按规模:

| 场景 | 推荐 |
|------|------|
| 内测 / 单实例 | 单容器 + 自管 MySQL,nginx 前置,人工部署 |
| 小规模生产 | 容器编排(Docker Compose / Nomad)+ RDS + S3 + 云 LB |
| 多实例 | K8s,但**注意**:`data/*.json` 是本地状态,多实例**必须**共享 volume,或者迁去 MySQL/Redis(目前没做) |

**当前架构存在多实例瓶颈**:
- `data/*.json` 是单实例本地文件,多实例会数据漂移
- 内存缓存 `content-tag-cache` / `city-cache` 是进程内,不共享
- node-cron 定时任务在每个实例都会跑,**多实例会重复跑**——需要加分布式锁或单独 worker 进程

→ 多实例之前先解决这些(进 todo)。

---

## 部署 checklist(每次发布前过)

- [ ] `.env` 所有必填字段都设了,key 没过期
- [ ] 数据库迁移已经跑(测试环境验证过)
- [ ] `pnpm check` + `pnpm test` 都过
- [ ] 镜像构建成功,本地 `docker run` 能起
- [ ] 健康检查路径返回 200
- [ ] nginx / 反代的 SSE 配置确认(`proxy_buffering off`)
- [ ] 备份了 `data/`(有运行时态数据时)
- [ ] 新增 LLM 调用?跑过 evals(将来)
- [ ] 看了 [runbook.md](runbook.md),知道挂了怎么处理

---

<a id="cron"></a>
## Cron 定时任务

### 低粉爆款 billboard 入库管线(ADR-0007)

**首次部署**:

```bash
# 1) 一次性 schema 升级(在 v5 基础上 ALTER + CREATE,幂等)
pnpm tsx server/scripts/apply-billboard-schema.ts

# 2) 一次性把 ADR-0007 之前的 116 条历史样本标 expired
pnpm tsx server/scripts/mark-pre-billboard-expired.ts --dry-run  # 先看影响
pnpm tsx server/scripts/mark-pre-billboard-expired.ts            # 确认后真改

# 3) 类目树首次 seed
pnpm tsx server/scripts/seed-billboard-categories.ts

# 4) 初始阶段小流量验证(每类目 1 页 + dry-run 看预检查通过率)
pnpm tsx server/scripts/run-billboard-pipeline.ts --init --dry-run
# 5) 正式跑入库
pnpm tsx server/scripts/run-billboard-pipeline.ts --init
```

**crontab 部署**(每天 08:00 = 管线 B / 每周一 09:00 = 管线 C):

```cron
# 管线 B(ADR-0007):billboard 每日刷新 + backfill stats + tagger
0 8 * * *      cd /path/to/repo && /usr/local/bin/pnpm tsx server/scripts/run-billboard-pipeline.ts \
                 && /usr/local/bin/pnpm tsx server/scripts/backfill-billboard-stats.ts \
                 && /usr/local/bin/pnpm tsx server/scripts/run-tagger.ts \
                 >> /var/log/lf-billboard.log 2>&1

# 管线 C(ADR-0008):search 补样每周一 09:00 + tagger
0 9 * * 1      cd /path/to/repo && /usr/local/bin/pnpm tsx server/scripts/run-search-pipeline.ts \
                 && /usr/local/bin/pnpm tsx server/scripts/run-tagger.ts \
                 >> /var/log/lf-search.log 2>&1
```

**首次 backfill(ADR-0008,本次手动一次):**
```bash
pnpm tsx server/scripts/apply-search-schema.ts             # 1. schema v7 (source ENUM 加 'search')
pnpm tsx server/scripts/run-search-pipeline.ts --backfill  # 2. 30kw × 2 页大流量
pnpm tsx server/scripts/run-tagger.ts                      # 3. 给新入库样本打标
```

**初始 → 正常切换条件**(ADR-0007 §Step 2):
连续 3 天预检查通过率稳定在 ≥ 10% 且无类目级异常,把 crontab 行去掉 `--init`(默认 = 拉到接口最大上限)。

**报警监控**:tail `/var/log/lf-billboard.log`,搜 `🚨 预检查通过率`——出现就要看 prompt 或类目漂移。

### 主预测路径里的 node-cron

无(主链路是请求驱动)。低粉管线 A(seed_topic 检索)由 `live-predictions.ts` 实时触发,**不依赖** cron。

---

## 已知部署债

按重要性:

1. **没有 graceful shutdown**——`SIGTERM` 不优雅,可能切断进行中的预测
2. **没有结构化进程指标**(Prometheus / OpenTelemetry)
3. **`data/*.json` 单实例瓶颈**(见上面的"多实例"段)
4. **没有自动迁移**:升级要人工 `pnpm db:push`
5. **没有 CI/CD**:见 P2 todo,该有 GitHub Actions 自动构建 + 推镜像

---

## 相关

- [Dockerfile](../Dockerfile)
- [.dockerignore](../.dockerignore)
- [.env.example](../.env.example)
- [runbook.md](runbook.md) — 故障应急
- [data/README.md](../data/README.md) — 运行时数据管理
