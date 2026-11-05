// Attach photos/PDFs (lab results, ECG...) and dictate by voice.
// script.js calls window.takeAttachments() when the user presses Send.
(function () {
  "use strict";

  const MAX_FILES = 3;
  const MAX_PDF_BYTES = 6 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1600; // photos are shrunk to this before sending

  const $ = (id) => document.getElementById(id);
  const tray = $("attach-tray");
  const note = $("attach-note");
  const fileInput = $("file-input");
  const attachBtn = $("btn-attach");
  const micBtn = $("btn-mic");
  const voiceSel = $("voice-lang");
  const inputEl = $("message");
  const formEl = $("chat-form");

  const attachments = []; // { type, mediaType, data, previewUrl }

  function showNote(text, isError) {
    note.textContent = text;
    note.classList.toggle("error", Boolean(isError));
    note.classList.toggle("hidden", !text);
  }

  const DEFAULT_NOTE =
    "AI can misread photos and cannot replace a doctor. Check the numbers against your original and show it to your doctor. " +
    "Your name may be visible in documents: hide it if you prefer. Files are not saved by this app.";

  function renderTray() {
    tray.replaceChildren();
    tray.classList.toggle("hidden", attachments.length === 0);

    attachments.forEach((a, index) => {
      const chip = document.createElement("div");
      chip.className = "chip";

      if (a.type === "image") {
        const img = document.createElement("img");
        img.src = a.previewUrl;
        img.alt = "Attached photo";
        chip.appendChild(img);
      } else {
        const label = document.createElement("span");
        label.textContent = "📄 PDF";
        chip.appendChild(label);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove attachment");
      remove.addEventListener("click", () => {
        attachments.splice(index, 1);
        renderTray();
      });
      chip.appendChild(remove);
      tray.appendChild(chip);
    });

    showNote(attachments.length ? DEFAULT_NOTE : "", false);
  }

  // ---------- Reading files ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not open this image."));
      };
      img.src = url;
    });
  }

  async function processImage(file) {
    const { img, url } = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { type: "image", mediaType: "image/jpeg", data: dataUrl.split(",")[1], previewUrl: dataUrl };
  }

  function processPdf(file) {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_PDF_BYTES) {
        reject(new Error("This PDF is too large (6 MB maximum). Try a photo of the page instead."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        resolve({ type: "pdf", mediaType: "application/pdf", data: dataUrl.split(",")[1], previewUrl: "" });
      };
      reader.onerror = () => reject(new Error("Could not read this PDF."));
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList);
    let error = "";

    for (const file of files) {
      if (attachments.length >= MAX_FILES) {
        error = "You can attach up to " + MAX_FILES + " files at once.";
        break;
      }
      try {
        if (file.type.startsWith("image/")) {
          attachments.push(await processImage(file));
        } else if (file.type === "application/pdf") {
          attachments.push(await processPdf(file));
        } else {
          error = "Only photos and PDF files are supported.";
        }
      } catch (err) {
        error = err.message || "Could not add this file.";
      }
    }

    renderTray();
    if (error) showNote(error, true);
  }

  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = ""; // allow picking the same file again
  });

  // Used by script.js
  window.takeAttachments = function () {
    const out = attachments.splice(0, attachments.length);
    renderTray();
    return out;
  };
  window.restoreAttachments = function (list) {
    attachments.unshift(...list);
    attachments.length = Math.min(attachments.length, MAX_FILES);
    renderTray();
  };

  // ---------- Voice dictation ----------
  // Uses the browser's built-in speech recognition (Chrome, Edge, Android Chrome, Safari).
  // The browser turns speech into text; only the text is sent to the chat.
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  try {
    const saved = localStorage.getItem("voiceLang");
    if (saved && Array.from(voiceSel.options).some((o) => o.value === saved)) voiceSel.value = saved;
  } catch (_) {
    /* storage unavailable */
  }
  voiceSel.addEventListener("change", () => {
    try {
      localStorage.setItem("voiceLang", voiceSel.value);
    } catch (_) {
      /* ignore */
    }
  });

  if (!SpeechRecognition) {
    micBtn.classList.add("hidden");
    voiceSel.classList.add("hidden");
  } else {
    let recognition = null;
    let listening = false;
    let baseText = "";

    function setListening(on) {
      listening = on;
      micBtn.classList.toggle("listening", on);
      micBtn.setAttribute("aria-pressed", String(on));
      micBtn.title = on ? "Stop listening" : "Speak your message";
      if (on) showNote("Listening... speak now, then press the microphone again to stop.", false);
      else if (!attachments.length) showNote("", false);
    }

    micBtn.addEventListener("click", () => {
      if (listening && recognition) {
        recognition.stop();
        return;
      }
      if (!window.isSecureContext) {
        showNote("Voice needs a secure page (https or localhost).", true);
        return;
      }

      recognition = new SpeechRecognition();
      recognition.lang = voiceSel.value;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      baseText = inputEl.value ? inputEl.value.trimEnd() + " " : "";

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
        inputEl.value = baseText + transcript;
        inputEl.dispatchEvent(new Event("input")); // auto-grow the text box
      };
      recognition.onerror = (event) => {
        const messages = {
          "not-allowed": "Microphone permission was refused. Allow it in your browser settings.",
          "service-not-allowed": "Microphone permission was refused. Allow it in your browser settings.",
          "no-speech": "I did not hear anything. Try again.",
          "audio-capture": "No microphone was found.",
          network: "Voice typing needs an internet connection."
        };
        showNote(messages[event.error] || "Voice typing did not work. You can type instead.", true);
      };
      recognition.onend = () => setListening(false);

      try {
        recognition.start();
        setListening(true);
      } catch (_) {
        setListening(false);
      }
    });

    // Stop listening when the message is sent
    formEl.addEventListener("submit", () => {
      if (listening && recognition) recognition.abort();
    });
  }
})();
