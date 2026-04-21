/**
 * Markdown 渲染器（类似扣子编程的渲染器）
 * 从 MonitorPage.tsx 提取
 */
import { useMemo } from "react";
import { sanitizeHtml } from "@/app/lib/sanitize-html";

/** 处理行内 Markdown 格式 */
function applyInline(text: string): string {
  // 加粗
  let result = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  // 行内代码
  result = result.replace(/`(.+?)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 text-[11px] font-mono text-gray-700">$1</code>');
  // 表情符号（保留原样）
  return result;
}

export function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => {
    let md = content;

    // 转义 HTML
    md = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 水平分割线
    md = md.replace(/^---$/gm, '<hr class="my-5 border-gray-200" />');

    // 表格
    md = md.replace(
      /(?:^|\n)((?:\|.+\|[ \t]*\n)+)/g,
      (_match, tableBlock: string) => {
        const rows = tableBlock.trim().split("\n").filter((r) => r.trim());
        if (rows.length < 2) return tableBlock;

        const isSeparator = /^\|[\s\-:|]+\|$/.test(rows[1].trim());
        const headerRow = rows[0];
        const dataRows = isSeparator ? rows.slice(2) : rows.slice(1);

        const parseRow = (row: string) =>
          row.split("|").slice(1, -1).map((cell) => cell.trim());

        const headerCells = parseRow(headerRow);
        let html = '<div class="my-4 overflow-x-auto rounded-lg border border-gray-200"><table class="w-full text-xs">';
        html += "<thead><tr>";
        for (const cell of headerCells) {
          html += `<th class="border-b border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">${applyInline(cell)}</th>`;
        }
        html += "</tr></thead><tbody>";
        for (const row of dataRows) {
          const cells = parseRow(row);
          html += '<tr class="border-b border-gray-100 last:border-0">';
          for (const cell of cells) {
            html += `<td class="px-3 py-2 text-gray-700">${applyInline(cell)}</td>`;
          }
          html += "</tr>";
        }
        html += "</tbody></table></div>";
        return html;
      },
    );

    // 引用块
    md = md.replace(
      /^&gt; (.+)$/gm,
      '<blockquote class="my-3 border-l-3 border-blue-300 bg-blue-50/50 px-4 py-2.5 text-xs text-gray-700">$1</blockquote>',
    );

    // 标题
    md = md.replace(/^#### (.+)$/gm, '<h4 class="mt-5 mb-2 text-sm font-semibold text-gray-800">$1</h4>');
    md = md.replace(/^### (.+)$/gm, '<h3 class="mt-6 mb-2 text-sm font-semibold text-gray-800">$1</h3>');
    md = md.replace(/^## (.+)$/gm, '<h2 class="mt-7 mb-3 text-base font-semibold text-gray-900">$1</h2>');
    md = md.replace(/^# (.+)$/gm, '<h1 class="mb-1 text-lg font-bold text-gray-900">$1</h1>');

    // 有序列表
    md = md.replace(/^(\d+)\. (.+)$/gm, '<div class="my-1 flex gap-2 text-xs text-gray-700"><span class="shrink-0 font-medium text-gray-500">$1.</span><span>$2</span></div>');

    // 无序列表
    md = md.replace(/^- (.+)$/gm, '<div class="my-1 flex gap-2 text-xs text-gray-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400"></span><span>$1</span></div>');

    // 斜体文本（独立行）
    md = md.replace(/^\*([^*]+)\*$/gm, '<p class="mt-4 text-[11px] italic text-gray-400">$1</p>');

    // 段落（非空行且非 HTML 标签开头）
    md = md.replace(
      /^(?!<[a-z]|$)(.+)$/gm,
      (_, text) => `<p class="my-2 text-xs leading-relaxed text-gray-700">${applyInline(text)}</p>`,
    );

    // 空行清理
    md = md.replace(/\n{3,}/g, "\n\n");

    return md;
  }, [content]);

  return (
    <div
      className="monitor-report-content"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
