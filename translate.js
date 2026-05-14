const fs = require('fs');
let code = fs.readFileSync('src/app/api/telegram/webhook/route.ts', 'utf8');

const i18n = `
const I18N = {
  home: { en: "Home", hi: "होम", bn: "হোম" },
  modules: { en: "Learn Modules", hi: "मॉड्यूल सीखें", bn: "মডিউল শিখুন" },
  videos: { en: "Videos", hi: "वीडियो", bn: "ভিডিও" },
  quiz: { en: "Quiz", hi: "क्विज़", bn: "কুইজ" },
  ask: { en: "Ask Vajra Acharya", hi: "वज्र आचार्य से पूछें", bn: "বজ্র আচার্যকে জিজ্ঞাসা করুন" },
  apply: { en: "Field Apply", hi: "फील्ड अप्लाई", bn: "ফিল্ড অ্যাপ্লাই" },
  tools: { en: "Tools", hi: "उपकरण", bn: "সরঞ্জাম" },
  progress: { en: "My Progress", hi: "मेरी प्रगति", bn: "আমার অগ্রগতি" },
  logout: { en: "🚪 Logout / Switch User", hi: "🚪 लॉगआउट", bn: "🚪 লগআউট" },
  login_prompt: { en: "Welcome to Vajra Acharya.\\n\\nPlease login with your phone number first.", hi: "वज्र आचार्य में आपका स्वागत है।\\n\\nकृपया पहले अपने फोन नंबर से लॉगिन करें।", bn: "বজ্র আচার্য-এ স্বাগতম।\\n\\nঅনুগ্রহ করে প্রথমে আপনার ফোন নম্বর দিয়ে লগইন করুন।" },
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

function t(key: keyof typeof I18N, lang: Lang = "en") {
  return I18N[key][lang] || I18N[key].en;
}
function isCmd(text: string, key: keyof typeof I18N) {
  return text === I18N[key].en || text === I18N[key].hi || text === I18N[key].bn;
}
`;

// Insert after imports
code = code.replace('export const preferredRegion = "bom1";', 'export const preferredRegion = "bom1";\n' + i18n);

// Replace button matching
code = code.replace(/if \(text === "\/start" \|\| text === "Home"\)/g, 'if (text === "/start" || isCmd(text, "home"))');
code = code.replace(/if \(text === "\/logout" \|\| text === "🔴 Logout" \|\| text === "🚪 Logout \/ Switch User"\)/g, 'if (text === "/logout" || isCmd(text, "logout"))');
code = code.replace(/if \(text === "\/courses" \|\| text === "Learn Modules"\)/g, 'if (text === "/courses" || isCmd(text, "modules"))');
code = code.replace(/if \(text === "\/ask" \|\| text === "Ask Vajra Acharya"\)/g, 'if (text === "/ask" || isCmd(text, "ask"))');
code = code.replace(/if \(text === "\/apply" \|\| text === "Field Apply"\)/g, 'if (text === "/apply" || isCmd(text, "apply"))');
code = code.replace(/if \(text === "\/quiz" \|\| text === "Quiz"\)/g, 'if (text === "/quiz" || isCmd(text, "quiz"))');
code = code.replace(/if \(text === "\/progress" \|\| text === "My Progress"\)/g, 'if (text === "/progress" || isCmd(text, "progress"))');
code = code.replace(/if \(text === "Tools" \|\| text === "Farm Tools"\)/g, 'if (isCmd(text, "tools"))');
code = code.replace(/if \(text === "Videos"\)/g, 'if (isCmd(text, "videos"))');

// Update persistentMainMenu to take lang
code = code.replace(/function persistentMainMenu\(\): ReplyMarkup/g, 'function persistentMainMenu(lang: Lang = "en"): ReplyMarkup');
code = code.replace(/persistentMainMenu\(\)/g, 'persistentMainMenu(account.preferred_lang)');

// Replace persistentMainMenu body
code = code.replace(/keyboard: \[\s*\[\{ text: "Home" \}, \{ text: "Learn Modules" \}\],\s*\[\{ text: "Videos" \}, \{ text: "Quiz" \}\],\s*\[\{ text: "Ask Vajra Acharya" \}, \{ text: "Field Apply" \}\],\s*\[\{ text: "Tools" \}, \{ text: "My Progress" \}\],\s*\[\{ text: "🚪 Logout \/ Switch User" \}\],\s*\],/g, 
`keyboard: [
      [{ text: t("home", lang) }, { text: t("modules", lang) }],
      [{ text: t("videos", lang) }, { text: t("quiz", lang) }],
      [{ text: t("ask", lang) }, { text: t("apply", lang) }],
      [{ text: t("tools", lang) }, { text: t("progress", lang) }],
      [{ text: t("logout", lang) }],
    ],`);

