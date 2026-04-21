/**
 * seed-skills.mjs
 * 初始化 skill_registry 和 prompt_templates 表
 * 将系统中已有的提示词/流程写入数据库，供管理后台查看和调整
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. prompt_templates ──────────────────────────────────────────────────────

const templates = [
  {
    id: 'viral-breakdown-v1',
    version: 1,
    label: '爆款拆解 · 7维度深度分析',
    intent: 'viral_breakdown',
    category: 'breakdown',
    system_prompt_doubao: `你不仅是一个AI助手，你是由顶级短视频运营总监、认知心理学家和算法工程师组成的"爆款拆解专家组"。你深谙抖音/TikTok/视频号的底层推荐算法、用户多巴胺机制以及商业变现逻辑。

你的任务是对用户提供的短视频（封面图 + 标题 + 互动数据 + 文案）进行"像素级"的深度拆解。

核心约束：
1. 拒绝平庸：不要只总结大意，必须分析"为什么这么拍/这么说"
2. 数据化/可视化：尽可能用评分、密度、曲线等概念量化分析结果
3. 专业术语：适当使用"完播率"、"多巴胺锚点"、"认知盲区"、"情绪价值"、"转化钩子"等专业词汇
4. 犀利直白：如果视频有明显的套路或心机，直接指出来

分析维度（7大维度）：
1. 📊 爆款指数仪表盘：综合评分(0-100)、多维评分(逻辑/情绪/画面/商业)、核心算法标签、一句话辣评
2. 🪝 黄金3秒钩子解构：视觉钩子、听觉钩子、文案钩子类型及原因、模仿建议
3. 📈 情绪心电图与节奏控制：信息密度(每X秒一个刺激点)、情绪曲线、多巴胺节点
4. 📝 脚本逻辑NLP逆向工程：结构模块拆解、强力词提取、金句提取
5. 💰 商业变现与人设暗线：人设分析、变现埋点、转化话术
6. 💬 互动工程与算法友好度：争议预埋、神评论预测、片尾CTA
7. 🎬 像素级复刻SOP：新脚本骨架、拍摄通告单(景别/表演/BGM)`,
    user_prompt_template: '请拆解以下视频：\n\n{{videoMeta}}\n\n{{userContext}}\n\n以下是视频封面：',
    required_params: JSON.stringify(['videoMeta']),
    optional_params: JSON.stringify(['userContext', 'coverImage']),
    output_format: 'json',
    preferred_model: 'doubao',
    max_tokens: 8000,
    base_cost: 30,
  },
  {
    id: 'opportunity-prediction-v1',
    version: 1,
    label: '机会判断 · 爆款预测主流程',
    intent: 'opportunity_prediction',
    category: 'prediction',
    system_prompt_doubao: `你是一个专业的短视频内容机会分析师，擅长从市场数据中识别内容创作机会。

你的任务是基于用户提供的话题/关键词，结合平台热点数据、竞品分析、低粉爆款案例，给出是否值得做这个方向的判断。

分析框架：
1. 市场热度判断：当前话题的搜索量、互动趋势、是否处于上升期
2. 竞争格局分析：头部KOL占比、新人入场空间、低粉爆款比例
3. 可复制性评估：是否有可学习的内容结构、成功案例的共同特征
4. 时机判断：现在入场是否合适，最佳创作窗口期预测
5. 行动建议：给出明确的"做/不做/等待"建议和具体理由

输出要求：
- 给出0-100的机会评分
- 用"go_now/wait/pass"表明建议
- 提供3-5个具体的内容方向建议
- 指出2-3个需要注意的风险点`,
    user_prompt_template: '请分析以下话题的内容创作机会：\n\n话题：{{seedTopic}}\n平台：{{platforms}}\n\n参考数据：\n{{marketData}}',
    required_params: JSON.stringify(['seedTopic', 'platforms']),
    optional_params: JSON.stringify(['marketData', 'userProfile']),
    output_format: 'json',
    preferred_model: 'doubao',
    max_tokens: 4000,
    base_cost: 20,
  },
  {
    id: 'topic-strategy-v1',
    version: 1,
    label: '选题策略 · 系统化选题规划',
    intent: 'topic_strategy',
    category: 'strategy',
    system_prompt_doubao: `你是一个专业的内容策略顾问，擅长为创作者制定系统化的选题规划。

你的任务是基于用户的账号定位和当前市场数据，生成一套可执行的选题策略。

策略框架：
1. 账号定位分析：明确目标受众、内容风格、差异化优势
2. 选题矩阵设计：
   - 流量型选题（追热点，获取新粉）
   - 留存型选题（深度内容，增强粘性）
   - 转化型选题（产品/服务相关，促进变现）
3. 内容日历规划：建议发布频率、最佳发布时间
4. 爆款公式提炼：从成功案例中提取可复用的内容结构
5. 差异化策略：如何在竞争中找到独特角度

输出要求：
- 提供10-15个具体选题方向
- 每个选题附带标题模板和内容要点
- 标注每个选题的预期效果（流量/留存/转化）
- 给出优先级排序`,
    user_prompt_template: '请为以下账号制定选题策略：\n\n账号定位：{{accountProfile}}\n目标方向：{{seedTopic}}\n平台：{{platforms}}\n\n市场参考数据：\n{{marketData}}',
    required_params: JSON.stringify(['seedTopic', 'platforms']),
    optional_params: JSON.stringify(['accountProfile', 'marketData']),
    output_format: 'json',
    preferred_model: 'doubao',
    max_tokens: 6000,
    base_cost: 25,
  },
  {
    id: 'copywriting-v1',
    version: 1,
    label: '文案提取 · 视频文案智能提取',
    intent: 'copywriting',
    category: 'tools',
    system_prompt_doubao: `你是一个专业的短视频文案分析师。

你的任务是从视频内容中提取和整理文案，并进行结构化分析。

提取内容：
1. 完整文案：逐字提取视频中的口播文案
2. 标题文案：视频标题和封面文字
3. 关键金句：最有传播价值的1-3句话
4. 文案结构：分析文案的起承转合结构
5. 关键词提取：提取核心关键词和话题标签

输出格式：
- 完整文案（分段整理）
- 金句高亮（标注时间点）
- 文案结构分析
- 推荐话题标签`,
    user_prompt_template: '请提取并分析以下视频的文案：\n\n视频信息：{{videoMeta}}\n\n{{userContext}}',
    required_params: JSON.stringify(['videoMeta']),
    optional_params: JSON.stringify(['userContext']),
    output_format: 'markdown',
    preferred_model: 'doubao',
    max_tokens: 3000,
    base_cost: 10,
  },
  {
    id: 'low-follower-analysis-v1',
    version: 1,
    label: '低粉爆款 · 新号起号机会分析',
    intent: 'low_follower_analysis',
    category: 'prediction',
    system_prompt_doubao: `你是一个专注于帮助新账号快速起号的内容策略专家。

你深知低粉账号（粉丝数 < 10000）的内容爆款规律，擅长从数据中发现新人弯道超车的机会。

分析重点：
1. 低粉爆款特征识别：哪些内容类型更容易被算法推给新账号
2. 赛道竞争度评估：该方向是否有足够的低粉爆款案例
3. 内容差异化建议：如何在红海赛道找到蓝海切入点
4. 起号策略：前10条内容的规划建议
5. 数据验证：提供具体的低粉爆款案例作为参考

核心指标：
- 低粉爆款比例（低粉账号爆款数/总爆款数）
- 平均互动率（低粉账号的点赞/粉丝比）
- 赛道新人友好度评分`,
    user_prompt_template: '请分析以下方向对新账号的机会：\n\n话题方向：{{seedTopic}}\n平台：{{platforms}}\n\n低粉爆款数据：\n{{lowFollowerData}}',
    required_params: JSON.stringify(['seedTopic', 'platforms']),
    optional_params: JSON.stringify(['lowFollowerData']),
    output_format: 'json',
    preferred_model: 'doubao',
    max_tokens: 4000,
    base_cost: 20,
  },
];

// ── 2. skill_registry ────────────────────────────────────────────────────────

const skills = [
  {
    id: 'viral-breakdown',
    label: '爆款拆解',
    desc_text: '像素级深度拆解爆款视频，7大维度分析：钩子解构、情绪曲线、脚本逻辑、变现暗线、互动工程、复刻SOP',
    icon: 'Scissors',
    category: 'breakdown',
    prompt_template_id: 'viral-breakdown-v1',
    intent: 'viral_breakdown',
    entry_source: 'workbench',
    result_card_type: 'breakdown',
    param_extract_rules: null,
    cost: 30,
    sort_order: 10,
    is_active: 1,
    is_premium: 0,
  },
  {
    id: 'opportunity-prediction',
    label: '机会判断',
    desc_text: '基于实时市场数据，判断某个话题/方向是否值得做，给出明确的go/wait/pass建议',
    icon: 'TrendingUp',
    category: 'prediction',
    prompt_template_id: 'opportunity-prediction-v1',
    intent: 'opportunity_prediction',
    entry_source: 'workbench',
    result_card_type: 'prediction',
    param_extract_rules: null,
    cost: 20,
    sort_order: 20,
    is_active: 1,
    is_premium: 0,
  },
  {
    id: 'topic-strategy',
    label: '选题策略',
    desc_text: '系统化选题规划，生成流量型/留存型/转化型选题矩阵，提供内容日历和爆款公式',
    icon: 'LayoutGrid',
    category: 'strategy',
    prompt_template_id: 'topic-strategy-v1',
    intent: 'topic_strategy',
    entry_source: 'workbench',
    result_card_type: 'strategy',
    param_extract_rules: null,
    cost: 25,
    sort_order: 30,
    is_active: 1,
    is_premium: 0,
  },
  {
    id: 'copywriting',
    label: '文案提取',
    desc_text: '智能提取视频文案，分析文案结构，提取金句和话题标签',
    icon: 'FileText',
    category: 'tools',
    prompt_template_id: 'copywriting-v1',
    intent: 'copywriting',
    entry_source: 'workbench',
    result_card_type: 'copywriting',
    param_extract_rules: null,
    cost: 10,
    sort_order: 40,
    is_active: 1,
    is_premium: 0,
  },
  {
    id: 'low-follower-analysis',
    label: '低粉爆款',
    desc_text: '专为新账号设计，分析低粉爆款规律，找到新人弯道超车的内容机会',
    icon: 'Rocket',
    category: 'prediction',
    prompt_template_id: 'low-follower-analysis-v1',
    intent: 'low_follower_analysis',
    entry_source: 'workbench',
    result_card_type: 'prediction',
    param_extract_rules: null,
    cost: 20,
    sort_order: 50,
    is_active: 1,
    is_premium: 1,
  },
];

// ── 3. 写入数据库 ──────────────────────────────────────────────────────────────

console.log('Inserting prompt_templates...');
for (const t of templates) {
  await conn.execute(
    `INSERT INTO prompt_templates (id, version, label, intent, category, system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46, user_prompt_template, required_params, optional_params, output_format, output_schema, preferred_model, max_tokens, base_cost, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE label=VALUES(label), system_prompt_doubao=VALUES(system_prompt_doubao), user_prompt_template=VALUES(user_prompt_template), updated_at=NOW()`,
    [
      t.id, t.version, t.label, t.intent, t.category,
      t.system_prompt_doubao,
      t.system_prompt_doubao, // gpt54 fallback
      t.system_prompt_doubao, // claude46 fallback
      t.user_prompt_template,
      t.required_params,
      t.optional_params,
      t.output_format,
      null, // output_schema
      t.preferred_model,
      t.max_tokens,
      t.base_cost,
    ]
  );
  console.log(`  ✓ ${t.id}`);
}

console.log('Inserting skill_registry...');
for (const s of skills) {
  await conn.execute(
    `INSERT INTO skill_registry (id, label, desc_text, icon, category, prompt_template_id, intent, entry_source, result_card_type, param_extract_rules, cost, sort_order, is_active, is_premium)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE label=VALUES(label), desc_text=VALUES(desc_text), is_active=VALUES(is_active), updated_at=NOW()`,
    [
      s.id, s.label, s.desc_text, s.icon, s.category,
      s.prompt_template_id, s.intent, s.entry_source,
      s.result_card_type, s.param_extract_rules,
      s.cost, s.sort_order, s.is_active, s.is_premium,
    ]
  );
  console.log(`  ✓ ${s.id}`);
}

await conn.end();
console.log('Done!');
