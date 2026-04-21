import {
  FileText,
  Mic,
  Sparkles,
  TrendingUp,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";

export type ExamplePart =
  | { type: "text"; value: string }
  | {
      type: "chip";
      values: string[];
      tone?: "violet" | "pink" | "blue" | "amber" | "slate" | "green" | "cyan";
      icon?: "video" | "folder";
    };

export type ResourceItem = {
  id: string;
  label: string;
  display: string;
  source: string;
  kind: "video" | "image" | "file" | "doc";
  content?: string;
};

export type PromptTemplate = {
  id: string;
  label: string;
  icon: LucideIcon;
  cost: number;
  parts: ExamplePart[];
  exampleResources?: Array<{
    kind: ResourceItem["kind"];
    display: string;
    source: string;
    content?: string;
  }>;
};

export type SkillTemplate = {
  id: string;
  label: string;
  icon: LucideIcon;
  cost: number;
  prompt: string;
  desc: string;
};

/* ------------------------------------------------------------------ */
/*  首页模板卡片（最多 5 个，直接展示在输入框下方）                      */
/* ------------------------------------------------------------------ */

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "opportunity-forecast",
    label: "爆款预测",
    icon: TrendingUp,
    cost: 20,
    parts: [
      {
        type: "chip",
        values: [
          "穿搭分享",
          "居家收纳",
          "职场干货",
          "健身减脂",
          "美妆小白",
          "母婴辅食",
          "宠物日常",
          "数码测评",
        ],
        tone: "pink",
      },
      { type: "text", value: " 赛道现在发什么会火？帮我找出具体可执行的选题" },
    ],
  },
  {
    id: "viral-breakdown",
    label: "爆款拆解",
    icon: Video,
    cost: 30,
    parts: [
      { type: "text", value: "请拆解视频：" },
      {
        type: "chip",
        values: ["@视频1"],
        tone: "slate",
        icon: "folder",
      },
      { type: "text", value: "，告诉我哪些结构值得借鉴" },
    ],
    exampleResources: [
      {
        kind: "video",
        display: "长柄洗锅刷示例视频",
        source: "https://v.douyin.com/klbUSvHwuik/",
      },
    ],
  },
  {
    id: "copy-extraction",
    label: "文案提取",
    icon: Mic,
    cost: 20,
    parts: [
      { type: "text", value: "请提取 " },
      {
        type: "chip",
        values: ["@视频1"],
        tone: "slate",
        icon: "folder",
      },
      { type: "text", value: " 中的完整文案，包含开场钩子、正文结构和结尾 CTA" },
    ],
    exampleResources: [
      {
        kind: "video",
        display: "长柄洗锅刷示例视频",
        source: "https://v.douyin.com/klbUSvHwuik/",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Skills（通过灯泡按钮弹出菜单访问）                                  */
/* ------------------------------------------------------------------ */

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: "account-diagnosis",
    label: "账号诊断",
    icon: User,
    cost: 25,
    prompt: "请诊断我的抖音账号，当前做美妆方向，帮我判断定位是否清晰并给出调整建议。",
    desc: "诊断账号定位、内容方向和差异化切入口是否成立。",
  },
  {
    id: "copy-rewrite",
    label: "文案改写优化",
    icon: Mic,
    cost: 20,
    prompt: "请帮我改写优化这段文案，保留核心卖点但让钩子更强、节奏更紧凑、CTA 更有行动力。",
    desc: "对已有文案进行钩子强化、节奏优化和 CTA 改写。",
  },
  {
    id: "xhs-topic-strategy",
    label: "小红书选题生成",
    icon: FileText,
    cost: 20,
    prompt: "请基于我的账号定位和目标人群，生成一组适合小红书的选题方向。",
    desc: "围绕赛道、人群和场景，生成适合小红书的选题清单。",
  },
  {
    id: "viral-script-breakdown",
    label: "爆款脚本拆解",
    icon: Sparkles,
    cost: 15,
    prompt: "请拆解这个视频脚本的开场、转折、卖点表达和结尾设计。",
    desc: "拆爆款视频的脚本骨架、节奏设计和卖点呈现方式。",
  },
  {
    id: "account-positioning-diagnosis",
    label: "账号定位诊断",
    icon: User,
    cost: 30,
    prompt: "请根据我的账号现状、内容方向和目标用户，诊断定位是否清晰并给出调整建议。",
    desc: "深度诊断账号定位、内容方向和差异化切入口。",
  },
  {
    id: "content-calendar",
    label: "内容排期表",
    icon: FileText,
    cost: 20,
    prompt: "请基于我的选题方向，生成一份 7 天内容排期表，包含发布时间和内容形式建议。",
    desc: "根据选题方向自动生成 7 天发布排期和形式建议。",
  },
];

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

export function buildPromptFromParts(parts: ExamplePart[], variantIndex: number) {
  return parts
    .map((part) =>
      part.type === "text"
        ? part.value
        : `[[${part.values[variantIndex % part.values.length]}]]`,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePromptValue(value: string) {
  return value.replace(/\[\[(.*?)\]\]/g, "$1");
}

export function getReferenceToneClass(token: string) {
  if (/^@链接/.test(token)) {
    return "bg-gray-100 text-gray-700 ring-gray-200";
  }
  if (/^@(视频|图片|文件)/.test(token)) {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }
  if (/^@文档/.test(token)) {
    return "bg-gray-100 text-gray-700 ring-gray-200";
  }
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

export function isVideoPlatformUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return [
      "douyin.com",
      "iesdouyin.com",
      "xiaohongshu.com",
      "bilibili.com",
      "b23.tv",
      "kuaishou.com",
      "weixin.qq.com",
      "video.qq.com",
    ].some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}

export function buildMarkdownFromUrl(value: string) {
  const url = new URL(value);
  const pathname = url.pathname === "/" ? "" : url.pathname;
  const title = `${url.hostname}${pathname}`.replace(/[-_/]+/g, " ").trim();

  return [
    `# ${title || "网页内容解析"}`,
    "",
    `来源：${value}`,
    "",
    "## 页面摘要",
    "- 当前为前端原型态，正式版将接入通用爬虫 / 解析插件输出正文内容。",
    "- 这里会沉淀正文、标题、小节、链接摘要和可引用段落。",
  ].join("\n");
}

export function getResourceKindLabel(kind: ResourceItem["kind"]) {
  if (kind === "video") return "视频";
  if (kind === "image") return "图片";
  if (kind === "doc") return "文档";
  return "文件";
}

export function createResourceItem(
  existingResources: ResourceItem[],
  config: {
    kind: ResourceItem["kind"];
    display: string;
    source: string;
    content?: string;
    preserveLabel?: string;
  },
) {
  const sameKindCount = existingResources.filter(
    (item) => item.kind === config.kind,
  ).length;
  const label =
    config.preserveLabel ??
    (config.kind === "video"
      ? `@视频${sameKindCount + 1}`
      : config.kind === "image"
        ? `@图片${sameKindCount + 1}`
        : config.kind === "doc"
          ? `@文档${sameKindCount + 1}`
          : `@文件${sameKindCount + 1}`);

  return {
    id: `resource-${config.kind}-${config.source}`,
    label,
    display: config.display,
    source: config.source,
    kind: config.kind,
    content: config.content,
  } satisfies ResourceItem;
}

export function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
