import type { ConnectorCapabilities } from "./types.js";

const FULL_CAPABILITIES: ConnectorCapabilities = {
  supportsSearch: true,
  supportsHotList: true,
  supportsDetail: true,
  supportsComments: true,
  supportsPublicProfile: true,
  supportsCookieAnalytics: false,
};

const CONTENT_ONLY_CAPABILITIES: ConnectorCapabilities = {
  supportsSearch: false,
  supportsHotList: false,
  supportsDetail: true,
  supportsComments: true,
  supportsPublicProfile: false,
  supportsCookieAnalytics: false,
};

export const PLATFORM_CAPABILITIES: Record<string, ConnectorCapabilities> = {
  douyin: { ...FULL_CAPABILITIES, supportsCookieAnalytics: true },
  xiaohongshu: {
    ...FULL_CAPABILITIES,
    supportsSearch: false, // TikHub 搜索笔记接口全部不可用，使用替代数据链
  },
  bilibili: FULL_CAPABILITIES,
  kuaishou: {
    ...FULL_CAPABILITIES,
    supportsComments: false, // TikHub 快手评论接口全部不可用（403/500）
  },
  wechat: FULL_CAPABILITIES,
  "wechat-mp": {
    ...CONTENT_ONLY_CAPABILITIES,
    supportsComments: true,
    supportsPublicProfile: true,
  },
  weibo: FULL_CAPABILITIES,
  zhihu: {
    ...CONTENT_ONLY_CAPABILITIES,
    supportsSearch: true,
    supportsPublicProfile: true,
  },
  xigua: FULL_CAPABILITIES,
  pipixia: FULL_CAPABILITIES,
  lemon8: FULL_CAPABILITIES,
  tiktok: FULL_CAPABILITIES,
  youtube: FULL_CAPABILITIES,
  instagram: FULL_CAPABILITIES,
  reddit: FULL_CAPABILITIES,
};

export function getCapabilities(platformId: string): ConnectorCapabilities {
  return (
    PLATFORM_CAPABILITIES[platformId] ?? {
      supportsSearch: false,
      supportsHotList: false,
      supportsDetail: false,
      supportsComments: false,
      supportsPublicProfile: false,
      supportsCookieAnalytics: false,
    }
  );
}
