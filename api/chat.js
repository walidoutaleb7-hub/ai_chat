"use strict";

/* =========================================================
   WEURA AI — CHAT.JS
   Frontend controller
   Think Beyond.
========================================================= */

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
    sound: true,
    protection: false,
    typingSpeed: 18,
    mode: "smart"
  },

  recognition: null,
  mediaStream: null,

  lastPrompt: "",
  lastAssistantMessage: "",

  isGenerating: false,
  abortController: null,
  generationToken: 0,

  userIsScrolling: false,
  initialized: false
};

/* =========================================================
   STORAGE
========================================================= */

const STORAGE = {
  history: "weura_history",
  conversations: "weura_conversations",
  settings: "weura_settings",
  current: "weura_current_conversation",
  memory: "weura_memory"
};

/* =========================================================
   ICONS
========================================================= */

const ICONS = {
  copy: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2"
        fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        fill="none" stroke="currentColor" stroke-width="1.8"/>
    </svg>
  `,

  copied: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  refresh: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round"/>
      <path d="M3 5v5h5"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 13a8.1 8.1 0 0 0 14.9 4L21 14"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round"/>
      <path d="M21 19v-5h-5"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  stop: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2"
        fill="currentColor"/>
    </svg>
  `,

  send: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 3 10 14"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m21 3-7 18-4-7-7-4Z"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  mic: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3"
        fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M5 11a7 7 0 0 0 14 0"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round"/>
      <path d="M12 18v3M8 21h8"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round"/>
    </svg>
  `,

  paperclip: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  image: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2"
        fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="8.5" cy="9" r="1.5"
        fill="none" stroke="currentColor" stroke-width="1.6"/>
      <path d="m4 17 5-5 3.5 3 2.5-2.5L20 17"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  camera: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linejoin="round"/>
      <circle cx="12" cy="13" r="4"
        fill="none" stroke="currentColor" stroke-width="1.8"/>
    </svg>
  `
};

/* =========================================================
   DOM
========================================================= */

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

const DOM = {
  messages: null,
  input: null,
  send: null,
  stop: null,
  welcome: null,
  sidebar: null,
  overlay: null,
  mode: null,
  search: null,
  fileInput: null,
  imageInput: null,
  cameraInput: null,
  historyList: null,
  statusText: null,
  menu: null,
  newChat: null,
  settings: null,
  theme: null,
  voice: null,
  camera: null,
  file: null,
  image: null
};

function cacheDOM() {
  DOM.messages = $("#messages");
  DOM.input = $("#messageInput");
  DOM.send = $("#sendBtn");
  DOM.stop = $("#stopBtn");
  DOM.welcome = $("#welcome");

  DOM.sidebar = $("#sidebar");
  DOM.overlay = $("#overlay");

  DOM.mode = $("#modeSelect");
  DOM.search = $("#searchToggle");

  DOM.fileInput = $("#fileInput");
  DOM.imageInput = $("#imageInput");
  DOM.cameraInput = $("#cameraInput");

  DOM.historyList = $("#historyList");
  DOM.statusText = $("#statusText");

  DOM.menu = $("#menuBtn");
  DOM.newChat = $("#newChatBtn");
  DOM.settings = $("#settingsBtn");
  DOM.theme = $("#themeBtn");

  DOM.voice = $("#voiceBtn");
  DOM.camera = $("#cameraBtn");
  DOM.file = $("#fileBtn");
  DOM.image = $("#imageBtn");
}

/* =========================================================
   SAFE STORAGE
========================================================= */

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/* =========================================================
   HELPERS
========================================================= */

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    String(error?.message || "").toLowerCase().includes("aborted")
  );
}

function setStatus(text) {
  if (DOM.statusText) {
    DOM.statusText.textContent = text;
  }
}

/* =========================================================
   THEME
========================================================= */

function applyTheme() {
  const theme = WEURA.settings.theme || "dark";

  document.documentElement.dataset.theme = theme;

  if (theme === "auto") {
    const dark = window.matchMedia?.(
      "(prefers-color-scheme: dark)"
    ).matches;

    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  } else {
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark"
    );

    document.documentElement.classList.toggle(
      "light",
      theme === "light"
    );
  }

  storageSet(STORAGE.settings, WEURA.settings);
}

function cycleTheme() {
  const themes = ["dark", "light", "auto"];
  const current = themes.indexOf(WEURA.settings.theme);
  const next = themes[(current + 1) % themes.length];

  WEURA.settings.theme = next;
  applyTheme();

  setStatus(
    next === "dark"
      ? "Dark mode"
      : next === "light"
        ? "Light mode"
        : "System theme"
  );
}

function listenSystemTheme() {
  const media = window.matchMedia?.(
    "(prefers-color-scheme: dark)"
  );

  if (!media) return;

  const handler = () => {
    if (WEURA.settings.theme === "auto") {
      applyTheme();
    }
  };

  if (media.addEventListener) {
    media.addEventListener("change", handler);
  } else if (media.addListener) {
    media.addListener(handler);
  }
}

/* =========================================================
   LANGUAGE / DIRECTION
========================================================= */

function detectLanguage(text) {
  const value = String(text || "");

  if (/[\u0600-\u06FF]/.test(value)) {
    return "ar";
  }

  if (/[àâçéèêëîïôùûüÿœ]/i.test(value)) {
    return "fr";
  }

  return "en";
}

function applyDirection(text = "") {
  if (!document.documentElement) return;

  const language =
    WEURA.settings.language === "auto"
      ? detectLanguage(text)
      : WEURA.settings.language;

  const rtl = language === "ar";

  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = language;
}

/* =========================================================
   CONVERSATIONS
========================================================= */

function generateConversationTitle(text) {
  const clean = normalizeText(text);

  if (!clean) return "New conversation";

  return clean
    .replace(/\s+/g, " ")
    .slice(0, 42);
}

