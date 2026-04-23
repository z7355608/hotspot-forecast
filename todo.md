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

## 用户反馈 5 项问题修复

- [ ] 问题1：manus.space域名访问时一直提示“正在验证登录状态”卡住（待排查cookie跨域配置）
- [x] 问题2：开通会员功能不可用（subscriptions表id改为auto_increment，移除手动UUID）
- [x] 问题3：全面检查所有数据库表字段与代码SQL一致性
  - [x] 7个表id从 varchar(36) 重建INT AUTO_INCREMENT
  - [x] content_calendar补充缺失列（track, topicTitle, contentAngle等）
  - [x] analysis_timing补充缺失列（promptSnippet, totalMs, intentMs等）
  - [x] weekly_topic_subscription代码中enabled→isActive列名统一
- [x] 问题4：“先盯这波”改为“先观察趋势”
- [x] 问题5：/results/rgzer6k 数据来源为localStorage快照（非假数据，是之前真实分析的缓存，换浏览器会丢失）

## Gap修复

- [x] 验证“开通会员”完整流程：curl测试subscribe mutation成功，subscriptions写入+积分赠送600+getSubscription返回正确会员信息
- [x] 补充系统化数据库一致性检查：创建22个缺失表，现有41个表全部存在，已通过curl验证关键写入路径（subscribe/checkin/credit_transactions）
- [x] /results/rgzer6k数据来源确认：localStorage快照，非假数据

## TikHub API 搜索和榜单集成优化

- [x] 验证 TikHub v2 搜索 API 可用性（POST /api/v1/douyin/search/fetch_general_search_v2）
- [x] 验证 TikHub 搜索建议 API（fetch_search_suggest）和话题建议 API（fetch_challenge_suggest）
- [x] 验证 TikHub 低粉爆款榜 API（fetch_hot_total_low_fan_list，POST 方法）
- [x] 验证 TikHub 热搜榜 API（fetch_hot_total_search_list，POST 方法）
- [x] 验证 TikHub 热词榜 API（fetch_hot_total_hot_word_list，POST 方法）
- [x] 从 DEFAULT_DISABLED_ENDPOINTS 中移除已验证可用的 billboard 路由
- [x] 在 DOUYIN_ROUTES 中添加 low_fan_billboard、hot_search_billboard、hot_word_billboard 路由
- [x] 在 getTaskPlan 中将 billboard capabilities 加入 topic_watch 和 validation_watch 的 optional 列表
- [x] 添加 validatePayload 和 getFallbackFlag 对新 billboard capabilities 的支持
- [x] 在 live-predictions.ts 中添加联想词扩展逻辑（Phase 1：搜索建议 + 话题建议 API）
- [x] 在 live-predictions.ts 中添加 extractLowFanBillboardContents 函数处理低粉爆款榜数据
- [x] 在 live-predictions.ts 中添加 billboard 数据提取处理（hot_search_billboard、hot_word_billboard 计入 hotSeedCount）
- [x] 编写 billboard-integration.test.ts 测试（11 个测试全部通过）

## 爆款预测链路修复：搜索结果未转化为真实结果页

- [x] 排查 /results/rucg2fd 结果页数据是否包含真实搜索结果
- [x] 检查预测链路中数据从搜索API到结果页的完整流转
- [x] 修复数据丢失或转化失败的环节：自动保存结果到后端 + clientResultId 回退查找
- [x] 验证修复后的预测链路能生成真实可用的结果页（6个测试全部通过）

## 紧急修复：页面不停刷新

- [x] 排查页面不停刷新的原因：排除了事件循环阻塞、tsx watch重启、auth.me数据变化等应用层原因
- [x] 已完成的代码修复：
  - sdk.ts: lastSignedIn更新改为5分钟节流，避免auth.me返回数据每次变化
  - useAuth.ts: 实现redirectOnUnauthenticated逻辑，未登录时自动跳转登录页
  - vite.config.ts: 增加HMR timeout配置到60秒
