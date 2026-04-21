现有三个视图的 URL

/ = 首页（输入工作台）

/results/:id = 结果页，必须是真实路由

analyzing 不建议做独立 URL

它是瞬时态 / 过渡态

用户提交后在当前流程内展示即可

分析完成后自动进入 /results/:id

不希望用户单独访问一个“分析中页面”

所以建议链路是：

首页输入后提交

当前页进入 analyzing state

完成后自动跳到 /results/:id

是否新增页面
这期建议先加这些真实页面：

/history = 历史分析记录 / 已保存结果

/credits = 积分余额、充值、会员权益

/connectors = 关联平台账号管理（抖音、小红书等）

/settings = 账户与偏好设置

* = 404 / not-found

如果要收敛 MVP，优先级建议：

P0：/results/:id、/history、/credits

P1：/connectors、/settings

P0：404 也加上

结果页是否支持深度链接 / 分享

需要

结果页应该支持深度链接和收藏

推荐使用：/results/:id

不建议只用 query string 方式，比如 /results?q=xxx

query 更适合临时搜索态

id 更适合唯一分析结果、历史记录、分享、回访

建议规则：

每次正式生成结果后，创建唯一结果 id

结果页通过 /results/:id 访问

页面内部可以再带少量 query 参数做 UI 状态控制，但主路由以 id 为准

侧边栏是否接真实路由

要接

侧边栏不应该只是静态占位

至少这几个需要有真实跳转：

建议映射：

爆款分析Agent → /

热门趋势 → 先预留真实路由，例如 /trends

低粉爆款 → 先预留真实路由，例如 /low-follower-opportunities

数据看板 → 先预留真实路由，例如 /dashboard

历史记录 → /history

积分 / 会员 → /credits

账号连接 → /connectors

设置 → /settings

如果“热门趋势 / 低粉爆款 / 数据看板”这期还没做完，可以：

先建路由空壳页

或进入占位页

但导航结构先真实化，不要继续静态

补充一个关键交互要求
请按下面逻辑处理“继续追问”：

继续追问不要跳新页面

在当前 /results/:id 页面内展开输入框

追问提交后：

轻追问：局部更新当前结果模块

重追问 / 执行型追问：在当前结果页追加新的结构化结果模块

路由保持不变，仍然是当前 /results/:id

也就是说：

首次分析：生成一个结果页 id

后续追问：都发生在这个结果页内，而不是不断创建新 URL

推荐的最终路由方案

/                      首页
/results/:id           结果页（含继续追问）
/history               历史记录
/credits               积分 / 会员
/connectors            平台连接管理
/settings              设置
/trends                热门趋势（可先占位）
/low-follower-opportunities   低粉爆款（可先占位）
/dashboard             数据看板（可先占位）
*                      404

一句话产品原则

首页和结果页要分离

analyzing 只是状态，不是页面资产

结果页要可收藏、可回访、可分享

继续追问属于结果页内部交互，不新开路由