/**
 * 新架构验证脚本 — 完整的确定性爆款预测流程
 * 种子词："穿搭"
 * 
 * 已验证的API数据结构：
 * - 搜索v2: data.business_data[].data.aweme_info (statistics, author, desc, aweme_id, create_time)
 *   分页: data.business_config.has_more, data.business_config.next_page.cursor
 *   注意: play_count=0（搜索结果不返回播放量），follower_count=0
 * - 低粉爆款: data.data.objs[] (item_id, item_title, nick_name, fans_cnt, play_cnt, like_cnt)
 * - 热搜v3: data.data.word_list[] (word, sentence_id, label)
 * - 搜索建议: data.sug_list[] (content)
 * - 话题建议: data.sug_list[] (cha_name)
 * 
 * 关键发现：
 * - billboard API 需要 POST 方法（GET 返回 405）
 * - 搜索v2 并发调用会返回 400，需要串行
 */

import dotenv from "dotenv";
dotenv.config();

const TIKHUB_BASE = process.env.TIKHUB_BASE_URL || "https://api.tikhub.dev";
const TIKHUB_KEY = process.env.TIKHUB_API_KEY;

if (!TIKHUB_KEY) { console.error("Missing TIKHUB_API_KEY"); process.exit(1); }

const SEED_TOPIC = "穿搭";
let apiCallCount = 0;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tikRequest(method, path, body = null, retries = 2) {
  apiCallCount++;
  const url = new URL(path, TIKHUB_BASE);
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt);
    }
    try {
      const opts = {
        method,
        headers: { Authorization: `Bearer ${TIKHUB_KEY}` },
        signal: AbortSignal.timeout(25000),
      };
      if (method === "POST") {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body || {});
      } else if (method === "GET" && body && typeof body === "object") {
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        }
      }
      const resp = await fetch(url, opts);
      if (!resp.ok) {
        if (attempt < retries && (resp.status === 400 || resp.status === 429 || resp.status >= 500)) continue;
        console.log(`  [API ${apiCallCount}] ${method} ${path} → ❌ ${resp.status}`);
        return null;
      }
      return await resp.json();
    } catch (err) {
      if (attempt < retries) continue;
      console.log(`  [API ${apiCallCount}] ${method} ${path} → ❌ ${err.message}`);
      return null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════
// Phase 1: 搜索联想词扩展
// ═══════════════════════════════════════════
async function phase1(seedTopic) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 1: 搜索联想词扩展");
  console.log("=".repeat(60));

  const sugResult = await tikRequest("POST", "/api/v1/douyin/search/fetch_search_suggest", { keyword: seedTopic });
  const sugKeywords = (sugResult?.data?.sug_list || []).map(i => typeof i === "string" ? i : i?.content || "").filter(Boolean);
  console.log(`  搜索建议: ${sugKeywords.length} 个 → ${sugKeywords.join(", ")}`);
  await sleep(300);

  const chaResult = await tikRequest("POST", "/api/v1/douyin/search/fetch_challenge_suggest", { keyword: seedTopic });
  const chaKeywords = (chaResult?.data?.sug_list || []).map(i => typeof i === "string" ? i : i?.cha_name || i?.content || "").filter(Boolean);
  console.log(`  话题建议: ${chaKeywords.length} 个 → ${chaKeywords.join(", ")}`);
  await sleep(300);

  const hotResult = await tikRequest("GET", "/api/v1/douyin/app/v3/fetch_hot_search_list", { board_type: "0", board_sub_type: "" });
  const hotWords = (hotResult?.data?.data?.word_list || []).map(i => i?.word || "").filter(Boolean);
  console.log(`  热搜词: ${hotWords.length} 个`);
  const relatedHot = hotWords.filter(w => w.includes(seedTopic));
  if (relatedHot.length > 0) console.log(`  相关热搜: ${relatedHot.join(", ")}`);

  const allExpanded = [...new Set([seedTopic, ...sugKeywords, ...chaKeywords, ...relatedHot])];
  console.log(`  合并关键词池: ${allExpanded.length} 个`);
  const finalKeywords = allExpanded.slice(0, 6);
  console.log(`  最终搜索关键词: ${finalKeywords.join(", ")}`);

  return { finalKeywords, hotWords };
}

