import "server-only";
import { ARJUN_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { logChatCall, logQuizCall } from "./ai-logger";

const MODEL = "gemini-2.5-flash";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface ApplyEvaluation {
  score: number;
  feedback: string;
  nextStep: string;
}

function langName(lang: string): string {
  return lang === "bn" ? "Bengali" : lang === "hi" ? "Hindi" : "English";
}

function textFromGemini(json: unknown): string {
  const j = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return j.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim() || "";
}

function mediaPart(media: string) {
  const match = media.match(/^data:((image|audio|video)\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    inline_data: {
      mime_type: match[1],
      data: match[3],
    },
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeQuestions(value: unknown): QuizQuestion[] {
  const obj = value as { questions?: unknown };
  const arr = Array.isArray(obj.questions) ? obj.questions : [];
  return arr.slice(0, 5).map((x) => {
    const q = x as Partial<QuizQuestion>;
    return {
      q: String(q.q || ""),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correct: Number.isInteger(q.correct) ? q.correct as number : 0,
      explanation: String(q.explanation || ""),
    };
  }).filter((q) => q.q && q.options.length === 4 && q.correct >= 0 && q.correct <= 3);
}

async function generateContent(body: Record<string, unknown>): Promise<unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : {};
  if (!res.ok) throw new Error(raw.slice(0, 500));
  return json;
}

export async function generateChatReply(opts: {
  message: string;
  history?: ChatMessage[];
  moduleId?: string | null;
  lang: string;
  image?: string | null;
}) {
  const started = Date.now();
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const h of (opts.history || []).slice(-8)) {
    if (h.content.length <= 4000) {
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }
  }

  const parts: Array<{ text: string } | NonNullable<ReturnType<typeof mediaPart>>> = [{ text: opts.message }];
  if (opts.image) {
    const part = mediaPart(opts.image);
    if (part) parts.push(part);
  }

  try {
    const json = await generateContent({
      system_instruction: {
        parts: [{
          text: `${ARJUN_SYSTEM_PROMPT}

The learner is currently studying module: ${opts.moduleId || "general electrician training"}.
Respond in ${langName(opts.lang)}.`,
        }],
      },
      contents: [...contents, { role: "user", parts }],
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 900,
      },
    });
    const reply = textFromGemini(json) || "I could not generate a reply. Please try again.";
    logChatCall({ model: MODEL, status: "ok", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId || undefined, hasImage: !!opts.image });
    return reply;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logChatCall({ model: MODEL, status: "error", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId || undefined, hasImage: !!opts.image, errorMessage });
    throw err;
  }
}

export async function generateQuizQuestions(opts: {
  moduleId: string;
  lang: string;
  completedModuleIds?: string[];
}) {
  const started = Date.now();
  const completedIds = (opts.completedModuleIds || []).filter((x) => x.length <= 80).slice(0, 40);
  const prompt = `${ARJUN_SYSTEM_PROMPT}

Generate exactly 5 multiple-choice quiz questions for Vajra Acharya module ${opts.moduleId}.
Language: ${langName(opts.lang)}.
Completed modules for context: ${completedIds.join(", ") || "none"}.

Return ONLY valid JSON in this exact shape:
{"questions":[{"q":"question","options":["A","B","C","D"],"correct":0,"explanation":"short explanation"}]}

Question topics should be practical electrician training: safety, tools, wiring, MCB/RCCB, earthing, load, fault finding, and customer service.`;

  try {
    const json = await generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1400,
        responseMimeType: "application/json",
      },
    });
    const text = textFromGemini(json);
    const questions = normalizeQuestions(extractJson(text));
    if (questions.length !== 5) throw new Error("Gemini returned invalid quiz JSON");
    logQuizCall({ model: MODEL, status: "ok", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId });
    return questions;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logQuizCall({ model: MODEL, status: "error", durationMs: Date.now() - started, lang: opts.lang, moduleId: opts.moduleId, errorMessage });
    throw err;
  }
}

