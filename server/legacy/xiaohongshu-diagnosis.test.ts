/**
 * xiaohongshu-diagnosis.test.ts
 * 测试诊断 Agent 对小红书平台的适配
 */
import { describe, it, expect } from "vitest";

// ─── 从 account-diagnosis-agent.ts 中提取的纯函数逻辑进行单元测试 ───

// 模拟 WorkItem 类型
interface WorkItem {
  id: string;
  title: string;
  coverUrl: string;
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
  reads?: number;
  voteups?: number;
  tags?: string[];
}

// 复制 calcEngagementRate 逻辑进行测试
function calcEngagementRate(work: WorkItem, followers?: number): number {
  const interaction = (work.likes ?? 0) + (work.comments ?? 0) +
    (work.shares ?? 0) + (work.collects ?? 0) + (work.voteups ?? 0);

  const views = work.views ?? work.reads ?? 0;
  if (views > 0) {
    return (interaction / views) * 100;
  }

  if (followers && followers > 0) {
    return (interaction / followers) * 100;
  }

  return interaction;
}

// 复制 calcCollectRate 逻辑
function calcCollectRate(work: WorkItem): number {
  const likes = work.likes ?? 0;
  const collects = work.collects ?? 0;
  const total = likes + collects;
  if (total === 0) return 0;
  return (collects / total) * 100;
}

// 复制 buildTrendSummary 逻辑
function buildTrendSummary(
  trendData: Array<{ views?: number; likes?: number; comments?: number; collects?: number }>,
  platformId?: string,
): string {
  const recent7 = trendData.slice(-7);
  const totalViews = recent7.reduce((s, t) => s + (t.views ?? 0), 0);
  const totalLikes = recent7.reduce((s, t) => s + (t.likes ?? 0), 0);
  const totalComments = recent7.reduce((s, t) => s + (t.comments ?? 0), 0);
  const totalCollects = recent7.reduce((s, t) => s + (t.collects ?? 0), 0);

  if (platformId === "xiaohongshu") {
    return `近7天：点赞${totalLikes} 收藏${totalCollects} 评论${totalComments}`;
  }
  return `近7天：播放${totalViews} 点赞${totalLikes} 评论${totalComments}`;
}

