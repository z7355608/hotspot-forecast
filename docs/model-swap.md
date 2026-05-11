# 切模型 Playbook(MODEL-SWAP)

> 当 AI 大模型(默认豆包 / Doubao)出现质量下滑、限流、涨价、停服时,
> 怎么在**1 小时内**切换到备用模型并验证效果。

---

## 何时启动这份 playbook

任一信号触发即启动:

| 信号 | 来源 |
|------|------|
| 用户反馈"选题水了" / "AI 回答莫名其妙" 一周 ≥ 3 次 | 客服 / 群反馈 |
| 自动评测分数比上版基准下降 ≥ 10%(接通后) | `evals/topic-suggest/` |
| 主流程错误率 > 5%(连续 1 小时) | 监控告警 |
| 数据接口返回 429 / 5xx 持续 ≥ 30 分钟 | 服务器日志 |
| 火山方舟控制台公告:涨价 / 模型升级 / 服务变更 | 商务渠道 |

---

## 系统当前的模型布局

| 用途 | 当前默认 | 代码位置 |
|------|---------|---------|
| 主流程("找趋势" + "出选题") | doubao | live-predictions.ts |
| 内容相关性筛选 | doubao | semantic-filter.ts |
| 信息抽取 + 意图识别 | doubao | payload-extractor.ts |
| 7 维评分(LLM 路) | doubao | ai-scoring-engine.ts |
| 视频拆解(长文本) | apollo | viral-breakdown.ts |
| 账号诊断 | gpt54 | account-diagnosis-agent.ts |
| 最终降级兜底 | forge | llm-gateway.ts(自动) |

**所有调用都过 `server/legacy/llm-gateway.ts`**——这是切模型的唯一入口。

---

## 备用模型的能力对比

| 模型 | 中文质量 | 数据合规(不出境) | 长文本 | 速度 | 单次成本(估) |
|------|--------|----------------|------|------|------------|
| **doubao** | 强 | ✅ | 中 | 快 | 基线(× 1) |
| **gpt54** | 强 | ❌(国外) | 强 | 中 | × 1.5 |
| **claude46** | 强 | ❌(国外) | 强 | 中 | × 2 |
| **apollo** | 中 | ✅ | 极强(65K token) | 慢 | × 0(内部 / 免费) |
| **forge** | 中 | ✅ | 中 | 快 | × 0(兜底) |

详见 `llm-gateway.ts:166` `calcChargedCredits` 内的 `MODEL_MULTIPLIER` 表。

---

## 切换的三种姿态

### 姿态 A:**临时切换**(< 5 分钟,生产生效)

适用:**模型 / 数据接口 突发不可用,需要立刻续命**。

操作:

1. 改主流程默认模型(只有 2 处主调用):

   ```ts
   // server/legacy/live-predictions.ts:1539(趋势)
   //                            :1634(选题)
   // 把 model: "doubao" 改成 model: "claude46"(或 "gpt54")
   ```

2. **不需要重启**——`tsx watch` 会自动热重载;生产环境 `pm2 reload`。

3. 跑一次预测,看输出结构是否正常(JSON 格式没崩)。

4. 在事故频道公告"已切到 X 模型,后续观察"。

> **风险**:跨境模型(gpt54 / claude46)走代理,**延迟 +1–3 秒**,
> 主流程趋势 30s 超时可能不够——临时把超时调到 45s。

### 姿态 B:**评估切换**(2–4 小时,有信心再切)

适用:**质量信号(用户反馈 / evals 分跌)出现,需要对比备选**。

操作:

1. **离线评测对比**(15 分钟):

   ```bash
   pnpm tsx evals/topic-suggest/run.ts --tag baseline-doubao
   # 改 evals/topic-suggest/run.ts 里的 model 为 claude46,再跑
   pnpm tsx evals/topic-suggest/run.ts --tag exp-claude46
   pnpm tsx evals/topic-suggest/diff.ts baseline-doubao exp-claude46
   ```

2. **看分数差异**:
   - 总分跌:不切,继续观察 doubao
   - 总分平 / 升:进入下一步

3. **灰度切**(主流程双投):
   - 加一个 env `MODEL_AB_TEST=claude46`,代码里 50% 用户走新模型
   - 跑 24 小时,对比命中率(打点上来后)

4. 验证通过 → 全量切;验证失败 → 回 doubao。

### 姿态 C:**永久切换**(写 ADR + 路线规划)

