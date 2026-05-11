# 爆款预测 Agent 行业词 3 天准确率验证

目标：验证用户只输入一个行业词时，Agent 一次返回的 3 个明确选题，后续市场上是否出现相似作品，并且互动表现分是否接近预测分。

这版验证的是“评分校准 / 机会判断是否靠谱”，不是用户自己发布后的商业命中率。

## 默认样本

默认跑 10 个行业赛道：

- ai工具
- 健身减脂
- 母婴育儿
- 职场效率
- 小红书美妆
- 家居收纳
- 本地生活探店
- 数码科技
- 宠物萌宠
- 餐饮加盟

## 周期

- 评估周期：3 天
- 检查点：6 / 12 / 24 / 48 小时
- 目标：已评估检查点中，`accuracy >= 50` 的比例达到 50%+

## 怎么跑

启动一个新批次：

```bash
pnpm eval:industry:start
```

扫描已经到期的检查点，并生成最新报告：

```bash
pnpm eval:industry:check
```

补齐同一批次里未完成 / 失败 / 样本不足的行业预测，并生成报告：

```bash
pnpm eval:industry:fill -- --batch=<batchId>
```

重新采集已经检查过的到期检查点，并生成报告：

```bash
pnpm eval:industry:recheck -- --batch=<batchId>
```

`eval:industry:recheck` 默认最多重采 100 个到期检查点；需要更大批量时可加 `--max-checkpoints=<数量>`。

只生成报告：

```bash
pnpm eval:industry:report
```

生成深度明细报告（Markdown + JSON + CSV）：

```bash
pnpm eval:industry:detail
```

查看批次：

```bash
pnpm eval:industry:list
```

可选参数：

```bash
pnpm eval:industry:start -- --tracks=ai工具,健身减脂 --platforms=douyin
pnpm eval:industry:fill -- --batch=<batchId> --tracks=本地生活探店,数码科技
pnpm eval:industry:check -- --batch=<batchId>
pnpm eval:industry:recheck -- --batch=<batchId> --max-checkpoints=300
pnpm eval:industry:detail -- --batch=<batchId>
```

## 数据和报告

- 状态文件：`data/industry-accuracy-eval.json`
- 报告目录：`evals/industry-accuracy/reports/`
- 深度报告会额外输出：
  - `*.detail.md`：逐选题/逐检查点/相似作品证据
  - `*.detail.json`：完整结构化明细
  - `*.detail.csv`：方便表格筛选的逐检查点数据

## 计算口径

- 只有 `supportingContents >= 3` 的预测结果才进入后验准确率验证；真实内容样本不足时，只能算选题草案，不计入准确率分母。
- `predictedScore`：Agent 对单个选题给出的预测分，缺失时使用结果总分降级。
- `actualScore`：TikHub 搜到的预测后新相似作品互动表现分。
- 有播放量时，复用效果追踪的互动率评分逻辑。
- 没有播放量但有点赞 / 评论 / 收藏 / 分享时，使用加权互动和同批搜索排名估算表现分。
- 单个检查点取 Top 3 相似样本表现分的中位数，降低单条异常视频的影响。
- `accuracy = 100 - abs(predictedScore - actualScore)`。
- 宽松靠谱比例：`accuracy >= 50` 的比例。
- 严格靠谱比例：`accuracy >= 80` 的比例。
- 置信度：综合相似样本数、是否有预测后样本、最高相似度和 accuracy 判断。

检查点搜索不新增 LLM 调用，只使用 TikHub 搜索和规则匹配。预测前旧样本和发布时间未知样本不进入准确率计算。
