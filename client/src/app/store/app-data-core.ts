import { getPlatformPredictionMeta } from "./prediction-platforms.js";
import { buildPredictionArtifacts } from "./prediction-engine.js";
import {
  buildAgentContract,
  getTaskIntentHistoryType,
} from "./agent-runtime.js";
import type {
  AgentRecommendedTask,
  AgentRun,
  AgentTaskPayload,
  AppDataMode,
  BreakdownSampleTaskPayload,
  PredictionBestAction,
  ConnectorAuthMode,
  ConnectorCapabilities,
  ConnectorSyncStatus,
  NotificationDeliveryStatus,
  NotificationEventType,
  NotificationProvider,
  NotificationVerifyStatus,
  PredictionEvidenceScreeningReport,
  PlatformSnapshot,
  PredictionConfidenceLabel,
  PredictionBrief,
  PredictionRequestDraft,
  PredictionRequestEntrySource,
  PredictionLowFollowerEvidenceItem,
  PredictionMarketEvidence,
  PredictionOperatorPanel,
  PredictionOpportunityType,
  PredictionResultCard,
  PredictionResultArtifactStatus,
  PredictionSupportingAccount,
  PredictionSupportingContent,
  TaskArtifact,
  TaskIntent,
  TaskIntentConfidence,
  PredictionVerdict,
  PredictionCommentInsight,
  PredictionWhyNowItem,
  PredictionWindowStrength,
  ScoreBreakdown,
  TopicStrategyV2Data,
} from "./prediction-types.js";

export type AnalysisType =
  | "爆款预测"
  | "趋势观察"
  | "爆款拆解"
  | "选题策略"
  | "文案提取"
  | "账号诊断"
  | "继续深挖";

export type MembershipPlan = "free" | "plus" | "pro" | "plus_yearly" | "pro_yearly";

/** 将年付变体归一化为基础等级，用于权限判断 */
export function normalizePlan(plan: MembershipPlan): "free" | "plus" | "pro" {
  if (plan === "plus" || plan === "plus_yearly") return "plus";
  if (plan === "pro" || plan === "pro_yearly") return "pro";
  return "free";
}
export type AIModelId = "doubao" | "gpt54" | "claude46";

export interface AIModelOption {
  id: AIModelId;
  name: string;
  badge: string;
  multiplier: number;
  requiredPlan: MembershipPlan;
  summary: string;
}

export const AI_MODELS: AIModelOption[] = [
  {
    id: "doubao",
    name: "doubao 2.0 seed",
    badge: "1x",
    multiplier: 1,
    requiredPlan: "free",
    summary: "基础判断模型，适合高频试探和低成本验证。",
  },
  {
    id: "gpt54",
    name: "GPT-5.4",
    badge: "1.5x",
    multiplier: 1.5,
    requiredPlan: "plus",
    summary: "更强的综合推理与结构化表达，适合正式分析与追问。",
  },
  {
    id: "claude46",
    name: "Claude 4.6 Opus",
    badge: "2x",
    multiplier: 2,
    requiredPlan: "pro",
    summary: "更深的长链路推理，适合高价值拆解与执行层生成。",
  },
] as const;

export type BreakdownActionId =
  | "advice"
  | "rewrite"
  | "title"
  | "hook"
  | "outline";

export interface ConnectorRecord {
  id: string;
  name: string;
  category: string;
  color: string;
  connected: boolean;
  authMode?: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
  platformUserId?: string;
  cookieConfigured?: boolean;
  syncStatus?: ConnectorSyncStatus;
  lastVerifiedAt?: string;
  lastSync?: string;
  dataPoints?: string;
  predictionEnabled?: boolean;
  capabilities: ConnectorCapabilities;
  endpointFamilies: string[];
  coreFields: string[];
  callBudget: {
    topic: number;
    link: number;
    account: number;
    cookieExtra?: number;
  };
}

export interface NotificationChannelRecord {
  channelId: NotificationProvider;
  provider: NotificationProvider;
  name: string;
  description: string;
  color: string;
  connected: boolean;
  enabled: boolean;
  destinationLabelMasked?: string;
  subscribedEvents: NotificationEventType[];
  verifyStatus: NotificationVerifyStatus;
  lastVerifiedAt?: string;
  lastDeliveredAt?: string;
  lastDeliveryStatus?: NotificationDeliveryStatus;
  lastDeliveryError?: string;
  /** 飞书应用模式字段 */
  feishuTargetId?: string;
  feishuTargetType?: string;
  feishuTargetName?: string;
  feishuAppMode?: boolean;
}

export interface ResultFollowUp {
  id: string;
  label: string;
  cost: number;
  result: string;
  createdAt: string;
  /** live 模式下标记该 follow-up 需要通过 SSE 流式生成完整内容 */
  liveStreamPending?: boolean;
}

export interface ResultRecord {
  id: string;
  dataMode: AppDataMode;
  taskIntent: TaskIntent;
  taskIntentConfidence: TaskIntentConfidence;
  entrySource: PredictionRequestEntrySource;
  title: string;
  summary: string;
  primaryCtaLabel: string;
  query: string;
  type: AnalysisType;
  modelId: AIModelId;
  platform: string[];
  score: number;
  scoreLabel: string;
  createdAt: string;
  updatedAt: string;
  verdict: PredictionVerdict;
  confidenceLabel: PredictionConfidenceLabel;
  opportunityTitle: string;
  opportunityType: PredictionOpportunityType;
  windowStrength: PredictionWindowStrength;
  coreBet: string;
  decisionBoundary: string;
  marketEvidence: PredictionMarketEvidence;
  supportingAccounts: PredictionSupportingAccount[];
  supportingContents: PredictionSupportingContent[];
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[];
  evidenceGaps: string[];
  whyNowItems: PredictionWhyNowItem[];
  bestFor: string[];
  notFor: string[];
  accountMatchSummary: string;
  bestActionNow: PredictionBestAction;
  whyNotOtherActions: string[];
  missIfWait?: string;
  operatorPanel?: PredictionOperatorPanel;
  screeningReport: PredictionEvidenceScreeningReport;
  primaryCard: PredictionResultCard;
  secondaryCard: PredictionResultCard;
  fitSummary: string;
  recommendedNextAction: PredictionBestAction;
  continueIf: string[];
  stopIf: string[];
  normalizedBrief?: PredictionBrief;
  platformSnapshots?: PlatformSnapshot[];
  scoreBreakdown?: ScoreBreakdown;
  recommendedLowFollowerSampleIds?: string[];
  artifactStatus?: PredictionResultArtifactStatus;
  taskPayload: AgentTaskPayload;
  recommendedNextTasks: AgentRecommendedTask[];
  primaryArtifact: TaskArtifact;
  agentRun: AgentRun;
  classificationReasons: string[];
  followUps: ResultFollowUp[];
  /** 热榜/热词命中数量（live 模式由后端返回） */
  hotSeedCount?: number;
  /** 评论数据洞察（二次采集结果） */
  commentInsight?: PredictionCommentInsight;
  /** 选题策略 V2 完整数据（5 阶段 Pipeline 结果） */
  topicStrategyV2?: TopicStrategyV2Data;
}

