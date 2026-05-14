import { NextRequest, NextResponse } from "next/server";
import { dbAcharya, dbConfigured, dbGunakul } from "@/lib/server/supabase";
import { normalizeIndianPhone } from "@/lib/phone";
import { evaluateApply, fallbackQuizQuestions, generateChatReply, generateQuizQuestions, type QuizQuestion } from "@/lib/server/gemini";
import { answerCallbackQuery, getPhotoAsDataUrl, sendMessage, type ReplyMarkup } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const preferredRegion = "bom1";
export const maxDuration = 60;

type Lang = "bn" | "hi" | "en";

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  contact?: { phone_number?: string; user_id?: number };
  photo?: Array<{ file_id: string; file_size?: number }>;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { chat: { id: number } };
  data?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramAccount {
  id: string;
  learner_id: string | null;
  telegram_user_id: number;
  telegram_chat_id: number;
  username: string | null;
  first_name: string | null;
  preferred_lang: Lang;
  selected_module_id: string;
  mode: "ask" | "apply";
  state: Record<string, unknown>;
}

interface ModuleRow {
  id: string;
  title_bn: string;
  title_hi: string;
  title_en: string;
  sort_order: number;
}

interface SectionRow {
  id: string;
  module_id: string;
  title_bn: string;
  title_hi: string;
  title_en: string;
  sort_order: number;
  body_bn?: string | null;
  body_hi?: string | null;
  body_en?: string | null;
}

