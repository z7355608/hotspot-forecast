/**
 * 工具箱共享小组件
 * 从 ToolboxPage.tsx 提取
 */
import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

export function PlatformTags({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((p) => (
        <span key={p} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{p}</span>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "复制", size = "sm" }: { text: string; label?: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (size === "xs") {
    return (
      <button type="button" onClick={handleCopy} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        copied ? "bg-green-50 text-green-600" : "bg-gray-900 text-white hover:bg-gray-800"
      }`}
    >
      {copied ? <><Check className="h-3 w-3" />已复制</> : <><Copy className="h-3 w-3" />{label}</>}
    </button>
  );
}
