import type { ConnectorCapabilities, PlatformPredictionMeta } from "./prediction-types.js";

const FULL_CAPABILITIES: ConnectorCapabilities = {
  supportsSearch: true,
  supportsHotList: true,
  supportsDetail: true,
  supportsComments: true,
  supportsPublicProfile: true,
  supportsCookieAnalytics: false,
};

export const PLATFORM_PREDICTION_META: Record<string, PlatformPredictionMeta> = {
  douyin: {
    platformId: "douyin",
    platformName: "抖音",
    predictionEnabled: true,
    endpointFamilies: [
      "fetch_hot_search_result",
      "fetch_one_video_v2",
      "fetch_user_post_videos",
      "fetch_video_comments",
      "creator_v2_*",
    ],
    coreFields: [
      "aweme_id", "desc", "create_time", "author_id", "follower_count",
      "digg_count", "comment_count", "share_count", "play_count",
      "hashtag", "hot_rank", "traffic_source", "search_keywords", "audience_portrait",
    ],
    capabilities: {
      ...FULL_CAPABILITIES,
      supportsCookieAnalytics: true,
    },
    callBudget: { topic: 6, link: 4, account: 5, cookieExtra: 5 },
  },
  xiaohongshu: {
    platformId: "xiaohongshu",
    platformName: "小红书",
    predictionEnabled: true,
    endpointFamilies: [
      "search_notes", "fetch_hot_list", "get_note_detail",
      "get_user_info", "get_user_posted_notes", "get_note_comments",
    ],
    coreFields: [
      "note_id", "title", "desc", "note_type", "publish_time",
      "user_id", "fans", "like_count", "comment_count", "collect_count",
      "share_count", "tags", "hot_list_rank",
    ],
    capabilities: {
      ...FULL_CAPABILITIES,
      supportsSearch: false, // 小红书搜索接口不稳定
    },
    callBudget: { topic: 6, link: 4, account: 5 },
  },
  kuaishou: {
    platformId: "kuaishou",
    platformName: "快手",
    predictionEnabled: true,
    endpointFamilies: [
      "web/search_content", "app/search_content_v2",
      "web/fetch_hot_search_list", "web/fetch_hot_topic_list",
      "app/fetch_hot_search_list", "web/fetch_one_video",
      "app/fetch_one_video_v2", "app/fetch_one_user_v2",
      "web/fetch_user_info", "web/fetch_user_post",
      "app/fetch_user_hot_post", "app/search_user_v2",
    ],
    coreFields: [
      "photo_id", "caption", "create_time", "author_id", "follower_count",
      "viewCount", "likeCount", "commentCount", "shareCount", "duration", "hot_rank",
    ],
    capabilities: {
      ...FULL_CAPABILITIES,
      supportsComments: false, // 快手评论接口全部不可用
    },
    callBudget: { topic: 5, link: 4, account: 4 },
  },
};

/** 已接入的中文平台 ID 列表 */
export const CHINESE_PREDICTION_PLATFORM_IDS = [
  "douyin",
  "xiaohongshu",
  "kuaishou",
] as const;

export function getPlatformPredictionMeta(platformId: string): PlatformPredictionMeta {
  return (
    PLATFORM_PREDICTION_META[platformId] ?? {
      platformId,
      platformName: platformId,
      predictionEnabled: false,
      endpointFamilies: [],
      coreFields: [],
      capabilities: {
        supportsSearch: false,
        supportsHotList: false,
        supportsDetail: false,
        supportsComments: false,
        supportsPublicProfile: false,
        supportsCookieAnalytics: false,
      },
      callBudget: { topic: 0, link: 0, account: 0 },
    }
  );
}

export function getCapabilityLabels(capabilities: ConnectorCapabilities): string[] {
  const labels: string[] = [];
  if (capabilities.supportsSearch) labels.push("搜索");
  if (capabilities.supportsHotList) labels.push("热榜");
  if (capabilities.supportsDetail) labels.push("详情");
  if (capabilities.supportsComments) labels.push("评论");
  if (capabilities.supportsPublicProfile) labels.push("主页");
  if (capabilities.supportsCookieAnalytics) labels.push("创作者数据");
  return labels;
}
