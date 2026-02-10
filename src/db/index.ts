import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

function findDbPath(): string {
  // 1. 環境變數指定
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace("file:", "");
  }

  // 2. 嘗試 cwd（本機開發 + Vercel build）
  const cwdPath = path.join(process.cwd(), "vetpro.db");
  if (fs.existsSync(cwdPath)) return cwdPath;

  // 3. Vercel serverless: DB 在 .next/server 旁
  // outputFileTracingIncludes 會把 DB 複製到 function bundle
  const dirnamePath = path.join(__dirname, "../../vetpro.db");
  if (fs.existsSync(dirnamePath)) return dirnamePath;

  const dirnamePath2 = path.join(__dirname, "../../../vetpro.db");
  if (fs.existsSync(dirnamePath2)) return dirnamePath2;

  // 4. Fallback
  return cwdPath;
}

const DB_PATH = findDbPath();

const sqlite = new Database(DB_PATH, { readonly: process.env.VERCEL ? true : false });
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
