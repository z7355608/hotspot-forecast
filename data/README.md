# `data/` — 运行时数据

> 项目运行时产生 / 维护的 JSON 数据。**不进 git**(目前 untracked,见末尾安全提示)。
> 这些文件不是源码,**不要手工编辑**——它们由 server 进程在运行时读写,误编辑会导致状态错乱。

---

## ⚠️ 安全提示(先读)

- `connector-secrets.json` 含 **AES-GCM 加密的会话凭证**——即使加密,也**不要进 git**
- `data/` 整个目录目前是 git untracked 状态,但 `.gitignore` **没显式排除**
- **强烈建议**:在 `.gitignore` 里加一行 `data/`,防止有人 `git add .` 时误传:

  ```bash
  echo "data/" >> .gitignore
  ```

---

## 文件清单

| 文件 | 大小 | 类型 | 用途 | 谁在写 |
|------|------|------|------|-------|
| `connectors.json` | 1.3 KB | JSON 对象,平台 ID 为键 | 已验证的社交账号配置(小红书 / 快手 / 抖音);含平台用户信息、验证状态、同步时间戳 | 用户在前端绑定账号时,后端写入 |
| `connector-secrets.json` | 16 KB | JSON 对象,加密凭证 | **敏感**:AES-GCM 加密的会话凭证(如 `登录_抖音_<UUID>`),含密文 + 更新时间 | 同上,加密后写入 |
| `endpoint-health.json` | 20 KB | JSON 对象,API 端点为键 | 第三方 API(TikHub / 爬虫等)健康监控:`httpStatus` / `businessCode` / `stable` / `tier` / 连续失败计数 | 监控任务定时写入 |
| `result-artifacts.json` | 1.2 MB | JSON 对象,artifact ID 为键 | 爆款预测结果缓存:`query` / `platform` / `score` / `verdict` / `snapshot` / `watchTaskId` | 主流程 `runLivePrediction` 完成后写入 |
| `watch-task-runs.json` | 27 MB | JSON | 监视任务运行历史日志(增量事件存储) | 后台监视任务写入 |
| `watch-tasks.json` | 0 B | JSON | 监视任务定义(目前未初始化) | 用户创建监视任务时写入 |

---

## 字段约定(TikHub 数据)

`result-artifacts.json` 里 `snapshot` 字段保存的是**已经过 payload-extractor 处理**的、
归一化后的 TikHub 数据。原始 TikHub 响应不直接落盘——见
[`server/legacy/payload-extractor.ts`](../server/legacy/payload-extractor.ts) 抽取逻辑。

跨平台字段约定(归一化后):

| 字段 | 含义 | 示例 |
|------|------|------|
| `platform` | 平台代码 | `douyin` / `xhs` / `kuaishou` |
| `videoId` / `noteId` | 平台原生 ID | `7234567890` |
| `title` | 标题 | |
| `desc` / `content` | 描述 / 正文 | |
| `stats.like` / `stats.comment` / `stats.share` / `stats.collect` | 互动数 | |
| `author.followers` | 作者粉丝数(用于低粉判定) | |
| `tags` / `hashtags` | 话题标签 | |
| `mediaUrls` | 视频 / 图片 URL(经 TikHub 去水印) | |

> 字段不全是因为各平台数据丰富度不同——业务代码用前要 `?.` 兜底,不要假设字段必有。

---

## 怎么"清空 / 重置"

```bash
# 重置全部运行时数据(会清空所有账号绑定 + 缓存)
rm -rf data/
mkdir -p data/

# 只清结果缓存(账号绑定保留)
rm data/result-artifacts.json data/watch-task-runs.json
```

清完之后下次 `pnpm dev` 启动会自动重新生成空文件。

---

## 怎么"备份"

线上环境必须定期备份(账号绑定丢了 = 用户必须重新授权登录):

```bash
# 备份(脱敏前)
tar czf data-backup-$(date +%Y%m%d).tar.gz data/

# 备份必须加密存,不要明文上传任何云盘/网盘
```

不要把 `data/` 整体推到 git / Slack / 工单系统——里面的 secrets 即使加密也是敏感。

---

## seed 数据(可进 git 的部分)

`seed-skills.mjs`(`pnpm seed:skills`)写的是 MySQL 表,不写 `data/` 目录。
如果未来要把"种子数据"加进仓库,**单独建一个 `seeds/` 目录**(可进 git),
不要混进 `data/`。

---

## 相关

- 加载 / 写入逻辑:见 `server/services/` 各 connector / cache 文件
- 凭证加密:`server/legacy/admin-secrets-helper.ts`
- 数据库主表(MySQL):见 `drizzle/schema.ts`