function ensureConversation() {
  if (WEURA.currentConversationId) {
    const existing = WEURA.conversations.find(
      c => c.id === WEURA.currentConversationId
    );

    if (existing) return existing;
  }

  const conversation = {
    id: uid("conv"),
    title: "New conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  WEURA.conversations.unshift(conversation);
  WEURA.currentConversationId = conversation.id;

  saveState();

  return conversation;
}

function getCurrentConversation() {
  return ensureConversation();
}

function syncConversation() {
  const conversation = getCurrentConversation();

  conversation.messages = WEURA.history.map(message => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || Date.now()
  }));

  conversation.updatedAt = Date.now();

  const firstUser = WEURA.history.find(
    message => message.role === "user"
  );

  if (
    firstUser &&
    conversation.title === "New conversation"
  ) {
    conversation.title = generateConversationTitle(
      firstUser.content
    );
  }

  WEURA.conversations = WEURA.conversations
    .filter(c => c.id !== conversation.id);

  WEURA.conversations.unshift(conversation);

  saveState();
  renderConversationList();
}

function loadConversation(id) {
  const conversation = WEURA.conversations.find(
    c => c.id === id
  );

  if (!conversation) return;

  stopGeneration(false);

  WEURA.currentConversationId = conversation.id;

  WEURA.history = Array.isArray(conversation.messages)
    ? conversation.messages.map(message => ({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || Date.now()
      }))
    : [];

  renderHistory(true);
  renderConversationList();
  saveState();

  closeSidebar();
  setStatus("Ready");

  if (DOM.input) {
    DOM.input.focus();
  }
}

function deleteConversation(id) {
  WEURA.conversations =
    WEURA.conversations.filter(c => c.id !== id);

  if (WEURA.currentConversationId === id) {
    WEURA.currentConversationId = null;
    WEURA.history = [];
    ensureConversation();
    renderHistory();
  }

  saveState();
  renderConversationList();
}

function renderConversationList() {
  if (!DOM.historyList) return;

  DOM.historyList.innerHTML = "";

  const conversations = WEURA.conversations
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!conversations.length) {
    DOM.historyList.innerHTML = `
      <div class="history-empty">
        No conversations yet
      </div>
    `;
    return;
  }

  conversations.forEach(conversation => {
    const item = document.createElement("div");

    item.className =
      "history-item" +
      (
        conversation.id === WEURA.currentConversationId
          ? " active"
          : ""
      );

    item.dataset.id = conversation.id;

    item.innerHTML = `
      <button
        class="history-main"
        type="button"
        aria-label="Open conversation"
      >
        <span class="history-title">
          ${escapeHTML(conversation.title || "Conversation")}
        </span>
      </button>

      <button
        class="history-delete"
        type="button"
        aria-label="Delete conversation"
        title="Delete"
      >
        ×
      </button>
    `;

    const openButton = $(".history-main", item);
    const deleteButton = $(".history-delete", item);

    openButton?.addEventListener("click", () => {
      loadConversation(conversation.id);
    });

    deleteButton?.addEventListener("click", event => {
      event.stopPropagation();

      if (
        window.confirm(
          "Delete this conversation?"
        )
      ) {
        deleteConversation(conversation.id);
      }
    });

    DOM.historyList.appendChild(item);
  });
}

/* =========================================================
   STATE
========================================================= */

function saveState() {
  storageSet(STORAGE.history, WEURA.history);
  storageSet(STORAGE.conversations, WEURA.conversations);
  storageSet(STORAGE.settings, WEURA.settings);

  if (WEURA.currentConversationId) {
    storageSet(
      STORAGE.current,
      WEURA.currentConversationId
    );
  }
}

function loadState() {
  const savedSettings = storageGet(
    STORAGE.settings,
    {}
  );

  WEURA.settings = {
    ...WEURA.settings,
    ...(savedSettings || {})
  };

  const savedHistory = storageGet(
    STORAGE.history,
    []
  );

  const savedConversations = storageGet(
    STORAGE.conversations,
    []
  );

  WEURA.history =
    Array.isArray(savedHistory)
      ? savedHistory
      : [];

  WEURA.conversations =
    Array.isArray(savedConversations)
      ? savedConversations
      : [];

  WEURA.currentConversationId =
    storageGet(STORAGE.current, null);

  if (
    WEURA.currentConversationId &&
    !WEURA.conversations.some(
      c => c.id === WEURA.currentConversationId
    )
  ) {
    WEURA.currentConversationId = null;
  }
}

/* =========================================================
   WELCOME
========================================================= */

function updateWelcome() {
  if (!DOM.welcome) return;

  DOM.welcome.style.display =
    WEURA.history.length === 0
      ? ""
      : "none";
}

/* =========================================================
   SCROLL
========================================================= */

function isNearBottom() {
  if (!DOM.messages) return true;

  const distance =
    DOM.messages.scrollHeight -
    DOM.messages.scrollTop -
    DOM.messages.clientHeight;

  return distance < 120;
}

function smartScroll(force = false) {
  if (!DOM.messages) return;

  if (force || !WEURA.userIsScrolling) {
    DOM.messages.scrollTo({
      top: DOM.messages.scrollHeight,
      behavior: "smooth"
    });
  }
}

function handleScroll() {
  WEURA.userIsScrolling = !isNearBottom();
}

/* =========================================================
   MARKDOWN-LITE
========================================================= */

function formatAssistantText(text) {
  let value = escapeHTML(text);

  value = value.replace(
    /```([\s\S]*?)```/g,
    (_, code) => `
      <pre class="code-block"><code>${code
        .trim()
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</code></pre>
    `
  );

  value = value.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  value = value.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  value = value.replace(
    /\n/g,
    "<br>"
  );

  return value;
}

/* =========================================================
   MESSAGE UI
========================================================= */

