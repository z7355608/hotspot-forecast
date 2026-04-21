/**
 * server/skill-pipeline.ts
 * ============================================================
 * Skills 技能系统执行管线
 *
 * 完整链路：
 * 点击技能 -> 从 DB 加载技能配置 -> 提取参数 -> 调用 Prompt 模板
 * -> 渲染特定结果卡片（breakdown_sheet / diagnosis_report / strategy_board）
 * -> 记录执行日志
 * ============================================================
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("SkillPipeline");
import { getPool } from "./database.js";
import {
  callWithTemplate,
  type RenderContext,
  type ModelId,
} from "./prompt-engine.js";
import { extractTaskParams } from "./payload-extractor.js";
import type { RowDataPacket } from "mysql2/promise";
import type { IncomingMessage, ServerResponse } from "http";

// -------------------------------------------------------
// 类型定义
// -------------------------------------------------------

export type ResultCardType =
  | "default"
  | "breakdown_sheet"
  | "diagnosis_report"
  | "strategy_board";

export interface SkillRecord {
  id: string;
  label: string;
  descText: string;
  icon: string;
  category: string;
  promptTemplateId: string;
  intent: string;
  entrySource: string;
  resultCardType: ResultCardType;
  paramExtractRules: Record<string, string> | null;
  cost: number;
  sortOrder: number;
  isActive: boolean;
  isPremium: boolean;
}

export interface SkillExecuteRequest {
  skillId: string;
  userPrompt: string;
  context?: RenderContext;
  overrideModel?: ModelId;
  userId?: string;
  sessionId?: string;
  parentArtifactId?: string;
}

export interface SkillExecuteResult {
  skillId: string;
  skillLabel: string;
  resultCardType: ResultCardType;
  content: string;
  modelId: ModelId;
  templateId: string;
  tokensUsed?: number;
  durationMs: number;
  creditsCharged: number;
  logId?: number;
}

// -------------------------------------------------------
// 内存缓存（5 分钟 TTL）
// -------------------------------------------------------

interface SkillCacheEntry {
  skills: Map<string, SkillRecord>;
  loadedAt: number;
}

let skillCache: SkillCacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function isSkillCacheValid(): boolean {
  return (
    skillCache !== null &&
    Date.now() - skillCache.loadedAt < CACHE_TTL_MS
  );
}

function mapRowToSkill(row: RowDataPacket): SkillRecord {
  return {
    id: row.id,
    label: row.label,
    descText: row.desc_text,
    icon: row.icon,
    category: row.category,
    promptTemplateId: row.prompt_template_id,
    intent: row.intent,
    entrySource: row.entry_source,
    resultCardType: (row.result_card_type ?? "default") as ResultCardType,
    paramExtractRules: row.param_extract_rules
      ? (typeof row.param_extract_rules === "string"
        ? JSON.parse(row.param_extract_rules)
        : row.param_extract_rules)
      : null,
    cost: row.cost ?? 20,
    sortOrder: row.sort_order ?? 100,
    isActive: Boolean(row.is_active),
    isPremium: Boolean(row.is_premium),
  };
}

// -------------------------------------------------------
// 数据库操作
// -------------------------------------------------------

/** 加载所有活跃技能（带缓存） */
export async function loadAllSkills(): Promise<Map<string, SkillRecord>> {
  if (isSkillCacheValid()) {
    return skillCache!.skills;
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM skill_registry WHERE is_active = 1 ORDER BY sort_order ASC"
  );

  const skills = new Map<string, SkillRecord>();
  for (const row of rows) {
    const skill = mapRowToSkill(row);
    skills.set(skill.id, skill);
  }

  skillCache = { skills, loadedAt: Date.now() };
  log.info(`Loaded ${skills.size} skills from DB`);
  return skills;
}

/** 按 ID 获取单个技能 */
export async function getSkillById(id: string): Promise<SkillRecord | null> {
  const skills = await loadAllSkills();
  return skills.get(id) ?? null;
}

/** 按分类获取技能列表 */
export async function getSkillsByCategory(category: string): Promise<SkillRecord[]> {
  const skills = await loadAllSkills();
  return Array.from(skills.values()).filter((s) => s.category === category);
}

/** 强制刷新缓存 */
export function invalidateSkillCache(): void {
  skillCache = null;
}