interface QuizState {
  type: "quiz";
  moduleId: string;
  questions: QuizQuestion[];
  index: number;
  score: number;
  answers: number[];
}

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (configuredSecret) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!dbConfigured) return NextResponse.json({ ok: true });

  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  try {
    if (update?.callback_query) await handleCallback(update.callback_query);
    else if (update?.message) await handleMessage(update.message);
  } catch (err) {
    console.error("[telegram] webhook error:", err);
    const chatId = update?.message?.chat.id || update?.callback_query?.message?.chat.id;
    if (chatId) {
      const detail = process.env.NODE_ENV === "development" && err instanceof Error
        ? `\n\nDev detail: ${err.message.slice(0, 500)}`
        : "";
      await sendMessage(chatId, `Something went wrong. Please try again.${detail}`);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}

async function handleMessage(message: TelegramMessage) {
  const from = message.from;
  if (!from) return;
  const chatId = message.chat.id;
  const account = await getOrCreateAccount(from, chatId);
  const text = (message.text || message.caption || "").trim();

  if (message.contact?.phone_number) {
    await linkContact(account, message);
    return;
  }

  if (!account.learner_id) {
    const typedPhone = normalizeIndianPhone(text);
    if (typedPhone) {
      await linkPhone(account, chatId, typedPhone);
      return;
    }
    await requestPhone(chatId);
    return;
  }

  if (text === "/start" || text === "Home") {
    await sendHome(chatId, account);
    return;
  }
  if (text === "/help") {
    await sendHelp(chatId);
    return;
  }
  if (text === "/courses" || text === "Learn Modules") {
    await sendCourses(chatId, account.preferred_lang, 1);
    return;
  }
  if (text === "/ask" || text === "Ask Vajra Acharya") {
    await setAccountMode(account.id, "ask");
    await sendMessage(chatId, "Ask mode is on. Send your electrical question now.", persistentMainMenu());
    return;
  }
  if (text === "/apply" || text === "Field Apply") {
    await setAccountMode(account.id, "apply");
    await sendMessage(chatId, "Apply mode is on. Send what you did in the field today. You can send text, a photo with caption, or both.", persistentMainMenu());
    return;
  }
  if (text === "/quiz" || text === "Quiz") {
    await sendModulePicker(chatId, "quiz", account.preferred_lang, 1);
    return;
  }
  if (text === "/progress" || text === "My Progress") {
    await sendProgress(chatId, account);
    return;
  }
  if (text === "/lang") {
    await sendLanguagePicker(chatId);
    return;
  }
  if (text === "Videos" || text === "Tools" || text === "Farm Tools") {
    await sendMessage(chatId, "This feature is coming soon!", persistentMainMenu());
    return;
  }

  if (isQuizState(account.state)) {
    await sendMessage(chatId, "Finish the current quiz using the option buttons, or send /quiz to start again.");
    return;
  }

  if (account.mode === "apply") {
    await handleApplyMessage(chatId, account, message);
    return;
  }

  if (!text) {
    await sendMessage(chatId, "Send a question, or use /courses, /quiz, /apply.");
    return;
  }
  await handleAskMessage(chatId, account, text);
}

async function handleCallback(query: TelegramCallbackQuery) {
  const chatId = query.message?.chat.id;
  const data = query.data || "";
  if (!chatId) return;
  await answerCallbackQuery(query.id);
  const account = await getOrCreateAccount(query.from, chatId);

  if (!account.learner_id && !data.startsWith("lang:")) {
    await requestPhone(chatId);
    return;
  }

  if (data.startsWith("lang:")) {
    const lang = data.slice(5) as Lang;
    if (!["bn", "hi", "en"].includes(lang)) return;
    await dbGunakul.from("telegram_accounts").update({ preferred_lang: lang, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (account.learner_id) await dbGunakul.from("learners").update({ preferred_lang: lang }).eq("id", account.learner_id);
    await sendMessage(chatId, `Language set to ${lang.toUpperCase()}.`, mainMenu());
    return;
  }

  if (data === "courses") {
    await sendCourses(chatId, account.preferred_lang, 1);
    return;
  }
  if (data === "ask") {
    await setAccountMode(account.id, "ask");
    await sendMessage(chatId, "Ask mode is on. Send your electrical question now.", persistentMainMenu());
    return;
  }
  if (data === "apply") {
    await setAccountMode(account.id, "apply");
    await sendMessage(chatId, "Apply mode is on. Send what you did in the field today. You can send text, a photo with caption, or both.", persistentMainMenu());
    return;
  }
  if (data === "quiz") {
    await sendModulePicker(chatId, "quiz", account.preferred_lang, 1);
    return;
  }
  if (data === "progress") {
    await sendProgress(chatId, account);
    return;
  }
  if (data === "lang") {
    await sendLanguagePicker(chatId);
    return;
  }
  if (data.startsWith("modpage:")) {
    const page = parseInt(data.slice(8), 10);
    await sendCourses(chatId, account.preferred_lang, page, query.message?.message_id);
    return;
  }
  if (data.startsWith("quizpage:")) {
    const page = parseInt(data.slice(9), 10);
    await sendModulePicker(chatId, "quiz", account.preferred_lang, page, query.message?.message_id);
    return;
  }
  if (data.startsWith("mod:")) {
    const moduleId = data.slice(4);
    await dbGunakul.from("telegram_accounts").update({ selected_module_id: moduleId, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendSections(chatId, moduleId, account.preferred_lang);
    return;
  }
  if (data.startsWith("section:")) {
    await sendSection(chatId, data.slice(8), account.preferred_lang);
    return;
  }
  if (data.startsWith("done:")) {
    const [, moduleId, sectionId] = data.split(":");
    await markSectionComplete(account, moduleId, sectionId);
    await sendMessage(chatId, "Marked complete.", persistentMainMenu());
    return;
  }
  if (data.startsWith("quizmod:")) {
    await startQuiz(chatId, account, data.slice(8));
    return;
  }
  if (data.startsWith("ans:")) {
    await handleQuizAnswer(chatId, account, Number(data.slice(4)));
  }
}

async function getOrCreateAccount(user: TelegramUser, chatId: number): Promise<TelegramAccount> {
  const { data: existing, error: existingError } = await dbGunakul
    .from("telegram_accounts")
    .select("*")
    .eq("telegram_user_id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return normalizeAccount(existing as Record<string, unknown>);

  const { data, error } = await dbGunakul
    .from("telegram_accounts")
    .insert({
      telegram_user_id: user.id,
      telegram_chat_id: chatId,
      username: user.username || null,
      first_name: user.first_name || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return normalizeAccount(data as Record<string, unknown>);
}

function normalizeAccount(row: Record<string, unknown>): TelegramAccount {
  return {
    id: String(row.id),
    learner_id: typeof row.learner_id === "string" ? row.learner_id : null,
    telegram_user_id: Number(row.telegram_user_id),
    telegram_chat_id: Number(row.telegram_chat_id),
    username: typeof row.username === "string" ? row.username : null,
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    preferred_lang: isLang(row.preferred_lang) ? row.preferred_lang : "en",
    selected_module_id: typeof row.selected_module_id === "string" ? row.selected_module_id : "M01-safety",
    mode: row.mode === "apply" ? "apply" : "ask",
    state: row.state && typeof row.state === "object" && !Array.isArray(row.state)
      ? row.state as Record<string, unknown>
      : {},
  };
}

async function linkContact(account: TelegramAccount, message: TelegramMessage) {
  const chatId = message.chat.id;
  if (message.contact?.user_id && message.from?.id && message.contact.user_id !== message.from.id) {
    await sendMessage(chatId, "Please share your own phone number using the button.");
    return;
  }
  const phone = normalizeIndianPhone(message.contact?.phone_number || "");
  if (!phone) {
    await sendMessage(chatId, "Please share a valid Indian mobile number.");
    return;
  }
  await linkPhone(account, chatId, phone);
}

async function linkPhone(account: TelegramAccount, chatId: number, phone: string) {
  const { data: learner, error } = await dbGunakul
    .from("learners")
    .upsert(
      {
        phone,
        name: account.first_name || `Learner ${phone.slice(-4)}`,
        role: "learner",
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    )
    .select("id, preferred_lang")
    .single();
  if (error || !learner) throw error || new Error("Learner upsert failed");

  await dbGunakul
    .from("telegram_accounts")
    .update({
      learner_id: learner.id,
      phone,
      preferred_lang: learner.preferred_lang || account.preferred_lang,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  await sendMessage(chatId, "Login complete.", { remove_keyboard: true });
  await sendHome(chatId, { ...account, learner_id: learner.id as string });
}

async function requestPhone(chatId: number) {
  await sendMessage(chatId, "Welcome to Vajra Acharya.\n\nPlease login with your phone number first. After login, I will show the learning and training tools.", {
    keyboard: [
      [{ text: "Share my Telegram phone", request_contact: true }],
      [{ text: "Type phone number" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

async function sendHome(chatId: number, account: TelegramAccount) {
  const completedIds = await completedModuleIds(account);
  const totalModules = (await getModules()).length;
  
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const dateStr = new Date().toLocaleDateString('en-IN', options);

  await sendMessage(
    chatId,
    `Vajra Acharya
${dateStr}
Modules completed: ${completedIds.length}/${totalModules}
Continue: ${account.selected_module_id}
Choose a tool below, or type any electrical question.`,
    persistentMainMenu(),
  );
}

function persistentMainMenu(): ReplyMarkup {
  return {
    keyboard: [
      [{ text: "Home" }, { text: "Learn Modules" }],
      [{ text: "Videos" }, { text: "Quiz" }],
      [{ text: "Ask Vajra Acharya" }, { text: "Field Apply" }],
      [{ text: "Tools" }, { text: "My Progress" }],
    ],
    resize_keyboard: true,
  };
}

async function sendHelp(chatId: number) {
  await sendMessage(chatId, "/ask - ask a question\n/quiz - start quiz\n/apply - submit field work\n/courses - open modules\n/progress - progress summary\n/lang - change language", persistentMainMenu());
}

async function sendLanguagePicker(chatId: number) {
  await sendMessage(chatId, "Choose language.", {
    inline_keyboard: [[
      { text: "English", callback_data: "lang:en" },
      { text: "Hindi", callback_data: "lang:hi" },
      { text: "Bengali", callback_data: "lang:bn" },
    ]],
  });
}

async function sendCourses(chatId: number, lang: Lang, page: number, messageIdToEdit?: number) {
  const modules = await getModules();
  if (modules.length === 0) {
    await sendMessage(chatId, "No course modules are available yet.", persistentMainMenu());
    return;
  }
  
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `mod:${m.id}` }]));
  
  if (page < totalPages) {
    keyboard.push([{ text: "Next ➡️", callback_data: `modpage:${page + 1}` }]);
  }
  if (page > 1) {
    keyboard.push([{ text: "⬅️ Previous", callback_data: `modpage:${page - 1}` }]);
  }

  const text = `Choose a learning module\nPage ${page}/${totalPages}`;
  
  // Note: message editing not implemented in telegram.ts yet, sending new message
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function sendModulePicker(chatId: number, action: "quiz", lang: Lang, page: number, messageIdToEdit?: number) {
  const modules = await getModules();
  if (modules.length === 0) {
    await sendMessage(chatId, "No modules are available for quiz yet.", persistentMainMenu());
    return;
  }
  
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `quizmod:${m.id}` }]));
  
  if (page < totalPages) {
    keyboard.push([{ text: "Next ➡️", callback_data: `quizpage:${page + 1}` }]);
  }
  if (page > 1) {
    keyboard.push([{ text: "⬅️ Previous", callback_data: `quizpage:${page - 1}` }]);
  }

  const text = `Choose a module for quiz\nPage ${page}/${totalPages}`;
  
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function getModules(): Promise<ModuleRow[]> {
  const { data, error } = await dbAcharya
    .from("modules")
    .select("id, title_bn, title_hi, title_en, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as ModuleRow[];
}

async function sendSections(chatId: number, moduleId: string, lang: Lang) {
  const sections = await getSections(moduleId);
  if (sections.length === 0) {
    await sendMessage(chatId, "No sections are available for this module yet.", persistentMainMenu());
    return;
  }
  await sendMessage(chatId, "Choose a section.", {
    inline_keyboard: sections.map((s) => ([{ text: title(s, lang), callback_data: `section:${s.id}` }])),
  });
}

async function getSections(moduleId: string): Promise<SectionRow[]> {
  const { data, error } = await dbAcharya
    .from("sections")
    .select("id, module_id, title_bn, title_hi, title_en, sort_order, body_bn, body_hi, body_en")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as SectionRow[];
}

async function sendSection(chatId: number, sectionId: string, lang: Lang) {
  const { data, error } = await dbAcharya
    .from("sections")
    .select("id, module_id, title_bn, title_hi, title_en, body_bn, body_hi, body_en")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await sendMessage(chatId, "Section not found.");
    return;
  }
  const section = data as SectionRow;
  const body = bodyText(section, lang);
  await sendMessage(chatId, `${title(section, lang)}

${body}`, {
    inline_keyboard: [[{ text: "Mark complete", callback_data: `done:${section.module_id}:${section.id}` }]],
  });
}

async function markSectionComplete(account: TelegramAccount, moduleId: string, sectionId: string) {
  if (!account.learner_id || !moduleId || !sectionId) return;
  const sections = await getSections(moduleId);
  const { data: existing } = await dbGunakul
    .from("progress")
    .select("sections_completed")
    .eq("learner_id", account.learner_id)
    .eq("module_id", moduleId)
    .maybeSingle();
  const current = Array.isArray((existing as { sections_completed?: unknown } | null)?.sections_completed)
    ? (existing as { sections_completed: string[] }).sections_completed
    : [];
  const completedSections = Array.from(new Set([...current, sectionId]));
  const completed = sections.length > 0 && completedSections.length >= sections.length;
  await dbGunakul.from("progress").upsert(
    {
      learner_id: account.learner_id,
      module_id: moduleId,
      sections_completed: completedSections,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "learner_id,module_id" },
  );
}

async function handleAskMessage(chatId: number, account: TelegramAccount, text: string) {
  if (!account.learner_id) return;
  await sendMessage(chatId, "Thinking...");
  const started = Date.now();
  const history = await getChatHistory(account.learner_id, account.selected_module_id, account.preferred_lang);
  const reply = await generateChatReply({
    message: text,
    history,
    moduleId: account.selected_module_id,
    lang: account.preferred_lang,
  });
  await dbGunakul.from("chat_logs").insert({
    learner_id: account.learner_id,
    module_id: account.selected_module_id,
    lang: account.preferred_lang,
    user_message: text,
    ai_response: reply,
    response_time_ms: Date.now() - started,
  });
  await sendMessage(chatId, reply, persistentMainMenu());
}

async function getChatHistory(learnerId: string, moduleId: string, lang: Lang) {
  const { data } = await dbGunakul
    .from("chat_logs")
    .select("user_message, ai_response")
    .eq("learner_id", learnerId)
    .eq("module_id", moduleId)
    .eq("lang", lang)
    .order("created_at", { ascending: false })
    .limit(4);
  return (data || []).reverse().flatMap((row: { user_message: string; ai_response: string }) => ([
    { role: "user" as const, content: row.user_message },
    { role: "assistant" as const, content: row.ai_response },
  ]));
}

async function handleApplyMessage(chatId: number, account: TelegramAccount, message: TelegramMessage) {
  if (!account.learner_id) return;
  const text = (message.text || message.caption || "").trim();
  const photo = message.photo?.slice().sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  const image = photo ? await getPhotoAsDataUrl(photo.file_id).catch(() => null) : null;
  await sendMessage(chatId, "Reviewing your field work...");
  const evaluation = await evaluateApply({
    text,
    moduleId: account.selected_module_id,
    lang: account.preferred_lang,
    hasPhoto: !!photo,
    image,
  });
  await dbGunakul.from("apply_logs").insert({
    learner_id: account.learner_id,
    module_id: account.selected_module_id,
    input: text || (photo ? "[photo submitted]" : ""),
    score: evaluation.score,
    feedback: evaluation.feedback,
    next_step: evaluation.nextStep,
    has_photo: !!photo,
  });
  await sendMessage(chatId, `Score: ${evaluation.score}/10

${evaluation.feedback}

Next: ${evaluation.nextStep}`, persistentMainMenu());
}

async function startQuiz(chatId: number, account: TelegramAccount, moduleId: string) {
  await sendMessage(chatId, "Generating quiz...");
  const completedIds = await completedModuleIds(account);
  let questions: QuizQuestion[];
  try {
    questions = await generateQuizQuestions({ moduleId, lang: account.preferred_lang, completedModuleIds: completedIds });
  } catch (err) {
    console.error("[telegram] quiz generation failed, using fallback:", err);
    questions = fallbackQuizQuestions(moduleId, account.preferred_lang);
    await sendMessage(chatId, "AI quiz generation failed, using a safety practice quiz for now.");
  }
  const state: QuizState = { type: "quiz", moduleId, questions, index: 0, score: 0, answers: [] };
  await dbGunakul.from("telegram_accounts").update({ state, selected_module_id: moduleId, updated_at: new Date().toISOString() }).eq("id", account.id);
  await sendQuizQuestion(chatId, state);
}

async function completedModuleIds(account: TelegramAccount) {
  if (!account.learner_id) return [];
  const { data } = await dbGunakul
    .from("progress")
    .select("module_id")
    .eq("learner_id", account.learner_id)
    .eq("completed", true);
  return (data || []).map((r: { module_id: string }) => r.module_id);
}

async function handleQuizAnswer(chatId: number, account: TelegramAccount, answer: number) {
  if (!account.learner_id || !isQuizState(account.state)) return;
  const state = account.state;
  const current = state.questions[state.index];
  if (!current || answer < 0 || answer > 3) return;
  const correct = answer === current.correct;
  const nextState: QuizState = {
    ...state,
    score: state.score + (correct ? 1 : 0),
    answers: [...state.answers, answer],
    index: state.index + 1,
  };
  await sendMessage(chatId, `${correct ? "Correct." : "Not correct."} ${current.explanation}`);

  if (nextState.index >= nextState.questions.length) {
    await dbGunakul.from("quiz_attempts").insert({
      learner_id: account.learner_id,
      module_id: nextState.moduleId,
      score: nextState.score,
      total: nextState.questions.length,
      questions: nextState.questions,
    });
    await dbGunakul.from("telegram_accounts").update({ state: {}, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendMessage(chatId, `Quiz complete. Score: ${nextState.score}/${nextState.questions.length}`, persistentMainMenu());
  } else {
    await dbGunakul.from("telegram_accounts").update({ state: nextState, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendQuizQuestion(chatId, nextState);
  }
}

async function sendQuizQuestion(chatId: number, state: QuizState) {
  const q = state.questions[state.index];
  if (!q) return;
  await sendMessage(chatId, `Question ${state.index + 1}/${state.questions.length}

${q.q}`, {
    inline_keyboard: q.options.map((option, idx) => ([{ text: option, callback_data: `ans:${idx}` }])),
  });
}

async function sendProgress(chatId: number, account: TelegramAccount) {
  if (!account.learner_id) return;
  const { data } = await dbGunakul
    .from("progress")
    .select("module_id, completed, sections_completed")
    .eq("learner_id", account.learner_id)
    .order("updated_at", { ascending: false });
  const rows = data || [];
  if (rows.length === 0) {
    await sendMessage(chatId, "No progress yet. Use /courses to start.");
    return;
  }
  const lines = rows.map((r: { module_id: string; completed: boolean; sections_completed?: string[] }) =>
    `${r.completed ? "[done]" : "[in progress]"} ${r.module_id} - ${(r.sections_completed || []).length} sections`,
  );
  await sendMessage(chatId, `Your progress:\n\n${lines.join("\n")}`, persistentMainMenu());
}

async function setAccountMode(accountId: string, mode: "ask" | "apply") {
  await dbGunakul.from("telegram_accounts").update({ mode, state: {}, updated_at: new Date().toISOString() }).eq("id", accountId);
}

function isLang(value: unknown): value is Lang {
  return value === "bn" || value === "hi" || value === "en";
}

function isQuizState(value: unknown): value is QuizState {
  const v = value as Partial<QuizState> | null;
  return !!v &&
    v.type === "quiz" &&
    typeof v.moduleId === "string" &&
    Array.isArray(v.questions) &&
    typeof v.index === "number" &&
    typeof v.score === "number" &&
    Array.isArray(v.answers);
}

function title(item: { title_bn: string; title_hi: string; title_en: string }, lang: Lang) {
  return (lang === "bn" ? item.title_bn : lang === "hi" ? item.title_hi : item.title_en) || item.title_en;
}

function bodyText(section: SectionRow, lang: Lang) {
  return (lang === "bn" ? section.body_bn : lang === "hi" ? section.body_hi : section.body_en) || section.body_en || "";
}
