"use strict";

const WEURA = {
  history: [],
  conversations: [],
  currentConversationId: null,
  settings: {
    theme: "dark",
    language: "auto",
    enterSend: true,
    memory: true,
    webSearch: true,
    sound: true
  },
  recognition: null,
  mediaStream: null,
  lastPrompt: "",
  isGenerating: false
};

/* =========================
   DOM
========================= */

const $ = (selector) =>
  document.querySelector(selector);

const messagesEl = $("#messages");
const inputEl = $("#messageInput");
const sendBtn = $("#sendBtn");
const stopBtn = $("#stopBtn");
const welcomeEl = $("#welcome");
const sidebar = $("#sidebar");
const overlay = $("#overlay");
const modeSelect = $("#modeSelect");
const searchToggle = $("#searchToggle");
const fileInput = $("#fileInput");
const imageInput = $("#imageInput");
const cameraInput = $("#cameraInput");

/* =========================
   STORAGE
========================= */

function saveState() {
  localStorage.setItem(
    "weura_history",
    JSON.stringify(WEURA.history)
  );

  localStorage.setItem(
    "weura_conversations",
    JSON.stringify(
      WEURA.conversations
    )
  );

  localStorage.setItem(
    "weura_settings",
    JSON.stringify(
      WEURA.settings
    )
  );
}

function loadState() {
  try {
    WEURA.history =
      JSON.parse(
        localStorage.getItem(
          "weura_history"
        )
      ) || [];

    WEURA.conversations =
      JSON.parse(
        localStorage.getItem(
          "weura_conversations"
        )
      ) || [];

    const settings =
      JSON.parse(
        localStorage.getItem(
          "weura_settings"
        )
      );

    if (settings) {
      WEURA.settings = {
        ...WEURA.settings,
        ...settings
      };
    }
  } catch {
    WEURA.history = [];
    WEURA.conversations = [];
  }

  applyTheme();
}

/* =========================
   THEME
========================= */

function applyTheme() {
  let theme = WEURA.settings.theme;

  if (theme === "auto") {
    theme = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "dark"
      : "light";
  }

  document.documentElement.dataset.theme =
    theme;
}

/* =========================
   LANGUAGE
========================= */

function detectLanguage(text) {
  if (!text) return "en";

  if (
    /[\u0600-\u06FF]/.test(text)
  ) {
    return "ar";
  }

  if (
    /[àâçéèêëîïôûùüÿœ]/i.test(text)
  ) {
    return "fr";
  }

  return "en";
}

function applyDirection(text) {
  const lang = detectLanguage(text);

  if (lang === "ar") {
    document.documentElement.dir =
      "rtl";
  } else {
    document.documentElement.dir =
      "ltr";
  }
}

/* =========================
   UI
========================= */

