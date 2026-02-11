import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是 native module，需要 external 處理
  serverExternalPackages: ["better-sqlite3"],

  // 確保 DB 檔案被 Vercel 打包進所有 serverless function
  outputFileTracingIncludes: {
    "/*": ["./vetpro.db"],
  },
};

export default nextConfig;
