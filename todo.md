# Project TODO

- [x] 初始化web-static项目并迁移前端代码
- [x] 升级为web-db-user全栈项目
- [x] 解决升级后的代码冲突（App.tsx, main.tsx, const.ts等）
- [x] 迁移原项目后端代码（legacy API, tRPC routers等）
- [x] 配置所有API密钥环境变量
- [x] 安装后端额外依赖
- [x] 推送数据库schema
- [x] 验证全栈项目正常运行
- [x] 修复所有TypeScript错误（0错误）
- [x] 验证tRPC auth.me端点正常工作
- [x] 验证legacy API health端点正常工作
- [x] 保存checkpoint并发布

## 结果页改造需求
- [x] 分析旧opportunity-prediction-renderer数据结构与新设计的映射关系
- [x] 改造new-prediction-result.tsx接受真实ResultRecord数据（替换硬编码demo数据）
- [x] 将新渲染器注册到Registry（替换旧的opportunity-prediction-renderer）
- [x] 保留下一步动作的CozeEditorDrawer输出展示编辑器
- [x] 清理旧的opportunity-prediction-renderer.tsx
- [x] 清理旧的demo路由（/demo/prediction-result）并重写ResultsDemoPage
- [x] 验证真实数据渲染效果（所有区域正常渲染：综合判断、机会分圆环、雷达图、建议切入方向、热门作品、CTA面板、相似账号、市场数据、评论词云等）
- [x] 保存checkpoint

## 产品方向文档改造需求

### 1. 结果页三层结构重做
- [x] 第一层（结果先行）：顶部第一屏改为"今日建议拍什么" + "爆款概率/爆发指数" + "推荐级别" + "立即执行按钮"
- [x] 第二层（动作建议）：紧接结果下方展示"下一步建议拍摄方式"、"是否建议马上拍/继续观察/转脚本拆解"
- [x] 第三层（归因展开）：数据支撑、账号样本、增长趋势、评论需求信号、低粉爆款归因、算法维度说明——全部默认折叠

### 2. 统一文案命名（弱化"机会判断"，围绕"爆款预测"）
- [x] 结果页"综合判断"标签改为"爆款预测结果"
- [x] "机会分"改为"爆发指数"或"爆款概率"
- [x] "综合机会分"改为"爆发指数"
- [x] "继续深挖这次机会"改为"继续深挖这次预测"
- [x] Shell层Hero标签中"黄金窗口/机会窗口/潜力窗口"改为更直接的预测级别表达
- [x] results-view-meta.ts中的WINDOW_META/OPPORTUNITY_META文案统一围绕"爆款预测"
- [x] 所有按钮文案围绕"预测/概率/可拍方向/下一步动作"

### 3. 首页入口改造（低思考成本）
- [x] HeroSection标题改为围绕"爆款预测"的核心价值描述
- [x] 输入框placeholder改为明确型引导
- [x] 首页精简：突出输入框+示例（保留DashboardInsights作为赛道情报，突出了输入框和"看看爆款预测示例"链接）

### 4. 预测理由用户化表达
- [x] 将whyNowItems的展示改为用户可理解的分类：最近增速异常/同类账号集中验证/评论需求强信号/低粉样本已跑出结果/跨平台信息差
- [x] 不展示算法术语，改为通俗表达

### 5. 数据异常拦截
- [x] 点赞/评论为0的内容在前端展示时标记或过滤
- [x] 对异常数据增加前端兜底提示

### 6. 视觉冲击力增强
- [x] 爆发指数/概率值做强视觉表现（更大字号、渐变色、动画）
- [x] 推荐级别做强表现（醒目标签/徽章）
- [x] 结果页第一屏视觉冲击力提升

### 7. 补充改动（系统审查后补全）
- [x] 低粉爆款归因补成独立折叠区（算法维度说明已融入"为什么现在值得拍"折叠区）
- [x] 首页布局调整：HeroSection移到DashboardInsights之前，首屏突出输入框
- [x] 输入框placeholder补充竞品链接和账号链接引导
- [x] 移除市场数据区域内的低粉爆款fallback（已有独立折叠区）

