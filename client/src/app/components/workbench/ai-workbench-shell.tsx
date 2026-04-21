import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api-utils";
import {
  AtSign,
  ArrowUp,
  Check,
  FileText,
  Lightbulb,
  Link2,
  Plus,
  FolderOpen,
  Plug,
  Paperclip,
  Search,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  getAnalysisInfo,
  getChargedCost,
  getHomepageAnalysisCost,
  getHomepagePlatformSurcharge,
} from "../../store/app-data";
import { trpc } from "@/lib/trpc";
import type {
  PredictionEvidenceItem,
  PredictionRequestDraft,
  PredictionRequestEntrySource,
} from "../../store/prediction-types";
import { useAppStore } from "../../store/app-store";
import {
  buildMarkdownFromUrl,
  buildPromptFromParts,
  createResourceItem,
  getReferenceToneClass,
  getResourceKindLabel,
  isValidUrl,
  isVideoPlatformUrl,
  normalizePromptValue,
  PROMPT_TEMPLATES,
  SKILL_TEMPLATES,
  type PromptTemplate,
  type ResourceItem,
  type SkillTemplate,
} from "./workbench-config";
import { EditableChipBar } from "./editable-chip-bar";
import { useOnboarding } from "../../lib/onboarding-context";

type MenuSection = "link" | "skill" | null;
type MentionItem = ResourceItem;

function InlineVariablePreview({
  value,
}: {
  value: string;
}) {
  const segments = value.split(/(\[\[.*?\]\])/g).filter(Boolean);

  return (
    <div className="min-h-[60px] whitespace-pre-wrap break-words text-base leading-7 text-gray-900">
      {segments.map((segment, index) => {
        const matched = segment.match(/^\[\[(.*)\]\]$/);
        if (!matched) {
          return (
            <span key={`text-${index}`} className="text-gray-900">
              {segment}
            </span>
          );
        }

        const token = matched[1];
        const isReference = token.startsWith("@");
        const toneClass = isReference
          ? getReferenceToneClass(token)
          : /(抖音|小红书|B站|微信视频号)/.test(token)
            ? "bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700 ring-violet-100"
            : /(美妆|通勤穿搭|母婴育儿|职场干货|居家生活|新号|成长期账号|低粉号)/.test(
                  token,
                )
              ? "bg-gradient-to-r from-rose-50 to-fuchsia-50 text-rose-700 ring-rose-100"
              : "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 ring-amber-100";

        return (
          <span
            key={`token-${index}`}
            className={`mx-1 inline-flex items-center gap-1 rounded-[6px] px-1.5 py-px align-baseline text-[12px] font-medium ring-1 ${toneClass}`}
          >
            {isReference && <FolderOpen className="h-3 w-3" />}
            {token}
          </span>
        );
      })}
    </div>
  );
}