适用:**长期决策**——例如豆包持续涨价 / 中文质量被超越。

操作:

1. 写 ADR(在 `docs/decisions/` 加 ADR-0005-default-llm-superseded.md)
   覆盖原 ADR-0001。
2. 改默认值。
3. 更新 [LLM-budget](./llm-budget.md) 的成本估算。
4. 通知运营 / 客服:用户感知可能变化。

---

## 切完之后必查的 6 项

| # | 检查项 | 怎么查 |
|---|------|------|
| 1 | 输出结构没崩(JSON 格式) | 跑一次预测,看前端没报错 |
| 2 | 端到端时延没退化(P95 ≤ 30s) | 看 5 个代表性 prompt 的耗时 |
| 3 | 中文质量主观可接受 | 看 5 条选题输出,有没有翻译腔 / 莫名其妙 |
| 4 | 错误率没飙 | 监控连续 30 分钟错误率 < 1% |
| 5 | 成本没失控 | 算一次成本估算(token × 新单价) |
| 6 | 极端 case 没崩 | 试一个超长 prompt + 一个超短 prompt |

任意一项不达标 → 立刻回滚。

---

## 各模型的已知"坑"(切前看)

### gpt54

- **JSON 严格度**:输出 markdown 时偶尔混入 ```json 包裹——记得 prompt 里强调 raw json
- **延迟波动**:跨境调用,P95 比 doubao 慢 1.5–2 倍
- **不合规**:数据出境——**只能临时应急,不能长期用作主模型**(违反 ADR-0001)

### claude46

- **温度低输出更稳**:适合做评分类(语义过滤);温度高时发散性比 doubao 强
- **prompt 工程差异**:Claude 对"system + user"分隔更敏感,如果原 prompt 是单 user,结构调整后效果更好
- **不合规**:同 gpt54

### apollo

- **超长上下文**:65K token,适合"喂整个视频转写"的场景
- **慢**:单次调用 30–60s,不适合主流程
- **免费**:内部模型,可在不影响成本的情况下做实验
- **视频专用 key**:优先使用 `THIRD_PARTY_LLM_VIDEO_API_KEY`,缺失时回退 `THIRD_PARTY_LLM_API_KEY`
- **不降级到 doubao**:apollo 的语义是视频理解,doubao 不支持 mp4 `image_url`;失败要让上层提示重试

相关探针:

```bash
pnpm tsx server/scripts/probe-real-breakdown.ts
pnpm tsx server/scripts/probe-tikhub-hybrid.ts
pnpm tsx server/scripts/probe-stress-test.ts
```

### forge(兜底)

- **质量稳定但平淡**:适合"输出可用就行"的兜底,不适合面向用户的核心 prompt
- 在 `llm-gateway.ts:301` 已经是自动 fallback,**不需要手动切**

---

## 工作流图(回到默认 vs 永久切走)

```
       检测到信号
           │
           ▼
   ┌───────────────┐
   │  姿态 A 临时切  │
   │  (5 分钟)     │
   └───────────────┘
           │
   24 小时内
           │
           ▼
   ┌───────────────┐
   │ 跑 evals 对比   │
   │ doubao vs 新   │
   └───────────────┘
           │
       ┌───┴───┐
       │       │
   分数升  分数平/跌
       │       │
       ▼       ▼
   姿态 C    回 doubao
   永久切    继续观察
   写 ADR
```

---

## 应急联系

| 角色 | 谁 | 何时找 |
|------|---|------|
| 模型供应商商务(火山方舟) | (待填) | 限流 / 涨价 / 协议问题 |
| 应用 owner(切模型最终决策) | (待填) | 永久切走 |
| 算法负责人 | (待填) | evals 跑分异常 |
| 客服 / 运营负责人 | (待填) | 用户体验出现明显波动 |

(联系方式上线前补全)

---

## 相关文档

- [`docs/llm-budget.md`](./llm-budget.md) — 成本预算,切模型后要更新
- [`docs/prompts.md`](./prompts.md) — 19 条 prompt 索引,不同模型对部分 prompt 兼容性不同
- [`docs/decisions/0001-doubao-as-default-llm.md`](./decisions/0001-doubao-as-default-llm.md) — 当前默认模型的决策
- [`evals/topic-suggest/`](../evals/topic-suggest/) — 切前必跑
- [`server/legacy/llm-gateway.ts`](../server/legacy/llm-gateway.ts) — 唯一切换入口
