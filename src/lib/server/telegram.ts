import "server-only";

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const apiBase = token ? `https://api.telegram.org/bot${token}` : "";

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface ReplyMarkup {
  inline_keyboard?: InlineKeyboardButton[][];
  keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  remove_keyboard?: boolean;
}

async function telegram(method: string, body: Record<string, unknown>) {
  if (!apiBase) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const res = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(`[telegram] ${method} failed:`, raw.slice(0, 500));
    throw new Error(`Telegram ${method} failed`);
  }
  return raw ? JSON.parse(raw) as unknown : null;
}

export async function sendMessage(chatId: number, text: string, replyMarkup?: ReplyMarkup) {
  const chunks = chunkText(text || "", 3900);
  for (let i = 0; i < chunks.length; i++) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      reply_markup: i === chunks.length - 1 ? replyMarkup : undefined,
    });
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function getPhotoAsDataUrl(fileId: string): Promise<string | null> {
  if (!apiBase || !token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const fileRes = await telegram("getFile", { file_id: fileId }) as { result?: { file_path?: string } } | null;
  const filePath = fileRes?.result?.file_path;
  if (!filePath) return null;
  const mediaRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!mediaRes.ok) return null;
  const contentType = mediaRes.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await mediaRes.arrayBuffer());
  if (bytes.byteLength > 4 * 1024 * 1024) return null;
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text || " "];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let idx = remaining.lastIndexOf("\n", max);
    if (idx < max * 0.5) idx = remaining.lastIndexOf(" ", max);
    if (idx < max * 0.5) idx = max;
    chunks.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
