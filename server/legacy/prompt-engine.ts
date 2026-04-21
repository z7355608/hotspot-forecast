/**
 * server/prompt-engine.ts
 * ============================================================
 * Prompt 模板管理层
 *
 * 功能：
 * 1. 从数据库加载 Prompt 模板（带缓存）
 * 2. 动态变量注入引擎：将用户上下文注入 {{变量}} 占位符
 * 3. 多模型适配层：根据模型选择对应的 system_prompt
 * 4. 模板版本管理和 CRUD API
 * ============================================================
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("PromptEngine");
import { getPool } from "./database.js";
import { callLLM, type LLMCallOptions, type LLMMessage } from "./llm-gateway.js";
import type { RowDataPacket } from "mysql2/promise";

// -------------------------------------------------------
// 类型定义
// -------------------------------------------------------

export type ModelId = "doubao" | "gpt54" | "claude46";

export interface PromptTemplate {
  id: string;
  version: number;
  label: string;
  intent: string;
  category: string;
  systemPromptDoubao: string;
  systemPromptGpt54: string;
  systemPromptClaude46: string;
  userPromptTemplate: string;
  requiredParams: string[];
  optionalParams: string[];
  outputFormat: "markdown" | "json" | "structured";
  outputSchema: Record<string, unknown> | null;
  preferredModel: ModelId;
  maxTokens: number;
  baseCost: number;
  isActive: boolean;
}

export interface RenderContext {
  // 通用上下文
  platform?: string;
  track?: string;
  accountStage?: string;
  followerCount?: number | string;
  targetAudience?: string;

  // 视频相关
  videoUrl?: string;
  playCount?: number | string;
  likeRate?: number | string;
  commentCount?: number | string;
  duration?: number | string;
  transcript?: string;
  contentType?: string;

  // 账号相关
  videoCount?: number | string;
  avgPlayCount?: number | string;
  maxPlayCount?: number | string;

  // 赛道相关
  heatTrend?: string;
  competitionLevel?: string;
  lowFollowerViralRate?: number | string;
  avgEngagementRate?: number | string;
  topAccountFollowers?: number | string;

  // 用户自定义
  userTrack?: string;

  // 任意额外字段
  [key: string]: string | number | undefined;
}

export interface RenderResult {
  systemPrompt: string;
  userPrompt: string;
  missingRequired: string[];
  filledOptional: string[];
  modelId: ModelId;
  maxTokens: number;
}

export interface PromptCallResult {
  content: string;
  modelId: ModelId;
  templateId: string;
  tokensUsed?: number;
  durationMs: number;
}

// -------------------------------------------------------
// 内存缓存（5 分钟 TTL）
// -------------------------------------------------------

interface CacheEntry {
  templates: Map<string, PromptTemplate>;
  loadedAt: number;
}

let templateCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function isCacheValid(): boolean {
  return (
    templateCache !== null &&
    Date.now() - templateCache.loadedAt < CACHE_TTL_MS
  );
}

function mapRowToTemplate(row: RowDataPacket): PromptTemplate {
  return {
    id: row.id,
    version: row.version,
    label: row.label,
    intent: row.intent,
    category: row.category,
    systemPromptDoubao: row.system_prompt_doubao,
    systemPromptGpt54: row.system_prompt_gpt54,
    systemPromptClaude46: row.system_prompt_claude46,
    userPromptTemplate: row.user_prompt_template,
    requiredParams: typeof row.required_params === "string"
      ? JSON.parse(row.required_params)
      : row.required_params ?? [],
    optionalParams: typeof row.optional_params === "string"
      ? JSON.parse(row.optional_params)
      : row.optional_params ?? [],
    outputFormat: row.output_format ?? "markdown",
    outputSchema: row.output_schema
      ? (typeof row.output_schema === "string"
        ? JSON.parse(row.output_schema)
        : row.output_schema)
      : null,
    preferredModel: (row.preferred_model ?? "doubao") as ModelId,
    maxTokens: row.max_tokens ?? 2000,
    baseCost: row.base_cost ?? 20,
    isActive: Boolean(row.is_active),
  };
}

// -------------------------------------------------------
// 数据库操作
// -------------------------------------------------------

/** 加载所有活跃模板（带缓存） */
export async function loadAllTemplates(): Promise<Map<string, PromptTemplate>> {
  if (isCacheValid()) {
    return templateCache!.templates;
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM prompt_templates WHERE is_active = 1 ORDER BY id"
  );

  const templates = new Map<string, PromptTemplate>();
  for (const row of rows) {
    const tpl = mapRowToTemplate(row);
    templates.set(tpl.id, tpl);
  }

  templateCache = { templates, loadedAt: Date.now() };
  log.info(`Loaded ${templates.size} templates from DB`);
  return templates;
}

/** 按 ID 获取单个模板 */
export async function getTemplateById(id: string): Promise<PromptTemplate | null> {
  const templates = await loadAllTemplates();
  return templates.get(id) ?? null;
}

