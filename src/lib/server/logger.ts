import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Lightweight structured logger.
 *
 * Writes JSON lines to logs/app.log (in dev; filesystem is read-only on
 * Vercel so writes silently no-op there). Always mirrors to console so
 * Vercel's request logs still get everything.
 */

type Level = "info" | "warn" | "error";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

let fsWritable = true;
function ensureDir(dir: string) {
  if (!fsWritable) return;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    fsWritable = false;
  }
}

export function writeLine(file: string, line: string) {
  if (!fsWritable) return;
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, line + "\n", "utf8");
  } catch {
    // Silently disable further writes if the environment is read-only.
    fsWritable = false;
  }
}

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {}),
  };
  const line = JSON.stringify(entry);
  // Always mirror to console (captured by Vercel / pm2 / etc.)
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  // Best-effort file write (dev only on Vercel)
  writeLine(LOG_FILE, line);
}

export const log = {
  info:  (event: string, data?: Record<string, unknown>) => emit("info",  event, data),
  warn:  (event: string, data?: Record<string, unknown>) => emit("warn",  event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};