function createMessageElement(role, content, options = {}) {
  const wrapper = document.createElement("article");

  wrapper.className =
    `message ${role}` +
    (options.generating ? " generating" : "");

  wrapper.dataset.role = role;

  if (role === "assistant") {
    wrapper.innerHTML = `
      <div class="message-avatar" aria-hidden="true">
        <div class="weura-mini-logo">W</div>
      </div>

      <div class="message-content">
        <div class="message-body"></div>

        <div class="message-actions">
          <button
            type="button"
            class="message-action copy-btn"
            title="Copy"
            aria-label="Copy"
          >
            ${ICONS.copy}
          </button>

          <button
            type="button"
            class="message-action regenerate-btn"
            title="Regenerate"
            aria-label="Regenerate"
          >
            ${ICONS.refresh}
          </button>
        </div>
      </div>
    `;
  } else {
    wrapper.innerHTML = `
      <div class="message-avatar user-avatar" aria-hidden="true">
        U
      </div>

      <div class="message-content">
        <div class="message-body"></div>
      </div>
    `;
  }

  const body = $(".message-body", wrapper);

  if (body) {
    if (role === "assistant") {
      body.innerHTML = formatAssistantText(content);
    } else {
      body.textContent = content;
    }
  }

  if (role === "assistant") {
    const copyButton = $(".copy-btn", wrapper);
    const regenerateButton =
      $(".regenerate-btn", wrapper);

    copyButton?.addEventListener(
      "click",
      () => {
        copyText(
          normalizeText(content),
          copyButton
        );
      }
    );

    regenerateButton?.addEventListener(
      "click",
      () => regenerateLast()
    );
  }

  return wrapper;
}

function addMessage(role, content, options = {}) {
  if (!DOM.messages) return null;

  const element = createMessageElement(
    role,
    content,
    options
  );

  DOM.messages.appendChild(element);

  updateWelcome();

  /*
    Do not force scroll when rendering old history.
  */
  if (!options.skipScroll) {
    smartScroll(Boolean(options.forceScroll));
  }

  return element;
}