function showWelcome(show = true) {
  if (!welcomeEl) return;

  welcomeEl.style.display = show
    ? "flex"
    : "none";
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop =
      messagesEl.scrollHeight;
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function simpleMarkdown(text) {
  let html = escapeHTML(text);

  html = html.replace(
    /```([\s\S]*?)```/g,
    (_, code) =>
      `<pre class="code-block"><code>${code}</code></pre>`
  );

  html = html.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  html = html.replace(
    /^### (.*)$/gm,
    "<h3>$1</h3>"
  );

  html = html.replace(
    /^## (.*)$/gm,
    "<h2>$1</h2>"
  );

  html = html.replace(
    /^# (.*)$/gm,
    "<h1>$1</h1>"
  );

  html = html.replace(
    /\n/g,
    "<br>"
  );

  return html;
}

/* =========================
   MESSAGE UI
========================= */

function addMessage(
  role,
  content,
  options = {}
) {
  showWelcome(false);

  const article =
    document.createElement("article");

  article.className =
    `message ${role}`;

  const avatar =
    document.createElement("div");

  avatar.className = "message-avatar";

  avatar.innerHTML =
    role === "assistant"
      ? `<span class="mini-logo">W</span>`
      : `<span class="user-avatar">U</span>`;

  const body =
    document.createElement("div");

  body.className =
    "message-body";

  const label =
    document.createElement("div");

  label.className =
    "message-label";

  label.textContent =
    role === "assistant"
      ? "WEURA"
      : "You";

  const contentEl =
    document.createElement("div");

  contentEl.className =
    "message-content";

  if (options.html) {
    contentEl.innerHTML =
      options.html;
  } else {
    contentEl.innerHTML =
      simpleMarkdown(content);
  }

  body.appendChild(label);
  body.appendChild(contentEl);

  if (role === "assistant") {
    const actions =
      document.createElement("div");

    actions.className =
      "message-actions";

    actions.innerHTML = `
      <button data-action="copy">Copy</button>
      <button data-action="regenerate">Regenerate</button>
    `;

    actions
      .querySelector(
        '[data-action="copy"]'
      )
      .onclick = () =>
        copyText(content);

    actions
      .querySelector(
        '[data-action="regenerate"]'
      )
      .onclick = regenerate;

    body.appendChild(actions);
  }

  article.appendChild(avatar);
  article.appendChild(body);

  messagesEl.appendChild(article);

  scrollToBottom();

  return contentEl;
}

function addTypingMessage() {
  return addMessage(
    "assistant",
    "",
    {
      html: `
        <div class="typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      `
    }
  );
}

/* =========================
   CHAT
========================= */

async function sendMessage(prompt = null) {
  const text =
    prompt ??
    inputEl.value.trim();

  if (!text || WEURA.isGenerating) {
    return;
  }

  WEURA.lastPrompt = text;
  WEURA.isGenerating = true;

  applyDirection(text);

  inputEl.value = "";
  inputEl.style.height = "auto";

  addMessage("user", text);

  WEURA.history.push({
    role: "user",
    content: text
  });

  saveState();

  sendBtn.disabled = true;
  stopBtn.style.display = "inline-flex";

  const typing =
    addTypingMessage();

  try {
    let searchResults = [];

    if (
      WEURA.settings.webSearch &&
      shouldSearch(text)
    ) {
      setStatus(
        "Searching the web…"
      );

      const searchResponse =
        await performSearch(text);

      searchResults =
        searchResponse?.results ||
        [];
    }

    setStatus(
      "WEURA is thinking…"
    );

    const response =
      await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          message: text,
          messages:
            WEURA.history,
          mode:
            modeSelect?.value ||
            "smart",
          memory:
            getMemoryContext(),
          searchResults
        })
      });

    const data =
      await response.json();

    typing.parentElement
      ?.parentElement
      ?.remove();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          "Request failed."
      );
    }

    addMessage(
      "assistant",
      data.answer
    );

    WEURA.history.push({
      role: "assistant",
      content: data.answer
    });

    saveState();

    if (
      WEURA.settings.memory
    ) {
      await considerMemory(
        text
      );
    }

    if (
      WEURA.settings.sound &&
      window.speechSynthesis &&
      document.body.dataset.voice ===
        "auto"
    ) {
      // Voice is intentionally opt-in.
    }
  } catch (error) {
    typing.parentElement
      ?.parentElement
      ?.remove();

    addMessage(
      "assistant",
      `**WEURA encountered an error.**\n\n${error.message}`
    );
  } finally {
    WEURA.isGenerating = false;
    sendBtn.disabled = false;
    stopBtn.style.display =
      "none";

    setStatus("Ready");
  }
}

/* =========================
   SEARCH
========================= */

function shouldSearch(text) {
  const keywords = [
    "latest",
    "today",
    "news",
    "current",
    "recent",
    "price",
    "weather",
    "who is",
    "what happened",
    "آخر",
    "اليوم",
    "الأخبار",
    "حاليا",
    "السعر",
    "الطقس",
    "من هو",
    "ماذا حدث"
  ];

  const value =
    text.toLowerCase();

  return keywords.some(
    (keyword) =>
      value.includes(keyword)
  );
}

async function performSearch(query) {
  try {
    const response =
      await fetch(
        "/api/search",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            query
          })
        }
      );

    return await response.json();
  } catch {
    return {
      results: []
    };
  }
}

/* =========================
   MEMORY
========================= */

function getMemoryContext() {
  if (
    !WEURA.settings.memory
  ) {
    return "";
  }

  try {
    return (
      localStorage.getItem(
        "weura_memory"
      ) || ""
    );
  } catch {
    return "";
  }
}

async function considerMemory(text) {
  if (text.length < 25) {
    return;
  }

  try {
    const response =
      await fetch(
        "/api/memory",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            text
          })
        }
      );

    const data =
      await response.json();

    if (
      data.ok &&
      data.save &&
      data.memory
    ) {
      localStorage.setItem(
        "weura_memory",
        data.memory
      );
    }
  } catch {
    // Memory is optional.
  }
}

/* =========================
   REGENERATE
========================= */

