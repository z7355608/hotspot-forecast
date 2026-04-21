-- ============================================================
-- Schema V4: Prompt 模板管理 + Skills 技能注册表
-- 版本: 2026-03-27
-- ============================================================

-- -------------------------------------------------------
-- 1. prompt_templates 表：Prompt 模板管理层
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_templates (
  id            VARCHAR(64)   NOT NULL PRIMARY KEY,
  version       INT           NOT NULL DEFAULT 1,
  label         VARCHAR(128)  NOT NULL COMMENT '模板显示名称',
  intent        VARCHAR(64)   NOT NULL COMMENT '对应 TaskIntent 类型',
  category      VARCHAR(32)   NOT NULL DEFAULT 'general' COMMENT 'general|breakdown|diagnosis|strategy|extraction',

  -- 多模型适配：每个模型有独立的 system_prompt
  system_prompt_doubao   MEDIUMTEXT NOT NULL COMMENT '豆包 2.0 seed 专用 system prompt',
  system_prompt_gpt54    MEDIUMTEXT NOT NULL COMMENT 'GPT-5.4 专用 system prompt',
  system_prompt_claude46 MEDIUMTEXT NOT NULL COMMENT 'Claude Opus 4.6 专用 system prompt',

  -- 用户侧 prompt 模板，支持 {{变量}} 占位符
  user_prompt_template   MEDIUMTEXT NOT NULL COMMENT '用户 prompt 模板，含 {{变量}} 占位符',

  -- 所需参数定义（JSON 数组）
  required_params  JSON NOT NULL COMMENT '必需参数列表，如 ["track","platform"]',
  optional_params  JSON NOT NULL COMMENT '可选参数列表，如 ["followerCount","accountAge"]',

  -- 输出约束
  output_format    VARCHAR(32) NOT NULL DEFAULT 'markdown' COMMENT 'markdown|json|structured',
  output_schema    JSON        NULL COMMENT '当 output_format=json 时的 JSON Schema 约束',

  -- 模型偏好
  preferred_model  VARCHAR(32) NOT NULL DEFAULT 'doubao' COMMENT 'doubao|gpt54|claude46|auto',
  max_tokens       INT         NOT NULL DEFAULT 2000,

  -- 积分消耗
  base_cost        INT         NOT NULL DEFAULT 20 COMMENT '基础积分消耗',

  -- 状态管理
  is_active        TINYINT(1)  NOT NULL DEFAULT 1,
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_intent (intent),
  INDEX idx_category (category),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Prompt 模板管理表，支持多模型适配和动态变量注入';

-- -------------------------------------------------------
-- 2. skill_registry 表：Skills 技能注册表
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_registry (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  label           VARCHAR(128)  NOT NULL COMMENT '技能显示名称',
  desc_text       TEXT          NOT NULL COMMENT '技能描述',
  icon            VARCHAR(64)   NOT NULL DEFAULT 'Sparkles' COMMENT 'Lucide 图标名称',
  category        VARCHAR(32)   NOT NULL DEFAULT 'content' COMMENT 'content|analysis|strategy|toolbox',

  -- 关联的 Prompt 模板
  prompt_template_id  VARCHAR(64) NOT NULL COMMENT '关联的 prompt_templates.id',

  -- 意图映射
  intent          VARCHAR(64)   NOT NULL COMMENT '对应 TaskIntent 类型',

  -- 执行配置
  entry_source    VARCHAR(32)   NOT NULL DEFAULT 'skill' COMMENT 'skill|template|manual',
  result_card_type VARCHAR(64)  NOT NULL DEFAULT 'default' COMMENT '结果卡片类型: default|breakdown_sheet|diagnosis_report|strategy_board',

  -- 参数提取规则（JSON）
  param_extract_rules  JSON NULL COMMENT '参数提取规则，用于从用户输入中提取技能参数',

  -- 积分消耗
  cost            INT           NOT NULL DEFAULT 20,

  -- 排序和状态
  sort_order      INT           NOT NULL DEFAULT 100,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  is_premium      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否为高级技能（需要更高套餐）',

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_intent (intent),
  INDEX idx_category (category),
  INDEX idx_active_sort (is_active, sort_order),
  FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Skills 技能注册表，从 workbench-config.tsx 迁移至数据库';

-- -------------------------------------------------------
-- 3. skill_execution_logs 表：技能执行日志
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_execution_logs (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  skill_id        VARCHAR(64)   NOT NULL,
  user_id         VARCHAR(64)   NULL COMMENT '用户 ID，未登录时为 NULL',
  session_id      VARCHAR(128)  NULL COMMENT '会话 ID',
  artifact_id     VARCHAR(128)  NULL COMMENT '生成的 Artifact ID',

  -- 执行上下文
  input_prompt    TEXT          NOT NULL COMMENT '用户原始输入',
  extracted_params JSON         NULL COMMENT '提取的参数',
  prompt_template_id VARCHAR(64) NOT NULL COMMENT '使用的 Prompt 模板 ID',
  model_used      VARCHAR(32)   NOT NULL COMMENT '实际使用的模型',

  -- 执行结果
  status          VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT 'pending|success|failed',
  tokens_used     INT           NULL,
  credits_charged INT           NULL,
  duration_ms     INT           NULL COMMENT '执行耗时（毫秒）',
  error_message   TEXT          NULL,

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_skill_id (skill_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='技能执行日志，用于统计和调试';

-- -------------------------------------------------------
-- 4. 初始数据：Prompt 模板
-- -------------------------------------------------------

INSERT INTO prompt_templates (
  id, version, label, intent, category,
  system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46,
  user_prompt_template,
  required_params, optional_params,
  output_format, preferred_model, max_tokens, base_cost
) VALUES

-- 4.1 爆款拆解模板
('viral-breakdown-v1', 1, '爆款视频拆解', 'viral_breakdown', 'breakdown',
 -- doubao system prompt（推理模型，需要明确的结构约束）
 '你是一位专业的短视频爆款内容分析师，擅长从数据驱动的视角拆解爆款视频的成功要素。\n\n分析时必须严格遵循以下原则：\n1. 所有结论必须源自提供的视频数据和文案，不得凭空推断\n2. 使用 Markdown 结构化输出，包含：开场钩子分析、叙事结构、视觉/节奏设计、情绪曲线、可复用模板\n3. 每个分析点后面必须附上"可迁移建议"，说明如何应用到用户自己的内容\n4. 禁止输出泛泛而谈的通用建议，每条建议必须具体到可执行的动作',
 -- gpt54 system prompt（强 JSON 结构约束）
 'You are an expert short-video content analyst. Analyze viral videos with data-driven precision.\n\nRules:\n1. All insights must be grounded in the provided video data and transcript\n2. Output structured Markdown with sections: Hook Analysis, Narrative Structure, Visual/Rhythm Design, Emotional Arc, Reusable Templates\n3. Each insight must include a "Transfer Tip" for the user\n4. No generic advice - every recommendation must be specific and actionable\n5. Respond in Chinese',
 -- claude46 system prompt（强调深度分析）
 '你是顶级短视频策略师，专注于从爆款内容中提炼可复制的创作框架。\n\n核心原则：\n- 深度优于广度：宁可深入分析 3 个关键要素，也不要浅尝 10 个\n- 数据驱动：所有判断必须基于提供的真实数据（播放量、互动率、文案内容）\n- 可迁移性：每个分析结论都要转化为用户可以立即使用的创作工具\n- 禁止模板化输出：根据视频特点定制分析框架，不套用固定模板',
 -- user prompt template
 '请拆解以下爆款视频：\n\n**视频基本信息：**\n- 平台：{{platform}}\n- 播放量：{{playCount}}\n- 点赞率：{{likeRate}}%\n- 评论数：{{commentCount}}\n- 视频时长：{{duration}}秒\n\n**视频文案/转录：**\n{{transcript}}\n\n**分析要求：**\n请从以下维度深度拆解，并给出可迁移到「{{userTrack}}」赛道的具体建议：\n1. 开场钩子（前3秒）：用了什么技巧？为什么有效？\n2. 叙事结构：信息是如何组织和递进的？\n3. 情绪设计：在哪些节点触发了用户情绪？\n4. 可复用模板：提炼出 2-3 个可直接套用的句式或结构框架',
 '["platform","playCount","transcript"]',
 '["likeRate","commentCount","duration","userTrack"]',
 'markdown', 'doubao', 3000, 30),

-- 4.2 账号诊断模板
('account-diagnosis-v1', 1, '账号定位诊断', 'account_diagnosis', 'diagnosis',
 '你是专业的短视频账号诊断师，擅长从数据维度诊断账号的定位清晰度、内容一致性和增长瓶颈。\n\n诊断原则：\n1. 所有诊断结论必须基于用户提供的真实数据（发布数量、平均播放、最高播放等）\n2. 使用 Markdown 输出，包含：定位诊断、内容一致性评分、增长瓶颈分析、优先级行动清单\n3. 行动清单必须具体到"下一条视频应该做什么"\n4. 禁止输出"建议坚持更新"等无效建议',
 'You are a professional short-video account diagnostician. Diagnose accounts with data precision.\n\nRules:\n1. All diagnoses must be based on provided real data\n2. Output structured Markdown: Positioning Diagnosis, Content Consistency Score, Growth Bottleneck Analysis, Priority Action List\n3. Action items must be specific to "what to do for the next video"\n4. Respond in Chinese',
 '你是顶级账号成长策略师，专注于帮助创作者突破增长瓶颈。\n\n诊断框架：\n- 定位清晰度（0-10分）：目标用户、内容主题、差异化卖点是否一致\n- 内容执行力（0-10分）：发布频率、完播率、互动率是否达标\n- 增长瓶颈识别：当前阶段最大的制约因素\n- 优先级行动：按影响力排序的 3 个立即可执行动作\n\n所有评分和建议必须基于用户提供的真实数据，禁止凭空评估。',
 '请诊断以下账号：\n\n**账号基本信息：**\n- 平台：{{platform}}\n- 账号阶段：{{accountStage}}\n- 内容方向：{{track}}\n- 已发布视频数：{{videoCount}}\n- 平均播放量：{{avgPlayCount}}\n- 最高播放量：{{maxPlayCount}}\n- 粉丝数量：{{followerCount}}\n\n**诊断要求：**\n请从定位清晰度、内容一致性、增长瓶颈三个维度进行诊断，并给出优先级行动清单（按影响力排序）。\n\n特别关注：当前阶段最应该优先解决的 1 个核心问题是什么？',
 '["platform","track","videoCount","avgPlayCount"]',
 '["accountStage","maxPlayCount","followerCount"]',
 'markdown', 'claude46', 2500, 25),

-- 4.3 赛道机会判断模板
('opportunity-forecast-v1', 1, '赛道机会判断', 'opportunity_prediction', 'strategy',
 '你是专业的短视频赛道分析师，基于真实市场数据判断赛道的机会窗口和竞争态势。\n\n分析原则：\n1. 所有判断必须基于提供的真实数据（热度指数、竞争密度、低粉爆款比例等）\n2. 使用 Markdown 输出：机会评分（0-100）、核心机会点、主要风险、切入建议\n3. 机会评分必须有明确的评分依据（哪些数据支撑了这个分数）\n4. 切入建议必须具体到"第一条视频应该做什么主题"',
 'You are a professional short-video niche analyst. Evaluate market opportunities with real data.\n\nRules:\n1. All judgments must be based on provided real data\n2. Output structured Markdown: Opportunity Score (0-100), Key Opportunities, Main Risks, Entry Strategy\n3. Score must have explicit data-backed reasoning\n4. Respond in Chinese',
 '你是顶级内容赛道策略师，专注于识别短视频市场的机会窗口。\n\n评估框架：\n- 机会评分（0-100）：综合热度趋势、竞争密度、低粉爆款比例、变现潜力\n- 核心机会点：当前赛道中未被充分满足的用户需求\n- 主要风险：进入该赛道的最大障碍\n- 切入策略：针对新账号的最优切入角度\n\n所有评估必须基于提供的真实数据，每个结论都要有数据支撑。',
 '请判断以下赛道的机会：\n\n**赛道数据：**\n- 赛道名称：{{track}}\n- 平台：{{platform}}\n- 热度趋势：{{heatTrend}}（近30天）\n- 竞争密度：{{competitionLevel}}\n- 低粉爆款比例：{{lowFollowerViralRate}}%\n- 平均互动率：{{avgEngagementRate}}%\n- 头部账号粉丝门槛：{{topAccountFollowers}}\n\n**判断要求：**\n1. 给出 0-100 的机会评分，并说明评分依据\n2. 识别当前赛道中最大的机会点（未被满足的需求）\n3. 指出进入该赛道的主要风险\n4. 给出适合新账号的切入建议（具体到第一条视频的主题方向）',
 '["track","platform"]',
 '["heatTrend","competitionLevel","lowFollowerViralRate","avgEngagementRate","topAccountFollowers"]',
 'markdown', 'doubao', 2000, 20),

-- 4.4 文案提取模板
('copy-extraction-v1', 1, '爆款文案提取', 'copy_extraction', 'extraction',
 '你是专业的短视频文案分析师，擅长从爆款内容中提炼可复用的文案模式和表达结构。\n\n提取原则：\n1. 所有提取结果必须来自提供的真实文案内容，不得编造\n2. 使用 Markdown 输出：钩子句式库、叙事结构模板、情绪触发词、CTA 模板\n3. 每个提取结果都要标注"原文出处"和"适用场景"\n4. 提供可直接套用的填空模板（用[]标注变量位置）',
 'You are a professional short-video copywriting analyst. Extract reusable patterns from viral content.\n\nRules:\n1. All extractions must come from the provided real content\n2. Output structured Markdown: Hook Library, Narrative Templates, Emotion Triggers, CTA Templates\n3. Each extraction must include source reference and applicable scenarios\n4. Provide fill-in-the-blank templates with [] for variables\n5. Respond in Chinese',
 '你是顶级文案策略师，专注于从爆款内容中提炼可复制的表达资产。\n\n提取框架：\n- 钩子句式：开场3秒内的注意力捕获技巧（至少3种）\n- 叙事结构：信息组织和递进的框架模式\n- 情绪触发词：引发共鸣、好奇、紧迫感的关键词汇\n- CTA 模板：结尾转化的表达方式\n\n每个提取结果必须：1）来自真实文案 2）提供填空模板 3）说明适用场景',
 '请从以下内容中提取可复用的文案模式：\n\n**内容信息：**\n- 平台：{{platform}}\n- 内容类型：{{contentType}}\n- 播放量：{{playCount}}\n\n**文案内容：**\n{{transcript}}\n\n**提取要求：**\n请提炼以下文案资产（每类至少 2-3 个，并提供填空模板）：\n1. 钩子句式：开场如何快速抓住注意力\n2. 叙事结构：信息是如何组织和递进的\n3. 情绪触发词：哪些表达触发了用户情绪\n4. CTA 模板：结尾如何引导用户行动\n\n对每个模板，用 [变量] 标注可替换的部分，并说明适用场景。',
 '["transcript"]',
 '["platform","contentType","playCount"]',
 'markdown', 'gpt54', 2000, 20),

-- 4.5 选题策略模板
('topic-strategy-v1', 1, '选题策略生成', 'topic_strategy', 'strategy',
 '你是专业的短视频选题策略师，基于账号定位和平台数据生成可执行的选题方向。\n\n策略原则：\n1. 所有选题必须基于提供的账号信息和赛道数据，不得凭空生成\n2. 使用 Markdown 输出：核心选题方向（3-5个）、每个方向的具体题目（3个）、发布建议\n3. 每个选题方向都要说明"为什么适合这个账号"\n4. 题目必须具体，不能是"分享日常"这类模糊描述',
 'You are a professional short-video topic strategist. Generate actionable content strategies based on account data.\n\nRules:\n1. All topics must be based on provided account info and niche data\n2. Output structured Markdown: Core Directions (3-5), Specific Topics per Direction (3 each), Publishing Recommendations\n3. Each direction must explain "why it fits this account"\n4. Topics must be specific, not vague like "share daily life"\n5. Respond in Chinese',
 '你是顶级内容选题策略师，专注于为创作者生成高转化率的选题体系。\n\n选题框架：\n- 核心方向（3-5个）：基于账号定位和用户需求的主要内容方向\n- 具体题目：每个方向下 3 个可立即拍摄的具体题目\n- 发布节奏：建议的发布频率和时间窗口\n- 低成本验证：哪个方向可以用最低成本先验证\n\n所有选题必须基于账号真实情况，禁止输出通用模板。',
 '请为以下账号生成选题策略：\n\n**账号信息：**\n- 平台：{{platform}}\n- 内容赛道：{{track}}\n- 账号阶段：{{accountStage}}\n- 目标用户：{{targetAudience}}\n- 粉丝数量：{{followerCount}}\n\n**选题要求：**\n请生成 3-5 个核心选题方向，每个方向包含：\n1. 方向定义（一句话说清楚做什么）\n2. 为什么适合这个账号（基于账号数据的理由）\n3. 3 个具体题目（可立即拍摄的标题）\n4. 低成本验证建议（如何用最小投入测试这个方向）',
 '["platform","track"]',
 '["accountStage","targetAudience","followerCount"]',
 'markdown', 'doubao', 2500, 20);

-- -------------------------------------------------------
-- 5. 初始数据：Skills 技能注册表
-- -------------------------------------------------------

INSERT INTO skill_registry (
  id, label, desc_text, icon, category,
  prompt_template_id, intent, entry_source, result_card_type,
  param_extract_rules, cost, sort_order, is_active
) VALUES

('viral-script-breakdown', '爆款脚本拆解', '拆爆款视频的脚本骨架、节奏设计和卖点呈现方式。', 'Sparkles', 'content',
 'viral-breakdown-v1', 'viral_breakdown', 'skill', 'breakdown_sheet',
 '{"videoUrl": "从用户输入中提取视频链接或口令", "platform": "从视频链接判断平台", "userTrack": "从用户上下文提取赛道"}',
 15, 10, 1),

('douyin-copy-extraction', '抖音文案提取', '提取视频或参考文案里的钩子、结构和可复用表达。', 'Mic', 'content',
 'copy-extraction-v1', 'copy_extraction', 'skill', 'default',
 '{"videoUrl": "从用户输入中提取视频链接", "contentType": "默认为抖音短视频", "platform": "douyin"}',
 20, 20, 1),

('xhs-topic-strategy', '小红书选题生成', '围绕赛道、人群和场景，生成适合小红书的选题清单。', 'FileText', 'strategy',
 'topic-strategy-v1', 'topic_strategy', 'skill', 'strategy_board',
 '{"platform": "xiaohongshu", "track": "从用户输入提取赛道", "accountStage": "从用户描述提取账号阶段"}',
 20, 30, 1),

('account-positioning-diagnosis', '账号定位诊断', '深度诊断账号定位、内容方向和差异化切入口。', 'User', 'analysis',
 'account-diagnosis-v1', 'account_diagnosis', 'skill', 'diagnosis_report',
 '{"platform": "从用户输入提取平台", "track": "从用户输入提取赛道", "videoCount": "从用户描述提取发布数量", "avgPlayCount": "从用户描述提取平均播放"}',
 30, 40, 1),

('account-diagnosis', '账号诊断', '诊断账号定位、内容方向和差异化切入口是否成立。', 'User', 'analysis',
 'account-diagnosis-v1', 'account_diagnosis', 'skill', 'diagnosis_report',
 '{"platform": "从用户输入提取平台", "track": "从用户输入提取赛道"}',
 25, 50, 1),

('content-calendar', '内容排期表', '根据选题方向自动生成 7 天发布排期和形式建议。', 'FileText', 'strategy',
 'topic-strategy-v1', 'topic_strategy', 'skill', 'strategy_board',
 '{"platform": "从用户输入提取平台", "track": "从用户输入提取赛道", "accountStage": "从用户描述提取账号阶段"}',
 20, 60, 1),

('multi-platform-topic-strategy', '多平台选题策略', '基于已连接的多个平台数据，生成跨平台选题方向、同行对标和验证报告。', 'FileText', 'strategy',
 'topic-strategy-v1', 'topic_strategy', 'template', 'strategy_board',
 '{"platforms": "从用户已连接平台自动获取", "track": "从用户输入提取赛道", "accountStage": "从用户描述提取账号阶段", "followerCounts": "从已连接账号自动获取", "recentWorks": "从已连接账号自动获取"}',
 25, 25, 1);
