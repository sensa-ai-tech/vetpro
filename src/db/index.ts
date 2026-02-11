import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

function findDbPath(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace("file:", "");
  }

  const candidates = [
    path.join(process.cwd(), "vetpro.db"),
    path.join(__dirname, "vetpro.db"),
    path.join(__dirname, "../vetpro.db"),
    path.join(__dirname, "../../vetpro.db"),
    path.join(__dirname, "../../../vetpro.db"),
    "/var/task/vetpro.db",
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return candidates[0];
}

const DB_PATH = findDbPath();

// Serverless runtime 的 filesystem 是唯讀的
// 先嘗試正常模式，失敗則用 readonly
let sqlite: InstanceType<typeof Database>;
try {
  sqlite = new Database(DB_PATH);
} catch {
  sqlite = new Database(DB_PATH, { readonly: true });
}
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

export { db, sqlite };