async function regenerate() {
  if (!WEURA.lastPrompt) {
    return;
  }

  const previous =
    WEURA.history.at(-1);

  if (
    previous?.role === "assistant"
  ) {
    WEURA.history.pop();
  }

  await sendMessage(
    WEURA.lastPrompt
  );
}

/* =========================
   STOP
========================= */

function stopGeneration() {
  window.location.reload();
}

/* =========================
   FILES
========================= */

async function analyzeFile(file) {
  if (!file) return;

  addMessage(
    "user",
    `📎 ${file.name}`
  );

  setStatus(
    "Analyzing file…"
  );

  const form =
    new FormData();

  form.append(
    "file",
    file
  );

  form.append(
    "question",
    "Analyze this file carefully and give me the most useful information."
  );

  try {
    const response =
      await fetch(
        "/api/file",
        {
          method: "POST",
          body: form
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "File analysis failed."
      );
    }

    addMessage(
      "assistant",
      data.answer
    );
  } catch (error) {
    addMessage(
      "assistant",
      `**File analysis failed:** ${error.message}`
    );
  } finally {
    setStatus("Ready");
  }
}

/* =========================
   IMAGE / VISION
========================= */

async function analyzeImage(file) {
  if (!file) return;

  addMessage(
    "user",
    `🖼️ ${file.name}`
  );

  setStatus(
    "Analyzing image…"
  );

  const form =
    new FormData();

  form.append(
    "image",
    file
  );

  form.append(
    "prompt",
    "Analyze this image in detail. Describe important objects, text, layout, context and anything relevant. If there is readable text, transcribe the important parts."
  );

  try {
    const response =
      await fetch(
        "/api/vision",
        {
          method: "POST",
          body: form
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Vision failed."
      );
    }

    addMessage(
      "assistant",
      data.answer
    );
  } catch (error) {
    addMessage(
      "assistant",
      `**Vision error:** ${error.message}`
    );
  } finally {
    setStatus("Ready");
  }
}

/* =========================
   COPY
========================= */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(
      text
    );

    setStatus(
      "Copied to clipboard"
    );

    setTimeout(
      () => setStatus("Ready"),
      1200
    );
  } catch {
    setStatus(
      "Copy failed"
    );
  }
}

/* =========================
   VOICE
========================= */

function startVoice() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert(
      "Voice input is not supported by this browser."
    );
    return;
  }

  if (WEURA.recognition) {
    WEURA.recognition.stop();
    WEURA.recognition = null;
    return;
  }

  const recognition =
    new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang =
    document.documentElement.dir ===
    "rtl"
      ? "ar-DZ"
      : "en-US";

  recognition.onstart = () =>
    setStatus(
      "Listening…"
    );

  recognition.onresult = (event) => {
    let result = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      result +=
        event.results[i][0]
          .transcript;
    }

    inputEl.value = result;
    autoResize();
  };

  recognition.onend = () => {
    setStatus("Ready");
    WEURA.recognition =
      null;
  };

  recognition.onerror = () => {
    setStatus(
      "Voice input failed"
    );
    WEURA.recognition =
      null;
  };

  WEURA.recognition =
    recognition;

  recognition.start();
}

/* =========================
   SPEAK
========================= */

function speak(text) {
  if (
    !window.speechSynthesis
  ) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(
      text
    );

  utterance.lang =
    detectLanguage(text) ===
    "ar"
      ? "ar-SA"
      : "en-US";

  window.speechSynthesis.speak(
    utterance
  );
}

/* =========================
   CAMERA
========================= */