/** 更新技能状态（启用/停用） */
export async function setSkillActive(skillId: string, isActive: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE skill_registry SET is_active = ? WHERE id = ?",
    [isActive ? 1 : 0, skillId]
  );
  invalidateSkillCache();
}

// -------------------------------------------------------
// 参数提取：从用户 Prompt 中提取技能所需参数
// -------------------------------------------------------

/**
 * 使用 payload-extractor 从用户输入中提取技能参数
 * 同时合并 context 中已有的参数
 */
async function extractSkillParams(
  skill: SkillRecord,
  userPrompt: string,
  existingContext?: RenderContext
): Promise<RenderContext> {
  // 先用 payload-extractor 从用户输入提取结构化参数
  let extracted: RenderContext = {};
  try {
    const payloadResult = await extractTaskParams(userPrompt);

    // 将提取结果映射到 RenderContext
    if (payloadResult.platform) extracted.platform = payloadResult.platform;
    if (payloadResult.keyword) extracted.track = payloadResult.keyword;
    if (payloadResult.contentUrl) extracted.videoUrl = payloadResult.contentUrl;
    if (payloadResult.uniqueId) extracted.targetAudience = payloadResult.uniqueId;

    // extraFields 不在 ExtractedTaskParams 中，跳过
  } catch (err) {
    log.warn({ err: err }, `Payload extraction failed for ${skill.id}`);
  }

  // 合并：existingContext > extracted（用户明确提供的优先）
  return {
    ...extracted,
    ...(existingContext ?? {}),
  };
}

// -------------------------------------------------------
// 结果卡片渲染器
// -------------------------------------------------------

/**
 * 根据 resultCardType 对 LLM 输出进行后处理
 * 目前主要是添加元数据标记，前端根据 cardType 渲染不同组件
 */
function postProcessResult(
  content: string,
  cardType: ResultCardType,
  _skill: SkillRecord
): string {
  // 对于 breakdown_sheet，确保输出包含标准的 Markdown 章节
  if (cardType === "breakdown_sheet") {
    // 如果 LLM 没有输出标准章节，添加提示
    if (!content.includes("##") && !content.includes("#")) {
      return `## 拆解分析\n\n${content}`;
    }
  }

  // 对于 diagnosis_report，确保有评分区域
  if (cardType === "diagnosis_report") {
    if (!content.includes("分") && !content.includes("评分")) {
      return `## 诊断报告\n\n${content}`;
    }
  }

  return content;
}

// -------------------------------------------------------
// 执行日志记录
// -------------------------------------------------------