// ═══════════════════════════════════════════
// Phase 2: 大规模数据采集（串行）
// ═══════════════════════════════════════════
async function phase2(keywords) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 2: 大规模数据采集");
  console.log("=".repeat(60));

  const allContents = [];

  // 2.1 关键词搜索v2（串行，每个关键词2页）
  console.log("\n[2.1] 关键词搜索v2（串行）...");
  for (const kw of keywords) {
    let cursor = 0;
    for (let page = 0; page < 2; page++) {
      const result = await tikRequest("POST", "/api/v1/douyin/search/fetch_general_search_v2", {
        keyword: kw, cursor, sort_type: "0", publish_time: "7",
        filter_duration: "0", content_type: "0", search_id: "", backtrace: "",
      });
      if (result) {
        const bd = result?.data?.business_data || [];
        let count = 0;
        for (const card of bd) {
          const ai = card?.data?.aweme_info;
          if (!ai) continue;
          const s = ai.statistics || {};
          const a = ai.author || {};
          allContents.push({
            contentId: ai.aweme_id || "", title: ai.desc || "",
            viewCount: s.play_count || 0, likeCount: s.digg_count || 0,
            commentCount: s.comment_count || 0, shareCount: s.share_count || 0,
            collectCount: s.collect_count || 0,
            authorName: a.nickname || "", authorFollowerCount: a.follower_count || 0,
            createTime: ai.create_time || 0, source: "search_v2", searchKeyword: kw,
          });
          count++;
        }
        console.log(`  "${kw}" p${page}: ${count} 条`);
        const np = result?.data?.business_config?.next_page;
        if (result?.data?.business_config?.has_more && np?.cursor) cursor = np.cursor;
        else break;
      } else {
        console.log(`  "${kw}" p${page}: 失败`);
      }
      await sleep(600);
    }
  }

  // 2.2 v1搜索补充（前3个关键词）
  console.log("\n[2.2] v1搜索补充...");
  for (const kw of keywords.slice(0, 3)) {
    await sleep(500);
    const result = await tikRequest("POST", "/api/v1/douyin/search/fetch_general_search_v1", {
      keyword: kw, cursor: 0, sort_type: "0", publish_time: "7",
      filter_duration: "0", content_type: "0", search_id: "", backtrace: "",
    });
    if (result) {
      const bd = result?.data?.business_data || result?.data?.data || [];
      let count = 0;
      if (Array.isArray(bd)) {
        for (const card of bd) {
          const ai = card?.data?.aweme_info || card?.aweme_info || card;
          if (!ai?.aweme_id && !ai?.statistics) continue;
          const s = ai.statistics || {};
          const a = ai.author || {};
          allContents.push({
            contentId: ai.aweme_id || "", title: ai.desc || "",
            viewCount: s.play_count || 0, likeCount: s.digg_count || 0,
            commentCount: s.comment_count || 0, shareCount: s.share_count || 0,
            collectCount: s.collect_count || 0,
            authorName: a.nickname || "", authorFollowerCount: a.follower_count || 0,
            createTime: ai.create_time || 0, source: "search_v1", searchKeyword: kw,
          });
          count++;
        }
      }
      console.log(`  v1 "${kw}": ${count} 条`);
    }
  }

  // 2.3 低粉爆款榜
  console.log("\n[2.3] 低粉爆款榜...");
  await sleep(300);
  const lowFan = await tikRequest("POST", "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list", {});
  if (lowFan) {
    const objs = lowFan?.data?.data?.objs || [];
    for (const o of objs) {
      allContents.push({
        contentId: o.item_id || "", title: o.item_title || "",
        viewCount: o.play_cnt || 0, likeCount: o.like_cnt || 0,
        commentCount: 0, shareCount: 0, collectCount: 0,
        authorName: o.nick_name || "", authorFollowerCount: o.fans_cnt || 0,
        createTime: o.publish_time || 0, source: "low_fan_billboard", searchKeyword: "",
      });
    }
    console.log(`  低粉爆款: ${objs.length} 条`);
  }

  // 2.4 热搜榜词
  console.log("\n[2.4] 热搜榜...");
  await sleep(300);
  const hotSearch = await tikRequest("POST", "/api/v1/douyin/billboard/fetch_hot_total_search_list", {});
  const hotSearchWords = (hotSearch?.data?.data?.search_list || []).map(i => i?.key_word || "").filter(Boolean);
  console.log(`  热搜词: ${hotSearchWords.length} 个`);

  console.log(`\n[采集汇总] 总内容: ${allContents.length}, API调用: ${apiCallCount}`);
  return { allContents, hotSearchWords };
}