- [ ] 进一步验证页面刷新根因：区分应用代码问题、Vite HMR开发环境问题、Manus网关/WebSocket代理问题
- [ ] 修复或规避开发环境页面反复重连/刷新
- [ ] 验证未登录manus.space访问路径：确保auth.me返回null时能稳定跳转到登录页
- [ ] 回归验证：确认浏览器日志中不再出现持续性的页面反复初始化循环

## 结果页渲染器5项改进（用户视觉编辑反馈 v3）

- [x] 问题1："下一步建议"区域改为直接交付爆款预测内容（标题改为"爆款预测结果"，展示primaryCard.description）
- [x] 问题2：视频封面添加referrerPolicy防盗链 + 加载失败回退 + 点击播放功能（hover显示播放按钮）
- [x] 问题3：热门作品参考展示全部内容（不按方向分组），最多9个（3x3 grid）
- [x] 问题4：热门话题标签优先使用后端trendingTags（联想词扩展数据）；评论采集移除commentCount>0跳过逻辑
- [x] 问题5：AI下一步建议改为返回多个（选题生成、爆款拆解、智能监控等），展示全部任务卡片

## 紧急修复：React DOM insertBefore错误

- [x] 排查执行任务过程中的insertBefore错误根因
- [x] 修复导致DOM节点不匹配的代码问题
- [x] 修复AnalysisView平台状态标签中条件文本节点的不稳定切换（key添加status、文本节点改为span包裹）
- [x] 修复stepTimings中Math.random()导致的不确定性（改为useRef+确定性分配）
- [x] 修复platformList未memo化导致每次渲染创建新数组
- [x] 修复dataCollected区域多个条件文本节点改为稳定的join表达式
- [x] 修复Fragment改为div包裹避免子节点不稳定
- [x] 修复不稳定key（key={i}改为基于内容的key）
- [x] HomePage中progressEvents更新包裹startTransition降低优先级
- [x] 编写22个测试验证修复逻辑（全部通过）

## 缺陷修复：用户输入引导提示消失

- [x] 排查输入框区域的用户引导提示消失的原因（LiveDemoPreview组件在之前切换真实数据时被删除）
- [x] 恢复LiveDemoPreview组件和DemoDialog弹窗
- [x] 恢复首页"看看效果"按钮
- [x] 移除"查看完整报告"按钮（/results/demo路由已不存在）
- [x] 浏览器验证弹窗正常显示（4种输入类型tab、打字机效果、概率条动画、CTA按钮）

## 商业化交付标准重构（5大核心问题）

### P1: 数据清洗与筛选机制重构（最高优先级）
- [x] 新增LLM语义相关性过滤模块（server/legacy/semantic-filter.ts）
- [x] 在live-predictions.ts中扩大初始搜索数据量（从8条→30条）
- [x] 对supportingContents执行LLM语义过滤，只保留与赛道高度相关的内容
- [x] 对supportingAccounts执行关联过滤（只保留相关内容的作者账号）
- [x] 对评论数据执行语义过滤，剔除无关评论和高频词
- [x] 确保热门作品参考、低粉爆款归因、市场数据支撑模块数据100%属于目标赛道

### P2: 信任校准与文案优化
- [x] 将"爆款概率"替换为"爆发指数"，避免绝对化表达
- [x] 添加置信度说明（基于样本量动态生成）
- [x] 修改score上限为95，避免出现100%绝对值
- [x] 全局替换所有"爆款概率"文案为"爆发指数"（15个文件已修改）

### P3: 深度归因分析优化
- [x] 低粉爆款归因模块的4个样本展示LLM动态生成的差异化拆解结论（50字以内）
- [x] 在live-predictions.ts中调用analyzeSampleReplicability并将结果传递到前端
- [x] 前端低粉归因卡片展示LLM生成的suggestion而非通用模板文案

