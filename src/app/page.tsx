import { dbConfigured, effectiveKeyRole, ACHARYA_SLUG } from "@/lib/server/supabase";

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "48px auto", padding: 24, lineHeight: 1.5 }}>
      <h1>Vajra Acharya Telegram Agent</h1>
      <p>This standalone app receives Telegram webhook updates and writes to the same Supabase data used by the main Vajra Acharya app.</p>
      <dl>
        <dt>Webhook</dt>
        <dd><code>/api/telegram/webhook</code></dd>
        <dt>Supabase configured</dt>
        <dd><code>{String(dbConfigured)}</code></dd>
        <dt>Supabase key role</dt>
        <dd><code>{effectiveKeyRole || "unknown"}</code></dd>
        <dt>Acharya slug</dt>
        <dd><code>{ACHARYA_SLUG}</code></dd>
      </dl>
    </main>
  );
}