export interface BreakdownGeneratedResult {
  id: string;
  actionId: BreakdownActionId;
  title: string;
  items: string[];
  cost: number;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  type: "deduct" | "earn" | "usage";
  desc?: string;
  label?: string;
  amount: number;
  date: string;
}

export interface LowFollowerSample {
  id: string;
  platform: string;
  contentForm: string;
  img: string;
  duration?: string;
  anomaly: number;
  fansLabel: string;
  fansCount: number;
  title: string;
  account: string;
  trackTags: string[];
  playCount: string;
  burstReasons: string[];
  suggestion: string;
  memberLocked?: boolean;
  featured?: boolean;
  publishedAt: string;
  newbieFriendly: number;
}

const IMG_WORK =
  "https://images.unsplash.com/photo-1762341117089-38771eedef9f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_FOOD =
  "https://images.unsplash.com/photo-1767485316686-56cfb72ef31f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_FIT =
  "https://images.unsplash.com/photo-1662385929980-e4a32fcbb07c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_BEAUTY =
  "https://images.unsplash.com/photo-1729337531424-198f880cb6c7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_BABY =
  "https://images.unsplash.com/photo-1759409972517-c30756821746?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_PET =
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_TRAVEL =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_HOME =
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_DIGITAL =
  "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";
const IMG_EDU =
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800";

const nowIso = "2026-03-19T09:00:00+08:00";

const BASE_CONNECTORS = [
  {
    id: "douyin",
    name: "抖音",
    category: "短视频",
    color: "#000000",
    connected: false,
    lastSync: "未连接",
    dataPoints: "搜索、热榜、作品详情、评论、创作者数据",
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    category: "图文社区",
    color: "#FF2442",
    connected: false,
    lastSync: "未连接",
    dataPoints: "热榜、用户搜索、笔记详情、评论",
  },
  {
    id: "kuaishou",
    name: "快手",
    category: "短视频",
    color: "#FF6600",
    connected: false,
    lastSync: "未连接",
    dataPoints: "搜索、热榜、作品详情、用户信息",
  },
];

export const INITIAL_CONNECTORS: ConnectorRecord[] = BASE_CONNECTORS.map((connector) => {
  const meta = getPlatformPredictionMeta(connector.id);

  return {
    ...connector,
    authMode: connector.connected ? "public" : undefined,
    profileUrl: connector.connected ? `https://creator.example.com/${connector.id}` : undefined,
    handle: connector.connected ? `${connector.name}创作者` : undefined,
    platformUserId: connector.connected ? `${connector.id}-seed` : undefined,
    cookieConfigured: false,
    syncStatus: connector.connected ? "verified" : "idle",
    lastVerifiedAt: connector.connected ? nowIso : undefined,
    predictionEnabled: meta.predictionEnabled,
    capabilities: meta.capabilities,
    endpointFamilies: meta.endpointFamilies,
    coreFields: meta.coreFields,
    callBudget: meta.callBudget,
  };
});

const DEFAULT_NOTIFICATION_EVENTS: NotificationEventType[] = [
  "prediction_succeeded",
  "prediction_failed",
  "connector_bound",
  "connector_needs_auth",
  "connector_sync_failed",
  "watch_succeeded",
  "watch_degraded",
  "watch_failed",
];

export const INITIAL_NOTIFICATION_CHANNELS: NotificationChannelRecord[] = [
  {
    channelId: "feishu",
    provider: "feishu",
    name: "飞书通知",
    description: "通过飞书应用主动推送分析完成、账号异常和复查结果通知到指定群聊。",
    color: "#3370FF",
    connected: false,
    enabled: true,
    subscribedEvents: [...DEFAULT_NOTIFICATION_EVENTS],
    verifyStatus: "idle",
    lastDeliveryStatus: "idle",
  },
  {
    channelId: "wecom",
    provider: "wecom",
    name: "企业微信机器人",
    description: "连接企业微信群机器人，把 watch 复查和连接器异常直接推到群里。",
    color: "#07C160",
    connected: false,
    enabled: true,
    subscribedEvents: [...DEFAULT_NOTIFICATION_EVENTS],
    verifyStatus: "idle",
    lastDeliveryStatus: "idle",
  },
  {
    channelId: "qq",
    provider: "qq",
    name: "QQ 机器人",
    description: "连接 QQ Webhook 机器人桥接地址，把关键结果同步到团队沟通群。",
    color: "#12B7F5",
    connected: false,
    enabled: true,
    subscribedEvents: [...DEFAULT_NOTIFICATION_EVENTS],
    verifyStatus: "idle",
    lastDeliveryStatus: "idle",
  },
];