function createTypingMessage() {
  if (!DOM.messages) return null;

  const element = document.createElement("article");

  element.className = "message assistant generating";

  element.innerHTML = `
    <div class="message-avatar" aria-hidden="true">
      <div class="weura-mini-logo">W</div>
    </div>

    <div class="message-content">
      <div class="message-body typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;

  DOM.messages.appendChild(element);

  smartScroll(false);

  return element;
}

/* =========================================================
   TYPING
========================================================= */

async function typeResponse(
  element,
  text,
  token
) {
  const body = $(".message-body", element);

  if (!body) return false;

  const value = String(text || "");

  body.classList.remove("typing-indicator");

  let current = "";

  const speed = Math.max(
    1,
    Number(WEURA.settings.typingSpeed) || 18
  );

  const chunkSize =
    value.length > 500
      ? 5
      : value.length > 200
        ? 3
        : 2;

  for (
    let index = 0;
    index < value.length;
    index += chunkSize
  ) {
    if (token !== WEURA.generationToken) {
      return false;
    }

    current += value.slice(
      index,
      index + chunkSize
    );

    body.innerHTML =
      formatAssistantText(current);

    /*
      Follow the response only when the user
      was already near the bottom.
    */
    if (!WEURA.userIsScrolling) {
      DOM.messages?.scrollTo({
        top: DOM.messages.scrollHeight,
        behavior: "auto"
      });
    }

    await sleep(speed);
  }

  body.innerHTML =
    formatAssistantText(value);

  return true;
}

/* =========================================================
   FETCH HELPER
========================================================= */

async function apiFetch(
  url,
  options = {},
  controller = null
) {
  const config = {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type": "application/json"
          }),
      ...(options.headers || {})
    }
  };

  if (controller) {
    config.signal = controller.signal;
  }

  const response = await fetch(url, config);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

/* =========================================================
   SEARCH
========================================================= */

function shouldSearch(text) {
  if (!WEURA.settings.webSearch) {
    return false;
  }

  const value = String(text || "").toLowerCase();

  const keywords = [
    "latest",
    "today",
    "yesterday",
    "tomorrow",
    "news",
    "current",
    "recent",
    "price",
    "weather",
    "search",
    "look up",
    "who is",
    "what happened",

    "اليوم",
    "أخبار",
    "خبر",
    "آخر",
    "اخر",
    "حاليا",
    "حاليًا",
    "الآن",
    "الان",
    "ابحث",
    "بحث",
    "السعر",
    "الطقس",
    "من هو",
    "ماذا حدث",
    "آخر الأخبار",
    "اخر الاخبار"
  ];

  return keywords.some(
    keyword => value.includes(keyword)
  );
}

async function performSearch(query) {
  const data = await apiFetch(
    "/api/search",
    {
      method: "POST",
      body: JSON.stringify({
        query
      })
    },
    null
  );

  if (!data?.ok) {
    return [];
  }

  return Array.isArray(data.results)
    ? data.results
    : [];
}

/* =========================================================
   MEMORY
========================================================= */

function getMemoryContext() {
  if (!WEURA.settings.memory) {
    return "";
  }

  try {
    return localStorage.getItem(
      STORAGE.memory
    ) || "";
  } catch {
    return "";
  }
}

async function considerMemory(text) {
  if (!WEURA.settings.memory) return;

  if (!text || text.length < 15) return;

  try {
    const data = await apiFetch(
      "/api/memory",
      {
        method: "POST",
        body: JSON.stringify({
          text
        })
      }
    );

    if (
      data?.ok &&
      data.save &&
      data.memory
    ) {
      const existing =
        getMemoryContext();

      const memories = existing
        ? `${existing}\n${data.memory}`
        : data.memory;

      localStorage.setItem(
        STORAGE.memory,
        memories.slice(-20000)
      );
    }
  } catch (error) {
    console.warn(
      "Memory classification failed:",
      error
    );
  }
}

/* =========================================================
   CHAT
========================================================= */

async function sendMessage(prompt = null) {
  if (WEURA.isGenerating) return;

  const text = normalizeText(
    prompt !== null
      ? prompt
      : DOM.input?.value
  );

  if (!text) return;

  WEURA.lastPrompt = text;
  WEURA.isGenerating = true;

  const token =
    ++WEURA.generationToken;

  WEURA.abortController =
    new AbortController();

  applyDirection(text);

  const conversation =
    getCurrentConversation();

  /*
    User message
  */
  WEURA.history.push({
    role: "user",
    content: text,
    timestamp: Date.now()
  });

  conversation.title =
    conversation.title === "New conversation"
      ? generateConversationTitle(text)
      : conversation.title;

  if (DOM.input) {
    DOM.input.value = "";
    autoResize();
  }

  addMessage(
    "user",
    text,
    {
      forceScroll: true
    }
  );

  syncConversation();

  setGeneratingUI(true);
  setStatus("Thinking…");

  const typingElement =
    createTypingMessage();

  try {
    let searchResults = [];

    /*
      Unified smart search
    */
    if (shouldSearch(text)) {
      setStatus("Searching…");

      try {
        searchResults =
          await performSearch(text);
      } catch (searchError) {
        console.warn(
          "Search unavailable:",
          searchError
        );
      }
    }

    if (
      token !== WEURA.generationToken
    ) {
      return;
    }

    setStatus(
      searchResults.length
        ? "Thinking with sources…"
        : "Thinking…"
    );

    const messages = WEURA.history
      .slice(-24)
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    const data = await apiFetch(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({
          message: text,
          messages,
          mode:
            DOM.mode?.value ||
            WEURA.settings.mode ||
            "smart",
          memory:
            getMemoryContext(),
          searchResults
        })
      },
      WEURA.abortController
    );

    if (
      token !== WEURA.generationToken
    ) {
      return;
    }

    const answer =
      normalizeText(data?.answer);

    if (!answer) {
      throw new Error(
        "WEURA returned an empty response."
      );
    }

    typingElement?.remove();

    const assistantElement =
      addMessage(
        "assistant",
        "",
        {
          skipScroll: true
        }
      );

    if (!assistantElement) {
      throw new Error(
        "Could not create assistant message."
      );
    }

    const completed =
      await typeResponse(
        assistantElement,
        answer,
        token
      );

    if (!completed) {
      return;
    }

    WEURA.lastAssistantMessage =
      answer;

    WEURA.history.push({
      role: "assistant",
      content: answer,
      timestamp: Date.now()
    });

    syncConversation();

    setStatus("Ready");

    /*
      Memory runs after the response,
      without blocking the UI.
    */
    considerMemory(text).catch(() => {});

  } catch (error) {
    typingElement?.remove();

    if (
      isAbortError(error) ||
      token !== WEURA.generationToken
    ) {
      setStatus("Stopped");
      return;
    }

    console.error(
      "WEURA CHAT ERROR:",
      error
    );

    const message =
      error?.message ||
      "Something went wrong while contacting WEURA.";

    addMessage(
      "assistant",
      `⚠️ ${message}`,
      {
        skipScroll: false
      }
    );

    setStatus("Connection error");

  } finally {
    if (
      token === WEURA.generationToken
    ) {
      WEURA.isGenerating = false;
      WEURA.abortController = null;
      setGeneratingUI(false);
    }
  }
}

/* =========================================================
   GENERATION UI
========================================================= */

function setGeneratingUI(generating) {
  if (DOM.send) {
    DOM.send.disabled = generating;
  }

  if (DOM.stop) {
    DOM.stop.style.display =
      generating
        ? "inline-flex"
        : "none";
  }

  if (DOM.input) {
    DOM.input.disabled = false;
  }

  if (DOM.voice) {
    DOM.voice.disabled = generating;
  }
}

/* =========================================================
   STOP
========================================================= */

function stopGeneration(updateStatus = true) {
  if (!WEURA.isGenerating) {
    if (updateStatus) {
      setStatus("Ready");
    }
    return;
  }

  WEURA.generationToken++;

  if (WEURA.abortController) {
    try {
      WEURA.abortController.abort();
    } catch {}
  }

  WEURA.abortController = null;
  WEURA.isGenerating = false;

  $$(".message.generating").forEach(
    element => element.remove()
  );

  setGeneratingUI(false);

  if (updateStatus) {
    setStatus("Stopped");
  }
}

/* =========================================================
   REGENERATE
========================================================= */

async function regenerateLast() {
  if (WEURA.isGenerating) return;

  let assistantIndex = -1;

  for (
    let i = WEURA.history.length - 1;
    i >= 0;
    i--
  ) {
    if (
      WEURA.history[i].role === "assistant"
    ) {
      assistantIndex = i;
      break;
    }
  }

  if (assistantIndex !== -1) {
    WEURA.history.splice(
      assistantIndex,
      1
    );
  }

  let userIndex = -1;

  for (
    let i = WEURA.history.length - 1;
    i >= 0;
    i--
  ) {
    if (
      WEURA.history[i].role === "user"
    ) {
      userIndex = i;
      break;
    }
  }

  if (userIndex === -1) {
    return;
  }

  const prompt =
    WEURA.history[userIndex].content;

  /*
    Re-render without duplicating
    the user's message in history.
  */
  renderHistory(true);

  WEURA.lastPrompt = prompt;

  await generateFromExistingUser(prompt);
}

async function generateFromExistingUser(prompt) {
  if (WEURA.isGenerating) return;

  WEURA.isGenerating = true;

  const token =
    ++WEURA.generationToken;

  WEURA.abortController =
    new AbortController();

  setGeneratingUI(true);
  setStatus("Thinking…");

  const typingElement =
    createTypingMessage();

  try {
    let searchResults = [];

    if (shouldSearch(prompt)) {
      setStatus("Searching…");

      try {
        searchResults =
          await performSearch(prompt);
      } catch {}
    }

    const messages = WEURA.history
      .slice(-24)
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    const data = await apiFetch(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({
          message: prompt,
          messages,
          mode:
            DOM.mode?.value ||
            WEURA.settings.mode ||
            "smart",
          memory:
            getMemoryContext(),
          searchResults
        })
      },
      WEURA.abortController
    );

    if (
      token !== WEURA.generationToken
    ) {
      return;
    }

    const answer =
      normalizeText(data?.answer);

    if (!answer) {
      throw new Error(
        "WEURA returned an empty response."
      );
    }

    typingElement?.remove();

    const element =
      addMessage(
        "assistant",
        "",
        {
          skipScroll: true
        }
      );

    const completed =
      await typeResponse(
        element,
        answer,
        token
      );

    if (!completed) return;

    WEURA.lastAssistantMessage =
      answer;

    WEURA.history.push({
      role: "assistant",
      content: answer,
      timestamp: Date.now()
    });

    syncConversation();
    setStatus("Ready");

  } catch (error) {
    typingElement?.remove();

    if (isAbortError(error)) {
      setStatus("Stopped");
    } else {
      console.error(
        "REGENERATE ERROR:",
        error
      );

      addMessage(
        "assistant",
        `⚠️ ${
          error?.message ||
          "Regeneration failed."
        }`
      );

      setStatus("Connection error");
    }

  } finally {
    if (
      token === WEURA.generationToken
    ) {
      WEURA.isGenerating = false;
      WEURA.abortController = null;
      setGeneratingUI(false);
    }
  }
}

/* =========================================================
   HISTORY RENDER
========================================================= */

function renderHistory(forceBottom = false) {
  if (!DOM.messages) return;

  DOM.messages.innerHTML = "";

  if (!WEURA.history.length) {
    updateWelcome();
    return;
  }

  WEURA.history.forEach(message => {
    addMessage(
      message.role,
      message.content,
      {
        skipScroll: true
      }
    );
  });

  updateWelcome();

  if (forceBottom) {
    requestAnimationFrame(() => {
      DOM.messages.scrollTo({
        top: DOM.messages.scrollHeight,
        behavior: "auto"
      });

      WEURA.userIsScrolling = false;
    });
  }
}

/* =========================================================
   NEW CHAT
========================================================= */

function newChat() {
  stopGeneration(false);

  WEURA.history = [];
  WEURA.lastPrompt = "";
  WEURA.lastAssistantMessage = "";

  WEURA.currentConversationId = null;

  ensureConversation();

  renderHistory();
  renderConversationList();
  saveState();

  closeSidebar();

  setStatus("Ready");

  if (DOM.input) {
    DOM.input.value = "";
    autoResize();
    DOM.input.focus();
  }
}

/* =========================================================
   COPY
========================================================= */

async function copyText(text, button = null) {
  const value = String(text || "");

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea =
      document.createElement("textarea");

    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
    } catch {}

    textarea.remove();
  }

  if (button) {
    const oldHTML = button.innerHTML;

    button.innerHTML = ICONS.copied;

    setTimeout(() => {
      button.innerHTML = oldHTML;
    }, 1200);
  }
}

/* =========================================================
   VOICE INPUT
========================================================= */

function startVoice() {
  if (WEURA.isGenerating) return;

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus(
      "Voice input is not supported by this browser."
    );
    return;
  }

  if (WEURA.recognition) {
    try {
      WEURA.recognition.stop();
    } catch {}

    WEURA.recognition = null;

    setStatus("Ready");
    return;
  }

  const recognition =
    new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;

  const language =
    document.documentElement.dir === "rtl"
      ? "ar-DZ"
      : "en-US";

  recognition.lang = language;

  recognition.onstart = () => {
    setStatus("Listening…");

    DOM.voice?.classList.add(
      "active"
    );
  };

  recognition.onresult = event => {
    let finalText = "";
    let interimText = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      const transcript =
        event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    const text =
      finalText || interimText;

    if (DOM.input && text) {
      DOM.input.value = text;
      autoResize();
    }

    if (finalText) {
      applyDirection(finalText);
    }
  };

  recognition.onerror = event => {
    console.warn(
      "Speech recognition:",
      event.error
    );

    setStatus(
      event.error === "not-allowed"
        ? "Microphone permission denied"
        : "Voice input error"
    );
  };

  recognition.onend = () => {
    WEURA.recognition = null;

    DOM.voice?.classList.remove(
      "active"
    );

    if (
      !WEURA.isGenerating
    ) {
      setStatus("Ready");
    }
  };

  WEURA.recognition = recognition;

  try {
    recognition.start();
  } catch {
    WEURA.recognition = null;
    setStatus("Could not start voice input.");
  }
}

/* =========================================================
   SPEECH OUTPUT
========================================================= */

function speak(text) {
  if (!WEURA.settings.sound) return;

  if (
    !("speechSynthesis" in window)
  ) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(
      String(text || "")
    );

  utterance.lang =
    detectLanguage(text) === "ar"
      ? "ar-DZ"
      : "en-US";

  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(
    utterance
  );
}

/* =========================================================
   FILE ANALYSIS
========================================================= */

async function analyzeFile(file) {
  if (!file) return;

  if (WEURA.isGenerating) {
    setStatus("Finish the current response first.");
    return;
  }

  WEURA.isGenerating = true;

  const token =
    ++WEURA.generationToken;

  setGeneratingUI(true);
  setStatus("Analyzing file…");

  const question =
    normalizeText(
      DOM.input?.value
    ) ||
    "Analyze this file and summarize the important information.";

  if (DOM.input) {
    DOM.input.value = "";
    autoResize();
  }

  addMessage(
    "user",
    `📎 ${file.name}`,
    {
      forceScroll: true
    }
  );

  const typingElement =
    createTypingMessage();

  try {
    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    formData.append(
      "question",
      question
    );

    const data =
      await apiFetch(
        "/api/file",
        {
          method: "POST",
          body: formData
        },
        null
      );

    if (
      token !== WEURA.generationToken
    ) {
      return;
    }

    const answer =
      normalizeText(data?.answer);

    typingElement?.remove();

    if (!answer) {
      throw new Error(
        "The file analysis returned an empty response."
      );
    }

    addMessage(
      "assistant",
      answer,
      {
        forceScroll: true
      }
    );

    setStatus("Ready");

  } catch (error) {
    typingElement?.remove();

    if (token === WEURA.generationToken) {
      addMessage(
        "assistant",
        `⚠️ ${
          error?.message ||
          "File analysis failed."
        }`
      );

      setStatus("File analysis error");
    }

  } finally {
    WEURA.isGenerating = false;
    setGeneratingUI(false);
  }
}

/* =========================================================
   IMAGE / VISION
========================================================= */

async function analyzeImage(
  file,
  prompt = ""
) {
  if (!file) return;

  if (WEURA.isGenerating) {
    setStatus("Finish the current response first.");
    return;
  }

  WEURA.isGenerating = true;

  const token =
    ++WEURA.generationToken;

  setGeneratingUI(true);
  setStatus("Analyzing image…");

  const userPrompt =
    normalizeText(prompt) ||
    "Analyze this image carefully and explain what you can see.";

  addMessage(
    "user",
    `🖼️ ${file.name || "Image"}`,
    {
      forceScroll: true
    }
  );

  const typingElement =
    createTypingMessage();

  try {
    const formData =
      new FormData();

    formData.append(
      "image",
      file
    );

    formData.append(
      "prompt",
      userPrompt
    );

    const data =
      await apiFetch(
        "/api/vision",
        {
          method: "POST",
          body: formData
        },
        null
      );

    if (
      token !== WEURA.generationToken
    ) {
      return;
    }

    const answer =
      normalizeText(data?.answer);

    typingElement?.remove();

    if (!answer) {
      throw new Error(
        "The image analysis returned an empty response."
      );
    }

    addMessage(
      "assistant",
      answer,
      {
        forceScroll: true
      }
    );

    setStatus("Ready");

  } catch (error) {
    typingElement?.remove();

    addMessage(
      "assistant",
      `⚠️ ${
        error?.message ||
        "Image analysis failed."
      }`
    );

    setStatus("Vision error");

  } finally {
    WEURA.isGenerating = false;
    setGeneratingUI(false);
  }
}

/* =========================================================
   CAMERA
========================================================= */

async function openCamera() {
  if (WEURA.isGenerating) return;

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    /*
      Fallback to file picker.
    */
    DOM.cameraInput?.click();
    return;
  }

  try {
    WEURA.mediaStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          }
        },
        audio: false
      });

    const modal =
      document.createElement("div");

    modal.className =
      "weura-camera-modal";

    modal.innerHTML = `
      <div class="weura-camera-backdrop"></div>

      <div class="weura-camera-panel">
        <div class="weura-camera-header">
          <strong>WEURA Vision</strong>

          <button
            type="button"
            class="weura-camera-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <video
          class="weura-camera-video"
          autoplay
          playsinline
          muted
        ></video>

        <div class="weura-camera-actions">
          <button
            type="button"
            class="weura-camera-capture"
          >
            Capture
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const video =
      $(".weura-camera-video", modal);

    const closeButton =
      $(".weura-camera-close", modal);

    const backdrop =
      $(".weura-camera-backdrop", modal);

    const captureButton =
      $(".weura-camera-capture", modal);

    video.srcObject =
      WEURA.mediaStream;

    const close = () => {
      if (WEURA.mediaStream) {
        WEURA.mediaStream
          .getTracks()
          .forEach(track => track.stop());

        WEURA.mediaStream = null;
      }

      modal.remove();
    };

    closeButton.addEventListener(
      "click",
      close
    );

    backdrop.addEventListener(
      "click",
      close
    );

    captureButton.addEventListener(
      "click",
      async () => {
        if (!video.videoWidth) {
          setStatus("Camera is not ready.");
          return;
        }

        const canvas =
          document.createElement("canvas");

        canvas.width =
          video.videoWidth;

        canvas.height =
          video.videoHeight;

        const context =
          canvas.getContext("2d");

        context.drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob(
          async blob => {
            if (!blob) {
              setStatus(
                "Could not capture image."
              );
              return;
            }

            const file =
              new File(
                [blob],
                "weura-camera.jpg",
                {
                  type: "image/jpeg"
                }
              );

            close();

            await analyzeImage(
              file,
              DOM.input?.value || ""
            );
          },
          "image/jpeg",
          0.92
        );
      }
    );

  } catch (error) {
    console.error(
      "CAMERA ERROR:",
      error
    );

    setStatus(
      "Camera permission was denied or unavailable."
    );

    /*
      Useful fallback on mobile.
    */
    DOM.cameraInput?.click();
  }
}

