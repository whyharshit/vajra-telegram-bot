import "server-only";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof createClient<any, any, any>>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const effectiveKey = serviceKey || anonKey;

const authOpts = { persistSession: false, autoRefreshToken: false } as const;
const platformSchema = process.env.NEXT_PUBLIC_PLATFORM_SCHEMA || "public";
const acharyaSchema = process.env.NEXT_PUBLIC_ACHARYA_SCHEMA || "public";

/**
 * Gunakul schema — identity, masters, logs.
 * Used for auth (mst_users), telemetry writes (log_chat, log_ai_usage, etc.),
 * and the acharya registry (mst_acharyas).
 */
export const dbGunakul: DB = url && effectiveKey
  ? createClient(url, effectiveKey, { auth: authOpts, db: { schema: platformSchema } })
  : createClient("https://placeholder.supabase.co", "placeholder", {
      auth: authOpts, db: { schema: platformSchema },
    });

/**
 * Per-Acharya content schema — driven by NEXT_PUBLIC_ACHARYA_SCHEMA env var.
 * Each Acharya deploy sets this to its own schema (e.g. "acharya_vajra_acharya").
 * Used for reading crs_modules, crs_sections, crs_videos, mst_config.
 */
export const dbAcharya: DB = url && effectiveKey
  ? createClient(url, effectiveKey, { auth: authOpts, db: { schema: acharyaSchema } })
  : createClient("https://placeholder.supabase.co", "placeholder", {
      auth: authOpts, db: { schema: acharyaSchema },
    });

// Legacy alias — some imports still reference `db`. Points at gunakul.
export const db = dbGunakul;

export const dbConfigured = !!url && !!effectiveKey
  && url !== "placeholder"
  && effectiveKey !== "placeholder";

export const ACHARYA_SLUG = process.env.NEXT_PUBLIC_ACHARYA_SLUG || "vajra";

// ---------------------------------------------------------------------------
// Acharya id cache
// ---------------------------------------------------------------------------
let cachedAcharyaId: string | null = null;
let acharyaIdPromise: Promise<string | null> | null = null;

export async function getAcharyaId(): Promise<string | null> {
  if (platformSchema === "public") return null;
  if (cachedAcharyaId) return cachedAcharyaId;
  if (acharyaIdPromise) return acharyaIdPromise;
  if (!dbConfigured) return null;
  acharyaIdPromise = (async () => {
    try {
      const { data, error } = await dbGunakul
        .from("mst_acharyas")
        .select("id")
        .eq("slug", ACHARYA_SLUG)
        .eq("is_deleted", false)
        .maybeSingle();
      if (error || !data) {
        console.error("[gunakul] acharya lookup failed:", error);
        return null;
      }
      cachedAcharyaId = data.id as string;
      return cachedAcharyaId;
    } catch (err) {
      console.error("[gunakul] acharya lookup threw:", err);
      return null;
    } finally {
      acharyaIdPromise = null;
    }
  })();
  return acharyaIdPromise;
}

// ---------------------------------------------------------------------------
// Key-role inspection
// ---------------------------------------------------------------------------
function roleOf(key: string): string | null {
  if (!key) return null;
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("eyJ")) {
    try {
      const payload = key.split(".")[1];
      if (!payload) return null;
      const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      return typeof json.role === "string" ? json.role : null;
    } catch {
      return null;
    }
  }
  return null;
}

export const effectiveKeyRole = effectiveKey ? roleOf(effectiveKey) : null;
export const usingServiceRole = effectiveKeyRole === "service_role";

if (dbConfigured) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (usingServiceRole) {
    console.log(`[acharya] service_role active (${host}), schemas=${platformSchema}+${acharyaSchema}, acharya=${ACHARYA_SLUG}`);
  } else {
    console.warn(
      `\n[acharya] Not using service_role (${host}). anon grants required on ${platformSchema} + ${acharyaSchema}.`
    );
  }
}


