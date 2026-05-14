import "server-only";
import path from "node:path";
import { after } from "next/server";
import { writeLine } from "./logger";
import { dbGunakul, dbConfigured, getAcharyaId } from "./supabase";

/**
 * AI / TTS call tracker. Emits one JSON line per call to
 * `logs/ai/calls.jsonl`. Each line carries tokens, duration, and a computed
 * USD cost estimate. Dashboard at /admin/usage consumes this file.
 *
 * Prices below are USD per 1M tokens (or per 1M chars for TTS) and reflect
 * published rates at the time of writing. Update these if Anthropic or
 * Google change pricing — ESTIMATES ONLY, use the provider's billing page
 * for ground truth.
 */

export interface AICallLog {
  ts: string;
  service: "chat" | "quiz" | "tts";
  model: string;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  // Token counts (undefined for tts)
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  // Character count for tts
  chars?: number;
  // Context
  lang?: string;
  moduleId?: string;
  hasImage?: boolean;
  // Computed
  costUsd: number;
  // Optional error message
  errorMessage?: string;
}

// ------------------------------------------------------------
// Pricing (USD per 1M tokens / 1M chars). Update as needed.
// ------------------------------------------------------------
const PRICE: Record<
  string,
  { input?: number; output?: number; cachedInput?: number; perMChar?: number }
> = {
  // Claude Sonnet 4 — listed as "claude-4-sonnet-20250514"
  "claude-4-sonnet-20250514": { input: 3.0,  output: 15.0, cachedInput: 0.30 },
  // Claude Haiku 4.5 — listed as "claude-haiku-4-5-20251001"
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0, cachedInput: 0.08 },
  // Google Cloud TTS (Chirp3-HD voices) — ~$16 per 1M chars
  "google-tts-chirp3-hd": { perMChar: 16.0 },
};

function priceOf(model: string) {
  return PRICE[model] || { input: 3.0, output: 15.0, cachedInput: 0.3 };
}

export function computeLlmCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = priceOf(model);
  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
  const inCost     = ((p.input ?? 0)       * uncachedInput    ) / 1_000_000;
  const outCost    = ((p.output ?? 0)      * outputTokens     ) / 1_000_000;
  const cacheCost  = ((p.cachedInput ?? 0) * cachedInputTokens) / 1_000_000;
  return inCost + outCost + cacheCost;
}

export function computeTtsCost(model: string, chars: number): number {
  const p = priceOf(model);
  return ((p.perMChar ?? 0) * chars) / 1_000_000;
}

const LOG_FILE = path.join(process.cwd(), "logs", "ai", "calls.jsonl");

function writeEntry(entry: AICallLog) {
  // 1. File mirror — dev only; silently no-ops on Vercel's read-only fs.
  writeLine(LOG_FILE, JSON.stringify(entry));

  // 2. Console mirror — Vercel captures this in its request logs.
  console.log(`[ai] ${entry.service} ${entry.model} ${entry.status} ${entry.durationMs}ms $${entry.costUsd.toFixed(4)}`);

  // 3. Supabase persistence — primary prod store, also works in dev.
  //    Scheduled via Next.js `after()` so the insert runs after the response
  //    is sent (zero added latency to the API call).
  if (dbConfigured) {
    // Build the row once. module_id is intentionally NULL on gurukul.ai_usage
    // (FK → gurukul.modules uuid), but we keep the slug in entry for the file
    // mirror. Resolving slug→uuid per call adds a round-trip we don't need for
    // pilot-scale cost/usage analytics — per-module breakdown can come from
    // chat_logs/apply_logs/quiz_attempts which already carry a real FK.
    const buildRow = async () => ({
      ts: entry.ts,
      service: entry.service,
      model: entry.model,
      status: entry.status,
      duration_ms: entry.durationMs,
      input_tokens: entry.inputTokens ?? null,
      output_tokens: entry.outputTokens ?? null,
      cached_input_tokens: entry.cachedInputTokens ?? null,
      chars: entry.chars ?? null,
      lang: entry.lang ?? null,
      acharya_id: await getAcharyaId(),
      has_image: !!entry.hasImage,
      cost_usd: entry.costUsd,
      error_message: entry.errorMessage ?? null,
    });

    try {
      after(async () => {
        try {
          const row = await buildRow();
          await dbGunakul.from("log_ai_usage").insert(row);
        } catch (err) {
          console.error("[ai-logger] supabase insert failed:", err);
        }
      });
    } catch {
      // `after()` only works inside a request scope — fall back to fire-and-forget.
      buildRow()
        .then((row) => dbGunakul.from("log_ai_usage").insert(row))
        .then((r) => {
          const e = (r && "error" in r) ? r.error : null;
          if (e) console.error("[ai-logger] supabase insert failed:", e.message);
        })
        .catch((err) => console.error("[ai-logger] supabase insert threw:", err));
    }
  }
}

export function logChatCall(opts: {
  model: string;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  lang?: string;
  moduleId?: string;
  hasImage?: boolean;
  errorMessage?: string;
}) {
  const inputTokens  = opts.usage?.inputTokens  || 0;
  const outputTokens = opts.usage?.outputTokens || 0;
  const cachedInputTokens = opts.usage?.cachedInputTokens || 0;
  const costUsd = opts.status === "ok"
    ? computeLlmCost(opts.model, inputTokens, outputTokens, cachedInputTokens)
    : 0;
  writeEntry({
    ts: new Date().toISOString(),
    service: "chat",
    model: opts.model,
    status: opts.status,
    durationMs: opts.durationMs,
    inputTokens, outputTokens, cachedInputTokens,
    lang: opts.lang,
    moduleId: opts.moduleId,
    hasImage: opts.hasImage,
    costUsd,
    errorMessage: opts.errorMessage,
  });
}

export function logQuizCall(opts: {
  model: string;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  lang?: string;
  moduleId?: string;
  errorMessage?: string;
}) {
  const inputTokens  = opts.usage?.inputTokens  || 0;
  const outputTokens = opts.usage?.outputTokens || 0;
  const cachedInputTokens = opts.usage?.cachedInputTokens || 0;
  const costUsd = opts.status === "ok"
    ? computeLlmCost(opts.model, inputTokens, outputTokens, cachedInputTokens)
    : 0;
  writeEntry({
    ts: new Date().toISOString(),
    service: "quiz",
    model: opts.model,
    status: opts.status,
    durationMs: opts.durationMs,
    inputTokens, outputTokens, cachedInputTokens,
    lang: opts.lang,
    moduleId: opts.moduleId,
    costUsd,
    errorMessage: opts.errorMessage,
  });
}

export function logTtsCall(opts: {
  model: string;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  chars: number;
  lang?: string;
  errorMessage?: string;
}) {
  const costUsd = opts.status === "ok" ? computeTtsCost(opts.model, opts.chars) : 0;
  writeEntry({
    ts: new Date().toISOString(),
    service: "tts",
    model: opts.model,
    status: opts.status,
    durationMs: opts.durationMs,
    chars: opts.chars,
    lang: opts.lang,
    costUsd,
    errorMessage: opts.errorMessage,
  });
}

export { LOG_FILE as AI_LOG_FILE };


