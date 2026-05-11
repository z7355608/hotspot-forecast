import { describe, expect, it } from "vitest";
import {
  assessLowFollowerCommercialQuality,
  buildCommercialQualityConditions,
} from "./legacy/low-follower-commercial-quality.js";

describe("low follower commercial quality gate", () => {
  it("rejects obvious funny entertainment samples even when they are easy to copy", () => {
    const result = assessLowFollowerCommercialQuality({
      source: "billboard",
      title: "#和朋友在一起时的精神状态 #闺蜜有什么痛苦跟我上韩国说 ？？？",
      trackTags: ["搞笑娱乐"],
      prefilterReason: "闺蜜趣味日常选题可复用，拍摄门槛低",
      newbieFriendly: 90,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("非商业化");
  });

  it("rejects bizarre samples leaked by LLM prefilter reason", () => {
    const result = assessLowFollowerCommercialQuality({
      source: "billboard",
      title: "#这是真正的硬菜 虾将军：我的长枪已被折断",
      trackTags: ["美食教程"],
      prefilterReason: "美食猎奇吃法可复刻，有网感文案可学",
      newbieFriendly: 90,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("预检查理由");
  });

  it("does not reject practical pet education just because it is pet content", () => {
    const result = assessLowFollowerCommercialQuality({
      source: "search",
      title: "想要狗狗活的久，喂狗喝水有讲究#狗狗#新手养狗#养狗经验分享",
      trackTags: ["萌宠"],
      prefilterReason: "养狗干货可复刻，拍摄门槛低",
      newbieFriendly: 95,
    });

    expect(result.accepted).toBe(true);
  });

  it("rejects old seed_topic samples that were never commercially tagged", () => {
    const result = assessLowFollowerCommercialQuality({
      source: "seed_topic",
      title: "ai你们还有什么好用的? #人工智能 #AI工具",
      trackTags: null,
      newbieFriendly: 50,
    });

    expect(result.accepted).toBe(false);
  });

  it("builds SQL conditions for router filtering", () => {
    const conditions = buildCommercialQualityConditions().join(" ");

    expect(conditions).toContain("搞笑娱乐");
    expect(conditions).toContain("prefilter_reason");
    expect(conditions).toContain("source != 'seed_topic'");
  });
});
