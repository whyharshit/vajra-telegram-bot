import { NextRequest, NextResponse } from "next/server";
import { dbAcharya, dbConfigured, dbGunakul } from "@/lib/server/supabase";
import { normalizeIndianPhone } from "@/lib/phone";
import { evaluateApply, fallbackQuizQuestions, generateChatReply, generateQuizQuestions, type QuizQuestion } from "@/lib/server/gemini";
import { answerCallbackQuery, getFileAsDataUrl, sendMessage, type ReplyMarkup } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

const I18N: Record<string, Record<string, string>> = {
  home: { en: "Home", hi: "होम", bn: "হোম" },
  modules: { en: "Learn Modules", hi: "मॉड्यूल सीखें", bn: "মডিউল শিখুন" },
  videos: { en: "Videos", hi: "वीडियो", bn: "ভিডিও" },
  quiz: { en: "Quiz", hi: "क्विज़", bn: "কুইজ" },
  ask: { en: "Ask Vajra Acharya", hi: "वज्र आचार्य से पूछें", bn: "বজ্র আচার্যকে জিজ্ঞাসা করুন" },
  apply: { en: "Field Apply", hi: "फील्ड अप्लाई", bn: "ফিল্ড অ্যাপ্লাই" },
  language: { en: "🌐 Language", hi: "🌐 भाषा", bn: "🌐 ভাষা" },
  tools: { en: "Tools", hi: "उपकरण", bn: "সরঞ্জাম" },
  progress: { en: "My Progress", hi: "मेरी प्रगति", bn: "আমার অগ্রগতি" },
  logout: { en: "🚪 Logout / Switch User", hi: "🚪 लॉगआउट / उपयोगकर्ता बदलें", bn: "🚪 লগআউট / ব্যবহারকারী পরিবর্তন করুন" },
  login_prompt: { en: "Welcome to Vajra Acharya.\n\nPlease login with your phone number first.", hi: "वज्र आचार्य में आपका स्वागत है।\n\nकृपया पहले अपने फोन नंबर से लॉगिन करें।", bn: "বজ্র আচার্য-এ স্বাগতম।\n\nঅনুগ্রহ করে প্রথমে আপনার ফোন নম্বর দিয়ে লগইন করুন।" },
  share_phone: { en: "Share my Telegram phone", hi: "अपना फोन नंबर साझा करें", bn: "ফোন নম্বর শেয়ার করুন" },
  type_phone: { en: "Type phone number", hi: "फोन नंबर टाइप करें", bn: "ফোন নম্বর টাইপ করুন" },
  login_complete: { en: "Login complete.", hi: "लॉगिन पूरा हुआ।", bn: "লগইন সম্পন্ন।" },
  logged_out: { en: "You have been logged out successfully.", hi: "आप सफलतापूर्वक लॉग आउट हो गए हैं।", bn: "আপনি সফলভাবে লগআউট হয়েছেন।" },
  ask_mode: { en: "Ask mode is on. Send your electrical question now.", hi: "पूछताछ मोड चालू है। अपना इलेक्ट्रिकल प्रश्न अभी भेजें।", bn: "জিজ্ঞাসা মোড চালু আছে। আপনার বৈদ্যুতিক প্রশ্ন এখন পাঠান।" },
  apply_mode: { en: "Apply mode is on. Send what you did in the field today. You can send text, a photo, or a voice note.", hi: "अप्लाई मोड चालू है। आज आपने फील्ड में क्या किया, भेजें। आप टेक्स्ट, फोटो या वॉयस नोट भेज सकते हैं।", bn: "অ্যাপ্লাই মোড চালু আছে। আজ আপনি মাঠে কী করেছেন তা পাঠান। আপনি টেক্সট, ছবি বা ভয়েস নোট পাঠাতে পারেন।" },
  choose_module: { en: "Choose a learning module", hi: "एक लर्निंग मॉड्यूल चुनें", bn: "একটি লার্নিং মডিউল বেছে নিন" },
  choose_quiz: { en: "Choose a module for quiz", hi: "क्विज़ के लिए एक मॉड्यूल चुनें", bn: "কুইজের জন্য একটি মডিউল বেছে নিন" },
  next: { en: "Next ➡️", hi: "अगला ➡️", bn: "পরবর্তী ➡️" },
  prev: { en: "⬅️ Previous", hi: "⬅️ पिछला", bn: "⬅️ পূর্ববর্তী" },
  mod_completed: { en: "Modules completed", hi: "मॉड्यूल पूरे हुए", bn: "মডিউল সম্পন্ন" },
  continue: { en: "Continue", hi: "जारी रखें", bn: "চালিয়ে যান" },
  choose_tool: { en: "Choose a tool below, or type any electrical question.", hi: "नीचे एक उपकरण चुनें, या कोई भी इलेक्ट्रिकल प्रश्न टाइप करें।", bn: "নীচে একটি টুল বেছে নিন, অথবা যে কোনো বৈদ্যুতিক প্রশ্ন টাইপ করুন।" },
  send_question: { en: "Send a question, or use /courses, /quiz, /apply.", hi: "एक प्रश्न भेजें, या /courses, /quiz, /apply का उपयोग करें।", bn: "একটি প্রশ্ন পাঠান, অথবা /courses, /quiz, /apply ব্যবহার করুন।" },
  thinking: { en: "Thinking...", hi: "सोच रहा हूँ...", bn: "ভাবছি..." },
  reviewing: { en: "Reviewing your field work...", hi: "आपके फील्ड वर्क की समीक्षा हो रही है...", bn: "আপনার ফিল্ড ওয়ার্ক পর্যালোচনা করা হচ্ছে..." },
  no_progress: { en: "No progress yet.", hi: "अभी तक कोई प्रगति नहीं।", bn: "এখনও কোন অগ্রগতি নেই।" },
  recent_activity: { en: "Recent Activity", hi: "हाल की गतिविधि", bn: "সাম্প্রতিক কার্যকলাপ" },
  course_progress: { en: "Your Course Progress", hi: "आपकी कोर्स प्रगति", bn: "আপনার কোর্স অগ্রগতি" },
};

