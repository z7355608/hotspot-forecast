export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // 阿波罗平台 Gemini 3.1 Pro
  thirdPartyLlmBaseUrl: process.env.THIRD_PARTY_LLM_BASE_URL ?? "",
  thirdPartyLlmApiKey: process.env.THIRD_PARTY_LLM_API_KEY ?? "",
  // 飞书第三方应用
  feishuAppId: process.env.FEISHU_APP_ID ?? "",
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? "",
};