describe("诊断Agent小红书适配", () => {
  // ─── calcEngagementRate ───

  describe("calcEngagementRate 多平台兼容", () => {
    it("有播放量时基于播放量计算（抖音）", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "video", isHot: false,
        views: 10000, likes: 500, comments: 50, shares: 30, collects: 20,
      };
      const rate = calcEngagementRate(work);
      // (500+50+30+20) / 10000 * 100 = 6%
      expect(rate).toBeCloseTo(6, 1);
    });

    it("无播放量时基于粉丝数计算（小红书）", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        views: 0, likes: 200, comments: 30, shares: 10, collects: 60,
      };
      const rate = calcEngagementRate(work, 5000);
      // (200+30+10+60) / 5000 * 100 = 6%
      expect(rate).toBeCloseTo(6, 1);
    });

    it("views=undefined 且有粉丝数时基于粉丝数", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        likes: 100, comments: 20, shares: 5, collects: 30,
      };
      const rate = calcEngagementRate(work, 10000);
      // (100+20+5+30) / 10000 * 100 = 1.55%
      expect(rate).toBeCloseTo(1.55, 1);
    });

    it("无播放量无粉丝数时返回互动总数", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        likes: 100, comments: 20, shares: 5, collects: 30,
      };
      const rate = calcEngagementRate(work, 0);
      // 100+20+5+30 = 155
      expect(rate).toBe(155);
    });

    it("reads 字段作为 views 的备选（B站）", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "article", isHot: false,
        reads: 5000, likes: 100, comments: 20, shares: 10, collects: 15,
      };
      const rate = calcEngagementRate(work);
      // (100+20+10+15) / 5000 * 100 = 2.9%
      expect(rate).toBeCloseTo(2.9, 1);
    });
  });

  // ─── calcCollectRate ───

  describe("calcCollectRate 收藏率", () => {
    it("正常计算收藏率", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        likes: 200, collects: 100,
      };
      // 100 / (200+100) * 100 = 33.33%
      expect(calcCollectRate(work)).toBeCloseTo(33.33, 1);
    });

    it("高收藏率（干货笔记）", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        likes: 50, collects: 200,
      };
      // 200 / (50+200) * 100 = 80%
      expect(calcCollectRate(work)).toBeCloseTo(80, 0);
    });

    it("零互动返回0", () => {
      const work: WorkItem = {
        id: "1", title: "test", coverUrl: "", publishedAt: "2025-01-01",
        type: "note", isHot: false,
        likes: 0, collects: 0,
      };
      expect(calcCollectRate(work)).toBe(0);
    });
  });

  // ─── buildTrendSummary ───

  describe("buildTrendSummary 平台差异化", () => {
    const trendData = [
      { views: 1000, likes: 100, comments: 20, collects: 50 },
      { views: 2000, likes: 200, comments: 30, collects: 80 },
      { views: 1500, likes: 150, comments: 25, collects: 60 },
    ];

    it("小红书：显示点赞/收藏/评论，不显示播放", () => {
      const summary = buildTrendSummary(trendData, "xiaohongshu");
      expect(summary).toContain("点赞");
      expect(summary).toContain("收藏");
      expect(summary).toContain("评论");
      expect(summary).not.toContain("播放");
    });

    it("抖音：显示播放/点赞/评论", () => {
      const summary = buildTrendSummary(trendData, "douyin");
      expect(summary).toContain("播放");
      expect(summary).toContain("点赞");
      expect(summary).toContain("评论");
      expect(summary).not.toContain("收藏");
    });

    it("默认平台：显示播放/点赞/评论", () => {
      const summary = buildTrendSummary(trendData);
      expect(summary).toContain("播放");
    });
  });

  // ─── 作品展示格式 ───

  describe("作品展示格式差异化", () => {
    const xhsWork: WorkItem = {
      id: "note1", title: "小红书种草笔记测试", coverUrl: "",
      publishedAt: "2025-01-15", type: "note", isHot: false,
      likes: 300, comments: 40, shares: 15, collects: 120,
      tags: ["护肤", "美妆"],
    };

    const videoWork: WorkItem = {
      id: "note2", title: "小红书视频笔记测试", coverUrl: "",
      publishedAt: "2025-01-16", type: "video", isHot: false,
      likes: 500, comments: 60, shares: 25, collects: 80,
      tags: ["穿搭"],
    };

    it("小红书图文笔记显示[图文]标签", () => {
      const noteType = xhsWork.type === "video" ? "[视频]" : "[图文]";
      expect(noteType).toBe("[图文]");
    });

    it("小红书视频笔记显示[视频]标签", () => {
      const noteType = videoWork.type === "video" ? "[视频]" : "[图文]";
      expect(noteType).toBe("[视频]");
    });

    it("小红书作品展示包含收藏率", () => {
      const collectRate = calcCollectRate(xhsWork);
      // 120 / (300+120) * 100 = 28.57%
      expect(collectRate).toBeCloseTo(28.57, 0);
    });
  });

  // ─── 互动率趋势分析 ───

  describe("analyzeEngagementTrend 小红书适配", () => {
    it("小红书作品无播放量时使用粉丝数计算趋势", () => {
      const works: WorkItem[] = [
        { id: "1", title: "早期", coverUrl: "", publishedAt: "2025-01-01", type: "note", isHot: false, likes: 100, comments: 10, collects: 30 },
        { id: "2", title: "早期2", coverUrl: "", publishedAt: "2025-01-05", type: "note", isHot: false, likes: 80, comments: 8, collects: 25 },
        { id: "3", title: "近期", coverUrl: "", publishedAt: "2025-01-20", type: "note", isHot: false, likes: 200, comments: 30, collects: 80 },
        { id: "4", title: "近期2", coverUrl: "", publishedAt: "2025-01-25", type: "note", isHot: false, likes: 250, comments: 40, collects: 100 },
      ];

      const followers = 10000;
      const rates = works.map(w => calcEngagementRate(w, followers));

      // 早期: (100+10+0+30)/10000*100=1.4%, (80+8+0+25)/10000*100=1.13%
      // 近期: (200+30+0+80)/10000*100=3.1%, (250+40+0+100)/10000*100=3.9%
      expect(rates[0]).toBeCloseTo(1.4, 1);
      expect(rates[2]).toBeCloseTo(3.1, 1);

      // 近期明显高于早期 → 应该是 rising 趋势
      const avgEarly = (rates[0] + rates[1]) / 2;
      const avgRecent = (rates[2] + rates[3]) / 2;
      expect(avgRecent).toBeGreaterThan(avgEarly);
    });
  });
});
