/**
 * ResultsDemoPage — Module F1
 * ============================
 * 路由 /results/demo
 * 展示完整的 mock 预测结果（使用新 Figma 设计渲染器），
 * 顶部有浅黄色 banner 提示这是示例。
 * 同时标记 Checklist 中「查看爆款预测」已完成。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { NewPredictionResultBody } from "../components/results/renderers/new-prediction-result";
import { useOnboarding } from "../lib/onboarding-context";
import type { ResultRecord } from "../store/app-data-core";

/* ── Mock ResultRecord 数据 ── */
const MOCK_RESULT: ResultRecord = {
  id: "demo-001",
  dataMode: "mock",
  taskIntent: "opportunity_prediction",
  taskIntentConfidence: "high",
  entrySource: "example",
  title: "爆款预测：职场穿搭 × 通勤好物",
  summary:
    "「职场穿搭」赛道正在经历一轮由低粉素人驱动的内容爆发。近 7 天新增相关内容 +34%，低粉异常占比达 18%，头部 KOL 尚未大规模入场，留给中腰部创作者的窗口期预计还有 2-3 周。建议优先以「通勤好物开箱」切入，结合真实场景展示，抓住当前流量红利。",
  primaryCtaLabel: "生成开拍方案",
  query: "职场穿搭 通勤好物",
  type: "爆款预测",
  modelId: "doubao",
  platform: ["douyin", "xiaohongshu"],
  score: 78,
  scoreLabel: "高",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  verdict: "go_now",
  confidenceLabel: "高",
  opportunityTitle: "职场穿搭 × 通勤好物",
  opportunityType: "anomaly_window",
  windowStrength: "strong_now",
  coreBet: "低粉素人驱动的内容爆发窗口，头部 KOL 尚未大规模入场",
  decisionBoundary: "如果 7 天内低粉异常占比下降至 10% 以下，建议暂停观望",
  marketEvidence: {
    evidenceWindowLabel: "近 14 天",
    momentumLabel: "accelerating",
    kolCount: 12,
    kocCount: 47,
    newCreatorCount: 23,
    similarContentCount: 156,
    growth7d: 0.34,
    lowFollowerAnomalyRatio: 0.18,
    timingLabel: "窗口期 2-3 周",
    tierBreakdown: { headKol: 3, standardKol: 9, strongKoc: 18, standardKoc: 29 },
  },
  supportingAccounts: [
    {
      accountId: "acc-1", displayName: "小鱼穿搭日记", handle: "xiaoyu_ootd", platform: "douyin",
      tierLabel: "strong_koc", followerCount: 28000, followingCount: 320, totalLikeCount: 450000,
      avgEngagementRate30d: 0.085, breakoutHitRate30d: 0.12, recentTopicClusters: ["通勤穿搭", "平价好物"],
      whyIncluded: "近 30 天 3 条视频播放量超 50 万，粉丝仅 2.8 万",
    },
    {
      accountId: "acc-2", displayName: "职场小白兔", handle: "office_bunny", platform: "xiaohongshu",
      tierLabel: "standard_koc", followerCount: 8500, followingCount: 180, totalLikeCount: 120000,
      avgEngagementRate30d: 0.12, breakoutHitRate30d: 0.08, recentTopicClusters: ["职场新人", "穿搭分享"],
      whyIncluded: "低粉高互动典型案例，评论区需求信号强",
    },
    {
      accountId: "acc-3", displayName: "Ada的衣橱", handle: "ada_closet", platform: "douyin",
      tierLabel: "standard_kol", followerCount: 156000, followingCount: 450, totalLikeCount: 2800000,
      avgEngagementRate30d: 0.045, breakoutHitRate30d: 0.06, recentTopicClusters: ["职场穿搭", "品牌测评"],
      whyIncluded: "标准 KOL 参考，内容结构可复用",
    },
  ],
  supportingContents: [
    {
      contentId: "c-1", title: "月薪 5000 的通勤穿搭｜全身不超过 300", authorName: "小鱼穿搭日记",
      platform: "douyin", publishedAt: "2026-04-15", viewCount: 580000, likeCount: 32000,
      commentCount: 1800, shareCount: 4500, collectCount: 8900,
      structureSummary: "开箱 → 试穿 → 场景展示 → 价格揭晓", keywordTokens: ["通勤穿搭", "平价", "开箱"],
      whyIncluded: "低粉爆款典型，结构清晰可复用",
    },
    {
      contentId: "c-2", title: "被同事问了 10 次的通勤包｜职场新人必入", authorName: "职场小白兔",
      platform: "xiaohongshu", publishedAt: "2026-04-12", viewCount: 230000, likeCount: 18000,
      commentCount: 2200, shareCount: 3100, collectCount: 12000,
      structureSummary: "痛点引入 → 产品展示 → 使用场景 → 购买链接", keywordTokens: ["通勤包", "职场新人", "好物推荐"],
      whyIncluded: "评论区购买意向强，转化信号明显",
    },
    {
      contentId: "c-3", title: "职场穿搭公式：3 件单品搞定一周", authorName: "Ada的衣橱",
      platform: "douyin", publishedAt: "2026-04-10", viewCount: 420000, likeCount: 25000,
      commentCount: 1500, shareCount: 3800, collectCount: 7600,
      structureSummary: "公式化教学 → 单品展示 → 搭配组合 → 总结", keywordTokens: ["穿搭公式", "一周穿搭", "职场"],
      whyIncluded: "教学类内容，完播率高",
    },
    {
      contentId: "c-4", title: "夏天通勤穿什么？这 5 套照着穿就行", authorName: "穿搭研究所",
      platform: "douyin", publishedAt: "2026-04-08", viewCount: 310000, likeCount: 19000,
      commentCount: 980, shareCount: 2600, collectCount: 5400,
      structureSummary: "季节痛点 → 5 套方案逐一展示 → 总结推荐", keywordTokens: ["夏季通勤", "穿搭方案", "照着穿"],
      whyIncluded: "季节性内容，时效性强",
    },
    {
      contentId: "c-5", title: "从实习生到总监，我的职场穿搭进化史", authorName: "时尚打工人",
      platform: "xiaohongshu", publishedAt: "2026-04-06", viewCount: 180000, likeCount: 14000,
      commentCount: 1100, shareCount: 2200, collectCount: 6800,
      structureSummary: "故事线叙事 → 不同阶段穿搭 → 经验总结", keywordTokens: ["职场进化", "穿搭故事", "经验分享"],
      whyIncluded: "故事型内容，情感共鸣强",
    },
    {
      contentId: "c-6", title: "通勤穿搭避雷！这些单品千万别买", authorName: "理性消费家",
      platform: "douyin", publishedAt: "2026-04-04", viewCount: 260000, likeCount: 22000,
      commentCount: 3100, shareCount: 5200, collectCount: 4300,
      structureSummary: "反面案例 → 避雷清单 → 替代推荐", keywordTokens: ["避雷", "通勤穿搭", "别买"],
      whyIncluded: "争议型内容，评论互动极高",
    },
  ],
  lowFollowerEvidence: [
    {
      id: "lf-1", platform: "douyin", contentForm: "短视频", title: "月薪 5000 的通勤穿搭",
      account: "小鱼穿搭日记", fansLabel: "2.8万粉", fansCount: 28000, anomaly: 20.7,
      playCount: "58万", likeCount: 32000, commentCount: 1800, collectCount: 8900, shareCount: 4500,
      trackTags: ["通勤穿搭", "平价"], suggestion: "结构清晰，可直接复用开箱+试穿模式", publishedAt: "2026-04-15",
    },
  ],
  evidenceGaps: ["缺少快手平台数据", "评论情感分析样本量偏小"],
  whyNowItems: [
    { sourceLabel: "搜索趋势", fact: "「通勤穿搭」搜索量近 7 天环比增长 42%", inference: "用户主动搜索意愿正在快速上升", userImpact: "自然流量红利窗口", tone: "positive" },
    { sourceLabel: "低粉异常", fact: "18% 的爆款内容来自 1 万粉以下账号", inference: "算法正在向新人倾斜流量", userImpact: "新账号也能获得推荐", tone: "positive" },
    { sourceLabel: "竞争格局", fact: "头部 KOL 仅 3 个在做相关内容", inference: "赛道尚未被头部垄断", userImpact: "中腰部创作者仍有差异化空间", tone: "positive" },
    { sourceLabel: "季节因素", fact: "春夏换季期，职场穿搭需求自然上升", inference: "季节性需求叠加趋势上升", userImpact: "内容时效性强，需尽快产出", tone: "positive" },
    { sourceLabel: "评论信号", fact: "「求链接」「在哪买」等购买意向评论占比 23%", inference: "用户已从浏览转向购买决策", userImpact: "带货转化率预期较高", tone: "positive" },
    { sourceLabel: "平台政策", fact: "抖音近期加大了生活方式类内容的推荐权重", inference: "平台流量倾斜与赛道方向一致", userImpact: "获得额外的算法加持", tone: "neutral" },
  ],
  bestFor: ["通勤好物开箱", "职场穿搭公式教学", "低粉素人真实分享"],
  notFor: ["高端奢侈品定位", "纯图文无视频能力的创作者"],
  accountMatchSummary: "适合 1-10 万粉的中腰部创作者",
  bestActionNow: {
    type: "generate_test_brief",
    title: "生成开拍方案",
    description: "基于真实爆款样本，直接生成一版能拍的脚本和分镜",
    ctaLabel: "生成开拍方案",
    reason: "当前窗口期有限，建议尽快产出第一条测试内容",
  },
  whyNotOtherActions: ["观望可能错过最佳入场时机", "直接拆解不如先验证方向"],
  missIfWait: "预计 2-3 周后头部 KOL 入场，流量竞争将显著加剧",
  screeningReport: {
    safeActionLevel: "shoot_now",
    evidenceAlignment: "strong",
    acceptedAccountIds: ["acc-1", "acc-2", "acc-3"],
    acceptedContentIds: ["c-1", "c-2", "c-3", "c-4", "c-5", "c-6"],
    acceptedLowFollowerIds: ["lf-1"],
    missingEvidence: ["快手平台数据"],
    contradictionSummary: [],
    candidates: [],
  },
  primaryCard: {
    title: "通勤好物开箱",
    ctaLabel: "生成开拍方案",
    description: "以「月薪 X 千的通勤穿搭」为切入点，开箱+试穿+价格揭晓的结构，低粉账号验证有效",
    reason: "低粉爆款率最高的内容形式",
    previewSections: [
      { title: "参考结构", items: ["开箱展示", "试穿对比", "场景演示", "价格揭晓"], tone: "positive" },
    ],
    continueIf: ["首条视频播放量超过 5 万"],
    stopIf: ["连续 3 条视频播放量低于 1 万"],
    evidenceRefs: ["c-1", "lf-1"],
    actionMode: "open_deep_dive",
    actionPrompt: "生成通勤好物开箱的完整拍摄方案",
  },
  secondaryCard: {
    title: "职场穿搭公式教学",
    ctaLabel: "生成选题策略",
    description: "以「X 件单品搞定一周」为框架，公式化教学内容完播率高",
    reason: "教学类内容长尾效应好，适合持续产出",
    previewSections: [
      { title: "参考结构", items: ["公式引入", "单品展示", "搭配组合", "总结"], tone: "neutral" },
    ],
    continueIf: ["收藏率超过 5%"],
    stopIf: ["完播率低于 30%"],
    evidenceRefs: ["c-3"],
    actionMode: "open_deep_dive",
    actionPrompt: "生成职场穿搭公式教学的选题策略",
  },
  fitSummary: "当前赛道与你的创作方向高度匹配",
  recommendedNextAction: {
    type: "generate_test_brief",
    title: "生成开拍方案",
    description: "基于真实爆款样本生成可执行的拍摄方案",
    ctaLabel: "立即生成",
    reason: "窗口期有限，建议尽快行动",
  },
  continueIf: ["首条测试视频播放量超过 5 万", "评论区出现购买意向"],
  stopIf: ["连续 3 条视频播放量低于 1 万", "低粉异常占比下降至 10% 以下"],
  taskPayload: {
    kind: "opportunity_prediction",
    highlight: "低粉素人驱动的职场穿搭内容爆发",
    verdictLabel: "极力推荐",
    evidenceSummary: ["低粉异常占比 18%", "近 7 天增长 34%", "头部 KOL 仅 3 个"],
    bestActionReason: "窗口期有限，建议尽快产出第一条测试内容",
    supportingProofTitles: ["月薪 5000 的通勤穿搭", "被同事问了 10 次的通勤包"],
    trendOpportunities: [
      {
        opportunityName: "通勤好物开箱",
        stage: "pre_burst",
        opportunityScore: 82,
        timingScore: 85,
        oneLiner: "低粉素人开箱内容正在爆发，头部尚未入场",
        whyNow: ["搜索量+42%", "低粉异常占比18%", "头部KOL仅3个"],
        doNow: "立即产出第一条通勤好物开箱视频",
        observe: "观察头部KOL是否开始批量产出",
        executableTopics: [
          { title: "月薪X千的通勤穿搭", hookType: "价格锚点", angle: "性价比", estimatedDuration: "60s" },
          { title: "被同事问了N次的通勤好物", hookType: "社交证明", angle: "真实推荐", estimatedDuration: "45s" },
        ],
        evidenceSummary: "6 条样本视频中 4 条来自低粉账号，平均播放量 35 万",
      },
    ],
    overviewOneLiner: "职场穿搭赛道正处于低粉爆发窗口期",
  },
  recommendedNextTasks: [
    {
      taskIntent: "viral_breakdown",
      title: "拆解低粉爆款",
      reason: "看看别人低粉怎么做到高互动的",
      actionLabel: "拆解低粉爆款",
    },
    {
      taskIntent: "topic_strategy",
      title: "生成选题策略",
      reason: "从预测结果到可执行选题",
      actionLabel: "生成选题策略",
    },
  ],
  primaryArtifact: {
    artifactId: "art-demo-001",
    runId: "run-demo-001",
    taskIntent: "opportunity_prediction",
    artifactType: "opportunity_memo",
    title: "职场穿搭 × 通勤好物 - 爆款预测",
    summary: "低粉素人驱动的职场穿搭内容爆发窗口",
    payload: {},
    snapshotRefs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    watchable: true,
    shareable: true,
  },
  agentRun: {
    runId: "run-demo-001",
    source: "home_input",
    taskIntent: "opportunity_prediction",
    taskIntentConfidence: "high",
    brief: {
      inputKind: "prompt",
      seedTopic: "职场穿搭 通勤好物",
      industry: "时尚穿搭",
      candidatePlatforms: ["douyin", "xiaohongshu"],
      accountContext: "低粉创作者",
      competitorEvidence: [],
      personalizationMode: "public",
    },
    facts: {
      platformSnapshots: [],
      scoreBreakdown: {
        demand: 82,
        competition: 75,
        anomaly: 80,
        fit: 80,
        opportunity: 78,
        timing: 85,
        risk: 30,
      },
    },
    judgment: {
      title: "职场穿搭 × 通勤好物",
      summary: "低粉素人驱动的内容爆发窗口",
      verdict: "go_now",
      confidenceLabel: "高",
      bestAction: {
        type: "generate_test_brief",
        title: "生成开拍方案",
        description: "基于真实爆款样本生成可执行的拍摄方案",
        ctaLabel: "生成开拍方案",
        reason: "窗口期有限",
      },
    },
    deliverables: [],
    recommendedNextTasks: [],
    artifacts: [],
    degradeFlags: [],
    taskPayload: { kind: "opportunity_prediction", highlight: "", verdictLabel: "", evidenceSummary: [], bestActionReason: "", supportingProofTitles: [] },
    status: "completed",
  },
  classificationReasons: ["用户查询包含赛道关键词", "明确的预测意图"],
  followUps: [],
  commentInsight: {
    totalCommentsCollected: 8600,
    highFreqKeywords: ["求链接", "在哪买", "同款", "好看", "通勤", "上班", "平价", "质感", "推荐", "种草"],
    sentimentSummary: "positive",
    demandSignals: ["购买意向强烈（23%评论含购买关键词）", "尺码咨询需求高", "搭配建议需求"],
    highlights: [
      {
        contentId: "c-1",
        contentTitle: "月薪 5000 的通勤穿搭",
        topComments: [
          { text: "求链接！这件外套太好看了", likeCount: 856, authorName: "小美" },
          { text: "终于有人做平价通勤穿搭了，不是每个人都买得起大牌", likeCount: 623, authorName: "打工人日记" },
          { text: "身高 160 能穿吗？求试穿反馈", likeCount: 412, authorName: "矮个子穿搭" },
        ],
        totalCommentCount: 1800,
      },
      {
        contentId: "c-6",
        contentTitle: "通勤穿搭避雷！这些单品千万别买",
        topComments: [
          { text: "说得太对了！我就踩过这个雷", likeCount: 1200, authorName: "经验之谈" },
          { text: "那到底该买什么？求推荐清单", likeCount: 890, authorName: "选择困难症" },
        ],
        totalCommentCount: 3100,
      },
    ],
  },
  scoreBreakdown: {
    demand: 82,
    competition: 75,
    anomaly: 80,
    fit: 80,
    opportunity: 78,
    timing: 85,
    risk: 30,
  },
};

export function ResultsDemoPage() {
  const navigate = useNavigate();
  const [bannerVisible, setBannerVisible] = useState(true);
  const { markChecklistDone } = useOnboarding();

  // 上手任务追踪：查看爆款预测（C1 第4项）
  useEffect(() => {
    markChecklistDone("prediction");
  }, [markChecklistDone]);

  return (
    <div className="relative">
      {/* Demo banner */}
      {bannerVisible && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[13px] text-[#92400E]">
            <Sparkles className="h-4 w-4 shrink-0 text-[#D97706]" />
            <span>这是一个示例分析，展示 AI 输出的真实质量。</span>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 text-[#D97706] underline underline-offset-2 transition-colors hover:text-[#B45309]"
            >
              开始你自己的分析
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setBannerVisible(false)}
            className="ml-4 shrink-0 text-[#92400E]/60 transition-colors hover:text-[#92400E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="max-w-[960px] mx-auto px-6 py-6">
        <NewPredictionResultBody result={MOCK_RESULT} />
      </div>
    </div>
  );
}