export function AIWorkbench({
  onSubmit,
  focusTrigger = 0,
  pendingPromptRef,
}: {
  onSubmit?: (
    request: PredictionRequestDraft,
  ) => Promise<{ ok: boolean; shortfall?: number; error?: string }>;
  focusTrigger?: number;
  pendingPromptRef?: React.RefObject<string | null>;
} = {}) {
  const navigate = useNavigate();
  const { tooltipsSeen, markTooltipSeen } = useOnboarding();
  const {
    state,
    connectedConnectors,
    selectedPlatformIds,
    selectedPlatformConnectors,
    togglePlatformSelection,
    setSelectedPlatformIds,
    connectConnector,
    disconnectConnector,
  } = useAppStore();
  const [inputValue, setInputValue] = useState("");
  const [showConnectors, setShowConnectors] = useState(true);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>(null);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // 本地临时选中状态（弹窗内切换，不调用 verify API）
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
  const [showInsufficient, setShowInsufficient] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillTemplate | null>(null);
  const [entrySource, setEntrySource] = useState<PredictionRequestEntrySource>("manual");
  const [entryTemplateId, setEntryTemplateId] = useState<string | undefined>(undefined);
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);
  const [exampleVariantIndex, setExampleVariantIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const normalizedInputValue = useMemo(
    () => normalizePromptValue(inputValue),
    [inputValue],
  );
  const analysisInfo = useMemo(() => getAnalysisInfo(normalizedInputValue), [
    normalizedInputValue,
  ]);
  const modelAdjustedCost = useMemo(
    () => getChargedCost(analysisInfo.cost, state.selectedModel),
    [analysisInfo.cost, state.selectedModel],
  );
  const platformSurcharge = useMemo(
    () => getHomepagePlatformSurcharge(selectedPlatformConnectors.length),
    [selectedPlatformConnectors.length],
  );
  const analysisCost = useMemo(
    () =>
      getHomepageAnalysisCost(
        analysisInfo.cost,
        state.selectedModel,
        selectedPlatformConnectors.length,
      ),
    [analysisInfo.cost, selectedPlatformConnectors.length, state.selectedModel],
  );
  const filteredConnectors = state.connectors.filter(
    (connector) =>
      connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      connector.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const mentionItems = useMemo<MentionItem[]>(() => resources, [resources]);
  const visibleMentionItems = useMemo(() => {
    if (mentionStart === null) return [];
    const keyword = mentionQuery.toLowerCase();
    return mentionItems.filter(
      (item) =>
        item.label.toLowerCase().includes(keyword) ||
        item.display.toLowerCase().includes(keyword),
    );
  }, [mentionItems, mentionQuery, mentionStart]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowPlusMenu(false);
        setActiveSection(null);
      }
    };

    if (!showPlusMenu) return;

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPlusMenu]);

  useEffect(() => {
    if (!focusTrigger) return;
    // 如果有来自情报控制台的快捷 prompt，填入输入框
    if (pendingPromptRef?.current) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      setInputValue(prompt);
      setEntrySource("manual");
      setActiveTemplate(null);
      setEntryTemplateId(undefined);
    }
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => textareaRef.current?.focus(), 180);
  }, [focusTrigger, pendingPromptRef]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setExampleVariantIndex((current) => current + 1);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  const buildSubmitPayload = () => {
    const evidenceItems: PredictionEvidenceItem[] = resources.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      display: item.display,
      source: item.source,
      content: item.content,
    }));

    return {
      prompt: normalizedInputValue.trim(),
      evidenceItems,
      selectedPlatforms: selectedPlatformConnectors.map((connector) => connector.id),
      connectedPlatforms: connectedConnectors.map((connector) => connector.id),
      personalizationMode: connectedConnectors.some(
        (connector) => connector.authMode === "cookie",
      )
        ? "cookie"
        : "public",
      entrySource: selectedSkill ? "skill" : entrySource,
      entryTemplateId: selectedSkill ? undefined : entryTemplateId,
      selectedSkillId: selectedSkill?.id,
      skillLabel: selectedSkill?.label,
      skillPrompt: selectedSkill?.prompt,
    } satisfies PredictionRequestDraft;
  };

  const insertTextAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? inputValue.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue = `${inputValue.slice(0, start)}${text}${inputValue.slice(end)}`;
    setInputValue(nextValue);
    window.setTimeout(() => {
      textarea?.focus();
      const caretPosition = start + text.length;
      textarea?.setSelectionRange(caretPosition, caretPosition);
      updateMentionState(nextValue, caretPosition);
    }, 0);
  };

  const updateMentionState = (value: string, caretPosition: number | null) => {
    if (caretPosition === null || mentionItems.length === 0) {
      setMentionStart(null);
      setMentionQuery("");
      return;
    }

    const leftText = value.slice(0, caretPosition);
    const matched = leftText.match(/(?:^|\s)@([^\s@]*)$/);
    if (!matched) {
      setMentionStart(null);
      setMentionQuery("");
      return;
    }

    setMentionStart(caretPosition - matched[0].trimStart().length);
    setMentionQuery(matched[1]);
  };

  const insertMentionToken = (item: MentionItem) => {
    const textarea = textareaRef.current;
    const start = mentionStart ?? textarea?.selectionStart ?? inputValue.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue = `${inputValue.slice(0, start)}[[${item.label}]]${inputValue.slice(end)}`;
    setInputValue(nextValue);
    setMentionStart(null);
    setMentionQuery("");
    window.setTimeout(() => {
      textarea?.focus();
      const caretPosition = start + `[[${item.label}]]`.length;
      textarea?.setSelectionRange(caretPosition, caretPosition);
    }, 0);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    setSubmitError("");
    const result = await onSubmit?.(buildSubmitPayload());
    setSubmitting(false);
    if (result?.ok === false) {
      if (result.error) {
        setSubmitError(result.error);
        setShowInsufficient(false);
        return;
      }
      setShowInsufficient(true);
      return;
    }

    setShowInsufficient(false);
    setSubmitError("");
    setMenuMessage("");
  };

  const [isParsingLink, setIsParsingLink] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const smartParseMutation = trpc.copywriting.smartParse.useMutation();

  const applyLinkDraft = async () => {
    if (!linkDraft.trim()) {
      setMenuMessage("先粘贴一个可解析的链接。");
      return;
    }
    if (!isValidUrl(linkDraft.trim())) {
      setMenuMessage("这个链接格式不正确，需以 http:// 或 https:// 开头。");
      return;
    }

    const nextUrl = linkDraft.trim();
    if (resources.some((item) => item.source === nextUrl)) {
      setMenuMessage("这个链接已经解析过了。");
      return;
    }

    setIsParsingLink(true);
    setMenuMessage("正在智能解析链接...");

    try {
      const parsed = await smartParseMutation.mutateAsync({ url: nextUrl });

      // 平台限制检测 → 提醒用户手动上传
      if (parsed.kind === "restricted") {
        setMenuMessage(
          `⚠️ ${parsed.restrictionWarning || "因网站限制无法获取内容，请手动下载后上传本地文件。"}`,
        );
        setIsParsingLink(false);
        return;
      }

      if (!parsed.ok && parsed.kind === "error") {
        setMenuMessage(`❌ 解析失败：${parsed.error || "未知错误"}，请检查链接或手动上传文件。`);
        setIsParsingLink(false);
        return;
      }

      // 根据解析结果创建资源
      const isVideoLink = parsed.kind === "video";
      const title = parsed.title || nextUrl.replace(/^https?:\/\//, "").slice(0, 48);
      const kind: ResourceItem["kind"] = isVideoLink ? "video" : "doc";

      const nextResource = createResourceItem(resources, {
        kind,
        display: title.slice(0, 60),
        source: nextUrl,
        content: parsed.content || (isVideoLink ? undefined : buildMarkdownFromUrl(nextUrl)),
      });

      setResources((prev) => [...prev, nextResource]);
      setInputValue((current) =>
        `${current}${current.trim() ? "\n" : ""}[[@${nextResource.label}]]`,
      );

      if (isVideoLink) {
        const platformLabel = parsed.platform ? `（${parsed.platform}）` : "";
        setMenuMessage(`✅ 已解析视频${platformLabel}：${title}`);
      } else {
        const contentLen = parsed.content?.length ?? 0;
        const kindLabel = parsed.kind === "article" ? "文章" : "网页";
        setMenuMessage(
          `✅ 已解析${kindLabel}：${title}${contentLen > 0 ? `（提取了 ${contentLen} 字内容，已转为 Markdown）` : ""}`,
        );
      }
    } catch {
      // Fallback: 如果智能解析失败，尝试旧接口
      try {
        const res = await apiFetch("/api/input/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: nextUrl }),
        });
        const fallbackParsed = await res.json();

        const isVideoLink = isVideoPlatformUrl(nextUrl);
        const title = fallbackParsed?.title || nextUrl.replace(/^https?:\/\//, "").slice(0, 48);
        const extractedText = fallbackParsed?.extractedText || "";
        const kind: ResourceItem["kind"] = isVideoLink ? "video" : "doc";

        const nextResource = createResourceItem(resources, {
          kind,
          display: title.slice(0, 60),
          source: nextUrl,
          content: extractedText || (isVideoLink ? undefined : buildMarkdownFromUrl(nextUrl)),
        });

        setResources((prev) => [...prev, nextResource]);
        setInputValue((current) =>
          `${current}${current.trim() ? "\n" : ""}[[@${nextResource.label}]]`,
        );
        setMenuMessage(
          isVideoLink
            ? `✅ 已解析视频链接：${title}`
            : `✅ 已解析网页：${title}${extractedText ? `（提取了 ${extractedText.length} 字内容）` : ""}`,
        );
      } catch {
        // 最终 fallback
        const isVideoLink = isVideoPlatformUrl(nextUrl);
        const nextResource = createResourceItem(resources, {
          kind: isVideoLink ? "video" : "doc",
          display: nextUrl.replace(/^https?:\/\//, "").slice(0, 48),
          source: nextUrl,
          content: isVideoLink ? undefined : buildMarkdownFromUrl(nextUrl),
        });
        setResources((prev) => [...prev, nextResource]);
        setInputValue((current) =>
          `${current}${current.trim() ? "\n" : ""}[[@${nextResource.label}]]`,
        );
        setMenuMessage("链接已添加，但解析服务暂时不可用，将在分析时自动解析。");
      }
    } finally {
      setIsParsingLink(false);
      setLinkDraft("");
      setShowPlusMenu(false);
      setActiveSection(null);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    // 去重
    const newFiles = fileArray.filter((file) => {
      const lower = file.name.toLowerCase();
      const kind: ResourceItem["kind"] = /\.(mp4|mov|avi|mkv|webm)$/.test(lower)
        ? "video"
        : /\.(png|jpg|jpeg|gif|webp|heic)$/.test(lower)
          ? "image"
          : "file";
      return !resources.some((item) => item.display === file.name && item.kind === kind);
    });

    if (newFiles.length === 0) {
      setMenuMessage("这些文件已经在当前上下文里了。");
      return;
    }

    setIsUploadingFile(true);
    setMenuMessage(`正在上传 ${newFiles.length} 个文件...`);
    setShowPlusMenu(false);
    setActiveSection(null);

    const uploaded: ResourceItem[] = [];
    for (const file of newFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch("/api/file/upload", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        const lower = file.name.toLowerCase();
        const kind: ResourceItem["kind"] = /\.(mp4|mov|avi|mkv|webm)$/.test(lower)
          ? "video"
          : /\.(png|jpg|jpeg|gif|webp|heic)$/.test(lower)
            ? "image"
            : "file";
        const resource = createResourceItem([...resources, ...uploaded], {
          kind,
          display: file.name,
          source: result.url || file.name,
          content: result.url ? `文件已上传: ${result.url}` : undefined,
        });
        uploaded.push(resource);
      } catch {
        // 上传失败时仍然创建本地资源
        const lower = file.name.toLowerCase();
        const kind: ResourceItem["kind"] = /\.(mp4|mov|avi|mkv|webm)$/.test(lower)
          ? "video"
          : /\.(png|jpg|jpeg|gif|webp|heic)$/.test(lower)
            ? "image"
            : "file";
        const resource = createResourceItem([...resources, ...uploaded], {
          kind,
          display: file.name,
          source: file.name,
        });
        uploaded.push(resource);
      }
    }

    setResources((prev) => [...prev, ...uploaded]);
    setMenuMessage(`✅ 已上传 ${uploaded.length} 个文件，可通过 @ 引用。`);
    setIsUploadingFile(false);
  };

  const applyPromptTemplate = (template: PromptTemplate) => {
    setSelectedSkill(null);
    setEntrySource("example");
    setEntryTemplateId(template.id);
    setActiveTemplate(template);
    setShowInsufficient(false);
    setMenuMessage("");
    if (template.exampleResources?.length) {
      const exampleResources = template.exampleResources.reduce<ResourceItem[]>(
        (acc, item) => [
          ...acc,
          createResourceItem(acc, {
            kind: item.kind,
            display: item.display,
            source: item.source,
            content: item.content,
          }),
        ],
        [],
      );
      setResources(exampleResources);
      setMenuMessage("已填入示例问题，并注入示例视频资源。");
    } else {
      setResources([]);
      setMenuMessage("");
    }
    setInputValue(buildPromptFromParts(template.parts, exampleVariantIndex));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-5 pt-0 sm:px-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      <div className="rounded-3xl bg-white shadow-lg transition-shadow hover:shadow-xl">
        <div className="px-4 py-5 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-500">
              不知道从哪里开始？
            </span>
            <span>先点下面的首问模板，或直接输入你最想判断的问题。</span>
          </div>
          {selectedSkill && (
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                {selectedSkill.label}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSkill(null);
                    setEntrySource("manual");
                    setEntryTemplateId(undefined);
                    textareaRef.current?.focus();
                  }}
                  className="text-gray-400 transition-colors hover:text-gray-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
              <span className="text-xs text-gray-400">
                说说想要这个技能帮你做什么
              </span>
            </div>
          )}
          {inputValue.includes("[[") && activeTemplate && (
            <div>
              <EditableChipBar
                inputValue={inputValue}
                activeTemplate={activeTemplate}
                onInputValueChange={(newValue) => setInputValue(newValue)}
              />
              <div className="mt-1 mb-2 flex items-center gap-2 text-[11px] text-gray-400">
                <span>点击上方标签切换选项，或</span>
                <button
                  type="button"
                  onClick={() => {
                    // 把 [[xxx]] 替换为纯文本，让用户在已有内容基础上自由编辑
                    const plainText = inputValue.replace(/\[\[(.*?)\]\]/g, "$1");
                    setInputValue(plainText);
                    setActiveTemplate(null);
                    setEntrySource("manual");
                    setEntryTemplateId(undefined);
                    textareaRef.current?.focus();
                  }}
                  className="underline text-gray-500 hover:text-gray-700 transition-colors"
                >
                  自由编辑
                </button>
              </div>
            </div>
          )}
          {/* E1: 首次聚焦 tooltip */}
          {!tooltipsSeen["e1_workbench_focus"] && (
            <div className="mb-2 flex items-start gap-2 rounded-xl bg-[#1E2939] px-3 py-2.5">
              <span className="text-[12px] leading-[17px] text-white flex-1">
                💡 试试直接粘贴一条视频链接，AI 会自动拆解内容结构
              </span>
              <button
                type="button"
                onClick={() => markTooltipSeen("e1_workbench_focus")}
                className="shrink-0 text-white/50 hover:text-white transition-colors mt-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="relative">
            {inputValue.includes("[[") && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                <InlineVariablePreview value={inputValue} />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onFocus={() => {
                // Mark E1 tooltip on first focus
                if (!tooltipsSeen["e1_workbench_focus"]) {
                  // Let them see it for 3s then auto-dismiss
                  setTimeout(() => markTooltipSeen("e1_workbench_focus"), 5000);
                }
              }}
              onChange={(event) => {
                setInputValue(event.target.value);
                if (!selectedSkill && !event.target.value.trim()) {
                  setEntrySource("manual");
                  setEntryTemplateId(undefined);
                  setActiveTemplate(null);
                  setResources([]);
                  setMenuMessage("");
                }
                setShowInsufficient(false);
                updateMentionState(event.target.value, event.target.selectionStart);
              }}
              placeholder={
                selectedSkill
                  ? "说说想要这个技能要帮你做什么"
                  : "例如：穿搭赛道现在发什么会火？我有 3000 粉，想知道具体可以做哪些选题"
              }
              className={`min-h-[60px] w-full resize-none bg-transparent text-base placeholder-gray-400 focus:outline-none ${
                inputValue.includes("[[") ? "text-transparent caret-gray-900 select-none" : "text-gray-900"
              }`}
              onClick={(event) => {
                // 模板态下点击 textarea 自动转为自由编辑模式
                if (inputValue.includes("[[") && activeTemplate) {
                  const plainText = inputValue.replace(/\[\[(.*?)\]\]/g, "$1");
                  setInputValue(plainText);
                  setActiveTemplate(null);
                  setEntrySource("manual");
                  setEntryTemplateId(undefined);
                }
                updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart);
              }}
              onKeyUp={(event) =>
                updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onSelect={(event) =>
                updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onKeyDown={(event) => {
                if (
                  visibleMentionItems.length > 0 &&
                  (event.key === "ArrowDown" || event.key === "ArrowUp")
                ) {
                  event.preventDefault();
                }
                if (
                  visibleMentionItems.length > 0 &&
                  (event.key === "Enter" || event.key === "Tab")
                ) {
                  event.preventDefault();
                  insertMentionToken(visibleMentionItems[0]);
                  return;
                }
                if (event.key === "Escape" && mentionStart !== null) {
                  setMentionStart(null);
                  setMentionQuery("");
                  return;
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
          </div>
          {visibleMentionItems.length > 0 && (
            <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-2">
              <div className="mb-1 px-2 text-[11px] text-gray-400">
                输入 @ 可快速引用已上传的文件和链接
              </div>
              <div className="space-y-1">
                {visibleMentionItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMentionToken(item);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-white"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {item.kind === "doc" ? (
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      ) : item.kind === "video" ? (
                        <Video className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      ) : item.kind === "image" ? (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      )}
                      <span className="rounded-[6px] bg-gray-100 px-1.5 py-px text-[11px] text-gray-700">
                        {item.label}
                      </span>
                      <span className="truncate text-xs text-gray-400">{item.display}</span>
                    </div>
                    <span className="text-[11px] text-gray-300">引用</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {resources.length > 0 && (
          <div className="space-y-2 px-4 pb-1 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
                >
                  {resource.kind === "doc" ? (
                    <FileText className="h-3 w-3" />
                  ) : resource.kind === "video" ? (
                    <Video className="h-3 w-3" />
                  ) : resource.kind === "image" ? (
                    <FolderOpen className="h-3 w-3" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-gray-200">
                    {getResourceKindLabel(resource.kind)}
                  </span>
                  <span className="max-w-[180px] truncate text-gray-700">
                    {resource.display}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const item = mentionItems.find((mention) => mention.id === resource.id);
                      if (!item) return;
                      setInputValue((current) =>
                        `${current}${current.trim() ? " " : ""}[[${item.label}]]`,
                      );
                      textareaRef.current?.focus();
                    }}
                    className="rounded-[6px] bg-gray-100 px-1.5 py-px text-[10px] text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                  >
                    @引用
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // 删除资源时同步清理输入框中的 [[xxx]] 引用
                      const item = mentionItems.find((mention) => mention.id === resource.id);
                      if (item) {
                        setInputValue((current) =>
                          current.replace(new RegExp(`\\[\\[${item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`, "g"), "").replace(/\s{2,}/g, " ").trim(),
                        );
                      }
                      setResources((prev) =>
                        prev.filter((r) => r.id !== resource.id),
                      );
                    }}
                    className="text-gray-400 transition-colors hover:text-gray-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 px-4 pb-4 pt-3 sm:px-6" ref={menuRef}>
          {inputValue.trim() &&
            (!showInsufficient ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                <span className="text-[10px] leading-none text-gray-300">◎</span>
                <span>
                  预计消耗 {analysisCost} 积分
                  {analysisCost !== analysisInfo.cost
                    ? `（模型后 ${modelAdjustedCost}${platformSurcharge > 0 ? ` + 平台 ${platformSurcharge}` : ""}）`
                    : ""}
                </span>
                <span className="text-gray-200">·</span>
                <span>余额 {state.credits}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500">
                  还差 {Math.max(analysisCost - state.credits, 0)} 积分
                </span>
                <span className="text-gray-200">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowInsufficient(false);
                    textareaRef.current?.focus();
                  }}
                  className="text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-700"
                >
                  保留问题继续修改
                </button>
                <span className="text-gray-200">·</span>
                <button
                  type="button"
                  onClick={() => navigate("/credits")}
                  className="text-blue-500 transition-colors hover:text-blue-600"
                >
                  去充值
                </button>
              </div>
            ))}

          {menuMessage && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              {menuMessage}
            </div>
          )}

          {submitError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
              {submitError}
            </div>
          )}

          {showPlusMenu && activeSection === "link" && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 text-xs text-gray-500">
                粘贴视频、网页或文章链接，自动识别类型并提取内容
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isParsingLink) {
                      event.preventDefault();
                      applyLinkDraft();
                    }
                  }}
                  placeholder="粘贴链接：视频自动解析，网页转为 Markdown"
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                />
                <button
                  type="button"
                  onClick={applyLinkDraft}
                  disabled={isParsingLink}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                >
                  {isParsingLink ? "智能解析中..." : "解析链接"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-400">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-500">视频自动解析</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-500">网页转 MD</span>
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-500">平台限制检测</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex items-center gap-2">

              <button
                type="button"
                onClick={() => {
                  setShowPlusMenu((value) => !value || activeSection === "skill");
                  setActiveSection(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPlusMenu((value) => !(value && activeSection === "skill"));
                  setActiveSection("skill");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <Lightbulb className="h-4 w-4" />
              </button>

              {showPlusMenu && activeSection !== "skill" && (
                <div className="absolute left-0 top-10 z-50 min-w-[220px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 text-gray-500" />
                    <span>从本地文件上传</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setActiveSection((value) => (value === "link" ? null : "link"));
                      setMenuMessage("");
                    }}
                  >
                    <Link2 className="h-4 w-4 text-gray-500" />
                    <span>解析链接</span>
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setSearchQuery("");
                      setLocalSelectedIds(new Set(selectedPlatformIds));
                      setShowConnectorModal(true);
                      setShowPlusMenu(false);
                      setActiveSection(null);
                    }}
                  >
                    <Plug className="h-4 w-4 text-gray-500" />
                    <span>添加连接器</span>
                  </button>
                </div>
              )}
              {showPlusMenu && activeSection === "skill" && (
                <div className="absolute left-0 top-10 z-50 min-w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                  <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400">
                    Skills
                  </div>
                  {SKILL_TEMPLATES.map((skill) => {
                    const Icon = skill.icon;
                    return (
                    <button
                      key={`menu-skill-${skill.label}`}
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                      onClick={() => {
                        setSelectedSkill(skill);
                        setEntrySource("skill");
                        setEntryTemplateId(undefined);
                        setShowInsufficient(false);
                        setMenuMessage(`已选择「${skill.label}」技能，请继续输入你要它完成的任务。`);
                        setShowPlusMenu(false);
                        setActiveSection(null);
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-800">{skill.label}</span>
                        <span className="block text-xs leading-5 text-gray-400">{skill.desc}</span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!inputValue.trim() || submitting}
                className="flex h-9 min-w-9 items-center justify-center rounded-full bg-gray-200 px-2 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? (
                  <span className="text-[11px] text-gray-700">分析中</span>
                ) : (
                  <ArrowUp className="h-4 w-4 text-gray-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 平台标签区：已选择的分析平台 chip + 添加按钮 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {selectedPlatformConnectors.map((connector) => (
          <div
            key={connector.id}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition-all hover:shadow"
          >
            <div
              className="h-3.5 w-3.5 shrink-0 rounded-full text-[8px] flex items-center justify-center text-white"
              style={{ backgroundColor: connector.color }}
            />
            <span className="text-gray-700">{connector.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlatformSelection(connector.id);
              }}
              className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              title={`移除 ${connector.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setLocalSelectedIds(new Set(selectedPlatformIds));
            setShowConnectorModal(true);
          }}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-transparent px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-600"
        >
          <Plus className="h-3 w-3" />
          添加平台
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs text-gray-400">
          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-500">示例</span>
          <span>已填入参考数据，适合直接试跑</span>
        </div>
        <div className="flex items-center justify-start gap-3 overflow-x-auto pb-2 sm:justify-center">
          {PROMPT_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
            <button
              key={`example-${template.label}`}
              type="button"
              onClick={() => {
                if (template.id === "copy-extraction") {
                  navigate("/toolbox?tool=text_extract");
                  return;
                }
                applyPromptTemplate(template);
              }}
              className="flex whitespace-nowrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Icon className="h-4 w-4" />
              <span>{template.label}</span>
              <span className="text-[10px] leading-none text-gray-300">
                {getHomepageAnalysisCost(
                  template.cost,
                  state.selectedModel,
                  selectedPlatformConnectors.length,
                )}
              </span>
            </button>
            );
          })}
          {/* 自定义赛道词快捷入口 */}
          {showCustomInput ? (
            <span className="flex shrink-0 items-center gap-1 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2">
              <input
                ref={customInputRef}
                type="text"
                value={customInputValue}
                onChange={(e) => setCustomInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const word = customInputValue.trim();
                    if (!word) { setShowCustomInput(false); return; }
                    const tpl = PROMPT_TEMPLATES.find((t) => t.id === "opportunity-forecast");
                    if (tpl) {
                      // 将自定义词注入模板第一个 chip 位置
                      const customParts = tpl.parts.map((p) =>
                        p.type === "chip" ? { ...p, values: [word, ...p.values] } : p
                      );
                      applyPromptTemplate({ ...tpl, parts: customParts });
                    }
                    setCustomInputValue("");
                    setShowCustomInput(false);
                  }
                  if (e.key === "Escape") {
                    setShowCustomInput(false);
                    setCustomInputValue("");
                  }
                }}
                onBlur={() => {
                  if (!customInputValue.trim()) {
                    setShowCustomInput(false);
                    setCustomInputValue("");
                  }
                }}
                placeholder="输入赛道词…"
                className="w-20 bg-transparent text-sm text-pink-700 placeholder-pink-300 outline-none"
                autoFocus
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const word = customInputValue.trim();
                  if (!word) { setShowCustomInput(false); return; }
                  const tpl = PROMPT_TEMPLATES.find((t) => t.id === "opportunity-forecast");
                  if (tpl) {
                    const customParts = tpl.parts.map((p) =>
                      p.type === "chip" ? { ...p, values: [word, ...p.values] } : p
                    );
                    applyPromptTemplate({ ...tpl, parts: customParts });
                  }
                  setCustomInputValue("");
                  setShowCustomInput(false);
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-400 text-white hover:bg-pink-500"
              >
                <Check className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowCustomInput(true);
                setTimeout(() => customInputRef.current?.focus(), 50);
              }}
              className="flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-400 transition-colors hover:border-pink-300 hover:text-pink-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>自定义赛道</span>
            </button>
          )}
        </div>
      </div>

      {showConnectorModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowConnectorModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="max-h-[85vh] w-full max-w-[min(48rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-4 py-5 sm:px-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-gray-900">选择分析平台</h2>
                  <button
                    type="button"
                    onClick={() => setShowConnectorModal(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索平台..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="max-h-[calc(85vh-180px)] overflow-y-auto p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredConnectors.map((connector) => {
                    const isSelected = localSelectedIds.has(connector.id);
                    return (
                      <button
                        key={connector.id}
                        type="button"
                        onClick={() => {
                          setLocalSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(connector.id)) {
                              next.delete(connector.id);
                            } else {
                              next.add(connector.id);
                            }
                            return next;
                          });
                        }}
                        className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex flex-1 items-center gap-3">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-white"
                              style={{ backgroundColor: connector.color }}
                            >
                              {connector.name.slice(0, 1)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {connector.name}
                              </div>
                              <div className="mt-0.5 text-xs text-gray-500">
                                {connector.category}
                                {connector.predictionEnabled ? " · 中文预测已启用" : " · 连接器待后续接入"}
                              </div>
                            {isSelected && connector.id !== "douyin" && (
                              <div className="mt-1 text-[10px] font-medium text-amber-600">
                                +10 积分/次
                              </div>
                            )}
                            {connector.id === "douyin" && (
                              <div className="mt-1 text-[10px] text-green-600">
                                基础平台（免费）
                              </div>
                            )}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    已选择{" "}
                    <span className="font-semibold text-gray-900">
                      {localSelectedIds.size}
                    </span>{" "}
                    个平台
                    {localSelectedIds.size > 1 && (
                      <span className="ml-1.5 text-amber-600 text-xs font-medium">
                        （+{(localSelectedIds.size - 1) * 10} 积分/次）
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // 将本地选中状态直接同步到 store 的 selectedPlatformIds
                      setSelectedPlatformIds(Array.from(localSelectedIds));
                      setShowConnectorModal(false);
                    }}
                    className="rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