// ═══════════════════════════════════════════
// Phase 3: 数据清洗 + 筛选 + 统计
// ═══════════════════════════════════════════
function phase3(allContents, hotWords) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 3: 数据清洗 + 筛选 + 统计");
  console.log("=".repeat(60));

  const seen = new Set();
  const deduped = allContents.filter(i => { if (!i.contentId || seen.has(i.contentId)) return false; seen.add(i.contentId); return true; });
  console.log(`  去重: ${allContents.length} → ${deduped.length}`);

  const valid = deduped.filter(i => i.title && i.title.length > 2);
  console.log(`  有效: ${valid.length}`);

  const nowTs = Date.now() / 1000;
  const enriched = valid.map(item => {
    const like = item.likeCount || 0, comment = item.commentCount || 0;
    const share = item.shareCount || 0, collect = item.collectCount || 0;
    const view = item.viewCount || 0, followers = item.authorFollowerCount || 0;
    const ageHours = item.createTime > 0 ? Math.max(1, (nowTs - item.createTime) / 3600) : 168;
    const totalEng = like + comment + share + collect;
    const density = like > 0 ? (comment + share) / like : 0;
    const collectRate = like > 0 ? collect / like : 0;
    const shareRate = like > 0 ? share / like : 0;
    const viewFanRatio = (followers > 0 && view > 0) ? view / followers : 0;

    const isLowFanViral = item.source === "low_fan_billboard" || (followers > 0 && followers < 50000 && view > 500000);
    const isHighEng = density > 0.5 || collectRate > 0.1;
    const isHighShare = shareRate > 0.5;
    const isRapid = ageHours < 72 && totalEng > 50000;
    const isHotMatch = hotWords.some(hw => item.title.includes(hw));

    let score = 0;
    // 互动量 (0-25)
    if (totalEng > 200000) score += 25; else if (totalEng > 100000) score += 22;
    else if (totalEng > 50000) score += 18; else if (totalEng > 10000) score += 12;
    else if (totalEng > 5000) score += 8; else score += 3;
    // 互动密度 (0-20)
    if (density > 1.0) score += 20; else if (density > 0.5) score += 16;
    else if (density > 0.3) score += 12; else if (density > 0.1) score += 8; else score += 3;
    // 传播力 (0-20)
    if (shareRate > 2.0) score += 20; else if (shareRate > 1.0) score += 16;
    else if (shareRate > 0.5) score += 12; else if (shareRate > 0.2) score += 8; else score += 3;
    // 收藏价值 (0-15)
    if (collectRate > 0.3) score += 15; else if (collectRate > 0.15) score += 12;
    else if (collectRate > 0.08) score += 9; else if (collectRate > 0.03) score += 6; else score += 2;
    // 低粉爆款 (0-15)
    if (isLowFanViral) score += 15; else if (followers > 0 && followers < 100000) score += 8;
    // 热榜 (0-5)
    if (isHotMatch) score += 5;

    return { ...item, totalEng, density, collectRate, shareRate, viewFanRatio, ageHours,
      isLowFanViral, isHighEng, isHighShare, isRapid, isHotMatch,
      opportunityScore: Math.min(100, score) };
  });

  const signalPool = enriched.filter(i => i.totalEng > 3000 || i.isLowFanViral || i.isHighShare)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
  console.log(`  信号池: ${signalPool.length} 条`);

  const likes = enriched.map(c => c.likeCount).filter(v => v > 0).sort((a, b) => a - b);
  const engs = enriched.map(c => c.totalEng).filter(v => v > 0).sort((a, b) => a - b);
  const med = a => a.length ? a[Math.floor(a.length / 2)] : 0;
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const p90 = a => a.length ? a[Math.floor(a.length * 0.9)] : 0;

  const report = {
    totalCount: enriched.length, avgLike: Math.round(avg(likes)), medianLike: Math.round(med(likes)),
    p90Like: Math.round(p90(likes)), avgEng: Math.round(avg(engs)), medianEng: Math.round(med(engs)),
    lowFanViral: enriched.filter(c => c.isLowFanViral).length,
    highEng: enriched.filter(c => c.isHighEng).length,
    highShare: enriched.filter(c => c.isHighShare).length,
    rapid: enriched.filter(c => c.isRapid).length,
    hotMatch: enriched.filter(c => c.isHotMatch).length,
    signalSize: signalPool.length,
    signalAvgScore: signalPool.length ? Number(avg(signalPool.map(s => s.opportunityScore)).toFixed(1)) : 0,
    signalTopScore: signalPool.length ? signalPool[0].opportunityScore : 0,
  };
  console.log("\n[统计报告]", JSON.stringify(report, null, 2));

  console.log("\n[Top 15 信号]");
  const fmt = n => n >= 10000 ? (n / 10000).toFixed(1) + "万" : String(n);
  signalPool.slice(0, 15).forEach((i, idx) => {
    const tags = [i.isLowFanViral && "低粉爆款", i.isHighEng && "高互动", i.isHighShare && "高传播", i.isRapid && "快速增长", i.isHotMatch && "热榜"].filter(Boolean);
    console.log(`  ${idx + 1}. [${i.opportunityScore}分] "${i.title.substring(0, 50)}"`);
    console.log(`     赞:${fmt(i.likeCount)} 评:${fmt(i.commentCount)} 转:${fmt(i.shareCount)} 藏:${fmt(i.collectCount)} | 密度:${i.density.toFixed(2)} 分享率:${i.shareRate.toFixed(2)} | ${i.authorName} [${tags.join(",")}]`);
  });

  return { enriched, signalPool, report };
}