async function logExecution(params: {
  skillId: string;
  userId?: string;
  sessionId?: string;
  artifactId?: string;
  inputPrompt: string;
  extractedParams: RenderContext;
  promptTemplateId: string;
  modelUsed: string;
  status: "success" | "failed";
  tokensUsed?: number;
  creditsCharged?: number;
  durationMs?: number;
  errorMessage?: string;
}): Promise<number | undefined> {
  try {
    const pool = getPool();
    const [result] = await pool.query<RowDataPacket[]>(
      `INSERT INTO skill_execution_logs (
        skill_id, user_id, session_id, artifact_id,
        input_prompt, extracted_params, prompt_template_id, model_used,
        status, tokens_used, credits_charged, duration_ms, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.skillId,
        params.userId ?? null,
        params.sessionId ?? null,
        params.artifactId ?? null,
        params.inputPrompt.slice(0, 2000), // 截断防止超长
        JSON.stringify(params.extractedParams),
        params.promptTemplateId,
        params.modelUsed,
        params.status,
        params.tokensUsed ?? null,
        params.creditsCharged ?? null,
        params.durationMs ?? null,
        params.errorMessage ?? null,
      ]
    );
    return (result as unknown as { insertId: number }).insertId;
  } catch (err) {
    log.warn({ err: err }, "Failed to log execution");
    return undefined;
  }
}

// -------------------------------------------------------
// 核心执行函数
// -------------------------------------------------------

/**
 * 执行技能完整管线：
 * 1. 加载技能配置
 * 2. 提取参数
 * 3. 渲染 Prompt 模板
 * 4. 调用 LLM
 * 5. 后处理结果卡片
 * 6. 记录执行日志
 */
export async function executeSkill(
  request: SkillExecuteRequest
): Promise<SkillExecuteResult> {
  const startMs = Date.now();

  // 1. 加载技能配置
  const skill = await getSkillById(request.skillId);
  if (!skill) {
    throw new Error(`[SkillPipeline] Skill not found: ${request.skillId}`);
  }

  if (!skill.isActive) {
    throw new Error(`[SkillPipeline] Skill is disabled: ${request.skillId}`);
  }

  // 2. 提取参数（并行：payload 提取 + 已有 context 合并）
  const extractedContext = await extractSkillParams(
    skill,
    request.userPrompt,
    request.context
  );

  // 3. 调用 Prompt 模板 + LLM
  let callResult;
  try {
    callResult = await callWithTemplate(
      skill.promptTemplateId,
      extractedContext,
      {
        overrideModel: request.overrideModel,
        allowMissingRequired: true,
        temperature: 0.7,
      }
    );
  } catch (err) {
    // 记录失败日志
    await logExecution({
      skillId: skill.id,
      userId: request.userId,
      sessionId: request.sessionId,
      inputPrompt: request.userPrompt,
      extractedParams: extractedContext,
      promptTemplateId: skill.promptTemplateId,
      modelUsed: request.overrideModel ?? "unknown",
      status: "failed",
      durationMs: Date.now() - startMs,
      errorMessage: String(err),
    });
    throw err;
  }

  // 4. 后处理结果卡片
  const processedContent = postProcessResult(
    callResult.content,
    skill.resultCardType,
    skill
  );

  const durationMs = Date.now() - startMs;

  // 5. 记录成功日志
  const logId = await logExecution({
    skillId: skill.id,
    userId: request.userId,
    sessionId: request.sessionId,
    inputPrompt: request.userPrompt,
    extractedParams: extractedContext,
    promptTemplateId: skill.promptTemplateId,
    modelUsed: callResult.modelId,
    status: "success",
    tokensUsed: callResult.tokensUsed,
    creditsCharged: skill.cost,
    durationMs,
  });

  return {
    skillId: skill.id,
    skillLabel: skill.label,
    resultCardType: skill.resultCardType,
    content: processedContent,
    modelId: callResult.modelId,
    templateId: callResult.templateId,
    tokensUsed: callResult.tokensUsed,
    durationMs,
    creditsCharged: skill.cost,
    logId,
  };
}

// -------------------------------------------------------
// HTTP 处理函数
// -------------------------------------------------------

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

/** GET /api/skills - 获取所有技能列表 */
export async function handleListSkills(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const skills = await loadAllSkills();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      skills: Array.from(skills.values()).map((s) => ({
        id: s.id,
        label: s.label,
        descText: s.descText,
        icon: s.icon,
        category: s.category,
        intent: s.intent,
        resultCardType: s.resultCardType,
        cost: s.cost,
        isPremium: s.isPremium,
      })),
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** POST /api/skills/execute - 执行技能（非流式） */
export async function handleExecuteSkill(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req) as Partial<SkillExecuteRequest>;

    if (!body.skillId || !body.userPrompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "skillId and userPrompt are required" }));
      return;
    }

    const result = await executeSkill({
      skillId: body.skillId,
      userPrompt: body.userPrompt,
      context: body.context,
      overrideModel: body.overrideModel,
      userId: body.userId,
      sessionId: body.sessionId,
      parentArtifactId: body.parentArtifactId,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** PATCH /api/skills/:id/toggle - 启用/停用技能 */
export async function handleToggleSkill(
  req: IncomingMessage,
  res: ServerResponse,
  skillId: string
): Promise<void> {
  try {
    const body = await readJsonBody(req) as { isActive?: boolean };
    const isActive = body.isActive !== false;
    await setSkillActive(skillId, isActive);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      message: `Skill ${skillId} ${isActive ? "enabled" : "disabled"}`,
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** GET /api/skills/stats - 技能执行统计 */
export async function handleSkillStats(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        skill_id,
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        AVG(duration_ms) as avg_duration_ms,
        SUM(credits_charged) as total_credits_charged,
        MAX(created_at) as last_executed_at
      FROM skill_execution_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY skill_id
      ORDER BY total_executions DESC
    `);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, stats: rows }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}
