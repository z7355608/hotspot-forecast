#!/usr/bin/env node
/**
 * prompts-dump.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * 从 DB 把 prompt_templates 表全量导出为 JSON,便于和 seed-skills.mjs 对比。
 *
 * 用途:
 *   1. 检查"线上 DB 是否被人手动改过"(应该没有,所有改动经 seed)
 *   2. 起新环境时手动审计当前 DB 状态
 *   3. 准备从老库迁移时备份
 *
 * 用法:
 *   pnpm prompts:dump                          # 输出到默认路径
 *   pnpm prompts:dump --out /tmp/prompts.json  # 自定义路径
 *   pnpm prompts:dump --diff                   # 只输出和 seed 的差异(若实现)
 *
 * 输出格式:每条 template 一个对象,字段顺序与 prompt_templates 表对齐。
 * ────────────────────────────────────────────────────────────────────────────
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 环境变量未设置 — 请检查项目根目录 .env 文件');
  process.exit(1);
}

// ─── 解析参数 ─────
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(__dirname, 'prompts-snapshot.json');
const outPath = outIdx >= 0 ? args[outIdx + 1] : defaultOut;

// ─── 连接 DB ─────
const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('📥 Dumping prompt_templates from DB...');

const [rows] = await conn.query(
  `SELECT
     id, version, label, intent, category,
     system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46,
     user_prompt_template, required_params, optional_params,
     output_format, output_schema, preferred_model, max_tokens, base_cost,
     is_active, created_at, updated_at
   FROM prompt_templates
   ORDER BY category, id`,
);

await conn.end();

// ─── 序列化 ─────
// MySQL JSON 字段返回 string 或 object,统一成 object
function normalizeJsonField(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

const dump = rows.map((row) => ({
  id: row.id,
  version: row.version,
  label: row.label,
  intent: row.intent,
  category: row.category,
  system_prompt_doubao: row.system_prompt_doubao,
  system_prompt_gpt54: row.system_prompt_gpt54,
  system_prompt_claude46: row.system_prompt_claude46,
  user_prompt_template: row.user_prompt_template,
  required_params: normalizeJsonField(row.required_params),
  optional_params: normalizeJsonField(row.optional_params),
  output_format: row.output_format,
  output_schema: normalizeJsonField(row.output_schema),
  preferred_model: row.preferred_model,
  max_tokens: row.max_tokens,
  base_cost: row.base_cost,
  is_active: Boolean(row.is_active),
  // 时间戳放最后,便于和 seed 对比时跳过
  created_at: row.created_at?.toISOString?.() ?? row.created_at,
  updated_at: row.updated_at?.toISOString?.() ?? row.updated_at,
}));

// ─── 写文件 ─────
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(dump, null, 2) + '\n', 'utf8');

console.log(`✅ Dumped ${dump.length} templates to ${outPath}`);
console.log(`   分类分布:`);
const byCategory = {};
for (const t of dump) {
  byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
}
for (const [cat, count] of Object.entries(byCategory).sort()) {
  console.log(`     ${cat}: ${count}`);
}
console.log('');
console.log('💡 跟 seed 对比:');
console.log('   diff <(jq -S . prompts-snapshot.json) <(...处理 seed 后的同结构)');
console.log('   理想情况下,DB 和 seed 应该完全一致。差异多半是手动改了 DB——补回 seed。');
