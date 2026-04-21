// account-center/types.ts — Shared types, config, and utility functions

import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  Coins,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  ThumbsUp,
  Users,
  Zap,
} from "lucide-react";
import type { CommentAnalysis } from "../../lib/creator-api";

// ─── Platform metric config ─────────────────────────────────────────

export interface PlatformMetricConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  valueKey: string;
  changeKey: string;
}

export function getPlatformMetrics(platformId: string): PlatformMetricConfig[] {
  const common: PlatformMetricConfig[] = [
    { key: "followers", label: "粉丝总数", icon: Users, color: "bg-blue-50 text-blue-500", valueKey: "followers", changeKey: "followersChange" },
  ];

  switch (platformId) {
    case "douyin":
      return [
        ...common,
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
        { key: "collects", label: "总收藏", icon: Bookmark, color: "bg-amber-50 text-amber-500", valueKey: "totalCollects", changeKey: "collectsChange" },
        { key: "engagement", label: "互动率", icon: Zap, color: "bg-orange-50 text-orange-500", valueKey: "avgEngagementRate", changeKey: "engagementRateChange" },
      ];
    case "kuaishou":
    case "xigua":
    case "pipixia":
      return [
        ...common,
        { key: "views", label: "总播放", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalViews", changeKey: "viewsChange" },
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
        { key: "engagement", label: "互动率", icon: Zap, color: "bg-amber-50 text-amber-500", valueKey: "avgEngagementRate", changeKey: "engagementRateChange" },
      ];
    case "xiaohongshu":
    case "lemon8":
      return [
        ...common,
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "collects", label: "总收藏", icon: Bookmark, color: "bg-amber-50 text-amber-500", valueKey: "totalCollects", changeKey: "collectsChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
        { key: "engagement", label: "互动率", icon: Zap, color: "bg-sky-50 text-sky-500", valueKey: "avgEngagementRate", changeKey: "engagementRateChange" },
      ];
    case "bilibili":
      return [
        ...common,
        { key: "views", label: "总播放", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalViews", changeKey: "viewsChange" },
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "coins", label: "总投币", icon: Coins, color: "bg-amber-50 text-amber-500", valueKey: "totalCoins", changeKey: "coinsChange" },
        { key: "favorites", label: "总收藏", icon: Bookmark, color: "bg-orange-50 text-orange-500", valueKey: "totalFavorites", changeKey: "favoritesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
      ];
    case "weibo":
      return [
        ...common,
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "reposts", label: "总转发", icon: Repeat2, color: "bg-sky-50 text-sky-500", valueKey: "totalReposts", changeKey: "repostsChange" },
        { key: "engagement", label: "互动率", icon: Zap, color: "bg-amber-50 text-amber-500", valueKey: "avgEngagementRate", changeKey: "engagementRateChange" },
      ];
    case "zhihu":
      return [
        ...common,
        { key: "reads", label: "总阅读", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalReads", changeKey: "readsChange" },
        { key: "voteups", label: "总赞同", icon: ThumbsUp, color: "bg-blue-50 text-blue-500", valueKey: "totalVoteups", changeKey: "voteupsChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "engagement", label: "互动率", icon: Zap, color: "bg-amber-50 text-amber-500", valueKey: "avgEngagementRate", changeKey: "engagementRateChange" },
      ];
    case "wechat":
      return [
        ...common,
        { key: "views", label: "总播放", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalViews", changeKey: "viewsChange" },
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
      ];
    case "wechat-mp":
      return [
        ...common,
        { key: "reads", label: "总阅读", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalReads", changeKey: "readsChange" },
        { key: "likes", label: "总在看", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
      ];
    default:
      return [
        ...common,
        { key: "views", label: "总播放", icon: Eye, color: "bg-sky-50 text-sky-500", valueKey: "totalViews", changeKey: "viewsChange" },
        { key: "likes", label: "总点赞", icon: Heart, color: "bg-red-50 text-red-500", valueKey: "totalLikes", changeKey: "likesChange" },
        { key: "comments", label: "总评论", icon: MessageCircle, color: "bg-green-50 text-green-500", valueKey: "totalComments", changeKey: "commentsChange" },
        { key: "shares", label: "总分享", icon: Share2, color: "bg-purple-50 text-purple-500", valueKey: "totalShares", changeKey: "sharesChange" },
      ];
  }
}

export function getWorkSortOptions(platformId: string): { key: string; label: string }[] {
  const base = [{ key: "time", label: "最新" }];
  switch (platformId) {
    case "douyin":
      return [...base, { key: "likes", label: "点赞" }, { key: "comments", label: "评论" }, { key: "collects", label: "收藏" }, { key: "shares", label: "分享" }];
    case "kuaishou":
    case "xigua":
    case "pipixia":
    case "wechat":
      return [...base, { key: "views", label: "播放量" }, { key: "likes", label: "点赞" }, { key: "comments", label: "评论" }];
    case "xiaohongshu":
    case "lemon8":
      return [...base, { key: "likes", label: "点赞" }, { key: "collects", label: "收藏" }, { key: "comments", label: "评论" }];
    case "bilibili":
      return [...base, { key: "views", label: "播放量" }, { key: "likes", label: "点赞" }, { key: "coins", label: "投币" }, { key: "favorites", label: "收藏" }];
    case "weibo":
      return [...base, { key: "likes", label: "点赞" }, { key: "reposts", label: "转发" }, { key: "comments", label: "评论" }];
    case "zhihu":
      return [...base, { key: "voteups", label: "赞同" }, { key: "reads", label: "阅读" }, { key: "comments", label: "评论" }];
    case "wechat-mp":
      return [...base, { key: "reads", label: "阅读" }, { key: "likes", label: "在看" }, { key: "comments", label: "评论" }];
    default:
      return [...base, { key: "views", label: "播放量" }, { key: "likes", label: "点赞" }, { key: "comments", label: "评论" }];
  }
}

// ─── Data types ─────────────────────────────────────────────────────

export interface AccountOverview {
  platformId: string;
  platformName: string;
  platformColor: string;
  handle: string;
  avatarUrl?: string;
  totalWorks: number;
  [key: string]: string | number | boolean | undefined;
}

export interface TrendDataPoint {
  date: string;
  [key: string]: string | number;
}

export interface WorkItem {
  id: string;
  title: string;
  coverUrl: string;
  contentUrl?: string;
  publishedAt: string;
  type: "video" | "note" | "article";
  isHot: boolean;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  coins?: number;
  favorites?: number;
  reposts?: number;
  reads?: number;
  voteups?: number;
  completionRate?: number;
  avgWatchDuration?: number;
  duration?: string;
  tags?: string[];
  trafficSources?: { source: string; percentage: number }[];
  audienceGender?: { male: number; female: number };
  audienceAge?: { range: string; percentage: number }[];
}

export interface CommentItem {
  id: string;
  author: string;
  authorAvatar?: string;
  content: string;
  likes: number;
  replyCount: number;
  createdAt: string;
  sentiment: "positive" | "neutral" | "negative";
  isAuthorReply: boolean;
}

export interface WorkDetail extends WorkItem {
  description: string;
  tags: string[];
  trafficSources?: { source: string; percentage: number }[];
  audienceGender?: { male: number; female: number };
  audienceAge?: { range: string; percentage: number }[];
  commentList: CommentItem[];
  commentAnalysis?: CommentAnalysis;
  commentsLoading?: boolean;
  analysisLoading?: boolean;
  commentPage?: number;
  commentTotalPages?: number;
  commentTotal?: number;
  commentHasMore?: boolean;
  commentNextCursor?: number | null;
  commentLoadingMore?: boolean;
}

export interface FanProfile {
  genderRatio: { male: number; female: number };
  ageDistribution: { range: string; percentage: number }[];
  topCities: { city: string; percentage: number }[];
  activeHours: { hour: string; percentage: number }[];
  interestTags: string[];
}

// ─── Formatting utilities ───────────────────────────────────────────

export function formatNumber(num: number | undefined): string {
  if (num === undefined) return "-";
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)} 亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)} 万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

export function formatChange(num: number | undefined, suffix = ""): string {
  if (num === undefined) return "-";
  const prefix = num >= 0 ? "+" : "";
  if (Math.abs(num) >= 10000) return `${prefix}${(num / 10000).toFixed(1)} 万${suffix}`;
  return `${prefix}${num.toLocaleString()}${suffix}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
