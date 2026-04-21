import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import type { ExamplePart, PromptTemplate } from "./workbench-config";

/** 轻量 toast 提示（修改成功后短暂显示） */
function ChipToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <span className="ml-1.5 inline-flex animate-pulse items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600 transition-opacity">
      <Check className="h-2.5 w-2.5" />
      {message}
    </span>
  );
}

/**
 * 从 inputValue 中提取所有 [[...]] 内的 token
 */
function extractChipTokens(value: string): string[] {
  const matches = value.match(/\[\[(.*?)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

/**
 * 替换 inputValue 中第 chipIndex 个 [[...]] 为新值
 */
function replaceChipToken(
  value: string,
  chipIndex: number,
  newToken: string,
): string {
  let count = 0;
  return value.replace(/\[\[.*?\]\]/g, (match) => {
    if (count === chipIndex) {
      count++;
      return `[[${newToken}]]`;
    }
    count++;
    return match;
  });
}

type ChipInfo = {
  token: string;
  suggestions: string[];
  tone: "violet" | "pink" | "blue" | "amber" | "slate";
  isReference: boolean;
};

/**
 * 从模板 parts 和当前 inputValue 中构建 chip 信息
 */
function buildChipInfos(
  template: PromptTemplate | null,
  inputValue: string,
): ChipInfo[] {
  const tokens = extractChipTokens(inputValue);
  if (tokens.length === 0) return [];

  // 从模板 parts 中获取 chip 的建议值和色调
  const chipParts = template
    ? template.parts.filter(
        (p): p is Extract<ExamplePart, { type: "chip" }> => p.type === "chip",
      )
    : [];

  return tokens.map((token, index) => {
    const chipPart = chipParts[index];
    const isReference = token.startsWith("@");
    return {
      token,
      suggestions: chipPart?.values ?? [],
      tone: (chipPart?.tone ?? "amber") as ChipInfo["tone"],
      isReference,
    };
  });
}

const TONE_CLASSES: Record<string, string> = {
  violet:
    "bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700 border-violet-200 hover:border-violet-300",
  pink: "bg-gradient-to-r from-rose-50 to-fuchsia-50 text-rose-700 border-rose-200 hover:border-rose-300",
  blue: "bg-gradient-to-r from-blue-50 to-sky-50 text-blue-700 border-blue-200 hover:border-blue-300",
  amber:
    "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200 hover:border-amber-300",
  slate:
    "bg-gradient-to-r from-gray-50 to-slate-50 text-gray-700 border-gray-200 hover:border-gray-300",
};

const TONE_ACTIVE_CLASSES: Record<string, string> = {
  violet: "ring-2 ring-violet-300",
  pink: "ring-2 ring-rose-300",
  blue: "ring-2 ring-blue-300",
  amber: "ring-2 ring-amber-300",
  slate: "ring-2 ring-gray-300",
};

/**
 * 单个可编辑 Chip
 */
function EditableChip({
  chip,
  chipIndex,
  onUpdate,
}: {
  chip: ChipInfo;
  chipIndex: number;
  onUpdate: (chipIndex: number, newValue: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(chip.token);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditValue(chip.token);
  }, [chip.token]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        if (isEditing) {
          confirmEdit();
        }
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });

  const [justUpdated, setJustUpdated] = useState(false);
  const [updateKey, setUpdateKey] = useState(0);

  const confirmEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== chip.token) {
      onUpdate(chipIndex, trimmed);
      setJustUpdated(true);
      setUpdateKey((k) => k + 1);
      setTimeout(() => setJustUpdated(false), 2000);
    } else {
      setEditValue(chip.token);
    }
    setIsEditing(false);
    setShowDropdown(false);
  }, [editValue, chip.token, chipIndex, onUpdate]);

  const selectSuggestion = useCallback(
    (value: string) => {
      onUpdate(chipIndex, value);
      setEditValue(value);
      setIsEditing(false);
      setShowDropdown(false);
      setJustUpdated(true);
      setUpdateKey((k) => k + 1);
      setTimeout(() => setJustUpdated(false), 2000);
    },
    [chipIndex, onUpdate],
  );

  // 不可编辑的引用类型（如 @视频1）
  if (chip.isReference) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[chip.tone]}`}
      >
        {chip.token}
      </span>
    );
  }

  const hasSuggestions = chip.suggestions.length > 1;

  return (
    <div ref={containerRef} className="relative inline-block">
      {isEditing ? (
        <span
          className={`inline-flex items-center gap-1 rounded-lg border px-1 py-0.5 text-xs font-medium ${TONE_CLASSES[chip.tone]} ${TONE_ACTIVE_CLASSES[chip.tone]}`}
        >
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmEdit();
              }
              if (e.key === "Escape") {
                setEditValue(chip.token);
                setIsEditing(false);
              }
            }}
            className="w-[6em] bg-transparent text-xs font-medium outline-none"
            style={{ minWidth: "3em", maxWidth: "12em" }}
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              confirmEdit();
            }}
            className="flex h-4 w-4 items-center justify-center rounded text-current opacity-60 hover:opacity-100"
          >
            <Check className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (hasSuggestions) {
              setShowDropdown((v) => !v);
            } else {
              setIsEditing(true);
            }
          }}
          className={`group inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${TONE_CLASSES[chip.tone]}`}
        >
          <span>{chip.token}</span>
          {hasSuggestions ? (
            <ChevronDown className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-80" />
          ) : (
            <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60" />
          )}
        </button>
      )}

      {justUpdated && <ChipToast key={updateKey} message="已修改" />}

      {showDropdown && hasSuggestions && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
          {chip.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 ${
                suggestion === chip.token
                  ? "font-medium text-gray-900"
                  : "text-gray-600"
              }`}
            >
              {suggestion === chip.token && (
                <Check className="h-3 w-3 text-green-500" />
              )}
              <span className={suggestion === chip.token ? "" : "pl-5"}>
                {suggestion}
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowDropdown(false);
              setIsEditing(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <Pencil className="h-3 w-3" />
            <span>自定义输入...</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 可编辑参数标签栏
 * 显示在 textarea 上方，让用户可以直接点击 chip 修改关键词
 */
export function EditableChipBar({
  inputValue,
  activeTemplate,
  onInputValueChange,
}: {
  inputValue: string;
  activeTemplate: PromptTemplate | null;
  onInputValueChange: (newValue: string) => void;
}) {
  const chipInfos = buildChipInfos(activeTemplate, inputValue);

  const handleUpdate = useCallback(
    (chipIndex: number, newValue: string) => {
      const newInput = replaceChipToken(inputValue, chipIndex, newValue);
      onInputValueChange(newInput);
    },
    [inputValue, onInputValueChange],
  );

  if (chipInfos.length === 0) return null;

  // 过滤掉引用类型的 chip，只显示可编辑的参数
  const editableChips = chipInfos.filter((c) => !c.isReference);
  if (editableChips.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-gray-400">参数：</span>
      {chipInfos.map((chip, index) =>
        chip.isReference ? null : (
          <EditableChip
            key={`chip-${index}-${chip.token}`}
            chip={chip}
            chipIndex={index}
            onUpdate={handleUpdate}
          />
        ),
      )}
      <span className="text-[10px] text-gray-300">点击可修改</span>
    </div>
  );
}