function t(key: string, lang: Lang = "en"): string {
  return I18N[key]?.[lang] || I18N[key]?.en || key;
}
function isCmd(text: string, key: string): boolean {
  return text === I18N[key]?.en || text === I18N[key]?.hi || text === I18N[key]?.bn;
}

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
  voice?: { file_id: string; duration?: number; mime_type?: string };
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { message_id?: number; chat: { id: number } };
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
    await requestPhone(chatId, account?.preferred_lang || "en");
    return;
  }

  if (text === "/start" || isCmd(text, "home")) {
    await sendHome(chatId, account);
    return;
  }
  if (text === "/logout" || isCmd(text, "logout")) {
    await dbGunakul.from("telegram_accounts").update({ learner_id: null, phone: null, updated_at: new Date().toISOString() }).eq("id", account.id);
    await sendMessage(chatId, t("logged_out", account.preferred_lang) + "\n\n*(Note: To remove previous messages from the screen, please use Telegram's built-in \'Clear History\' option in the top-right menu.)*", { remove_keyboard: true });
    await requestPhone(chatId, account?.preferred_lang || "en");
    return;
  }
  if (text === "/help") {
    await sendHelp(chatId, account);
    return;
  }
  if (text === "/courses" || isCmd(text, "modules")) {
    await sendCourses(chatId, account.preferred_lang, 1);
    return;
  }
  if (text === "/ask" || isCmd(text, "ask")) {
    await setAccountMode(account.id, "ask");
    await sendMessage(chatId, t("ask_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
    return;
  }
  if (text === "/apply" || isCmd(text, "apply")) {
    await setAccountMode(account.id, "apply");
    await sendMessage(chatId, t("apply_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
    return;
  }
  if (text === "/quiz" || isCmd(text, "quiz")) {
    await sendModulePicker(chatId, "quiz", account.preferred_lang, 1);
    return;
  }
  if (text === "/progress" || isCmd(text, "progress")) {
    await sendProgress(chatId, account);
    return;
  }
  if (text === "/lang" || isCmd(text, "language")) {
    await sendLanguagePicker(chatId);
    return;
  }
  if (isCmd(text, "tools")) {
    const toolsMsg = `🛠️ Essential Toolkit Checklist:

1. Insulated Screwdriver Set
2. Wire Stripper & Cutter
3. Digital Multimeter
4. Phase/Neon Tester
5. Combination Pliers
6. Electrical Tape (ISI Marked)
7. Rubber Safety Gloves

⚠️ Rule: Always inspect tool insulation before touching any wires!`;
    await sendMessage(chatId, toolsMsg, persistentMainMenu(account.preferred_lang));
    return;
  }

  if (isCmd(text, "videos")) {
    const videosMsg = `📺 Electrician Training Videos:

• Basic House Wiring: https://youtu.be/search?q=house+wiring
• Multimeter Tutorial: https://youtu.be/search?q=use+multimeter
• MCB vs RCCB: https://youtu.be/search?q=mcb+vs+rccb+explained

(More video courses coming soon!)`;
    await sendMessage(chatId, videosMsg, persistentMainMenu(account.preferred_lang));
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

  if (!text && !message.voice) {
    await sendMessage(chatId, t("send_question", account.preferred_lang));
    return;
  }
  await handleAskMessage(chatId, account, text, message.voice);
}

async function handleCallback(query: TelegramCallbackQuery) {
  const chatId = query.message?.chat.id;
  const data = query.data || "";
  if (!chatId) return;
  await answerCallbackQuery(query.id);
  const account = await getOrCreateAccount(query.from, chatId);

  if (!account.learner_id && !data.startsWith("lang:")) {
    await requestPhone(chatId, account?.preferred_lang || "en");
    return;
  }

  if (data.startsWith("lang:")) {
    const lang = data.slice(5) as Lang;
    if (!["bn", "hi", "en"].includes(lang)) return;
    await dbGunakul.from("telegram_accounts").update({ preferred_lang: lang, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (account.learner_id) await dbGunakul.from("learners").update({ preferred_lang: lang }).eq("id", account.learner_id);
    await sendMessage(chatId, `Language set to ${lang.toUpperCase()}.`, persistentMainMenu(account.preferred_lang));
    return;
  }

  if (data === "courses") {
    await sendCourses(chatId, account.preferred_lang, 1);
    return;
  }
  if (data === "ask") {
    await setAccountMode(account.id, "ask");
    await sendMessage(chatId, t("ask_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
    return;
  }
  if (data === "apply") {
    await setAccountMode(account.id, "apply");
    await sendMessage(chatId, t("apply_mode", account.preferred_lang), persistentMainMenu(account.preferred_lang));
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
    await sendMessage(chatId, "Marked complete.", persistentMainMenu(account.preferred_lang));
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

  await sendMessage(chatId, t("login_complete", account.preferred_lang), { remove_keyboard: true });
  await sendHome(chatId, { ...account, learner_id: learner.id as string });
}

async function requestPhone(chatId: number, lang: Lang = "en") {
  await sendMessage(chatId, t("login_prompt", lang), {
    keyboard: [
      [{ text: t("share_phone", lang), request_contact: true }],
      [{ text: t("type_phone", lang) }]
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
    persistentMainMenu(account.preferred_lang),
  );
}

function persistentMainMenu(lang: Lang = "en"): ReplyMarkup {
  return {
    keyboard: [
      [{ text: t("home", lang) }, { text: t("modules", lang) }],
      [{ text: t("videos", lang) }, { text: t("quiz", lang) }],
      [{ text: t("ask", lang) }, { text: t("apply", lang) }],
      [{ text: t("language", lang) }, { text: t("progress", lang) }],
      [{ text: t("logout", lang) }],
    ],
    resize_keyboard: true,
  };
}

async function sendHelp(chatId: number, account: TelegramAccount) {
  await sendMessage(chatId, "/ask - ask a question\n/quiz - start quiz\n/apply - submit field work\n/courses - open modules\n/progress - progress summary\n/lang - change language", persistentMainMenu(account.preferred_lang));
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
    await sendMessage(chatId, "No course modules are available yet.", persistentMainMenu(lang));
    return;
  }
  
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `mod:${m.id}` }]));
  
  if (page < totalPages) {
    keyboard.push([{ text: t("next", lang), callback_data: `modpage:${page + 1}` }]);
  }
  if (page > 1) {
    keyboard.push([{ text: t("prev", lang), callback_data: `modpage:${page - 1}` }]);
  }

  const text = `${t("choose_module", lang)}\nPage ${page}/${totalPages}`;
  
  // Note: message editing not implemented in telegram.ts yet, sending new message
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function sendModulePicker(chatId: number, action: "quiz", lang: Lang, page: number, messageIdToEdit?: number) {
  const modules = await getModules();
  if (modules.length === 0) {
    await sendMessage(chatId, "No modules are available for quiz yet.", persistentMainMenu(lang));
    return;
  }
  
  const perPage = 8;
  const totalPages = Math.ceil(modules.length / perPage);
  const start = (page - 1) * perPage;
  const sliced = modules.slice(start, start + perPage);

  const keyboard = sliced.map((m) => ([{ text: `${m.sort_order}. ${title(m, lang)}`, callback_data: `quizmod:${m.id}` }]));
  
  if (page < totalPages) {
    keyboard.push([{ text: t("next", lang), callback_data: `quizpage:${page + 1}` }]);
  }
  if (page > 1) {
    keyboard.push([{ text: t("prev", lang), callback_data: `quizpage:${page - 1}` }]);
  }

  const text = `${t("choose_quiz", lang)}\nPage ${page}/${totalPages}`;
  
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
    await sendMessage(chatId, "No sections are available for this module yet.", persistentMainMenu(lang));
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

async function handleAskMessage(chatId: number, account: TelegramAccount, text: string, voice?: TelegramMessage['voice']) {
  if (!account.learner_id) return;
  await sendMessage(chatId, t("thinking", account.preferred_lang));
  const started = Date.now();
  const history = await getChatHistory(account.learner_id, account.selected_module_id, account.preferred_lang);
  const reply = await generateChatReply({
    message: text || "[voice note]",
    history,
    moduleId: account.selected_module_id,
    lang: account.preferred_lang,
  });
  await dbGunakul.from("chat_logs").insert({
    learner_id: account.learner_id,
    module_id: account.selected_module_id,
    lang: account.preferred_lang,
    user_message: text || "[voice note]",
    ai_response: reply,
    response_time_ms: Date.now() - started,
  });
  await sendMessage(chatId, reply, persistentMainMenu(account.preferred_lang));
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
  const fileId = photo?.file_id || message.voice?.file_id;
  const image = fileId ? await getFileAsDataUrl(fileId).catch(() => null) : null;

  if (!text && !image) return;
  await sendMessage(chatId, t("reviewing", account.preferred_lang));
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
    input: text || (photo ? "[photo submitted]" : message.voice ? "[voice submitted]" : ""),
    score: evaluation.score,
    feedback: evaluation.feedback,
    next_step: evaluation.nextStep,
    has_photo: !!photo,
  });
  await sendMessage(chatId, `Score: ${evaluation.score}/10

${evaluation.feedback}

Next: ${evaluation.nextStep}`, persistentMainMenu(account.preferred_lang));
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
    await sendMessage(chatId, `Quiz complete. Score: ${nextState.score}/${nextState.questions.length}`, persistentMainMenu(account.preferred_lang));
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
  const { data: rows } = await dbGunakul
    .from("progress")
    .select("module_id, completed, sections_completed")
    .eq("learner_id", account.learner_id)
    .order("updated_at", { ascending: false });

  const { data: history } = await dbGunakul
    .from("chat_logs")
    .select("user_message, created_at")
    .eq("learner_id", account.learner_id)
    .order("created_at", { ascending: false })
    .limit(5);

  const lines = (rows || []).map((r: { module_id: string; completed: boolean; sections_completed?: string[] }) =>
    `${r.completed ? "[done]" : "[in progress]"} ${r.module_id} - ${(r.sections_completed || []).length} sections`,
  );
  
  const historyLines = (history || []).map((h: { user_message: string, created_at: string }) => 
    `• ${h.user_message.slice(0, 30)}${h.user_message.length > 30 ? '...' : ''}`
  );

  await sendMessage(chatId, `📊 ${t("course_progress", account.preferred_lang)}:\n\n${lines.join("\n") || t("no_progress", account.preferred_lang)}\n\n🕒 ${t("recent_activity", account.preferred_lang)}:\n${historyLines.join("\n") || t("no_progress", account.preferred_lang)}`, persistentMainMenu(account.preferred_lang));
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
