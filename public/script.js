// ---------------------------------------------------------------
// CONFIG
// Leave API_URL empty to run in DEMO MODE (fake replies, no AI).
// Later, point it to YOUR backend, e.g. "https://your-server.com/api/chat".
// NEVER put your Claude API key in this file: anyone could steal it.
// Your backend should expect: { messages: [{role, content}, ...] }
// and return: { reply: "text" }
// ---------------------------------------------------------------
const API_URL = "/api/chat";

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message");
const sendBtn = document.getElementById("send");
const typingEl = document.getElementById("typing");

// Conversation history sent to the backend
const chatHistory = [];

// Words that trigger an emergency warning instead of a normal reply
const EMERGENCY_KEYWORDS = [
  // English
  "chest pain", "can't breathe", "cannot breathe", "difficulty breathing",
  "overdose", "suicide", "kill myself", "want to die", "severe bleeding",
  "unconscious", "stroke", "seizure", "heart attack", "poisoned",
  // French
  "douleur thoracique", "douleur dans la poitrine", "je n'arrive pas a respirer",
  "suicide", "me tuer", "envie de mourir", "hemorragie", "inconscient",
  "crise cardiaque", "avc", "surdose",
  // Arabic
  "ألم في الصدر", "لا أستطيع التنفس", "انتحار", "أريد أن أموت",
  "نزيف شديد", "فقدان الوعي", "جلطة", "نوبة قلبية", "جرعة زائدة"
];

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents (é -> e)
}

function isEmergency(text) {
  const t = normalize(text);
  return EMERGENCY_KEYWORDS.some((k) => t.includes(normalize(k)));
}

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "msg " + type;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

// ---- Attachments (photos / PDFs picked with the paperclip button, see media.js) ----
function addAttachmentPreviews(bubble, attachments) {
  for (const a of attachments) {
    if (a.type === "image" && a.previewUrl) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = a.previewUrl;
      img.alt = "Attached photo";
      bubble.appendChild(img);
    } else {
      const tag = document.createElement("div");
      tag.className = "file-tag";
      tag.textContent = "📄 PDF document";
      bubble.appendChild(tag);
    }
  }
}

// Short generic note kept in the history instead of the file itself
// (no file names, they can contain personal data).
function attachmentNote(attachments) {
  if (!attachments.length) return "";
  const images = attachments.filter((a) => a.type === "image").length;
  const pdfs = attachments.length - images;
  const parts = [];
  if (images) parts.push(images + " image" + (images > 1 ? "s" : ""));
  if (pdfs) parts.push(pdfs + " PDF" + (pdfs > 1 ? "s" : ""));
  return "\n[Patient attached: " + parts.join(" and ") + "]";
}

// Only the newest message carries the actual files; older ones are text only.
function buildPayloadMessages() {
  const last = chatHistory.length - 1;
  return chatHistory.map((m, i) => {
    const out = { role: m.role, content: m.content };
    if (i === last && m.attachments && m.attachments.length) {
      out.attachments = m.attachments.map((a) => ({
        type: a.type,
        mediaType: a.mediaType,
        data: a.data
      }));
    }
    return out;
  });
}

function stripAttachments() {
  chatHistory.forEach((m) => {
    delete m.attachments;
  });
}

function setLoading(isLoading) {
  typingEl.classList.toggle("hidden", !isLoading);
  sendBtn.disabled = isLoading;
  if (isLoading) chatEl.scrollTop = chatEl.scrollHeight;
}

// DEMO MODE reply (replace by real AI once you connect a backend)
function demoReply() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        "This is a demo reply. The app is not connected to an AI yet.\n\n" +
        "Once you connect a backend (see API_URL in script.js), real answers " +
        "will appear here."
      );
    }, 900);
  });
}

// REAL MODE reply: calls your backend
async function backendReply() {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: buildPayloadMessages() })
  });
  if (!res.ok) throw new Error("Server error " + res.status);
  const data = await res.json();
  return data.reply;
}

async function handleSend(text, attachments = []) {
  const bubble = addMessage(text, "user");
  addAttachmentPreviews(bubble, attachments);
  chatHistory.push({ role: "user", content: text + attachmentNote(attachments), attachments });

  // Safety check first
  if (isEmergency(text)) {
    addMessage(
      "This could be a medical emergency. Please contact your local " +
      "emergency services right now (in Morocco, for example, 141 or 15) " +
      "or go to the nearest emergency room. If you are thinking about " +
      "harming yourself, reach out to someone you trust or a crisis line " +
      "immediately. Please don't wait for a chat reply.",
      "emergency"
    );
    stripAttachments();
    return;
  }

  setLoading(true);
  try {
    const reply = API_URL ? await backendReply() : await demoReply();
    addMessage(reply, "bot");
    chatHistory.push({ role: "assistant", content: reply });
  } catch (err) {
    addMessage("Sorry, something went wrong. Please try again.", "bot");
    console.error(err);
    // Put the photos back in the tray so the user can just press Send again
    if (attachments.length && window.restoreAttachments) window.restoreAttachments(attachments);
  } finally {
    stripAttachments();
    setLoading(false);
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const typed = inputEl.value.trim();
  const attachments = window.takeAttachments ? window.takeAttachments() : [];
  if (!typed && !attachments.length) return;
  inputEl.value = "";
  inputEl.style.height = "auto";
  handleSend(typed || "Please look at the attached file(s).", attachments);
});

// Enter sends, Shift+Enter makes a new line
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

// Auto-grow the text box
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
});

// Welcome message
addMessage(
  "Hello! I can share general health information and help you understand " +
  "when it's a good idea to see a doctor. What would you like to ask?",
  "bot"
);
