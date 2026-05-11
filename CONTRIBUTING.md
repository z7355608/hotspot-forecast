# 贡献指南

> 目标:**clone 完 5 分钟内能跑通一次预测**。如果你卡在这之前,说明这份文档需要更新——
> 提一个 issue / PR。

新接手的同学(或 AI)请**先读一遍 [CLAUDE.md](CLAUDE.md)**——里面写了所有踩过的坑、命名误导
和隐性约束。这份文档只讲贡献流程。

---

## 1. 本地开发

### 前置要求

- **Node 20+**(用 nvm 装,`nvm use 20`)
- **pnpm 10**(本项目锁了 pnpm,**不要用 npm / yarn**,会破坏 lockfile)
- **MySQL 8**(本机起一个,或者用现成的连接串)

### 起步(5 步)

```bash
git clone <repo> && cd manus爆款预测
pnpm install
cp .env.example .env       # 然后填空,见下
pnpm db:push               # Drizzle 生成 + 迁移
pnpm dev                   # :3000(若被占自动找空端口)
```

`.env` 必填项(去 [.env.example](.env.example) 看完整字段名):

| 变量 | 用途 | 哪里拿 |
|------|------|--------|
| `TIKHUB_API_KEY` | 抖音 / 小红书 / 快手 数据源 | TikHub 控制台 |
| `ARK_API_KEY` | Doubao(火山方舟)LLM | 火山引擎方舟控制台 |
| `DATABASE_URL` | MySQL 连接串 | 本机 mysql 或测试库 |
| `JWT_SECRET` 等 | 鉴权 | 任意 32 位字符串(本地) |

### 验证起步成功

1. 打开 http://localhost:3000
2. 登录 → 默认落地"爆款选题推荐"页
3. 输入一个赛道关键词 → 应在 30 秒内返回 3 张选题卡片
4. 终端没有红色报错

---

## 2. 改代码之前

- **先看 [CLAUDE.md](CLAUDE.md)**——尤其是 4 条隐性知识(主线/旁线、`legacy/` 命名、
  LLM 预算、文档优先)。
- **先看 [docs/系统流程图.md](docs/系统流程图.md)**——如果改的是预测主流程任何一步。
- 改打分 / 算法 → 看 [docs/爆款预测系统技术说明文档.md](docs/爆款预测系统技术说明文档.md)。
- 重大改动(切模型 / 拆模块 / 新增 LLM 步骤)→ **先开一个 ADR**(放 `docs/decisions/`),
  再写代码。

---

## 3. 提交规范

### 分支

- 主干:`main`(受保护)
- 功能分支:`feat/<topic>` / `fix/<topic>` / `docs/<topic>` / `refactor/<topic>`
- **不要直接 push main**。

### Commit message(参照仓库历史)

格式:`<type>: <中文描述>`,常见 type:

- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 不改外部行为的内部重构
- `docs:` 文档
- `chore:` 构建 / 工具 / 依赖
- `test:` 仅测试

参考最近的几条:

```
fix: 服务端拉宽 requestTimeout 防止长 LLM 调用被掐断
feat: 爆款拆解去水印路径用 TikHub 替换第三方 watermark API
fix: 爆款拆解 LLM 调用 + 渲染层修复
```

写"为什么"比写"做了什么"更有价值。Diff 已经告诉别人改了什么。

### Pre-PR checklist

提 PR 前自己跑一遍:

- [ ] `pnpm check` 全过(类型)
- [ ] `pnpm test` 不增加红色测试
- [ ] 若改了 UI 或主流程,**手动跑一次预测**(golden path + 一两个边界)
- [ ] 若改了 prompt 或 LLM 调用,看一眼 token / 延时 / 成本影响
- [ ] `git diff` 自己 review 过,没把调试 `console.log`、`.env`、临时文件带上
- [ ] PR 描述讲清楚"为什么改 + 测了什么",而不只是"改了什么"

### 不要做的事

- 不要 `--no-verify` 跳 hook(hook 失败请修根因,不要绕)
- 不要 `--force` 推共享分支
- 不要把 `TIKHUB_API_KEY` / `ARK_API_KEY` / 任何密钥写进 git 追踪的文件
- 不要在 commit 里捎带不相关的"顺手清理"——单独提一个 PR

---

## 4. 测试

```bash
pnpm test           # 全部 vitest 单测(目前 49 个 .test.ts,集中在 server/)
pnpm test <pattern> # 跑匹配的子集
```

集成测试目前**缺位**,改主流程必须**手动验证一次端到端**(开发服务器 → 浏览器实操)。
后续会引入 evals 目录(`evals/topic-suggest/`)做 LLM 输出质量回归。

---

## 5. 反馈坏味道 / 提建议

- 项目级 bug / feature → GitHub issue
- 文档不准 / 上手卡住 → 直接改这份 `CONTRIBUTING.md` 或对应 doc 提 PR
- 架构层面分歧 → 不要在 issue 里长开炮,**写一份 ADR 草稿**(`docs/decisions/`)再讨论

---

## License

本项目 MIT 协议(见 [LICENSE](LICENSE))。提交即视为同意以同样协议贡献你的代码。