export function fallbackQuizQuestions(moduleId: string, lang: string): QuizQuestion[] {
  const hi = lang === "hi";
  const bn = lang === "bn";
  const suffix = moduleId ? ` (${moduleId})` : "";
  if (hi) {
    return [
      { q: `काम शुरू करने से पहले सबसे पहले क्या करना चाहिए${suffix}?`, options: ["मेन सप्लाई बंद करें", "तार छुएं", "MCB बदल दें", "ग्राहक को बिल दें"], correct: 0, explanation: "किसी भी बोर्ड या वायरिंग को खोलने से पहले मेन सप्लाई बंद करके टेस्ट करना जरूरी है।" },
      { q: "RCCB मुख्य रूप से किससे बचाने में मदद करता है?", options: ["अर्थ लीकेज", "पेंट खराब होना", "कम रोशनी", "ड्रिल बिट टूटना"], correct: 0, explanation: "RCCB earth leakage detect करके supply trip कर सकता है।" },
      { q: "ओवरलोड से बचने का सही तरीका क्या है?", options: ["लोड और वायर साइज जांचें", "एक ही extension में सब लगाएं", "MCB बड़ा कर दें", "न्यूट्रल हटाएं"], correct: 0, explanation: "लोड, वायर साइज और MCB rating match होना चाहिए।" },
      { q: "Switchboard खोलने के बाद क्या चेक करना चाहिए?", options: ["Loose screw और burn mark", "दीवार का रंग", "ग्राहक का नाम", "मोबाइल नेटवर्क"], correct: 0, explanation: "Loose connection और heating marks faults के common signs हैं।" },
      { q: "Live conductor को छूना कब ठीक है?", options: ["कभी नहीं", "जब जल्दी हो", "अगर tester नहीं है", "दस्ताने गीले हों"], correct: 0, explanation: "Live conductor को touch नहीं करना चाहिए; isolate और test करें।" },
    ];
  }
  if (bn) {
    return [
      { q: `কাজ শুরু করার আগে প্রথমে কী করবেন${suffix}?`, options: ["মেইন সাপ্লাই বন্ধ", "তার ধরবেন", "MCB বদলাবেন", "বিল দেবেন"], correct: 0, explanation: "বোর্ড বা wiring খোলার আগে মেইন সাপ্লাই বন্ধ করে tester দিয়ে নিশ্চিত করতে হবে।" },
      { q: "RCCB মূলত কোন ঝুঁকিতে সাহায্য করে?", options: ["Earth leakage", "রঙ নষ্ট", "কম আলো", "ড্রিল ভাঙা"], correct: 0, explanation: "RCCB earth leakage হলে trip করতে পারে।" },
      { q: "Overload এড়ানোর সঠিক উপায় কী?", options: ["Load ও wire size দেখা", "সব এক extension-এ লাগানো", "বড় MCB লাগানো", "Neutral খুলে দেওয়া"], correct: 0, explanation: "Load, wire size ও MCB rating ঠিক মিলতে হবে।" },
      { q: "Switchboard খুলে কী দেখা জরুরি?", options: ["Loose screw ও burn mark", "দেয়ালের রঙ", "গ্রাহকের নাম", "মোবাইল network"], correct: 0, explanation: "Loose connection ও heating mark সাধারণ fault sign।" },
      { q: "Live conductor কখন ধরা ঠিক?", options: ["কখনো না", "তাড়া থাকলে", "tester না থাকলে", "ভেজা gloves থাকলে"], correct: 0, explanation: "Live conductor ধরা যাবে না; isolate ও test করতে হবে।" },
    ];
  }
  return [
    { q: `What should you do first before opening a switchboard${suffix}?`, options: ["Switch off main supply", "Touch the wire", "Replace the MCB", "Give the bill"], correct: 0, explanation: "Always isolate power and verify with a tester before opening electrical points." },
    { q: "What does an RCCB mainly help detect?", options: ["Earth leakage", "Wall color issue", "Low brightness", "Broken drill bit"], correct: 0, explanation: "An RCCB trips on leakage current and helps reduce shock risk." },
    { q: "How do you avoid overload?", options: ["Check load and wire size", "Use one extension for all loads", "Use a bigger MCB blindly", "Remove neutral"], correct: 0, explanation: "Load, cable size, and MCB rating must be suitable for the circuit." },
    { q: "What should you inspect inside a switchboard?", options: ["Loose screws and burn marks", "Wall paint", "Customer name", "Mobile network"], correct: 0, explanation: "Loose connections and burn marks are common fault indicators." },
    { q: "When is it okay to touch a live conductor?", options: ["Never", "When in a hurry", "When no tester is nearby", "With wet gloves"], correct: 0, explanation: "Never touch live conductors. Isolate, test, then work." },
  ];
}

export async function evaluateApply(opts: {
  text: string;
  moduleId: string;
  lang: string;
  hasPhoto?: boolean;
  image?: string | null;
}): Promise<ApplyEvaluation> {
  const prompt = `FIELD APPLICATION FINAL EVALUATION.

The learner has reported field work for module ${opts.moduleId}.
Report:
${opts.text || "(no text provided)"}

Photo attached: ${opts.hasPhoto ? "yes" : "no"}.

Respond ONLY in valid JSON:
{"score":7,"feedback":"short practical feedback","nextStep":"one concrete next step"}

Score must be 0 to 10. Respond in ${langName(opts.lang)}.`;

  const reply = await generateChatReply({
    message: prompt,
    moduleId: opts.moduleId,
    lang: opts.lang,
    image: opts.image || null,
  });

  try {
    const parsed = extractJson(reply) as Partial<ApplyEvaluation>;
    return {
      score: Math.max(0, Math.min(10, Number(parsed.score || 0))),
      feedback: String(parsed.feedback || reply).slice(0, 4000),
      nextStep: String(parsed.nextStep || "Review safety checks and continue practice.").slice(0, 1000),
    };
  } catch {
    return {
      score: 7,
      feedback: reply.slice(0, 4000),
      nextStep: "Review safety checks and continue practice.",
    };
  }
}