async function openCamera() {
  try {
    const video =
      document.createElement(
        "video"
      );

    video.autoplay = true;
    video.playsInline = true;

    const stream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: true
        }
      );

    WEURA.mediaStream =
      stream;

    const modal =
      document.createElement(
        "div"
      );

    modal.className =
      "camera-modal";

    modal.innerHTML = `
      <div class="camera-card">
        <video autoplay playsinline></video>
        <div class="camera-actions">
          <button id="cameraCapture">
            Capture
          </button>
          <button id="cameraClose">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(
      modal
    );

    const cameraVideo =
      modal.querySelector(
        "video"
      );

    cameraVideo.srcObject =
      stream;

    modal.querySelector(
      "#cameraCapture"
    ).onclick = () => {
      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width =
        cameraVideo.videoWidth;

      canvas.height =
        cameraVideo.videoHeight;

      canvas
        .getContext("2d")
        .drawImage(
          cameraVideo,
          0,
          0
        );

      canvas.toBlob(
        (blob) => {
          const file =
            new File(
              [blob],
              "camera-image.jpg",
              {
                type: "image/jpeg"
              }
            );

          analyzeImage(file);
        },
        "image/jpeg",
        0.9
      );

      closeCamera(modal);
    };

    modal.querySelector(
      "#cameraClose"
    ).onclick = () =>
      closeCamera(modal);
  } catch (error) {
    alert(
      "Camera access was unavailable."
    );
  }
}

function closeCamera(modal) {
  if (WEURA.mediaStream) {
    WEURA.mediaStream
      .getTracks()
      .forEach((track) =>
        track.stop()
      );

    WEURA.mediaStream =
      null;
  }

  modal.remove();
}

/* =========================
   STATUS
========================= */

function setStatus(text) {
  const el =
    $("#statusText");

  if (el) {
    el.textContent = text;
  }
}

/* =========================
   TEXTAREA
========================= */

function autoResize() {
  inputEl.style.height =
    "auto";

  inputEl.style.height =
    Math.min(
      inputEl.scrollHeight,
      180
    ) + "px";
}

/* =========================
   NEW CHAT
========================= */

function newChat() {
  WEURA.history = [];
  WEURA.currentConversationId =
    crypto.randomUUID();

  messagesEl.innerHTML = "";

  showWelcome(true);

  inputEl.value = "";

  saveState();

  closeSidebarMobile();
}

/* =========================
   SIDEBAR
========================= */

function toggleSidebar() {
  sidebar.classList.toggle(
    "open"
  );

  overlay.classList.toggle(
    "show"
  );
}

function closeSidebarMobile() {
  sidebar.classList.remove(
    "open"
  );

  overlay.classList.remove(
    "show"
  );
}

/* =========================
   EVENTS
========================= */

sendBtn?.addEventListener(
  "click",
  () => sendMessage()
);

stopBtn?.addEventListener(
  "click",
  stopGeneration
);

inputEl?.addEventListener(
  "input",
  autoResize
);

inputEl?.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      WEURA.settings.enterSend
    ) {
      event.preventDefault();
      sendMessage();
    }
  }
);

$("#menuBtn")?.addEventListener(
  "click",
  toggleSidebar
);

overlay?.addEventListener(
  "click",
  closeSidebarMobile
);

$("#newChatBtn")?.addEventListener(
  "click",
  newChat
);

$("#voiceBtn")?.addEventListener(
  "click",
  startVoice
);

$("#cameraBtn")?.addEventListener(
  "click",
  openCamera
);

$("#fileBtn")?.addEventListener(
  "click",
  () => fileInput.click()
);

$("#imageBtn")?.addEventListener(
  "click",
  () => imageInput.click()
);

fileInput?.addEventListener(
  "change",
  (event) => {
    analyzeFile(
      event.target.files?.[0]
    );

    event.target.value = "";
  }
);

imageInput?.addEventListener(
  "change",
  (event) => {
    analyzeImage(
      event.target.files?.[0]
    );

    event.target.value = "";
  }
);

cameraInput?.addEventListener(
  "change",
  (event) => {
    analyzeImage(
      event.target.files?.[0]
    );

    event.target.value = "";
  }
);

/* Quick actions */

document
  .querySelectorAll(
    "[data-prompt]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const prompt =
          button.dataset.prompt;

        inputEl.value =
          prompt;

        autoResize();

        inputEl.focus();
      }
    );
  });

/* Settings */

document
  .querySelectorAll(
    "[data-theme]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        WEURA.settings.theme =
          button.dataset.theme;

        applyTheme();
        saveState();
      }
    );
  });

/* =========================
   INIT
========================= */

function init() {
  loadState();

  showWelcome(
    WEURA.history.length === 0
  );

  if (
    WEURA.history.length
  ) {
    WEURA.history.forEach(
      (message) => {
        if (
          message.role ===
          "user"
        ) {
          addMessage(
            "user",
            message.content
          );
        }

        if (
          message.role ===
          "assistant"
        ) {
          addMessage(
            "assistant",
            message.content
          );
        }
      }
    );
  }

  setStatus("Ready");
}

window.sendMessage =
  sendMessage;

window.newChat =
  newChat;

window.startVoice =
  startVoice;

window.openCamera =
  openCamera;

window.speak =
  speak;

window.regenerate =
  regenerate;

window.stopGeneration =
  stopGeneration;

init();