// ═══════════════════════════════════════════
async function main() {
  console.log("🚀 新架构验证 — 种子词:", SEED_TOPIC, "时间:", new Date().toISOString());

  const { finalKeywords, hotWords } = await phase1(SEED_TOPIC);
  const { allContents, hotSearchWords } = await phase2(finalKeywords);
  const { enriched, signalPool, report } = phase3(allContents, hotWords);

  const output = {
    seedTopic: SEED_TOPIC, timestamp: new Date().toISOString(), apiCallCount,
    keywords: finalKeywords, report, hotSearchWords,
    signalPool: signalPool.slice(0, 20).map(s => ({
      contentId: s.contentId, title: s.title, viewCount: s.viewCount,
      likeCount: s.likeCount, commentCount: s.commentCount,
      shareCount: s.shareCount, collectCount: s.collectCount,
      authorName: s.authorName, authorFollowerCount: s.authorFollowerCount,
      totalEng: s.totalEng, density: s.density, shareRate: s.shareRate,
      collectRate: s.collectRate, opportunityScore: s.opportunityScore,
      tags: [s.isLowFanViral && "低粉爆款", s.isHighEng && "高互动", s.isHighShare && "高传播", s.isRapid && "快速增长", s.isHotMatch && "热榜"].filter(Boolean),
      source: s.source, searchKeyword: s.searchKeyword,
    })),
  };

  const fs = await import("fs");
  fs.writeFileSync("/home/ubuntu/verify-pipeline-result.json", JSON.stringify(output, null, 2));
  console.log(`\n✅ 完成! API:${apiCallCount}次 内容:${enriched.length}条 信号:${signalPool.length}条`);
}

main().catch(err => { console.error("❌", err.message, err.stack); process.exit(1); });