export const LOW_FOLLOWER_SAMPLES: LowFollowerSample[] = [
  {
    id: "f1",
    platform: "抖音",
    contentForm: "竖屏视频",
    img: IMG_WORK,
    duration: "2:34",
    anomaly: 4.2,
    fansLabel: "800粉",
    fansCount: 800,
    title: "入职第一周必学的 3 个 Excel 快捷键，老员工都在用",
    account: "@职场效率小白",
    trackTags: ["职场", "干货"],
    playCount: "12.3万",
    burstReasons: ["新人视角", "标题切口强", "平台近期偏好"],
    suggestion: "更适合新手借鉴切角，结合自己风格调整形式",
    featured: true,
    publishedAt: "2026-03-18T18:20:00+08:00",
    newbieFriendly: 92,
  },
  {
    id: "f2",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_FOOD,
    anomaly: 5.7,
    fansLabel: "1,400粉",
    fansCount: 1400,
    title: "本地宝藏小馆，人均 25 元吃到扶墙出，已经回访 8 次",
    account: "@本地吃货君",
    trackTags: ["美食", "本地"],
    playCount: "8.4万",
    burstReasons: ["本地情怀", "价值锚定清晰", "回访数据"],
    suggestion: "「回访次数」是可信度指标，适合探店类账号借鉴叙事结构",
    featured: true,
    publishedAt: "2026-03-17T12:30:00+08:00",
    newbieFriendly: 74,
  },
  {
    id: "f3",
    platform: "抖音",
    contentForm: "竖屏视频",
    img: IMG_FIT,
    duration: "3:10",
    anomaly: 6.8,
    fansLabel: "900粉",
    fansCount: 900,
    title: "30天体脂从 28% 降到 21%，我只做了这一件事",
    account: "@体脂管理日记",
    trackTags: ["健身", "减脂"],
    playCount: "22.1万",
    burstReasons: ["数据结果型", "时间跨度清晰", "情绪激励"],
    suggestion: "30天数据跨度在健身赛道有强说服力，需真实记录背书",
    memberLocked: true,
    featured: true,
    publishedAt: "2026-03-18T09:15:00+08:00",
    newbieFriendly: 67,
  },
  {
    id: "g1",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_BEAUTY,
    anomaly: 3.4,
    fansLabel: "2,300粉",
    fansCount: 2300,
    title: "分手后第 3 周，我整理出这份情绪清单",
    account: "@打工人情感角",
    trackTags: ["情感", "心理"],
    playCount: "5.8万",
    burstReasons: ["情绪共鸣强", "标题切口强"],
    suggestion: "场景限定很强，适合情感赛道借鉴切角，结合自己风格调整",
    publishedAt: "2026-03-16T21:30:00+08:00",
    newbieFriendly: 83,
  },
  {
    id: "g2",
    platform: "抖音",
    contentForm: "竖屏视频",
    img: IMG_WORK,
    duration: "1:48",
    anomaly: 7.1,
    fansLabel: "620粉",
    fansCount: 620,
    title: "我入职第一天就想跑路，后来…",
    account: "@入职新人日记",
    trackTags: ["职场", "新人"],
    playCount: "28.4万",
    burstReasons: ["新人视角", "反转结构", "高完播"],
    suggestion: "反转叙事结构 + 职场新人场景，可复制性高，适合新号冷启动",
    publishedAt: "2026-03-19T01:10:00+08:00",
    newbieFriendly: 95,
  },
  {
    id: "g3",
    platform: "B站",
    contentForm: "横屏视频",
    img: IMG_WORK,
    duration: "8:20",
    anomaly: 2.8,
    fansLabel: "4,100粉",
    fansCount: 4100,
    title: "普通人攒下第一个 10 万的真实记录",
    account: "@理财学习本",
    trackTags: ["搞钱", "理财"],
    playCount: "9.2万",
    burstReasons: ["真实感强", "数据可信"],
    suggestion: "真实流水账内容在 B 站搞钱赛道有稳定表现，需真实数据背书",
    publishedAt: "2026-03-12T18:40:00+08:00",
    newbieFriendly: 62,
  },
  {
    id: "g4",
    platform: "抖音",
    contentForm: "竖屏视频",
    img: IMG_BABY,
    duration: "2:15",
    anomaly: 5.3,
    fansLabel: "1,800粉",
    fansCount: 1800,
    title: "宝宝突然哭闹不止，我用这个方法 10 秒止哭",
    account: "@宝妈小林",
    trackTags: ["育儿", "新手父母"],
    playCount: "15.7万",
    burstReasons: ["强痛点", "即时解法", "口碑传播"],
    suggestion: "「10秒解法」即时方案型内容在育儿赛道有强传播力，适合新手账号",
    publishedAt: "2026-03-18T07:45:00+08:00",
    newbieFriendly: 88,
  },
  {
    id: "g5",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_BEAUTY,
    anomaly: 4.6,
    fansLabel: "2,800粉",
    fansCount: 2800,
    title: "我素颜去面试，竟然拿到 offer 了",
    account: "@素颜研究员",
    trackTags: ["美妆", "生活方式"],
    playCount: "11.3万",
    burstReasons: ["反常识切口", "情绪触发强"],
    suggestion: "反常识标题在小红书美妆赛道点击率高，内容本身需有说服力",
    publishedAt: "2026-03-15T15:20:00+08:00",
    newbieFriendly: 72,
  },
  {
    id: "g6",
    platform: "抖音",
    contentForm: "口播",
    img: IMG_WORK,
    duration: "3:02",
    anomaly: 3.9,
    fansLabel: "3,100粉",
    fansCount: 3100,
    title: "我用副业每月多赚 3000，没有任何门槛",
    account: "@副业实测er",
    trackTags: ["搞钱", "副业"],
    playCount: "8.1万",
    burstReasons: ["低门槛定位", "数字诱导"],
    suggestion: "「没有门槛」是关键差异点，对新人吸引力强，需真实案例支撑",
    publishedAt: "2026-03-11T20:10:00+08:00",
    newbieFriendly: 70,
  },
  {
    id: "g7",
    platform: "视频号",
    contentForm: "竖屏视频",
    img: IMG_BEAUTY,
    duration: "4:30",
    anomaly: 4.1,
    fansLabel: "1,200粉",
    fansCount: 1200,
    title: "40岁被裁员，我靠这件事重建了自己",
    account: "@中年生活感悟",
    trackTags: ["情感", "职场"],
    playCount: "6.7万",
    burstReasons: ["情绪共鸣强", "平台偏好"],
    suggestion: "中年视角 + 重建叙事在视频号有强共鸣，适合情感 / 励志账号参考",
    publishedAt: "2026-03-18T11:10:00+08:00",
    newbieFriendly: 79,
  },
  {
    id: "g8",
    platform: "快手",
    contentForm: "横屏视频",
    img: IMG_FOOD,
    duration: "2:48",
    anomaly: 8.2,
    fansLabel: "760粉",
    fansCount: 760,
    title: "小镇上 5 元一碗的面，我吃了 20 年",
    account: "@小镇探食记",
    trackTags: ["美食", "本地"],
    playCount: "31.2万",
    burstReasons: ["本地情怀", "低成本感", "高传播力"],
    suggestion: "本地情怀 + 低单价定位在快手有天然亲近感，适合本地赛道借鉴",
    publishedAt: "2026-03-19T06:10:00+08:00",
    newbieFriendly: 90,
  },
  {
    id: "g9",
    platform: "拖音",
    contentForm: "干货",
    img: IMG_WORK,
    duration: "1:55",
    anomaly: 3.2,
    fansLabel: "3,800粉",
    fansCount: 3800,
    title: "这 5 个面试问题，HR 从来不会告诉你答案",
    account: "@HR避坑指南",
    trackTags: ["职场", "求职"],
    playCount: "7.5万",
    burstReasons: ["信息差", "实用性强"],
    suggestion: "「信息差型」内容在职场赛道稳定表现，标题公式可直接复用",
    publishedAt: "2026-03-14T17:00:00+08:00",
    newbieFriendly: 84,
  },
  // ---- 宠物赛道 ----
  {
    id: "h1",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_PET,
    duration: "0:45",
    anomaly: 9.1,
    fansLabel: "320粉",
    fansCount: 320,
    title: "我家狗子听到“洗澡”两个字的反应，笑死我了",
    account: "@毛孩子日记",
    trackTags: ["宠物", "萌宠"],
    playCount: "45.2万",
    burstReasons: ["情绪触发强", "强反差感", "高完播"],
    suggestion: "宠物反应类内容在拖音有极高传播力，关键在于反差感和情绪张力",
    featured: true,
    publishedAt: "2026-03-20T10:30:00+08:00",
    newbieFriendly: 96,
  },
  {
    id: "h2",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_PET,
    anomaly: 5.4,
    fansLabel: "1,600粉",
    fansCount: 1600,
    title: "养猫 3 年，我后悔没早点知道这 7 件事",
    account: "@猫奴小白",
    trackTags: ["宠物", "猫咪"],
    playCount: "9.8万",
    burstReasons: ["经验总结型", "数字列表", "实用性强"],
    suggestion: "「N年经验+后悔」公式在宠物赛道点击率高，适合新号快速起量",
    publishedAt: "2026-03-19T14:20:00+08:00",
    newbieFriendly: 88,
  },
  // ---- 旅行赛道 ----
  {
    id: "h3",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_TRAVEL,
    anomaly: 6.3,
    fansLabel: "900粉",
    fansCount: 900,
    title: "成都 3 天 2 晚，人均 800 元的极简攻略",
    account: "@穷游小分队",
    trackTags: ["旅行", "攻略"],
    playCount: "18.7万",
    burstReasons: ["价格锚定清晰", "实用性强", "地域热度"],
    suggestion: "低价攻略+具体地点在小红书旅行赛道有稳定表现，适合新号切入",
    featured: true,
    publishedAt: "2026-03-18T16:00:00+08:00",
    newbieFriendly: 91,
  },
  {
    id: "h4",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_TRAVEL,
    duration: "2:20",
    anomaly: 4.8,
    fansLabel: "2,100粉",
    fansCount: 2100,
    title: "千万别去这个景点，我后悔死了（反转）",
    account: "@旅行避坑王",
    trackTags: ["旅行", "避坑"],
    playCount: "14.3万",
    burstReasons: ["反转结构", "情绪触发强", "好奇心驱动"],
    suggestion: "「千万别去+反转」公式在旅行赛道点击率极高，需注意内容质量支撑",
    publishedAt: "2026-03-17T20:15:00+08:00",
    newbieFriendly: 85,
  },
  // ---- 居家赛道 ----
  {
    id: "h5",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_HOME,
    anomaly: 5.9,
    fansLabel: "1,100粉",
    fansCount: 1100,
    title: "租房改造花了 200 元，房东看了都想加租",
    account: "@小家改造局",
    trackTags: ["居家", "改造"],
    playCount: "21.5万",
    burstReasons: ["低成本感", "反差感强", "视觉冲击"],
    suggestion: "低成本改造+前后对比在小红书居家赛道有极强传播力",
    featured: true,
    publishedAt: "2026-03-19T08:30:00+08:00",
    newbieFriendly: 93,
  },
  {
    id: "h6",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_HOME,
    duration: "1:30",
    anomaly: 4.5,
    fansLabel: "2,500粉",
    fansCount: 2500,
    title: "全屋收纳只需这 3 个神器，后悔没早买",
    account: "@整理小能手",
    trackTags: ["居家", "收纳"],
    playCount: "8.9万",
    burstReasons: ["实用性强", "数字列表", "产品推荐"],
    suggestion: "「N个神器」公式在居家赛道稳定表现，适合带货型账号",
    publishedAt: "2026-03-16T11:45:00+08:00",
    newbieFriendly: 80,
  },
  // ---- 美妆赛道补充 ----
  {
    id: "h7",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_BEAUTY,
    duration: "1:15",
    anomaly: 7.5,
    fansLabel: "450粉",
    fansCount: 450,
    title: "我用超市 9.9 元的产品化了一个全妆，效果惊人",
    account: "@平价美妆实验室",
    trackTags: ["美妆", "平价"],
    playCount: "32.8万",
    burstReasons: ["低成本感", "反差感强", "好奇心驱动"],
    suggestion: "「低价+惊人效果」在美妆赛道有极高点击率，适合新号冷启动",
    featured: true,
    publishedAt: "2026-03-20T14:00:00+08:00",
    newbieFriendly: 94,
  },
  {
    id: "h8",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_BEAUTY,
    anomaly: 4.2,
    fansLabel: "3,200粉",
    fansCount: 3200,
    title: "换季护肤我只用这 4 步，皮肤状态好到爆",
    account: "@护肤极简派",
    trackTags: ["美妆", "护肤"],
    playCount: "6.4万",
    burstReasons: ["极简主义", "季节热点", "实用性强"],
    suggestion: "换季护肤是周期性热点，「极简步骤」切角降低门槛",
    publishedAt: "2026-03-15T09:30:00+08:00",
    newbieFriendly: 76,
  },
  // ---- 数码赛道 ----
  {
    id: "h9",
    platform: "B站",
    contentForm: "横屏视频",
    img: IMG_DIGITAL,
    duration: "6:40",
    anomaly: 5.1,
    fansLabel: "2,800粉",
    fansCount: 2800,
    title: "花 500 块买的平板，用了 3 个月后的真实感受",
    account: "@数码实测员",
    trackTags: ["数码", "测评"],
    playCount: "11.6万",
    burstReasons: ["真实感强", "时间跨度", "价格锚定"],
    suggestion: "「低价+长期使用感受」在 B 站数码赛道有稳定表现",
    publishedAt: "2026-03-17T19:00:00+08:00",
    newbieFriendly: 68,
  },
  {
    id: "h10",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_DIGITAL,
    duration: "1:50",
    anomaly: 6.7,
    fansLabel: "580粉",
    fansCount: 580,
    title: "iPhone 这个隐藏功能 99% 的人不知道",
    account: "@手机小技巧",
    trackTags: ["数码", "技巧"],
    playCount: "26.3万",
    burstReasons: ["信息差", "好奇心驱动", "实用性强"],
    suggestion: "「隐藏功能+99%不知道」是数码赛道经典爆款公式，可复用性极高",
    featured: true,
    publishedAt: "2026-03-19T22:10:00+08:00",
    newbieFriendly: 92,
  },
  // ---- 教育/知识赛道 ----
  {
    id: "h11",
    platform: "B站",
    contentForm: "横屏视频",
    img: IMG_EDU,
    duration: "10:15",
    anomaly: 3.8,
    fansLabel: "4,500粉",
    fansCount: 4500,
    title: "普通人学英语最大的误区，我走了 10 年弯路",
    account: "@英语学习日记",
    trackTags: ["教育", "英语"],
    playCount: "7.8万",
    burstReasons: ["经验总结型", "情绪共鸣强", "时间跨度"],
    suggestion: "「弯路总结」在教育赛道有稳定表现，需真实经历支撑",
    publishedAt: "2026-03-13T15:30:00+08:00",
    newbieFriendly: 65,
  },
  {
    id: "h12",
    platform: "拖音",
    contentForm: "口播",
    img: IMG_EDU,
    duration: "2:30",
    anomaly: 5.6,
    fansLabel: "1,300粉",
    fansCount: 1300,
    title: "孩子写作业拖拉？试试这个方法，立竿见影",
    account: "@父母成长营",
    trackTags: ["教育", "育儿"],
    playCount: "13.4万",
    burstReasons: ["强痛点", "即时解法", "口碑传播"],
    suggestion: "「痛点+即时解法」在育儿教育赛道传播力极强，适合新号",
    featured: true,
    publishedAt: "2026-03-20T07:00:00+08:00",
    newbieFriendly: 89,
  },
  // ---- 穿搭赛道 ----
  {
    id: "h13",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_BEAUTY,
    anomaly: 6.1,
    fansLabel: "700粉",
    fansCount: 700,
    title: "通勤穿搭一周不重样，全部来自优衣库",
    account: "@平价穿搭小分队",
    trackTags: ["穿搭", "通勤"],
    playCount: "19.6万",
    burstReasons: ["低成本感", "实用性强", "场景限定"],
    suggestion: "「一周不重样+单一品牌」在穿搭赛道点击率极高，适合新号",
    featured: true,
    publishedAt: "2026-03-19T12:00:00+08:00",
    newbieFriendly: 94,
  },
  {
    id: "h14",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_BEAUTY,
    duration: "0:58",
    anomaly: 5.3,
    fansLabel: "1,900粉",
    fansCount: 1900,
    title: "小个子女生显高穿搭公式，视觉长高 10cm",
    account: "@小个子穿搭师",
    trackTags: ["穿搭", "显高"],
    playCount: "10.2万",
    burstReasons: ["痛点解决", "视觉对比强", "可复制性高"],
    suggestion: "「显高公式」在穿搭赛道有稳定需求，适合垂直账号定位",
    publishedAt: "2026-03-16T18:30:00+08:00",
    newbieFriendly: 82,
  },
  // ---- 美食赛道补充 ----
  {
    id: "h15",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_FOOD,
    duration: "1:20",
    anomaly: 7.8,
    fansLabel: "400粉",
    fansCount: 400,
    title: "全网最简单的电饭煲食谱，懒人必学",
    account: "@懒人厨房",
    trackTags: ["美食", "懒人食谱"],
    playCount: "38.4万",
    burstReasons: ["低门槛", "实用性强", "场景限定"],
    suggestion: "「最简单+懒人必学」在美食赛道有极高传播力，适合新号冷启动",
    featured: true,
    publishedAt: "2026-03-20T12:00:00+08:00",
    newbieFriendly: 97,
  },
  {
    id: "h16",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_FOOD,
    anomaly: 4.9,
    fansLabel: "2,400粉",
    fansCount: 2400,
    title: "北京打工人周末幸福感来源：这 5 家店人均 30 元",
    account: "@北京吃货地图",
    trackTags: ["美食", "探店"],
    playCount: "7.3万",
    burstReasons: ["本地情怀", "价格锚定清晰", "打工人共鸣"],
    suggestion: "「打工人+低价幸福感」在美食探店赛道有稳定表现",
    publishedAt: "2026-03-14T10:20:00+08:00",
    newbieFriendly: 78,
  },
  // ---- 健身赛道补充 ----
  {
    id: "h17",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_FIT,
    duration: "2:45",
    anomaly: 5.8,
    fansLabel: "1,500粉",
    fansCount: 1500,
    title: "每天 10 分钟，不去健身房也能练出马甲线",
    account: "@居家健身小白",
    trackTags: ["健身", "居家"],
    playCount: "16.8万",
    burstReasons: ["低门槛", "时间限定", "目标明确"],
    suggestion: "「每天N分钟+不去健身房」在健身赛道有极强吸引力，降低行动门槛",
    publishedAt: "2026-03-18T06:30:00+08:00",
    newbieFriendly: 90,
  },
  {
    id: "h18",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_FIT,
    anomaly: 4.3,
    fansLabel: "3,600粉",
    fansCount: 3600,
    title: "我用这个方法一个月瘦了 8 斤，没节食没运动",
    account: "@体重管理日记",
    trackTags: ["健身", "减脂"],
    playCount: "5.9万",
    burstReasons: ["反常识切口", "数据结果型", "好奇心驱动"],
    suggestion: "「没节食没运动」反常识切口在减脂赛道点击率高，需内容支撑",
    publishedAt: "2026-03-12T14:15:00+08:00",
    newbieFriendly: 73,
  },
  // ---- 母婴赛道补充 ----
  {
    id: "h19",
    platform: "小红书",
    contentForm: "图文",
    img: IMG_BABY,
    anomaly: 5.0,
    fansLabel: "2,000粉",
    fansCount: 2000,
    title: "宝宝辅食我只做这 3 样，营养师都说好",
    account: "@辅食小分队",
    trackTags: ["育儿", "辅食"],
    playCount: "12.1万",
    burstReasons: ["权威背书", "极简主义", "实用性强"],
    suggestion: "「只做N样+权威认可」在母婴赛道有强信任感，适合新号",
    publishedAt: "2026-03-17T08:00:00+08:00",
    newbieFriendly: 86,
  },
  {
    id: "h20",
    platform: "拖音",
    contentForm: "竖屏视频",
    img: IMG_BABY,
    duration: "1:40",
    anomaly: 6.2,
    fansLabel: "850粉",
    fansCount: 850,
    title: "孩子发烧不要急，儿科医生教你 3 步处理",
    account: "@儿科医生妈妈",
    trackTags: ["育儿", "健康"],
    playCount: "24.7万",
    burstReasons: ["权威身份", "强痛点", "即时解法"],
    suggestion: "「医生身份+即时解法」在育儿赛道有极强信任感和传播力",
    featured: true,
    publishedAt: "2026-03-20T09:00:00+08:00",
    newbieFriendly: 87,
  },
  // ---- 情感赛道补充 ----
  {
    id: "h21",
    platform: "视频号",
    contentForm: "竖屏视频",
    img: IMG_BEAUTY,
    duration: "3:15",
    anomaly: 4.7,
    fansLabel: "1,700粉",
    fansCount: 1700,
    title: "结婚 10 年，我才明白婚姻里最重要的一件事",
    account: "@婚姻成长记",
    trackTags: ["情感", "婚姻"],
    playCount: "8.5万",
    burstReasons: ["时间跨度", "情绪共鸣强", "平台偏好"],
    suggestion: "「N年经历+一件事」在视频号情感赛道有稳定表现",
    publishedAt: "2026-03-15T20:00:00+08:00",
    newbieFriendly: 75,
  },
];