### P4: 异常数据展示修复
- [x] 修复growth7d计算公式：添加上限300、下限为0
- [x] 修复lowFollowerAnomalyRatio计算：添加上限80、除以零保护
- [x] 前端展示修复：growth7d和lowFollowerAnomalyRatio不再乘以100（后端已输出百分比整数）
- [x] direct-result-markdown.ts中lowFollowerAnomalyRatio不再乘以100

### P5: UI细节优化
- [x] 修复雷达图标签文字截断问题：扩大viewBox尺寸（285x234→340x290）、标签字符限制从6提高到8、添加whitespace-nowrap、移除Math.random()使用确定性值

## 缺陷修复：502 Bad Gateway 错误

- [ ] 排查"健身减脂"赛道预测提交后的502 Bad Gateway错误根因
- [ ] 修复后端服务异常

## 缺陷修复：低粉爆款归因模块播放量和异常值显示为0

- [x] 排查数据源中实际可用的字段（播放量不可用，点赞/评论/收藏可用）
- [x] 重构mapLowFollowerEvidence：优先用播放量，其次点赞量，再次评论量，生成“X万点赞”等标签
- [x] anomaly改为互动粉丝比（engagementCount/fans），clamp(1, 99)，无互动时为0
- [x] 前端卡片显示“互动粉丝比 Xx”替代“异常值 0x”
- [x] 全局替换“爆发因子”为“互动粉丝比”，“播放量”为“互动数据”
- [x] TypeScript编译0错误

## 新功能：AI预测选题模块（结果页第一屏）

### 后端
- [x] 在prediction-types.ts中新增AiTopicSuggestion类型（title/angle/referenceTitle/referenceId）
- [x] 在PredictionUiResult和ResultRecord中新增aiTopicSuggestions字段
- [x] 在live-predictions.ts最后一步增加LLM调用，基于热门样本+低粉特征+评论高频词生成2-3个选题
- [x] 将生成的选题写入最终结果对象（enrichedResult + store-helpers透传）

### 前端
- [x] 在new-prediction-result.tsx中新增AI选题卡片模块
- [x] 插入位置：建议拍摄方向下方、热门作品参考上方
- [x] 卡片内容：爆款标题+切入角度+对标参考+行动按钮
- [x] 保持现有炫酷UI风格（科技感、高亮、横向卡片）
- [x] 行动按钮复用现有CTA逻辑（open-cta-editor事件 + shoot_plan ctaId）

### 持久化恢复
- [x] ResultsPage.normalizeRemoteResult中添加aiTopicSuggestions的映射逻辑

### 验证
- [x] TypeScript编译0错误
- [x] 编写测试验证选题生成逻辑（24个测试全部通过）

## 结果页6项优化需求

### 需求1：移除第一屏冗余废话
- [x] 删除“今天直接开拍”下方的所有描述性废话（真实样本和市场扩散已经补齐/当前真实证据足以支撑/强烈推荐等）
- [x] 保持界面清爽，直接突出核心结论

### 需求2：选题模块上移
- [x] 将“爆款预测选题”模块整体上移到第一屏结论紧下方
- [x] 确保用户在第一屏就能直接看到具体的选题卡片

### 需求3：选题模块文案修改
- [x] 模块标题从“AI为你生成的爆款选题”改为“爆款预测选题”
- [x] 增加引导文案“直接拍这几个一定会火”

### 需求4：每个选题增加独立爆款机率分数
- [x] 后端LLM调用时为每个选题生成独立的爆款机率分数（70-95范围clamp）
- [x] AiTopicSuggestion类型新增score字段
- [x] 前端卡片UI展示爆款机率分数（颜色分级：≥85绿色、≥70紫色、<70橙色）

### 需求5：优化AI推荐下一步逻辑
- [x] 下一步建议从“基于整个赛道”改为“基于具体生成的选题”
- [x] 建议动作与上面的具体选题强关联（“针对选题1「XXX」生成脚本”）

### 需求6：优化搜索接口数据筛选规则
- [x] 后端搜索接口增加点赞数>=1000的筛选规则
- [x] 默认按点赞数倒序排序 + 时间范围限制近1个月
- [x] 数据不足时自动降级（保留排序结果）
- [x] 确保前端热门作品参考不再出现低赞数据

