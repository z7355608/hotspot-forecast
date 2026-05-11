/**
 * server/legacy/json-extract.ts
 * ───────────────────────────────────────────────
 * 剥 markdown 围栏 + 截首尾大括号 — 给"不支持 response_format"的模型用(主要是 Doubao)。
 *
 * 背景:Doubao endpoint 实测既不支持 json_object 也不支持 json_schema(ADR-0007 §Step 3 changelog),
 * 只能靠 prompt 强约束 + 这个解析 helper 兜底 LLM 输出格式偶发的 markdown 围栏 / 解释性前后缀。
 *
 * 使用方:any callLLM modelId='doubao' 且需要 JSON 解析的地方都应该过一道。
 */

/** 剥 ```json``` markdown 围栏,或截取首个 { 到末个 } 之间的 JSON */
export function stripJsonFences(text: string): string {
  const t = text.trim();
  // 匹配 ```json ... ``` 或 ``` ... ```
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // 截取首 { 到末 }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}