const SEED_HISTORY = [
  {
    id: "ma7x2k",
    query: "职场干货 / Excel 技巧赛道可行性分析",
    createdAt: "2026-03-15T14:32:00+08:00",
    updatedAt: "2026-03-17T09:10:00+08:00",
  },
  {
    id: "nz5f1b",
    query: "宠物日常 + 萌宠类内容增长分析",
    createdAt: "2026-03-12T10:11:00+08:00",
    updatedAt: "2026-03-12T10:11:00+08:00",
  },
  {
    id: "qe9d4p",
    query: "低粉爆款拆解：美食探店赛道",
    createdAt: "2026-03-10T11:40:00+08:00",
    updatedAt: "2026-03-11T09:00:00+08:00",
  },
  {
    id: "rs3h8c",
    query: "健身 / 体脂管理赛道爆款预测",
    createdAt: "2026-03-08T16:44:00+08:00",
    updatedAt: "2026-03-08T16:44:00+08:00",
  },
  {
    id: "vt6j0w",
    query: "情感类选题策略 · 女性向短视频",
    createdAt: "2026-03-05T12:00:00+08:00",
    updatedAt: "2026-03-14T20:35:00+08:00",
  },
  {
    id: "lk2m7y",
    query: "母婴育儿赛道趋势观察",
    createdAt: "2026-02-28T09:20:00+08:00",
    updatedAt: "2026-03-01T09:30:00+08:00",
  },
];

