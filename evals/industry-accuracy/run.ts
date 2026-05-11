import "dotenv/config";
import {
  DEFAULT_INDUSTRY_TRACKS,
  generateIndustryAccuracyDetailReport,
  generateIndustryAccuracyReport,
  readIndustryAccuracyBatches,
  resumeIndustryAccuracyBatchTracks,
  runDueIndustryAccuracyChecks,
  startIndustryAccuracyBatch,
} from "../../server/services/industry-accuracy-eval.js";
import type { SupportedPlatform } from "../../server/legacy/types.js";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parsePlatforms(value: string | undefined): SupportedPlatform[] | undefined {
  const items = parseList(value);
  if (!items) return undefined;
  const platforms = items.filter((item): item is SupportedPlatform =>
    item === "douyin" || item === "xiaohongshu" || item === "kuaishou",
  );
  return platforms.length ? platforms : undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main(): Promise<void> {
  const shouldStart = hasFlag("--start");
  const shouldResumeIncomplete = hasFlag("--resume-incomplete") || hasFlag("--fill-missing");
  const shouldCheckDue = hasFlag("--check-due");
  const shouldForceCheck = hasFlag("--force-check");
  const shouldRecheckDone = hasFlag("--recheck-done");
  const shouldIncludeDataInsufficient = hasFlag("--include-data-insufficient");
  const shouldIncludeCompleted = hasFlag("--include-completed");
  const shouldReport = hasFlag("--report");
  const shouldDetailReport = hasFlag("--detail-report") || hasFlag("--detail");
  const shouldList = hasFlag("--list");
  const batchId = getArgValue("--batch");
  const maxCheckpoints = parsePositiveInt(getArgValue("--max-checkpoints")) ?? parsePositiveInt(getArgValue("--max"));

  if (shouldStart) {
    const tracks = parseList(getArgValue("--tracks")) ?? [...DEFAULT_INDUSTRY_TRACKS];
    const platforms = parsePlatforms(getArgValue("--platforms")) ?? ["douyin"];
    const batch = await startIndustryAccuracyBatch({
      batchId,
      tracks,
      platforms,
    });
    console.log(JSON.stringify({
      batchId: batch.batchId,
      tracks: batch.tracks.length,
      topics: batch.summary?.totalTopics ?? 0,
      checkpointHours: batch.checkpointHours,
      platforms: batch.platforms,
      store: "data/industry-accuracy-eval.json",
    }, null, 2));
  }

  if (shouldResumeIncomplete) {
    const result = await resumeIndustryAccuracyBatchTracks({
      batchId,
      tracks: parseList(getArgValue("--tracks")),
      includeDataInsufficient: shouldIncludeDataInsufficient,
      includeCompleted: shouldIncludeCompleted,
    });
    if (!result) {
      console.log("没有可恢复的行业词验证批次。");
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }

  if (shouldCheckDue || shouldForceCheck) {
    const result = await runDueIndustryAccuracyChecks({
      batchId,
      force: shouldForceCheck,
      recheckDone: shouldRecheckDone,
      maxCheckpoints,
    });
    console.log(JSON.stringify(result, null, 2));
  }

  if (shouldReport) {
    const report = await generateIndustryAccuracyReport(batchId);
    if (!report) {
      console.log("没有可生成报告的行业词验证批次。");
    } else {
      console.log(JSON.stringify({
        batchId: report.batch.batchId,
        jsonPath: report.jsonPath,
        markdownPath: report.markdownPath,
        summary: report.batch.summary,
      }, null, 2));
    }
  }

  if (shouldDetailReport) {
    const report = await generateIndustryAccuracyDetailReport(batchId);
    if (!report) {
      console.log("没有可生成深度报告的行业词验证批次。");
    } else {
      console.log(JSON.stringify({
        batchId: report.detail.batchId,
        jsonPath: report.jsonPath,
        markdownPath: report.markdownPath,
        csvPath: report.csvPath,
        summary: report.detail.summary,
      }, null, 2));
    }
  }

  if (shouldList) {
    const batches = await readIndustryAccuracyBatches();
    console.log(JSON.stringify(batches.map((batch) => ({
      batchId: batch.batchId,
      status: batch.status,
      createdAt: batch.createdAt,
      tracks: batch.tracks.length,
      dataInsufficientTracks: batch.summary?.dataInsufficientTracks ?? 0,
      topics: batch.summary?.totalTopics ?? 0,
      evaluatedCheckpoints: batch.summary?.evaluatedCheckpoints ?? 0,
      accuracyRate: batch.summary?.accuracyRate ?? 0,
    })), null, 2));
  }

  if (!shouldStart && !shouldResumeIncomplete && !shouldCheckDue && !shouldForceCheck && !shouldRecheckDone && !shouldReport && !shouldDetailReport && !shouldList) {
    console.log([
      "用法:",
      "  pnpm eval:industry:start",
      "  pnpm eval:industry:fill",
      "  pnpm eval:industry:check",
      "  pnpm eval:industry:report",
      "  pnpm eval:industry:detail",
      "",
      "可选参数:",
      "  --tracks=ai工具,健身减脂",
      "  --platforms=douyin,xiaohongshu,kuaishou",
      "  --batch=<batchId>",
      "  --max-checkpoints=100",
      "  --force-check",
      "  --recheck-done",
      "  --include-data-insufficient",
      "  --include-completed",
      "  --detail-report",
    ].join("\n"));
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