/* =========================================================
   SIDEBAR
========================================================= */

function openSidebar() {
  DOM.sidebar?.classList.add("open");
  DOM.overlay?.classList.add("show");
}

function closeSidebar() {
  DOM.sidebar?.classList.remove("open");
  DOM.overlay?.classList.remove("show");
}

/* =========================================================
   AUTO RESIZE
========================================================= */

function autoResize() {
  if (!DOM.input) return;

  DOM.input.style.height = "auto";

  DOM.input.style.height =
    Math.min(
      DOM.input.scrollHeight,
      180
    ) + "px";
}

/* =========================================================
   SETTINGS
========================================================= */

function openSettings() {
  /*
    If a settings panel already exists in index.html,
    use it.
  */
  const existing =
    document.querySelector(
      "#settingsModal, .settings-modal, [data-settings-modal]"
    );

  if (existing) {
    existing.classList.add("open");
    existing.style.display = "";
    return;
  }

  /*
    Lightweight built-in settings panel.
    This means the Settings button works even if
    the current HTML does not contain a settings modal.
  */
  const modal =
    document.createElement("div");

  modal.className =
    "weura-settings-modal";

  modal.innerHTML = `
    <div class="weura-settings-backdrop"></div>

    <div class="weura-settings-panel">
      <div class="weura-settings-header">
        <div>
          <strong>WEURA Settings</strong>
          <small>Think Beyond.</small>
        </div>

        <button
          type="button"
          class="weura-settings-close"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div class="weura-settings-body">

        <label class="setting-row">
          <span>Theme</span>
          <select data-weura-setting="theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="auto">System</option>
          </select>
        </label>

        <label class="setting-row">
          <span>Language</span>
          <select data-weura-setting="language">
            <option value="auto">Auto</option>
            <option value="ar">العربية</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>

        <label class="setting-row">
          <span>Enter to send</span>
          <input
            type="checkbox"
            data-weura-setting="enterSend"
          />
        </label>

        <label class="setting-row">
          <span>Web search</span>
          <input
            type="checkbox"
            data-weura-setting="webSearch"
          />
        </label>

        <label class="setting-row">
          <span>Memory</span>
          <input
            type="checkbox"
            data-weura-setting="memory"
          />
        </label>

        <label class="setting-row">
          <span>Sound</span>
          <input
            type="checkbox"
            data-weura-setting="sound"
          />
        </label>

        <label class="setting-row">
          <span>Typing speed</span>
          <input
            type="range"
            min="1"
            max="50"
            data-weura-setting="typingSpeed"
          />
        </label>

        <button
          type="button"
          class="weura-settings-danger"
          data-clear-memory
        >
          Clear saved memory
        </button>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
  };

  $(".weura-settings-close", modal)
    ?.addEventListener(
      "click",
      close
    );

  $(".weura-settings-backdrop", modal)
    ?.addEventListener(
      "click",
      close
    );

  const theme =
    $('[data-weura-setting="theme"]', modal);

  const language =
    $('[data-weura-setting="language"]', modal);

  const enterSend =
    $('[data-weura-setting="enterSend"]', modal);

  const webSearch =
    $('[data-weura-setting="webSearch"]', modal);

  const memory =
    $('[data-weura-setting="memory"]', modal);

  const sound =
    $('[data-weura-setting="sound"]', modal);

  const typingSpeed =
    $('[data-weura-setting="typingSpeed"]', modal);

  if (theme) {
    theme.value =
      WEURA.settings.theme;
  }

  if (language) {
    language.value =
      WEURA.settings.language;
  }

  if (enterSend) {
    enterSend.checked =
      Boolean(
        WEURA.settings.enterSend
      );
  }

  if (webSearch) {
    webSearch.checked =
      Boolean(
        WEURA.settings.webSearch
      );
  }

  if (memory) {
    memory.checked =
      Boolean(
        WEURA.settings.memory
      );
  }

  if (sound) {
    sound.checked =
      Boolean(
        WEURA.settings.sound
      );
  }

  if (typingSpeed) {
    typingSpeed.value =
      WEURA.settings.typingSpeed;
  }

  theme?.addEventListener(
    "change",
    () => {
      WEURA.settings.theme =
        theme.value;

      applyTheme();
      saveState();
    }
  );

  language?.addEventListener(
    "change",
    () => {
      WEURA.settings.language =
        language.value;

      if (DOM.input?.value) {
        applyDirection(
          DOM.input.value
        );
      }

      saveState();
    }
  );

  enterSend?.addEventListener(
    "change",
    () => {
      WEURA.settings.enterSend =
        enterSend.checked;

      saveState();
    }
  );

  webSearch?.addEventListener(
    "change",
    () => {
      WEURA.settings.webSearch =
        webSearch.checked;

      if (DOM.search) {
        DOM.search.checked =
          WEURA.settings.webSearch;
      }

      saveState();
    }
  );

  memory?.addEventListener(
    "change",
    () => {
      WEURA.settings.memory =
        memory.checked;

      saveState();
    }
  );

  sound?.addEventListener(
    "change",
    () => {
      WEURA.settings.sound =
        sound.checked;

      saveState();
    }
  );

  typingSpeed?.addEventListener(
    "input",
    () => {
      WEURA.settings.typingSpeed =
        Number(
          typingSpeed.value
        );

      saveState();
    }
  );

  $(
    "[data-clear-memory]",
    modal
  )?.addEventListener(
    "click",
    () => {
      storageRemove(
        STORAGE.memory
      );

      setStatus(
        "Saved memory cleared"
      );
    }
  );
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

function handleQuickAction(button) {
  const prompt =
    normalizeText(
      button?.dataset?.prompt
    );

  if (!prompt) return;

  /*
    Fill the composer instead of silently
    sending unexpected messages.
  */
  if (DOM.input) {
    DOM.input.value = prompt;

    applyDirection(prompt);
    autoResize();

    DOM.input.focus();

    /*
      If explicitly marked auto-send,
      execute immediately.
    */
    if (
      button.dataset.autosend === "true"
    ) {
      sendMessage(prompt);
    }
  }
}

/* =========================================================
   SETTINGS BINDINGS
========================================================= */

function bindExistingSettings() {
  $$("[data-theme]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const theme =
            button.dataset.theme;

          if (
            ["dark", "light", "auto"]
              .includes(theme)
          ) {
            WEURA.settings.theme =
              theme;

            applyTheme();
          }
        }
      );
    }
  );

  $$("[data-setting]").forEach(
    element => {
      const setting =
        element.dataset.setting;

      if (!(setting in WEURA.settings)) {
        return;
      }

      if (
        element.type === "checkbox"
      ) {
        element.checked =
          Boolean(
            WEURA.settings[setting]
          );
      } else {
        element.value =
          WEURA.settings[setting];
      }

      element.addEventListener(
        "change",
        () => {
          let value;

          if (
            element.type === "checkbox"
          ) {
            value = element.checked;
          } else if (
            element.type === "number" ||
            element.type === "range"
          ) {
            value = Number(
              element.value
            );
          } else {
            value = element.value;
          }

          WEURA.settings[setting] =
            value;

          if (setting === "theme") {
            applyTheme();
          }

          saveState();
        }
      );
    }
  );
}

/* =========================================================
   PROTECTION
========================================================= */

function enableProtection() {
  if (!WEURA.settings.protection) {
    return;
  }

  document.addEventListener(
    "contextmenu",
    event => {
      event.preventDefault();
    }
  );
}

/* =========================================================
   EVENT BINDINGS
========================================================= */

function bindEvents() {
  DOM.send?.addEventListener(
    "click",
    () => sendMessage()
  );

  DOM.stop?.addEventListener(
    "click",
    () => stopGeneration()
  );

  DOM.input?.addEventListener(
    "input",
    () => {
      autoResize();

      if (DOM.input.value) {
        applyDirection(
          DOM.input.value
        );
      }
    }
  );

  DOM.input?.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        if (
          WEURA.settings.enterSend
        ) {
          event.preventDefault();

          if (!WEURA.isGenerating) {
            sendMessage();
          }
        }
      }
    }
  );

  DOM.messages?.addEventListener(
    "scroll",
    handleScroll,
    {
      passive: true
    }
  );

  DOM.menu?.addEventListener(
    "click",
    openSidebar
  );

  DOM.overlay?.addEventListener(
    "click",
    closeSidebar
  );

  DOM.newChat?.addEventListener(
    "click",
    newChat
  );

  DOM.settings?.addEventListener(
    "click",
    openSettings
  );

  DOM.theme?.addEventListener(
    "click",
    cycleTheme
  );

  DOM.voice?.addEventListener(
    "click",
    startVoice
  );

  DOM.camera?.addEventListener(
    "click",
    openCamera
  );

  DOM.file?.addEventListener(
    "click",
    () => {
      DOM.fileInput?.click();
    }
  );

  DOM.image?.addEventListener(
    "click",
    () => {
      DOM.imageInput?.click();
    }
  );

  DOM.fileInput?.addEventListener(
    "change",
    event => {
      const file =
        event.target.files?.[0];

      if (file) {
        analyzeFile(file);
      }

      event.target.value = "";
    }
  );

  DOM.imageInput?.addEventListener(
    "change",
    event => {
      const file =
        event.target.files?.[0];

      if (file) {
        analyzeImage(
          file,
          DOM.input?.value || ""
        );
      }

      event.target.value = "";
    }
  );

  DOM.cameraInput?.addEventListener(
    "change",
    event => {
      const file =
        event.target.files?.[0];

      if (file) {
        analyzeImage(
          file,
          DOM.input?.value || ""
        );
      }

      event.target.value = "";
    }
  );

  DOM.search?.addEventListener(
    "change",
    () => {
      WEURA.settings.webSearch =
        DOM.search.checked;

      saveState();
    }
  );

  DOM.mode?.addEventListener(
    "change",
    () => {
      WEURA.settings.mode =
        DOM.mode.value;

      saveState();
    }
  );

  $$("[data-prompt]").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          handleQuickAction(button);
        }
      );
    }
  );

  bindExistingSettings();
}

/* =========================================================
   INITIALIZATION
========================================================= */

function migrateOldHistory() {
  if (
    WEURA.history.length &&
    !WEURA.conversations.length
  ) {
    const conversation = {
      id: uid("conv"),
      title: "Previous conversation",
      messages: WEURA.history,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    WEURA.conversations = [
      conversation
    ];

    WEURA.currentConversationId =
      conversation.id;

    saveState();
  }
}

function init() {
  if (WEURA.initialized) {
    return;
  }

  WEURA.initialized = true;

  cacheDOM();
  loadState();
  migrateOldHistory();

  applyTheme();
  listenSystemTheme();

  ensureConversation();

  renderHistory(true);
  renderConversationList();

  if (DOM.search) {
    DOM.search.checked =
      Boolean(
        WEURA.settings.webSearch
      );
  }

  if (
    DOM.mode &&
    WEURA.settings.mode
  ) {
    /*
      Only assign if the option exists.
    */
    const optionExists =
      Array.from(
        DOM.mode.options || []
      ).some(
        option =>
          option.value ===
          WEURA.settings.mode
      );

    if (optionExists) {
      DOM.mode.value =
        WEURA.settings.mode;
    }
  }

  bindEvents();
  enableProtection();

  autoResize();

  applyDirection(
    WEURA.history
      .filter(m => m.role === "user")
      .at(-1)?.content || ""
  );

  setGeneratingUI(false);
  setStatus("Ready");

  requestAnimationFrame(() => {
    if (DOM.input) {
      DOM.input.focus();
    }
  });

  console.log(
    "%cWEURA AI%c initialized — Think Beyond.",
    "font-weight:bold;font-size:16px;",
    "font-weight:normal;"
  );
}

/* =========================================================
   PUBLIC API
========================================================= */

window.WEURA = WEURA;

window.WEURA_API = {
  sendMessage,
  newChat,
  startVoice,
  openCamera,
  speak,
  regenerate: regenerateLast,
  stopGeneration,
  loadConversation,
  deleteConversation,
  analyzeFile,
  analyzeImage,
  openSettings,
  cycleTheme
};

/* =========================================================
   START
========================================================= */

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init,
    {
      once: true
    }
  );
} else {
  init();
}