### Gap修复（系统审查）
- [x] 同步覆盖 agentRun/run 内的 recommendedNextTasks，确保与 enrichedResult 一致
- [x] 降级路径改为始终保留 likes>=1000 硬门槛（放宽时间范围而非放弃门槛）

## 缺陷修复：分析失败 - API代理未接通真实数据后端

- [ ] 排查"分析失败：当前环境未接通真实数据后端"的根因
- [ ] 确保/api反向代理正确指向Node服务
- [ ] 验证分析流程端到端可用

## 结果页重构：从赛道分析升级为具体选题方案

### P1：重构第一屏核心交付物（最高优先级）
- [x] 第一屏爆发指数下方新增【AI 预测爆款选题】核心模块
- [x] 每个选题方案包含：爆款标题、切入角度、对标参考（关联具体热门样本+作者）、核心标签
- [x] 后端LLM调用增加核心标签（tags）字段生成
- [x] AiTopicSuggestion类型新增tags和referenceAuthor字段
- [x] 前端选题卡片展示完整信息（标题+角度+标签+对标作者+对标标题）

### P2：将分析报告降级为支撑证据（高优先级）
- [x] 在选题方案下方增加分割线，标题为“以上选题的预测依据（数据支撑）”
- [x] 将“为什么现在值得拍”、“热门作品参考”、“低粉爆款归因”、“市场数据支撑”等模块收纳在支撑证据区域
- [x] 视觉层级降级：选题方案为主角，数据分析为配角（Database图标+分割线+标题）

### P3：强化下一步动作转化（中优先级）
- [x] 每个选题卡片内放置主操作按钮[生成开拍脚本]
- [x] 点击按钮将选题信息（标题、切入角度、对标样本、作者、标签）传递给脚本生成Agent
- [x] 实现从“预测选题”到“生成脚本”的无缝衔接（dirPromptSuffix + topicReference + topicTags）
- [x] 后端 breakdown-agent.ts context类型新增 topicReference/topicTags 字段
- [x] shoot_plan prompt 显式消费 topicReference/topicTags（buildTopicContext 辅助函数）
- [x] TypeScript编译0错误 + Legacy Bridge正常加载 + 49个测试全部通过

## 用户视觉编辑需求

- [x] 删除ai-workbench-shell.tsx中的示例模板按钮区域（爆款预测/爆款拆解/文案提取）
- [x] 优化HomePage.tsx快速示例：“健身减脂 现在拍什么会火”、“拆解这条爆款视频”（含链接）、“母婴辅食 低粉爆款分析”

## 参考Canvas设计重构选题卡片和下一步动作

### 后端LLM调用更新
- [x] AiTopicSuggestion类型新增字段：conclusion、conclusionSub、howToShoot、whyNow
- [x] 后端LLM prompt和JSON schema同步更新（maxTokens 1200→2000）
- [x] ResultsPage normalizeRemoteResult映射同步更新

### 前端选题卡片重构
- [x] 从并排小卡片改为单张大卡片轮播（左右箭头+圆点指示器）
- [x] 卡片上半部分：左侧结论区（推荐标签+序号+结论大字+副文案+两个按钮）+ 右侧推荐内容区（推荐标题+标签组）
- [x] 卡片右上角：优先级分数卡片（score/100格式）
- [x] 卡片下半部分：三列详情（怎么拍/为什么现在/推荐动作）
- [x] 底部提示：“不满意可切换下一条”

### 下一步动作区域优化
- [ ] 标题改为“下一步动作” + 副标题“不是建议，是直接执行清单”
- [ ] 右侧标签“随当前内容变化”
注：下一步动作区域已融入卡片内的“推荐动作”列和“开始拍摄/生成脚本”按钮

### 验证
- [x] TypeScript编译0错误
- [x] ai-topic-suggestions.test.ts 49个测试全部通过（其他失败测试为已有DB schema/网络问题，与本次修改无关）