export const INITIAL_TRANSACTIONS: TransactionRecord[] = [
  {
    id: "tx-1",
    type: "earn",
    desc: "欢迎积分",
    amount: 120,
    date: "03-01 09:00",
  },
  {
    id: "tx-2",
    type: "earn",
    desc: "邀请好友奖励",
    amount: 65,
    date: "03-10 09:00",
  },
  {
    id: "tx-3",
    type: "deduct",
    desc: "爆款预测",
    amount: -20,
    date: "03-15 14:32",
  },
  {
    id: "tx-4",
    type: "deduct",
    desc: "爆款拆解分析",
    amount: -30,
    date: "03-12 10:11",
  },
  {
    id: "tx-5",
    type: "deduct",
    desc: "趋势观察",
    amount: -15,
    date: "03-08 16:44",
  },
];

export const INITIAL_STATS = {
  monthlySpent: 65,
  totalEarned: 185,
};

export const APP_NOW = nowIso;

export function createId(prefix = "r") {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

export function getModelOption(modelId: AIModelId) {
  return AI_MODELS.find((item) => item.id === modelId) ?? AI_MODELS[0];
}

export function canUseModel(
  membershipPlan: MembershipPlan,
  modelId: AIModelId,
) {
  const option = getModelOption(modelId);
  const effective = normalizePlan(membershipPlan);

  if (option.requiredPlan === "free") return true;
  if (option.requiredPlan === "plus") {
    return effective === "plus" || effective === "pro";
  }
  return effective === "pro";
}

export function getHighestAvailableModel(
  membershipPlan: MembershipPlan,
): AIModelId {
  const effective = normalizePlan(membershipPlan);
  if (effective === "pro") return "claude46";
  if (effective === "plus") return "gpt54";
  return "doubao";
}

export function getModelRequiredPlanLabel(modelId: AIModelId) {
  const option = getModelOption(modelId);

  if (option.requiredPlan === "free") return "所有用户可用";
  if (option.requiredPlan === "plus") return "需 Plus 会员及以上";
  return "需 Pro 会员";
}

export function getChargedCost(baseCost: number, modelId: AIModelId) {
  if (baseCost <= 0) return 0;

  const option = getModelOption(modelId);
  const rawCost = baseCost * option.multiplier;

  return Math.ceil(rawCost / 5) * 5;
}

export function getHomepagePlatformSurcharge(connectedPlatformCount: number) {
  // 每增加一个平台额外消耗 10 积分（首个平台免费）
  return Math.max(connectedPlatformCount - 1, 0) * 10;
}

export function getHomepageAnalysisCost(
  baseCost: number,
  modelId: AIModelId,
  connectedPlatformCount: number,
) {
  return (
    getChargedCost(baseCost, modelId) +
    getHomepagePlatformSurcharge(connectedPlatformCount)
  );
}

export function getAnalysisInfo(text: string) {
  if (text.includes("爆款") || text.includes("拆解")) {
    return { type: "爆款拆解分析", cost: 30 };
  }
  if (text.includes("热点") || text.includes("热搜") || text.includes("热榜")) {
    return { type: "趋势观察", cost: 15 };
  }
  if (
    text.includes("策略") ||
    text.includes("规划") ||
    text.includes("内容方向")
  ) {
    return { type: "选题策略", cost: 20 };
  }
  return { type: "爆款预测", cost: 20 };
}

export function createResultRecord(params: {
  id: string;
  dataMode: AppDataMode;
  request: PredictionRequestDraft;
  modelId: AIModelId;
  createdAt: string;
  updatedAt: string;
  artifacts: ReturnType<typeof buildPredictionArtifacts>;
  followUps?: ResultFollowUp[];
  runtimeMeta?: Record<string, unknown>;
  degradeFlags?: string[];
}) {
  const {
    artifacts,
    createdAt,
    dataMode,
    id,
    modelId,
    request,
    runtimeMeta,
    degradeFlags = [],
    updatedAt,
    followUps = [],
  } = params;
  const contract = buildAgentContract({
    runId: id,
    request,
    artifacts,
    runtimeMeta: {
      createdAt,
      updatedAt,
      ...runtimeMeta,
    },
    degradeFlags,
  });
  const primaryArtifact = {
    ...contract.primaryArtifact,
    createdAt,
    updatedAt,
  };
  const agentRun = {
    ...contract.agentRun,
    artifacts: [primaryArtifact],
    runtimeMeta: {
      ...contract.agentRun.runtimeMeta,
      createdAt,
      updatedAt,
    },
  };

  return {
    id,
    dataMode,
    taskIntent: contract.classification.taskIntent,
    taskIntentConfidence: contract.classification.confidence,
    entrySource: request.entrySource ?? "manual",
    title: contract.title,
    summary: contract.summary,
    primaryCtaLabel: contract.primaryCtaLabel,
    query: request.prompt,
    modelId,
    createdAt,
    updatedAt,
    ...artifacts.uiResult,
    type: getTaskIntentHistoryType(contract.classification.taskIntent) as AnalysisType,
    normalizedBrief: artifacts.normalizedBrief,
    platformSnapshots: artifacts.platformSnapshots,
    scoreBreakdown: artifacts.scoreBreakdown,
    recommendedLowFollowerSampleIds: artifacts.recommendedLowFollowerSampleIds,
    taskPayload: contract.taskPayload,
    recommendedNextTasks: contract.recommendedNextTasks,
    primaryArtifact,
    agentRun,
    classificationReasons: contract.classification.reasons,
    followUps,
  } satisfies ResultRecord;
}

export function createSeedResults(connectors: ConnectorRecord[]) {
  return SEED_HISTORY.map((entry) => {
    const request: PredictionRequestDraft = {
      prompt: entry.query,
      evidenceItems: [],
      selectedPlatforms: [],
      connectedPlatforms: connectors
        .filter((connector) => connector.connected)
        .map((connector) => connector.id),
      personalizationMode: "public",
    };
    const artifacts = buildPredictionArtifacts(
      request,
      connectors,
      LOW_FOLLOWER_SAMPLES,
    );
    return createResultRecord({
      id: entry.id,
      dataMode: "mock",
      request,
      modelId: "doubao",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      artifacts,
    });
  });
}

export function inferResultScoreLabel(score: number) {
  if (score >= 80) return "强推";
  if (score >= 70) return "可行";
  if (score >= 60) return "潜力股";
  return "蓄力中";
}

export function formatHistoryDate(iso: string) {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatTransactionDate(iso: string) {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function getQueryType(query: string): AnalysisType {
  if (/(拆解|爆款)/i.test(query)) return "爆款拆解";
  if (/(热点|热搜|热榜|观察|监控)/i.test(query)) return "趋势观察";
  if (/(策略|方向|规划|选题)/i.test(query)) return "选题策略";
  if (/(文案|钩子|CTA|提取)/i.test(query)) return "文案提取";
  if (/(评估|账号|定位|诊断)/i.test(query)) return "账号诊断";
  return "爆款预测";
}

export function generateFollowUpResult(
  query: string,
  prompt: string,
  taskIntent: TaskIntent = "opportunity_prediction",
) {
  if (/(标题|题目)/i.test(prompt)) {
    return `基于「${query}」更适合先生成“场景 + 结果 + 明确对象”的标题，例如把泛问题压缩成一个明确人群和一个明确收益。`;
  }
  if (/(新手|起号|零基础)/i.test(prompt)) {
    return `如果你现在是新手账号，建议先从更窄的切口验证 3 条内容，而不是一次性铺很宽的题材。先证明有人愿意看，再扩展。`;
  }
  if (/(风险|竞争|难)/i.test(prompt)) {
    return `主要风险不在于题材本身，而在于表达太泛。真正的竞争对手是那些已经把“同一件事讲得更具体、更可信”的账号。`;
  }
  if (taskIntent === "trend_watch") {
    return `围绕「${prompt}」，这次更适合补一版观察清单：先明确 3 个需要复查的信号、1 个升级阈值和 1 个继续降级条件，避免把短期噪音误判成趋势升温。`;
  }
  if (taskIntent === "viral_breakdown") {
    return `围绕「${prompt}」，先把这条内容拆成“值得抄的结构、不能照搬的表达、适合你场景的迁移步骤”三层，而不是继续停在泛分析。`;
  }
  if (taskIntent === "topic_strategy") {
    return `围绕「${prompt}」，更适合先收口成 3 个优先题目，每个题目都写清楚为什么现在做、适合谁做、先用哪种低成本方式试。`;
  }
  if (taskIntent === "copy_extraction") {
    return `围绕「${prompt}」，这次应该直接提炼可拿走的表达资产：优先抽 3 个钩子、2 个过渡句和 1 个 CTA 模式，再决定是否进入完整脚本。`;
  }
  if (taskIntent === "account_diagnosis") {
    return `围绕「${prompt}」，更适合继续补账号承接结论：先说清楚这个号该继续什么、停什么、补什么，再把建议落到可执行的内容打法。`;
  }
  return `围绕「${prompt}」，更适合优先验证低成本、可复用、能在一周内看见反馈的执行动作，再决定是否加大投入。`;
}

export function getBreakdownActionResult(
  sample: LowFollowerSample,
  actionId: BreakdownActionId,
) {
  const track = sample.trackTags[0] ?? "内容";

  const map: Record<BreakdownActionId, { title: string; items: string[] }> = {
    advice: {
      title: "已生成：借鉴建议",
      items: [
        `保留「${sample.burstReasons[0]}」这个爆因，把内容切成更适合你账号的 ${track} 场景。`,
        `标题建议继续使用“明确对象 + 明确结果”的结构，避免抽象概念。`,
        `前 3 秒先给结果或反差点，再补充过程，降低跳出率。`,
      ],
    },
    rewrite: {
      title: "已生成：切口改写",
      items: [
        `原样本切口：${sample.title}`,
        `改写方向：把 ${track} 赛道里最常见的问题换成你的真实使用场景。`,
        "保留爆因结构，不照搬叙事素材和表达语气。",
      ],
    },
    title: {
      title: "已生成：3 个类似标题方向",
      items: [
        `“${track} 新手最容易忽略的一步，做对效率差很多”`,
        `“为什么同样做 ${track}，别人 3 天见效你却卡很久”`,
        `“如果只能改一个动作，我会先改这个 ${track} 细节”`,
      ],
    },
    hook: {
      title: "已生成：3 个开头钩子",
      items: [
        "先亮出结果，再反问观众为什么自己做不到。",
        "用一个常见错误开场，迅速建立代入和焦虑感。",
        "先给反常识结论，再用 1 句解释把人留住。",
      ],
    },
    outline: {
      title: "已生成：内容提纲结构",
      items: [
        "开头 5 秒：结果 / 反差 / 数据先行。",
        "中段 30-60 秒：解释为什么这个样本能爆，拆 2-3 个关键动作。",
        "结尾 15 秒：给出适合你的迁移建议和明确行动提示。",
      ],
    },
  };

  return map[actionId];
}

export function getSampleById(sampleId: string) {
  return LOW_FOLLOWER_SAMPLES.find((item) => item.id === sampleId) ?? null;
}

/**
 * createBreakdownSampleResultRecord
 * ===================================
 * 将 LowFollowerSample 转换为统一 ResultRecord，
 * 使 /breakdown/:id 技能页可以通过 /results/:id 统一路由展示。
 * 这是方案B的核心桥接工厂函数。
 */
export function createBreakdownSampleResultRecord(
  sample: LowFollowerSample,
  similarSamples: LowFollowerSample[],
  options: {
    id: string;
    dataMode: AppDataMode;
    modelId: AIModelId;
    createdAt: string;
  },
): ResultRecord {
  const { id, dataMode, modelId, createdAt } = options;
  const track = sample.trackTags[0] ?? "内容";
  const secondTrack = sample.trackTags[1] ?? sample.platform;

  // 构建完整的 BreakdownSampleTaskPayload
  const taskPayload: BreakdownSampleTaskPayload = {
    kind: "breakdown_sample",
    sampleId: sample.id,
    sampleTitle: sample.title,
    platform: sample.platform,
    contentForm: sample.contentForm,
    anomaly: sample.anomaly,
    fansLabel: sample.fansLabel,
    playCount: sample.playCount,
    trackTags: sample.trackTags,
    burstReasons: sample.burstReasons,
    breakdownSummary: `这条 ${track} 样本的核心竞争力在于「${sample.burstReasons[0]} × ${sample.burstReasons[1] ?? "明确结果"}」的结构组合。${sample.playCount}，互动粉丝比 ${sample.anomaly}倍，适合借鉴的是表达框架和叙事顺序，而不是直接复制素材。`,
    copyPoints: [
      `保留「${sample.burstReasons[0]}」这个爆因，把内容切成更适合你账号的 ${track} 场景`,
      `标题使用"明确对象 + 明确结果"的结构，避免抽象概念`,
      `前 3 秒先给结果或反差点，再补充过程，降低跳出率`,
    ],
    avoidPoints: [
      `不要直接照搬 @${sample.account} 的叙事素材，账号人设不同效果会大打折扣`,
      `${secondTrack} 赛道的平台调性差异较大，迁移时需调整语气和节奏`,
      `互动粉丝比 ${sample.anomaly}倍 不代表可复制性高，需结合自身账号阶段判断`,
    ],
    migrationSteps: [
      `第一步：确认你的账号是否在 ${track} 赛道，且目标人群与样本重叠`,
      `第二步：提取「${sample.burstReasons[0]}」的表达框架，替换成你的真实场景`,
      `第三步：用低成本方式先测 1 条，看完播率和评论意图再决定是否扩量`,
    ],
    titleVariants: [
      `"${track} 新手最容易忽略的一步，做对效率差很多"`,
      `"为什么同样做 ${track}，别人 3 天见效你却卡很久"`,
      `"如果只能改一个动作，我会先改这个 ${track} 细节"`,
    ],
    hookVariants: [
      "先亮出结果，再反问观众为什么自己做不到",
      "用一个常见错误开场，迅速建立代入和焦虑感",
      "先给反常识结论，再用 1 句解释把人留住",
    ],
    contentOutline: [
      "开头 5 秒：结果 / 反差 / 数据先行",
      `中段 30-60 秒：解释为什么这条 ${track} 样本能爆，拆 2-3 个关键动作`,
      "结尾 15 秒：给出适合你的迁移建议和明确行动提示",
    ],
    similarSamples: similarSamples.slice(0, 3).map((s) => ({
      id: s.id,
      title: s.title,
      platform: s.platform,
      anomaly: s.anomaly,
      fansLabel: s.fansLabel,
      trackTags: s.trackTags,
    })),
  };

  // 构建 primaryArtifact
  const primaryArtifact: TaskArtifact = {
    artifactId: `artifact-${id}`,
    runId: id,
    taskIntent: "breakdown_sample",
    artifactType: "breakdown_sample_sheet",
    title: `低粉爆款拆解：${sample.title.slice(0, 20)}`,
    summary: taskPayload.breakdownSummary,
    payload: taskPayload as unknown as Record<string, unknown>,
    snapshotRefs: [],
    createdAt,
    updatedAt: createdAt,
    watchable: false,
    shareable: true,
  };

  // 构建 agentRun (技能入口的简化 run，部分字段在后续 return 对象中补全)
  const agentRun = {
    runId: id,
    source: "skill" as const,
    status: "completed" as const,
    artifacts: [primaryArtifact],
    runtimeMeta: {
      createdAt,
      updatedAt: createdAt,
      skillId: "low_follower_breakdown",
      sampleId: sample.id,
    },
  } as unknown as AgentRun;

  // 构建推荐下一步任务
  const recommendedNextTasks: AgentRecommendedTask[] = [
    {
      taskIntent: "copy_extraction",
      title: "提取这条样本的文案模式",
      reason: "把钩子句式、叙事结构和 CTA 模板整理成可复用资产",
      actionLabel: "提取文案模式",
    },
    {
      taskIntent: "topic_strategy",
      title: "基于这个爆款方向制定选题策略",
      reason: `在 ${track} 赛道里找到 3-5 个可持续的选题方向`,
      actionLabel: "制定选题策略",
    },
  ];

  // 构建 bestActionNow
  const bestActionNow: PredictionBestAction = {
    type: "breakdown",
    title: "生成翻拍脚本",
    description: "把这条爆款改成你能直接用的版本，保留结构去掉雷点",
    ctaLabel: "生成翻拍脚本",
    reason: "当前样本已完成拆解，最高效的下一步是直接生成可开拍的执行脚本",
  };

  // 构建 primaryCard
  const primaryCard: PredictionResultCard = {
    title: `${track} 爆款样本拆解完成`,
    ctaLabel: "生成翻拍脚本",
    description: taskPayload.breakdownSummary,
    reason: `互动粉丝比 ${sample.anomaly}倍，可借鉴度高，适合在 ${track} 赛道借鉴结构`,
    previewSections: [
      {
        title: "值得抄的部分",
        items: taskPayload.copyPoints,
        tone: "positive",
      },
      {
        title: "别直接照搬",
        items: taskPayload.avoidPoints,
        tone: "warning",
      },
    ],
    continueIf: [`你的账号在 ${track} 赛道`, "目标人群与样本重叠", "有能力在 1 周内完成 1 条测试"],
    stopIf: ["账号赛道与样本完全不同", "没有时间做低成本测试验证"],
    evidenceRefs: [],
    actionMode: "open_deep_dive",
  };

  // 构建 secondaryCard
  const secondaryCard: PredictionResultCard = {
    title: "提取文案模式",
    ctaLabel: "提取文案模式",
    description: "把这条样本的钩子句式、叙事结构和 CTA 模板整理成可复用资产",
    reason: "文案资产是可以跨内容复用的核心竞争力",
    previewSections: [
      {
        title: "可提取的资产",
        items: ["钩子句式 3-5 个", "叙事结构模板", "CTA 转化模式"],
        tone: "positive",
      },
    ],
    continueIf: ["需要批量生产同类内容"],
    stopIf: ["只需要一次性借鉴"],
    evidenceRefs: [],
    actionMode: "navigate",
  };

  // 构建空的 screeningReport（技能拆解不需要证据筛选）
  const screeningReport: PredictionEvidenceScreeningReport = {
    safeActionLevel: "test_one",
    evidenceAlignment: "strong",
    acceptedAccountIds: [],
    acceptedContentIds: [],
    acceptedLowFollowerIds: [sample.id],
    missingEvidence: [],
    contradictionSummary: [],
    candidates: [],
  };

  // 构建 marketEvidence（基于样本数据）
  const marketEvidence: PredictionMarketEvidence = {
    evidenceWindowLabel: "低粉爆款样本",
    momentumLabel: "emerging",
    kolCount: 0,
    kocCount: 1,
    newCreatorCount: 1,
    similarContentCount: similarSamples.length,
    growth7d: sample.anomaly * 10,
    lowFollowerAnomalyRatio: 1,
    timingLabel: "样本验证期",
    tierBreakdown: { headKol: 0, standardKol: 0, strongKoc: 0, standardKoc: 1 },
  };

  return {
    id,
    dataMode,
    taskIntent: "breakdown_sample",
    taskIntentConfidence: "high",
    entrySource: "skill",
    title: `低粉爆款拆解：${sample.title.slice(0, 20)}`,
    summary: taskPayload.breakdownSummary,
    primaryCtaLabel: "生成翻拍脚本",
    query: sample.title,
    type: "爆款拆解",
    modelId,
    platform: [sample.platform],
    score: Math.min(96, Math.round(sample.anomaly * 12 + (sample.newbieFriendly ?? 80) * 0.2)),
    scoreLabel: "可借鉴",
    createdAt,
    updatedAt: createdAt,
    verdict: "test_small",
    confidenceLabel: "高",
    opportunityTitle: `${track} 低粉爆款结构`,
    opportunityType: "anomaly_window",
    windowStrength: "validate_first",
    coreBet: `借鉴「${sample.burstReasons[0]}」的表达框架，在 ${track} 赛道测试 1 条低成本内容`,
    decisionBoundary: `如果测试内容完播率超过同类均值 1.5 倍，则继续扩量；否则调整切口再测`,
    marketEvidence,
    supportingAccounts: [],
    supportingContents: [],
    lowFollowerEvidence: [{
      id: sample.id,
      platform: sample.platform,
      contentForm: sample.contentForm,
      title: sample.title,
      account: sample.account,
      fansLabel: sample.fansLabel,
      fansCount: sample.fansCount,
      anomaly: sample.anomaly,
      playCount: sample.playCount,
      engagementCount: 0,
      trackTags: sample.trackTags,
      suggestion: sample.suggestion,
      publishedAt: sample.publishedAt,
    }],
    evidenceGaps: [],
    whyNowItems: [
      {
        sourceLabel: "低粉爆款样本",
        fact: `${sample.platform} 上 ${sample.fansLabel} 账号实现 ${sample.playCount}`,
        inference: `互动粉丝比 ${sample.anomaly}倍，说明内容结构本身具备传播力，与账号体量关系不大`,
        userImpact: "新号或小号可以直接借鉴这个结构，降低冷启动风险",
        tone: "positive",
      },
    ],
    bestFor: taskPayload.copyPoints,
    notFor: taskPayload.avoidPoints,
    accountMatchSummary: `适合在 ${track} 赛道的账号借鉴，尤其是新号和成长期账号`,
    bestActionNow,
    whyNotOtherActions: ["直接照搬会因账号人设不同导致效果差异"],
    missIfWait: "爆款结构有时效性，建议在 2 周内完成测试验证",
    screeningReport,
    primaryCard,
    secondaryCard,
    fitSummary: `这条样本在 ${track} 赛道具备高可借鉴性，互动粉丝比 ${sample.anomaly}倍，新手友好度 ${sample.newbieFriendly ?? 80} 分`,
    recommendedNextAction: bestActionNow,
    continueIf: primaryCard.continueIf,
    stopIf: primaryCard.stopIf,
    taskPayload,
    recommendedNextTasks,
    primaryArtifact,
    agentRun,
    classificationReasons: [
      `来源：低粉爆款技能入口`,
      `样本：${sample.title.slice(0, 15)}`,
      `平台：${sample.platform}`,
      `互动粉丝比：${sample.anomaly}倍`,
    ],
    followUps: [],
  };
}

export type { BreakdownSampleTaskPayload };
