import fs from "node:fs";
import path from "node:path";

function readRequiredSecret(name: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.length > 0) return value;
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env");
  const envExists = fs.existsSync(envPath);
  throw new Error(
    `[env] Missing required ${name}. cwd=${cwd}, .env exists=${envExists}. ` +
      `Set ${name} in .env (see .env.example) and restart the dev server. ` +
      `Note: dotenv only loads at process start — if you just edited .env, restart pnpm dev.`,
  );
}

export const ENV = {
  appId: process.env.APP_ID ?? process.env.VITE_APP_ID ?? "hotspot-forecast",
  cookieSecret: readRequiredSecret("JWT_SECRET"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // 阿波罗平台（ablai.top）—— 通用 third-party LLM 通道
  thirdPartyLlmBaseUrl: process.env.THIRD_PARTY_LLM_BASE_URL ?? "",
  thirdPartyLlmApiKey: process.env.THIRD_PARTY_LLM_API_KEY ?? "",
  // 阿波罗图片生成通道。默认复用 THIRD_PARTY_LLM_*，允许单独切分图片分组 key。
  thirdPartyImageBaseUrl:
    process.env.APOLLO_IMAGE_BASE_URL ??
    process.env.THIRD_PARTY_IMAGE_BASE_URL ??
    process.env.THIRD_PARTY_LLM_BASE_URL ??
    "",
  thirdPartyImageApiKey:
    process.env.APOLLO_IMAGE_API_KEY ??
    process.env.THIRD_PARTY_IMAGE_API_KEY ??
    process.env.THIRD_PARTY_LLM_API_KEY ??
    "",
  // 阿波罗平台「视频理解专用分组」key（独立分组、不与文本通道争抢容量）
  // apollo modelId（gemini-3.1-pro-preview）优先用此 key，缺失时 fallback 到通用 thirdPartyLlmApiKey。
  thirdPartyLlmVideoApiKey: process.env.THIRD_PARTY_LLM_VIDEO_API_KEY ?? "",
  // 飞书第三方应用
  feishuAppId: process.env.FEISHU_APP_ID ?? "",
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? "",
  /**
   * 灯灰度开关：是否对「分析类」LLM 动作（深度拆解 / 爆款预测等）真实扣减积分。
   * 默认 false（保持当前免费状态），交由业务侧决定何时开启正式计费。
   *
   * 即便此开关为 false，前端仍会展示积分余额、积分消耗预告等可视化元素，
   * 让用户感知"积分体系存在"，建立付费心智；只有真扣减由这个开关控制。
   */
  creditDeductionEnabled: process.env.CREDIT_DEDUCTION_ENABLED === "true",
  /**
   * 旁路内容注入器(content augmenter)开关。
   *
   * - `xAugmenterEnabled` = true  → 启动期动态 import X 平台 AI 科技博主推文 augmenter。
   *   默认 false,完全不 import,0 副作用。详见 docs/decisions/0005-x-augmenter-bootstrap.md。
   * - `xAugmenterTechHandles` = "elonmusk,sama,karpathy" → augmenter 拉取的预设 X handles。
   *   留空则 augmenter 即便注册也不出数据。
   * - `augmenterTimeoutMs` = augmenter 单次执行超时,默认 5000ms。
   */
  xAugmenterEnabled: process.env.X_AUGMENTER_ENABLED === "true",
  xAugmenterTechHandles: process.env.X_AUGMENTER_TECH_HANDLES ?? "",
  augmenterTimeoutMs: Number(process.env.AUGMENTER_TIMEOUT_MS) || 5_000,
};