## 首页彻底重做（做减法）

### 核心原则：首屏只做三件事 — 价值描述 + 输入框 + 示例演示
- [x] 首屏移除DashboardInsights（赛道情报）— 信息过载，干扰核心流程
- [x] 首屏移除ValueCarousel — 与核心预测无关
- [x] PromptTemplates不再平铺展示 — 改为输入框下方的3个可点击示例标签
- [x] 新增内嵌式样例展示：展示“输入→输出”的动态示意（文档要求的demo场景）
- [x] 输入框下方增加引导动画/微交互，降低首次使用门槛
- [x] 首页整体视觉做减法，确保用户10秒内知道该干什么

## 首页优化：LiveDemoPreview改为弹窗

- [x] LiveDemoPreview从首页内嵌改为弹窗（Dialog）形式
- [x] 首屏只保留Hero+输入框+快速示例标签，一眼看完不需滚动
- [x] 快速示例标签区域增加"看看效果"触发按钮打开弹窗

## 首页优化：删除自定义赛道 + Demo弹窗增加多类型示例

- [x] 删除首页的“自定义赛道”按钮
- [x] Demo弹窗增加视频链接输入示例
- [x] Demo弹窗增加账户链接输入示例
- [x] Demo弹窗增加一句话描述输入示例（保留原有关键词示例）

## 结果页精简：删除冗余板块

- [x] 删除“保存/观察这次预测”板块（保存、未监控、最近复查等）
- [x] 删除“当前最优动作”板块（继续生成观察规则等CTA区域）
- [x] 将Agent下一步建议融入爆款预测结果区域内（已在渲染器第二层“下一步建议”中实现）

## 用户视觉编辑反馈

- [x] 删除Shell层Hero Header板块（标签+标题+摘要+指标卡，与渲染器第一层重复）
- [x] 渲染器“下一步建议”改为可操作的CTA动作面板（生成开拍方案/拆解低粉爆款/加入监控）
- [x] 渲染器CTA按钮改为Agent建议的下一步任务卡片（拆解低粉爆款/生成选题策略）

## 缺陷修复

- [x] 修正渲染器"下一步动作"面板CTA按钮：改为通过ctaId匹配getCtaActions，避免不同score下actionIndex错配
- [x] Shell层open-cta-editor事件处理改为优先ctaId匹配，兼容旧actionIndex
- [x] 确认Agent建议任务卡片点击后正确触发open-deep-dive深挖面板

## 用户视觉编辑反馈 v2

- [x] 删除Shell层838行附近的板块（FOMO/运营视角区域）
- [x] 修复FomoTeaser积分充值按钮报错（FomoTeaser已删除，问题自动解决）
- [x] 改造“建议拍摄方向”：选择方向后通过directionContext与CTA动作面板联动，注入prompt和编辑器标题
- [x] 标题从泛赛道名改为具体爆款内容：优先展示primaryCard.title + executableTopics选题标签

## 全面切换真实数据（删除所有假数据）

- [x] 删除ResultsDemoPage.tsx及其路由
- [x] 清理所有指向/results/demo的导航链接（首页、历史页、WelcomeFlow、PromptTemplates）
- [x] 调用真实接口获取一次分析结果，已成功生成真实数据（/results/rbj2jha）
- [x] 首页展示入口改为快速示例标签（填入输入框触发真实分析）
- [x] mock模式保留作为降级方案，环境变量VITE_DEFAULT_DATA_MODE已设为live
- [x] 确保所有数据流走live真实接口（已验证）
- [x] 真实分析结果已自动保存为artifact（后端在分析完成后自动保存，可通过/results/rbj2jha访问）
- [x] 首页展示入口设计为快速示例标签（用户点击后填入输入框并触发真实分析，而非展示假数据）

## 缺陷修复：充值报错

- [x] 修复充值提示 Unknown column 'balance' in 'field list'
- [x] 统一legacy和tRPC两套代码的credit_transactions列名
- [x] 创建llm_usage_logs缺失表