/** 按 intent 获取最新版本模板 */
export async function getTemplateByIntent(intent: string): Promise<PromptTemplate | null> {
  const templates = await loadAllTemplates();
  let best: PromptTemplate | null = null;
  for (const tpl of templates.values()) {
    if (tpl.intent === intent) {
      if (!best || tpl.version > best.version) {
        best = tpl;
      }
    }
  }
  return best;
}

/** 获取所有模板列表（用于管理界面） */
export async function listTemplates(): Promise<PromptTemplate[]> {
  const templates = await loadAllTemplates();
  return Array.from(templates.values());
}

/** 强制刷新缓存 */
export function invalidateTemplateCache(): void {
  templateCache = null;
  log.info("Template cache invalidated");
}

/** 创建或更新模板 */
export async function upsertTemplate(
  tpl: Omit<PromptTemplate, "isActive"> & { isActive?: boolean }
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO prompt_templates (
      id, version, label, intent, category,
      system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46,
      user_prompt_template, required_params, optional_params,
      output_format, output_schema, preferred_model, max_tokens, base_cost, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      version = VALUES(version) + 1,
      label = VALUES(label),
      system_prompt_doubao = VALUES(system_prompt_doubao),
      system_prompt_gpt54 = VALUES(system_prompt_gpt54),
      system_prompt_claude46 = VALUES(system_prompt_claude46),
      user_prompt_template = VALUES(user_prompt_template),
      required_params = VALUES(required_params),
      optional_params = VALUES(optional_params),
      output_format = VALUES(output_format),
      output_schema = VALUES(output_schema),
      preferred_model = VALUES(preferred_model),
      max_tokens = VALUES(max_tokens),
      base_cost = VALUES(base_cost),
      is_active = VALUES(is_active),
      updated_at = NOW()`,
    [
      tpl.id, tpl.version, tpl.label, tpl.intent, tpl.category,
      tpl.systemPromptDoubao, tpl.systemPromptGpt54, tpl.systemPromptClaude46,
      tpl.userPromptTemplate,
      JSON.stringify(tpl.requiredParams),
      JSON.stringify(tpl.optionalParams),
      tpl.outputFormat,
      tpl.outputSchema ? JSON.stringify(tpl.outputSchema) : null,
      tpl.preferredModel, tpl.maxTokens, tpl.baseCost,
      tpl.isActive !== false ? 1 : 0,
    ]
  );
  invalidateTemplateCache();
}

// -------------------------------------------------------
// 动态变量注入引擎
// -------------------------------------------------------

/**
 * 将 context 中的值注入模板字符串中的 {{变量}} 占位符
 * 支持格式：{{varName}} 或 {{ varName }}
 */
export function injectVariables(template: string, context: RenderContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = context[key];
    if (value === undefined || value === null || value === "") {
      return match; // 保留未填充的占位符，方便调试
    }
    return String(value);
  });
}

/**
 * 检查必需参数是否都已提供
 */
export function checkRequiredParams(
  requiredParams: string[],
  context: RenderContext
): string[] {
  return requiredParams.filter(
    (param) => context[param] === undefined || context[param] === null || context[param] === ""
  );
}

/**
 * 检查哪些可选参数已被填充
 */
export function checkFilledOptional(
  optionalParams: string[],
  context: RenderContext
): string[] {
  return optionalParams.filter(
    (param) => context[param] !== undefined && context[param] !== null && context[param] !== ""
  );
}

// -------------------------------------------------------
// 多模型适配层
// -------------------------------------------------------

/**
 * 根据模型 ID 选择对应的 system prompt
 */
export function selectSystemPrompt(template: PromptTemplate, modelId: ModelId): string {
  switch (modelId) {
    case "doubao":
      return template.systemPromptDoubao;
    case "gpt54":
      return template.systemPromptGpt54;
    case "claude46":
      return template.systemPromptClaude46;
    default:
      return template.systemPromptDoubao;
  }
}

/**
 * 根据上下文和偏好选择最优模型
 * 规则：
 * - 有长文案（>2000字）且需要深度分析 → claude46
 * - 需要 JSON 结构化输出 → gpt54
 * - 其他 → 使用模板的 preferredModel
 */
export function selectOptimalModel(
  template: PromptTemplate,
  context: RenderContext,
  overrideModel?: ModelId
): ModelId {
  if (overrideModel) return overrideModel;

  const transcriptLength = String(context.transcript ?? "").length;

  // 长文案深度分析 → claude46
  if (transcriptLength > 2000 && template.category === "breakdown") {
    return "claude46";
  }

  // JSON 输出 → gpt54
  if (template.outputFormat === "json") {
    return "gpt54";
  }

  return template.preferredModel;
}

// -------------------------------------------------------
// 核心渲染函数
// -------------------------------------------------------

/**
 * 渲染 Prompt 模板：注入变量 + 选择模型 + 返回完整 prompt
 */
export async function renderTemplate(
  templateId: string,
  context: RenderContext,
  options?: {
    overrideModel?: ModelId;
    allowMissingRequired?: boolean;
  }
): Promise<RenderResult> {
  const template = await getTemplateById(templateId);
  if (!template) {
    throw new Error(`[PromptEngine] Template not found: ${templateId}`);
  }

  const missingRequired = checkRequiredParams(template.requiredParams, context);
  if (missingRequired.length > 0 && !options?.allowMissingRequired) {
    log.warn("Missing required params for ${templateId}: ${missingRequired.join(");
  }

  const filledOptional = checkFilledOptional(template.optionalParams, context);
  const modelId = selectOptimalModel(template, context, options?.overrideModel);
  const systemPrompt = selectSystemPrompt(template, modelId);
  const userPrompt = injectVariables(template.userPromptTemplate, context);

  return {
    systemPrompt,
    userPrompt,
    missingRequired,
    filledOptional,
    modelId,
    maxTokens: template.maxTokens,
  };
}

// -------------------------------------------------------
// 高级调用函数：渲染 + LLM 调用一体化
// -------------------------------------------------------

/**
 * 渲染模板并调用 LLM，返回完整结果
 */
export async function callWithTemplate(
  templateId: string,
  context: RenderContext,
  options?: {
    overrideModel?: ModelId;
    allowMissingRequired?: boolean;
    temperature?: number;
  }
): Promise<PromptCallResult> {
  const startMs = Date.now();
  const rendered = await renderTemplate(templateId, context, options);

  // LLMCallOptions uses messages[] array; build system + user messages
  const messages: LLMMessage[] = [];
  if (rendered.systemPrompt) {
    messages.push({ role: "system", content: rendered.systemPrompt });
  }
  messages.push({ role: "user", content: rendered.userPrompt });

  const llmOptions: LLMCallOptions = {
    modelId: rendered.modelId,
    messages,
    maxTokens: rendered.maxTokens,
    temperature: options?.temperature ?? 0.7,
  };

  const response = await callLLM(llmOptions);

  return {
    content: response.content,
    modelId: rendered.modelId,
    templateId,
    tokensUsed: (response.promptTokens ?? 0) + (response.completionTokens ?? 0),
    durationMs: Date.now() - startMs,
  };
}

// -------------------------------------------------------
// HTTP 处理函数（供 http-server.ts 调用）
// -------------------------------------------------------

import type { IncomingMessage, ServerResponse } from "http";

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

/** GET /api/prompt-templates - 获取所有模板列表 */
export async function handleListTemplates(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const templates = await listTemplates();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      templates: templates.map((t) => ({
        id: t.id,
        version: t.version,
        label: t.label,
        intent: t.intent,
        category: t.category,
        preferredModel: t.preferredModel,
        baseCost: t.baseCost,
        requiredParams: t.requiredParams,
        optionalParams: t.optionalParams,
      })),
    }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** GET /api/prompt-templates/:id - 获取单个模板详情 */
export async function handleGetTemplate(
  _req: IncomingMessage,
  res: ServerResponse,
  templateId: string
): Promise<void> {
  try {
    const template = await getTemplateById(templateId);
    if (!template) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Template not found: ${templateId}` }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, template }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** POST /api/prompt-templates/render - 渲染模板（预览，不调用 LLM） */