// Replace simple messages
code = code.replace(/"You have been logged out successfully. Another person can now share their phone number to log in.\\n\\n\*\([^)]+\)\*"/g, 't("logged_out", account.preferred_lang) + "\\n\\n*(Note: To remove previous messages from the screen, please use Telegram\'s built-in \\\'Clear History\\\' option in the top-right menu.)*"');
code = code.replace(/"Ask mode is on. Send your electrical question now."/g, 't("ask_mode", account.preferred_lang)');
code = code.replace(/"Apply mode is on\. Send what you did in the field today\. You can send text, a photo with caption, or both\."/g, 't("apply_mode", account.preferred_lang)');
code = code.replace(/"Login complete\."/g, 't("login_complete", account.preferred_lang)');
code = code.replace(/"Welcome to Vajra Acharya\.\\n\\nPlease login with your phone number first\. After login, I will show the learning and training tools\."/g, 't("login_prompt", "en")'); // requestPhone doesn't know lang yet

// requestPhone buttons
code = code.replace(/\[\{ text: "Share my Telegram phone", request_contact: true \}\],\s*\[\{ text: "Type phone number" \}\]/g, 
`[{ text: t("share_phone", "en"), request_contact: true }],
      [{ text: t("type_phone", "en") }]`);

// sendHome text
code = code.replace(/`Vajra Acharya\\n\$\{dateStr\}\\nModules completed: \$\{completedIds.length\}\/\$\{totalModules\}\\nContinue: \$\{account.selected_module_id\}\\nChoose a tool below, or type any electrical question.`/g, 
`\`Vajra Acharya\\n\${dateStr}\\n\${t("mod_completed", account.preferred_lang)}: \${completedIds.length}/\${totalModules}\\n\${t("continue", account.preferred_lang)}: \${account.selected_module_id}\\n\${t("choose_tool", account.preferred_lang)}\``);

// sendCourses text
code = code.replace(/const text = `Choose a learning module\\nPage \$\{page\}\/\$\{totalPages\}`;/g, 'const text = `${t("choose_module", lang)}\\nPage ${page}/${totalPages}`;');
code = code.replace(/\[\{ text: "Next ➡️", callback_data: `modpage:\$\{page \+ 1\}` \}\]/g, '[{ text: t("next", lang), callback_data: `modpage:${page + 1}` }]');
code = code.replace(/\[\{ text: "⬅️ Previous", callback_data: `modpage:\$\{page - 1\}` \}\]/g, '[{ text: t("prev", lang), callback_data: `modpage:${page - 1}` }]');

// sendModulePicker text
code = code.replace(/const text = `Choose a module for quiz\\nPage \$\{page\}\/\$\{totalPages\}`;/g, 'const text = `${t("choose_quiz", lang)}\\nPage ${page}/${totalPages}`;');
code = code.replace(/\[\{ text: "Next ➡️", callback_data: `quizpage:\$\{page \+ 1\}` \}\]/g, '[{ text: t("next", lang), callback_data: `quizpage:${page + 1}` }]');
code = code.replace(/\[\{ text: "⬅️ Previous", callback_data: `quizpage:\$\{page - 1\}` \}\]/g, '[{ text: t("prev", lang), callback_data: `quizpage:${page - 1}` }]');

// ask and apply processing
code = code.replace(/"Thinking..."/g, 't("thinking", account.preferred_lang)');
code = code.replace(/"Reviewing your field work..."/g, 't("reviewing", account.preferred_lang)');
code = code.replace(/"Send a question, or use \/courses, \/quiz, \/apply."/g, 't("send_question", account.preferred_lang)');

// progress text
code = code.replace(/`📊 Your Course Progress:\\n\\n\$\{lines.join\("\\n"\) \|\| "No progress yet."\}\\n\\n🕒 Recent Activity:\\n\$\{historyLines.join\("\\n"\) \|\| "No recent activity."\}`/g, 
`\`📊 \${t("course_progress", account.preferred_lang)}:\\n\\n\${lines.join("\\n") || t("no_progress", account.preferred_lang)}\\n\\n🕒 \${t("recent_activity", account.preferred_lang)}:\\n\${historyLines.join("\\n") || t("no_progress", account.preferred_lang)}\``);

// Fix requestPhone to accept lang
code = code.replace(/async function requestPhone\(chatId: number\) \{/g, 'async function requestPhone(chatId: number, lang: Lang = "en") {');
code = code.replace(/t\("login_prompt", "en"\)/g, 't("login_prompt", lang)');
code = code.replace(/t\("share_phone", "en"\)/g, 't("share_phone", lang)');
code = code.replace(/t\("type_phone", "en"\)/g, 't("type_phone", lang)');
code = code.replace(/await requestPhone\(chatId\);/g, 'await requestPhone(chatId, account?.preferred_lang || "en");');

fs.writeFileSync('src/app/api/telegram/webhook/route.ts', code);
console.log("Done translating");
