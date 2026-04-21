/**
 * low-follower-tagger.test.ts
 * 低粉爆款自动打标签模块单元测试
 */
import { describe, it, expect } from "vitest";
import {
  tagSampleByRules,
  type TaggingInput,
} from "./legacy/low-follower-tagger.js";

// ─────────────────────────────────────────────
// 测试数据工厂
// ─────────────────────────────────────────────

function makeSample(overrides: Partial<TaggingInput> = {}): TaggingInput {
  return {
    id: `sample_${Math.random().toString(36).slice(2, 8)}`,
    title: "测试视频标题",
    platform: "douyin",
    authorFollowers: 3000,
    likeCount: 500,
    commentCount: 100,
    shareCount: 50,
    saveCount: 200,
    viralScore: 65,
    seedTopic: null,
    hashtags: null,
    duration: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// tagSampleByRules 测试
// ─────────────────────────────────────────────

describe("tagSampleByRules", () => {
  describe("内容形式识别", () => {
    it("小红书平台默认识别为图文", () => {
      const sample = makeSample({ platform: "xiaohongshu" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("图文");
    });

    it("抖音平台默认识别为竖屏视频", () => {
      const sample = makeSample({ platform: "douyin" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("竖屏视频");
    });

    it("标题含口播关键词应识别为口播", () => {
      const sample = makeSample({ title: "真人出镜分享我的护肤心得" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("口播");
    });

    it("标题含测评关键词应识别为测评", () => {
      const sample = makeSample({ title: "iPhone 16 Pro 深度评测对比" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("测评");
    });

    it("标题含干货关键词应识别为干货", () => {
      const sample = makeSample({ title: "3分钟学会Python教程入门" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("干货");
    });

    it("标题含剪辑关键词应识别为剪辑", () => {
      const sample = makeSample({ title: "2026年度混剪合集" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("剪辑");
    });

    it("超长视频应识别为横屏视频", () => {
      const sample = makeSample({ duration: 600, title: "普通标题" });
      const result = tagSampleByRules(sample);
      expect(result.contentForm).toBe("横屏视频");
    });
  });

  describe("赛道标签识别", () => {
    it("AI相关标题应识别AI赛道", () => {
      const sample = makeSample({ title: "ChatGPT效率工具推荐" });
      const result = tagSampleByRules(sample);
      expect(result.trackTags).toContain("AI效率工具");
    });

    it("美妆相关标题应识别美妆赛道", () => {
      const sample = makeSample({ title: "秋冬护肤必备面膜推荐" });
      const result = tagSampleByRules(sample);
      expect(result.trackTags).toContain("美妆护肤");
    });

    it("健身相关标题应识别健身赛道", () => {
      const sample = makeSample({ title: "居家减脂运动30分钟" });
      const result = tagSampleByRules(sample);
      expect(result.trackTags).toContain("健身减脂");
    });

    it("无匹配关键词时应使用seedTopic", () => {
      const sample = makeSample({ title: "普通标题", seedTopic: "宠物日常" });
      const result = tagSampleByRules(sample);
      expect(result.trackTags).toContain("宠物日常");
    });

    it("赛道标签最多3个", () => {
      const sample = makeSample({
        title: "AI工具护肤健身职场家居美食",
        hashtags: "数码穿搭旅行",
      });
      const result = tagSampleByRules(sample);
      expect(result.trackTags.length).toBeLessThanOrEqual(3);
    });
  });

  describe("爆款原因识别", () => {
    it("干货类标题应识别实用干货", () => {
      const sample = makeSample({ title: "教你5个高效学习技巧" });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons).toContain("实用干货");
    });

    it("情绪类标题应识别情绪共鸣", () => {
      const sample = makeSample({ title: "看完太真实了，扎心了" });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons).toContain("情绪共鸣");
    });

    it("反差类标题应识别反差钩子", () => {
      const sample = makeSample({ title: "没想到居然这么好用" });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons).toContain("反差钩子");
    });

    it("高评论率应识别互动引导", () => {
      const sample = makeSample({
        title: "普通标题",
        likeCount: 100,
        commentCount: 50, // 评论 > 点赞 * 0.1
      });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons).toContain("互动引导");
    });

    it("低粉高分应识别低门槛模仿", () => {
      const sample = makeSample({
        title: "普通标题",
        authorFollowers: 200,
        viralScore: 75,
      });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons).toContain("低门槛模仿");
    });

    it("无匹配时应有默认原因", () => {
      const sample = makeSample({
        title: "一个普通的标题",
        likeCount: 1000,
        commentCount: 5,
        authorFollowers: 5000,
        viralScore: 30,
      });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons.length).toBeGreaterThan(0);
    });

    it("爆款原因最多3个", () => {
      const sample = makeSample({
        title: "没想到这个教程干货太真实了全网火了",
        likeCount: 100,
        commentCount: 50,
        authorFollowers: 200,
        viralScore: 80,
      });
      const result = tagSampleByRules(sample);
      expect(result.burstReasons.length).toBeLessThanOrEqual(3);
    });
  });

  describe("新手友好度", () => {
    it("极低粉丝应获得较高新手友好度", () => {
      const sample = makeSample({ authorFollowers: 100 });
      const result = tagSampleByRules(sample);
      expect(result.newbieFriendly).toBeGreaterThanOrEqual(60);
    });

    it("口播类内容应获得额外新手友好度加分", () => {
      const sampleOral = makeSample({ title: "真人口播分享", authorFollowers: 3000 });
      const sampleNormal = makeSample({ title: "普通标题", authorFollowers: 3000 });
      const resultOral = tagSampleByRules(sampleOral);
      const resultNormal = tagSampleByRules(sampleNormal);
      expect(resultOral.newbieFriendly).toBeGreaterThanOrEqual(resultNormal.newbieFriendly);
    });

    it("新手友好度应在0-100范围内", () => {
      const samples = [
        makeSample({ authorFollowers: 1, viralScore: 100 }),
        makeSample({ authorFollowers: 10000, viralScore: 0, title: "剪辑混剪合集", duration: 600 }),
      ];
      for (const sample of samples) {
        const result = tagSampleByRules(sample);
        expect(result.newbieFriendly).toBeGreaterThanOrEqual(0);
        expect(result.newbieFriendly).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("建议生成", () => {
    it("应返回非空建议", () => {
      const sample = makeSample();
      const result = tagSampleByRules(sample);
      expect(result.suggestion).toBeTruthy();
      expect(result.suggestion.length).toBeGreaterThan(5);
    });

    it("干货类应给出干货相关建议", () => {
      const sample = makeSample({ title: "教你3个高效攻略方法" });
      const result = tagSampleByRules(sample);
      expect(result.suggestion).toContain("干货");
    });

    it("情绪类应给出情绪相关建议", () => {
      const sample = makeSample({ title: "看完太真实了扎心" });
      const result = tagSampleByRules(sample);
      expect(result.suggestion).toContain("情绪");
    });
  });

  describe("完整标签结构", () => {
    it("应返回所有必需字段", () => {
      const sample = makeSample();
      const result = tagSampleByRules(sample);
      expect(result).toHaveProperty("contentForm");
      expect(result).toHaveProperty("trackTags");
      expect(result).toHaveProperty("burstReasons");
      expect(result).toHaveProperty("newbieFriendly");
      expect(result).toHaveProperty("suggestion");
      expect(typeof result.contentForm).toBe("string");
      expect(Array.isArray(result.trackTags)).toBe(true);
      expect(Array.isArray(result.burstReasons)).toBe(true);
      expect(typeof result.newbieFriendly).toBe("number");
      expect(typeof result.suggestion).toBe("string");
    });

    it("内容形式应为有效值", () => {
      const validForms = new Set(["竖屏视频", "横屏视频", "图文", "口播", "剪辑", "干货", "测评"]);
      const samples = [
        makeSample({ platform: "douyin" }),
        makeSample({ platform: "xiaohongshu" }),
        makeSample({ title: "口播分享" }),
        makeSample({ title: "深度评测" }),
        makeSample({ title: "干货教程" }),
        makeSample({ title: "混剪合集" }),
        makeSample({ duration: 600 }),
      ];
      for (const sample of samples) {
        const result = tagSampleByRules(sample);
        expect(validForms.has(result.contentForm)).toBe(true);
      }
    });
  });
});