export async function handleRenderTemplate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req) as {
      templateId?: string;
      context?: RenderContext;
      overrideModel?: ModelId;
    };

    if (!body.templateId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "templateId is required" }));
      return;
    }

    const result = await renderTemplate(
      body.templateId,
      body.context ?? {},
      { overrideModel: body.overrideModel, allowMissingRequired: true }
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** POST /api/prompt-templates/call - 渲染模板并调用 LLM */
export async function handleCallTemplate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req) as {
      templateId?: string;
      context?: RenderContext;
      overrideModel?: ModelId;
      temperature?: number;
    };

    if (!body.templateId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "templateId is required" }));
      return;
    }

    const result = await callWithTemplate(
      body.templateId,
      body.context ?? {},
      {
        overrideModel: body.overrideModel,
        allowMissingRequired: true,
        temperature: body.temperature,
      }
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

/** PUT /api/prompt-templates/:id - 创建或更新模板 */
export async function handleUpsertTemplate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req) as Partial<PromptTemplate>;

    if (!body.id || !body.intent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "id and intent are required" }));
      return;
    }

    await upsertTemplate({
      id: body.id,
      version: body.version ?? 1,
      label: body.label ?? body.id,
      intent: body.intent,
      category: body.category ?? "general",
      systemPromptDoubao: body.systemPromptDoubao ?? "",
      systemPromptGpt54: body.systemPromptGpt54 ?? "",
      systemPromptClaude46: body.systemPromptClaude46 ?? "",
      userPromptTemplate: body.userPromptTemplate ?? "",
      requiredParams: body.requiredParams ?? [],
      optionalParams: body.optionalParams ?? [],
      outputFormat: body.outputFormat ?? "markdown",
      outputSchema: body.outputSchema ?? null,
      preferredModel: body.preferredModel ?? "doubao",
      maxTokens: body.maxTokens ?? 2000,
      baseCost: body.baseCost ?? 20,
      isActive: body.isActive !== false,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: `Template ${body.id} upserted` }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}
