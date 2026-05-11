# Runbook(运维手册)

> 服务"着火"时怎么办——按症状查表,每条 5 段:
> **症状 / 诊断 / 缓解(< 5 分钟) / 恢复(< 30 分钟) / 事后**。
>
> 配套读物:[SLA / 降级表](SLA-降级表.md)(每条调用挂掉的技术行为)、
> [系统流程图](系统流程图.md)。

---

## 索引(按"接到反馈第一秒能想到的关键词"组织)

| 关键词 | 可能的根因 | 跳到 |
|--------|----------|------|
| 用户说"一直转圈"/超时 | TikHub / LLM 慢 / 主流程超时 | [§1](#1-用户预测一直转圈--超时) |
| 用户说"提示余额不足" | TikHub httpStatus=402 | [§2](#2-tikhub-余额不足) |
| 用户说"选题质量明显变差" | LLM 行为漂移 / 模型升级 | [§3](#3-llm-输出质量明显下滑) |
| 监控报错率飙升 | LLM gateway 全挂 / 网络问题 | [§4](#4-llm-gateway-报错率飙升) |
| 服务 502 / 进程不响应 | Node 进程卡死 / OOM | [§5](#5-node-进程不响应) |
| MySQL 慢查询 / 连接拒绝 | DB 故障 | [§6](#6-mysql-故障) |
| 视频转写挂了 | 火山 ASR | [§7](#7-火山-asr-不可用) |
| 爆款拆解 / 视频理解失败 | Apollo 视频理解 key / 上游 / 视频 URL 可访问性 | [§8](#8-apollo-视频理解失败) |
| 所有用户都报错 | 全局降级中 | [§9](#9-全局故障应急动作) |

---

## §1 用户预测一直转圈 / 超时

**症状**:用户在预测页 30+ 秒看不到结果;前端进度条停在某一步;F12 看到 SSE 连接断或停推。

**诊断**(按这个顺序排查):

1. 看服务器日志(`pino` 输出),搜 `runLivePrediction` 最近的 trace
2. 哪一步耗时异常?对照 [SLA 表](SLA-降级表.md):
   - `parseInput` > 6s → 多模态解析慢
   - 某平台 watchTask > 30s → TikHub 慢
   - **趋势 + 选题合并 LLM > 35s → 主瓶颈**(最常见)
3. 看 ARK / TikHub 的健康面板(各自控制台)是不是处于异常状态
4. 看 `data/endpoint-health.json` 最近的 `consecutiveFailures`

**缓解(< 5 分钟)**:

- **告知用户重试一次**——单点抖动通常 60s 内恢复
- 如果是大量用户同时受影响,**进入 §8 全局动作**
- 临时把 `predict-stream` 路由前面的 nginx / proxy `read_timeout` 调到 60s+

**恢复(< 30 分钟)**:

- 看是否要重启 server(进程持续吃满 CPU 时考虑)
- 如果是 TikHub 慢,环境变量 `TIKHUB_REQUEST_TIMEOUT_MS` 可临时调短(避免长尾拖死)
- LLM 慢:gateway 已经会自动 fallback Forge,确认 fallback 路径没断

**事后**:

- 写进 `docs/incidents/<日期>-<标题>.md`(目录还没建,第一次写就建)
- 看是否需要 `evals` 跑一次回归
- 调超时的话同步更新 [SLA-降级表.md](SLA-降级表.md)

---

## §2 TikHub 余额不足

**症状**:用户看到"TikHub 余额不足"红字;日志里 `httpStatus=402`;
所有平台数据都拉不到。

**诊断**:

```bash
grep -r "httpStatus.*402" logs/ | head
```

或在 TikHub 控制台直接看余额。

**缓解(< 5 分钟)**:

1. **立刻去 TikHub 控制台充值**——这是唯一根因
2. 在 product 内挂一条公告:"数据源临时维护,请稍后再试"

**恢复**:

- 设置 TikHub 余额低于 X 时**告警**(目前没有,这是 todo)
- 评估是否需要切备用 TikHub 账号(目前没多账号)

**事后**:

- 看是不是后台 monitor 速率没控好导致烧得快(`monitor-scheduler.ts` 限速 10/分钟)
- 加预算监控

---

## §3 LLM 输出质量明显下滑

**症状**:用户反馈"选题变水了"/"标题翻译腔"/"建议和赛道不沾边";
但**没有报错,没有超时**。

**诊断**(最难诊断的一类):

1. 看是不是模型供应商悄悄升级了——Doubao / ARK 历史上有过这事
2. 跑 [evals](../evals/topic-suggest/)(接通后)对比 baseline 分数——
   主流程 ⭐ prompt 是哪个变烂了(trend / topic / semantic-filter)
3. 自己用 5 条代表性 prompt 在前端跑一遍,对比 1 周前的截图(如果有)
4. 检查最近一周的 PR 是不是改过 prompt(`git log --oneline --since="1 week ago" -- '*.ts' | grep -i prompt`)

**缓解(< 5 分钟)**:

- 如果是最近 PR 引起,**直接 revert 那个 PR**
- 如果是模型供应商改的,gateway 临时切到 GPT-5.4 或 Claude 4.6:
  改 [`server/legacy/llm-gateway.ts`](../server/legacy/llm-gateway.ts) 的默认模型,redeploy

**恢复**:

- 在 evals 里把这一类 case 加进去(防止以后再漏)
- 写 ADR 记录模型行为变化

**事后**:

- 这是 evals 体系**最该工作的场景**——如果 evals 没接通,这件事还会发生
- 见 [evals/README.md](../evals/README.md) 的接通 TODO

---

## §4 LLM gateway 报错率飙升

**症状**:监控显示 `callLLM` 失败率从 < 1% 飙到 > 10%;用户大面积反馈失败。

**诊断**:

1. 哪个模型挂的?日志里看 `model: doubao` / `gpt54` / `claude46` 的失败比
2. 是 timeout 还是 4xx / 5xx?
3. 看 ARK / OpenAI status page

**缓解(< 5 分钟)**:

- gateway 已经有自动 fallback Forge——确认 fallback 没也挂
- 如果 Doubao 整体不可用,把默认模型改 GPT-5.4 / Claude(临时 hotfix)
- 如果是限流(429),临时降低并发(对应改 `monitor-scheduler.ts` 的并发数)

**恢复**:

- 写 ADR 记录这次切模型决定(哪怕只是临时)
- 看是否需要长期多供应商负载均衡

---

## §5 Node 进程不响应

**症状**:健康检查 502;进程在但 `kill -0` 不响应;CPU 100%。

**诊断**:

1. `top` / `htop` 看是 CPU 还是内存
2. `node --inspect` attach 看 stack(线上不容易,但有的话用)
3. 最近有没有改流式 / 长连接相关代码?

**缓解(< 5 分钟)**:

- **重启进程**(`pm2 restart` 或对应平台的 redeploy)
- 通知用户"短暂维护"

**恢复(< 30 分钟)**:

- 看 OOM:
  - `result-artifacts.json` 是不是太大(目前已 1.2 MB,持续增长)→ 清掉旧记录
  - `watch-task-runs.json` 27 MB,持续增长 → 同上
- 看是不是某个 SSE 连接没正确清理:`pino` 日志里搜 `SSE` 看 open/close 平不平衡
- 看主流程有没有死循环

**事后**:

- 加进程级内存监控
- 考虑把 `data/*.json` 体积大的文件迁出本地 JSON,改用 MySQL / Redis

---

## §6 MySQL 故障

**症状**:Drizzle 查询全报 `ECONNREFUSED` / `ETIMEDOUT`;tRPC 路由大面积 500。

**诊断**:

1. `mysql -u <user> -h <host> -p` 能不能连?
2. 看 MySQL 进程 / 容器状态
3. 慢查询日志(`SHOW PROCESSLIST`)有没有锁

**缓解**:

- 联系 DBA / 重启 MySQL 实例
- **服务暂时无法降级**——MySQL 没有降级路径,见 [SLA-降级表](SLA-降级表.md)

**恢复**:

- 数据库恢复后,跑一次 `pnpm db:push` 确认 schema 同步
- 检查 `data/connectors.json` 等运行时数据有没有损坏

---

## §7 火山 ASR 不可用

**症状**:用户传视频后转写一直没结果,但**预测能跑**(走文本路径)。

**诊断**:看日志 `volc-asr` 关键字。

**缓解**:

- 跳过转写,提示用户"暂时无法处理音频,选题仍可生成"
- 主流程已经 fallback,见 [SLA-降级表](SLA-降级表.md)

**恢复**:

- 等火山服务恢复
- 评估是否要切备用 ASR(目前没有备用)

---

## §8 Apollo 视频理解失败

**症状**:用户点"爆款拆解"后失败;日志里 `modelId=apollo`;错误可能是 401 / 429 / 5xx / 视频 URL 下载失败。

**诊断**:

1. 确认 `.env` 里 `THIRD_PARTY_LLM_BASE_URL` 和 `THIRD_PARTY_LLM_API_KEY` 存在。
2. 如果配置了 `THIRD_PARTY_LLM_VIDEO_API_KEY`,优先检查这把视频专用分组 key 是否有效。
3. 跑本地探针复现:

```bash
pnpm tsx server/scripts/probe-tikhub-hybrid.ts
pnpm tsx server/scripts/probe-real-breakdown.ts
pnpm tsx server/scripts/probe-stress-test.ts
```

**缓解(< 5 分钟)**:

- 如果是视频专用 key 失效,临时移除 `THIRD_PARTY_LLM_VIDEO_API_KEY`,让 `apollo` 回退到通用 `THIRD_PARTY_LLM_API_KEY`。
- 如果是 Apollo 上游 429/5xx,提示用户稍后重试;不要切 doubao 兜底,它不支持 mp4 `image_url`。
- 如果是视频 URL 不可访问,优先用 `probe-amemv-url.ts` / `probe-tikhub-hybrid.ts` 判断是 CDN geo-block 还是 TikHub 返回问题。

**恢复**:

- 修复 key 或上游分组后,用 `probe-real-breakdown.ts` 跑一条真实视频。
- 记录可用模型 / key 分组变化,同步 [model-swap.md](model-swap.md) 和 [llm-budget.md](llm-budget.md)。

---

## §9 全局故障应急动作

**何时进入**:

- 多个核心依赖同时挂(TikHub + LLM + DB)
- 服务持续 5+ 分钟无法响应
- 用户大量(> 50 人)反馈

**动作清单**:

1. **拉一个事故频道 / 群**,任命一个事故指挥
2. **暂停后台 monitor**(避免烧 TikHub 配额):杀掉 monitor-scheduler 相关 cron
3. **挂维护页**:在 nginx / 网关层返回 503 + 文案(避免大量用户重试加重负担)
4. **保留现场**:先**别**重启进程——抓 stack / 日志 / `top` 截图
5. **每 15 分钟一次状态更新**到事故群
6. 解决完之后,写 postmortem 进 `docs/incidents/`

---

## 进 / 出维护模式

目前**没有正式的维护模式开关**——硬性挂维护要走 nginx / 反向代理层。
建议加一个 env 开关 `MAINTENANCE_MODE=1` 让 server 直接返回 503,
但这是 todo,还没实现。

---

## 监控差距(已知 todo)

按重要性排:

1. ❌ TikHub 余额低告警(目前撞墙才知道)
2. ❌ Doubao 调用成功率告警
3. ❌ Node 进程内存 / CPU 告警
4. ❌ MySQL 连接池监控
5. ❌ `result-artifacts.json` / `watch-task-runs.json` 体积告警(防 OOM)
6. ❌ evals 周期性自动跑(防止 LLM 行为悄悄漂移)

补完这些之前,**很多事故只能事后救火**。

---

## 相关

- [SLA-降级表](SLA-降级表.md) — 每条调用挂掉的技术行为
- [系统流程图](系统流程图.md) — 一次预测的全链路
- [LLM-budget](llm-budget.md) — LLM 超时矩阵
- 事故记录(将来):`docs/incidents/`
