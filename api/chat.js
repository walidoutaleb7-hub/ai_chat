"use strict";

/* =========================================================
   WEURA AI — CHAT ENGINE
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
    protection: true,
    typingSpeed: 18
  },

  recognition: null,
  mediaStream: null,

  lastPrompt: "",
  lastAssistantMessage: "",
  isGenerating: false,
  abortController: null,
  generationToken: 0,

  userIsScrolling: false
};

/* =========================================================
   SVG ICON SYSTEM
========================================================= */

const ICONS = {
  copy: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"/>
      <path d="M5 16V5a2 2 0 0 1 2-2h9"/>
    </svg>
  `,

  copied: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6"/>
    </svg>
  `,

  refresh: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10"/>
      <path d="M3 4v6h6"/>
      <path d="M4 13a8.1 8.1 0 0 0 14.9 4L21 14"/>
      <path d="M21 20v-6h-6"/>
    </svg>
  `,

  stop: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2"/>
    </svg>
  `,

  send: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 3 10 14"/>
      <path d="m21 3-7 18-4-7-7-4Z"/>
    </svg>
  `,

  mic: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3"/>
      <path d="M5 11a7 7 0 0 0 14 0"/>
      <path d="M12 18v3"/>
      <path d="M8 21h8"/>
    </svg>
  `,

  paperclip: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 0 1-2.8-2.8l8.2-8.2"/>
    </svg>
  `,

  image: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3"/>
      <circle cx="8.5" cy="9" r="1.5"/>
      <path d="m4 17 5-5 3.5 3.5 2.5-2.5L20 18"/>
    </svg>
  `,

  camera: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h4l1.5-2h5L16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  `
};

/* =========================================================
   DOM
========================================================= */

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

/* =========================================================
   UTILITIES
========================================================= */

function uid() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function now() {
  return Date.now();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   MARKDOWN
========================================================= */

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

/* =========================================================
   STORAGE
========================================================= */

function saveState() {
  try {
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

    localStorage.setItem(
      "weura_current_conversation",
      WEURA.currentConversationId || ""
    );
  } catch (error) {
    console.warn(
      "WEURA storage error:",
      error
    );
  }
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

    const savedSettings =
      JSON.parse(
        localStorage.getItem(
          "weura_settings"
        )
      );

    if (savedSettings) {
      WEURA.settings = {
        ...WEURA.settings,
        ...savedSettings
      };
    }

    WEURA.currentConversationId =
      localStorage.getItem(
        "weura_current_conversation"
      ) || null;
  } catch {
    WEURA.history = [];
    WEURA.conversations = [];
    WEURA.currentConversationId = null;
  }

  applyTheme();
}

/* =========================================================
   CONVERSATION STORAGE
========================================================= */

function ensureConversation() {
  if (!WEURA.currentConversationId) {
    WEURA.currentConversationId = uid();
  }

  let conversation =
    WEURA.conversations.find(
      (item) =>
        item.id ===
        WEURA.currentConversationId
    );

  if (!conversation) {
    conversation = {
      id: WEURA.currentConversationId,
      title: "New chat",
      createdAt: now(),
      updatedAt: now(),
      messages: []
    };

    WEURA.conversations.unshift(
      conversation
    );
  }

  return conversation;
}

function generateConversationTitle(text) {
  const clean =
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!clean) {
    return "New chat";
  }

  return clean.length > 45
    ? clean.slice(0, 45) + "…"
    : clean;
}

function syncConversation() {
  const conversation =
    ensureConversation();

  conversation.messages =
    WEURA.history.map((message) => ({
      role: message.role,
      content: message.content
    }));

  conversation.updatedAt = now();

  const firstUser =
    WEURA.history.find(
      (message) =>
        message.role === "user"
    );

  if (
    firstUser &&
    (!conversation.title ||
      conversation.title ===
        "New chat")
  ) {
    conversation.title =
      generateConversationTitle(
        firstUser.content
      );
  }

  WEURA.conversations =
    WEURA.conversations
      .filter(
        (item) =>
          item.id !==
          conversation.id
      );

  WEURA.conversations.unshift(
    conversation
  );

  saveState();
  renderConversationList();
}

function loadConversation(id) {
  const conversation =
    WEURA.conversations.find(
      (item) => item.id === id
    );

  if (!conversation) return;

  WEURA.currentConversationId =
    conversation.id;

  WEURA.history =
    Array.isArray(
      conversation.messages
    )
      ? conversation.messages.map(
          (message) => ({
            role: message.role,
            content: message.content
          })
        )
      : [];

  renderHistory();
  saveState();
  closeSidebarMobile();
}

function deleteConversation(id) {
  WEURA.conversations =
    WEURA.conversations.filter(
      (item) => item.id !== id
    );

  if (
    WEURA.currentConversationId === id
  ) {
    WEURA.currentConversationId =
      null;

    WEURA.history = [];

    renderHistory();
    showWelcome(true);
  }

  saveState();
  renderConversationList();
}

function renderConversationList() {
  const list =
    $("#historyList");

  if (!list) return;

  list.innerHTML = "";

  const conversations = [
    ...WEURA.conversations
  ].sort(
    (a, b) =>
      (b.updatedAt || 0) -
      (a.updatedAt || 0)
  );

  conversations.forEach(
    (conversation) => {
      const item =
        document.createElement(
          "button"
        );

      item.className =
        "history-item";

      if (
        conversation.id ===
        WEURA.currentConversationId
      ) {
        item.classList.add(
          "active"
        );
      }

      item.type = "button";

      item.innerHTML = `
        <span class="history-item-icon">
          ${ICONS.refresh}
        </span>

        <span class="history-item-title">
          ${escapeHTML(
            conversation.title ||
              "New chat"
          )}
        </span>

        <span
          class="history-delete"
          title="Delete conversation"
          aria-label="Delete conversation"
        >
          ×
        </span>
      `;

      item.addEventListener(
        "click",
        (event) => {
          if (
            event.target.closest(
              ".history-delete"
            )
          ) {
            event.stopPropagation();
            deleteConversation(
              conversation.id
            );
            return;
          }

          loadConversation(
            conversation.id
          );
        }
      );

      list.appendChild(item);
    }
  );
}

/* =========================================================
   THEME
========================================================= */

function applyTheme() {
  let theme =
    WEURA.settings.theme;

  if (theme === "auto") {
    theme =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
  }

  document.documentElement.dataset.theme =
    theme;
}

/* =========================================================
   LANGUAGE
========================================================= */

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
  if (
    WEURA.settings.language !==
    "auto"
  ) {
    document.documentElement.dir =
      WEURA.settings.language ===
      "ar"
        ? "rtl"
        : "ltr";

    return;
  }

  document.documentElement.dir =
    detectLanguage(text) === "ar"
      ? "rtl"
      : "ltr";
}

/* =========================================================
   WELCOME
========================================================= */

function showWelcome(show = true) {
  if (!welcomeEl) return;

  welcomeEl.style.display =
    show ? "flex" : "none";
}

/* =========================================================
   SMART SCROLL
========================================================= */

function isNearBottom() {
  if (!messagesEl) return true;

  const distance =
    messagesEl.scrollHeight -
    messagesEl.scrollTop -
    messagesEl.clientHeight;

  return distance < 120;
}

function smartScroll(force = false) {
  if (!messagesEl) return;

  if (
    force ||
    !WEURA.userIsScrolling ||
    isNearBottom()
  ) {
    requestAnimationFrame(() => {
      messagesEl.scrollTo({
        top:
          messagesEl.scrollHeight,
        behavior: "auto"
      });
    });
  }
}

messagesEl?.addEventListener(
  "scroll",
  () => {
    WEURA.userIsScrolling =
      !isNearBottom();
  },
  { passive: true }
);

/* =========================================================
   MESSAGE UI
========================================================= */

function createAssistantActions(
  content
) {
  const actions =
    document.createElement("div");

  actions.className =
    "message-actions";

  actions.innerHTML = `
    <button
      type="button"
      class="message-action"
      data-action="copy"
      aria-label="Copy response"
      title="Copy"
    >
      ${ICONS.copy}
      <span>Copy</span>
    </button>

    <button
      type="button"
      class="message-action"
      data-action="regenerate"
      aria-label="Regenerate response"
      title="Regenerate"
    >
      ${ICONS.refresh}
      <span>Regenerate</span>
    </button>
  `;

  const copyButton =
    actions.querySelector(
      '[data-action="copy"]'
    );

  copyButton.addEventListener(
    "click",
    async () => {
      const success =
        await copyText(content);

      if (success) {
        copyButton.innerHTML = `
          ${ICONS.copied}
          <span>Copied</span>
        `;

        setTimeout(() => {
          copyButton.innerHTML = `
            ${ICONS.copy}
            <span>Copy</span>
          `;
        }, 1400);
      }
    }
  );

  actions
    .querySelector(
      '[data-action="regenerate"]'
    )
    .addEventListener(
      "click",
      regenerate
    );

  return actions;
}

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

  article.dataset.role = role;

  const avatar =
    document.createElement("div");

  avatar.className =
    "message-avatar";

  avatar.innerHTML =
    role === "assistant"
      ? `
        <span class="mini-logo">
          W
        </span>
      `
      : `
        <span class="user-avatar">
          U
        </span>
      `;

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
    body.appendChild(
      createAssistantActions(
        content
      )
    );
  }

  article.appendChild(avatar);
  article.appendChild(body);

  messagesEl.appendChild(article);

  smartScroll(true);

  return contentEl;
}

/* =========================================================
   TYPING MESSAGE
========================================================= */

function createTypingMessage() {
  showWelcome(false);

  const article =
    document.createElement("article");

  article.className =
    "message assistant generating";

  article.innerHTML = `
    <div class="message-avatar">
      <span class="mini-logo">W</span>
    </div>

    <div class="message-body">
      <div class="message-label">
        WEURA
      </div>

      <div class="message-content">
        <div class="typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;

  messagesEl.appendChild(article);

  smartScroll(true);

  return article;
}

/* =========================================================
   PROGRESSIVE RESPONSE
========================================================= */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

async function typeResponse(
  element,
  text,
  token
) {
  const content =
    String(text || "");

  element.innerHTML = "";

  let visible = "";

  const speed = Math.max(
    4,
    Number(
      WEURA.settings
        .typingSpeed || 18
    )
  );

  for (
    let i = 0;
    i < content.length;
  ) {
    if (
      token !==
      WEURA.generationToken
    ) {
      return false;
    }

    let chunk = 1;

    if (
      content.length > 1200
    ) {
      chunk = 3;
    } else if (
      content.length > 500
    ) {
      chunk = 2;
    }

    visible +=
      content.slice(
        i,
        i + chunk
      );

    i += chunk;

    element.innerHTML =
      simpleMarkdown(visible);

    smartScroll();

    await sleep(speed);
  }

  return true;
}

/* =========================================================
   CHAT
========================================================= */

async function sendMessage(
  prompt = null
) {
  const text =
    prompt !== null
      ? String(prompt).trim()
      : inputEl?.value.trim();

  if (
    !text ||
    WEURA.isGenerating
  ) {
    return;
  }

  WEURA.lastPrompt = text;
  WEURA.isGenerating = true;
  WEURA.generationToken++;

  const currentToken =
    WEURA.generationToken;

  WEURA.abortController =
    new AbortController();

  applyDirection(text);

  if (inputEl) {
    inputEl.value = "";
    inputEl.style.height =
      "auto";
  }

  addMessage(
    "user",
    text
  );

  WEURA.history.push({
    role: "user",
    content: text
  });

  ensureConversation();

  syncConversation();

  if (sendBtn) {
    sendBtn.disabled = true;
  }

  if (stopBtn) {
    stopBtn.style.display =
      "inline-flex";
  }

  const typing =
    createTypingMessage();

  try {
    let searchResults = [];

    const searchEnabled =
      WEURA.settings.webSearch &&
      (
        searchToggle
          ? searchToggle.checked !==
            false
          : true
      );

    if (
      searchEnabled &&
      shouldSearch(text)
    ) {
      setStatus(
        "Searching the web…"
      );

      const searchResponse =
        await performSearch(
          text
        );

      searchResults =
        searchResponse?.results ||
        [];
    }

    setStatus(
      "WEURA is thinking…"
    );

    const response =
      await fetch(
        "/api/chat",
        {
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
          }),
          signal:
            WEURA.abortController
              .signal
        }
      );

    const data =
      await response.json();

    typing.remove();

    if (
      !response.ok ||
      !data.ok
    ) {
      throw new Error(
        data.error ||
          "Request failed."
      );
    }

    const answer =
      String(
        data.answer || ""
      );

    const article =
      document.createElement(
        "article"
      );

    article.className =
      "message assistant";

    article.innerHTML = `
      <div class="message-avatar">
        <span class="mini-logo">W</span>
      </div>

      <div class="message-body">
        <div class="message-label">
          WEURA
        </div>

        <div class="message-content"></div>

        <div class="message-actions">
          <button
            type="button"
            class="message-action"
            data-action="copy"
            title="Copy"
          >
            ${ICONS.copy}
            <span>Copy</span>
          </button>

          <button
            type="button"
            class="message-action"
            data-action="regenerate"
            title="Regenerate"
          >
            ${ICONS.refresh}
            <span>Regenerate</span>
          </button>
        </div>
      </div>
    `;

    messagesEl.appendChild(
      article
    );

    const contentEl =
      article.querySelector(
        ".message-content"
      );

    const typed =
      await typeResponse(
        contentEl,
        answer,
        currentToken
      );

    if (!typed) {
      return;
    }

    const copyButton =
      article.querySelector(
        '[data-action="copy"]'
      );

    copyButton?.addEventListener(
      "click",
      async () => {
        const success =
          await copyText(answer);

        if (success) {
          copyButton.innerHTML = `
            ${ICONS.copied}
            <span>Copied</span>
          `;

          setTimeout(() => {
            copyButton.innerHTML = `
              ${ICONS.copy}
              <span>Copy</span>
            `;
          }, 1400);
        }
      }
    );

    article
      .querySelector(
        '[data-action="regenerate"]'
      )
      ?.addEventListener(
        "click",
        regenerate
      );

    WEURA.lastAssistantMessage =
      answer;

    WEURA.history.push({
      role: "assistant",
      content: answer
    });

    syncConversation();

    if (
      WEURA.settings.memory
    ) {
      await considerMemory(
        text
      );
    }

    smartScroll(true);
  } catch (error) {
    typing?.remove();

    if (
      error?.name ===
      "AbortError"
    ) {
      setStatus("Stopped");
      return;
    }

    addMessage(
      "assistant",
      `**WEURA encountered an error.**\n\n${error.message}`
    );
  } finally {
    WEURA.isGenerating = false;
    WEURA.abortController =
      null;

    if (sendBtn) {
      sendBtn.disabled = false;
    }

    if (stopBtn) {
      stopBtn.style.display =
        "none";
    }

    setStatus("Ready");
  }
}

/* =========================================================
   SEARCH
========================================================= */

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
    "ماذا حدث",
    "الآن",
    "جديد",
    "الجديد"
  ];

  const value =
    text.toLowerCase();

  return keywords.some(
    (keyword) =>
      value.includes(keyword)
  );
}

async function performSearch(
  query
) {
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

/* =========================================================
   MEMORY
========================================================= */

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

async function considerMemory(
  text
) {
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
    // Optional memory.
  }
}

/* =========================================================
   REGENERATE
========================================================= */

async function regenerate() {
  if (
    WEURA.isGenerating ||
    !WEURA.lastPrompt
  ) {
    return;
  }

  if (
    WEURA.history.at(-1)
      ?.role === "assistant"
  ) {
    WEURA.history.pop();
  }

  const lastUser =
    [...WEURA.history]
      .reverse()
      .find(
        (message) =>
          message.role ===
          "user"
      );

  if (lastUser) {
    WEURA.lastPrompt =
      lastUser.content;
  }

  renderHistory();
  syncConversation();

  await sendMessage(
    WEURA.lastPrompt
  );
}

/* =========================================================
   STOP
========================================================= */

function stopGeneration() {
  WEURA.generationToken++;

  if (
    WEURA.abortController
  ) {
    WEURA.abortController.abort();
  }

  if (
    WEURA.recognition
  ) {
    WEURA.recognition.stop();
    WEURA.recognition = null;
  }

  WEURA.isGenerating = false;

  document
    .querySelectorAll(
      ".message.generating"
    )
    .forEach(
      (element) =>
        element.remove()
    );

  if (sendBtn) {
    sendBtn.disabled = false;
  }

  if (stopBtn) {
    stopBtn.style.display =
      "none";
  }

  setStatus("Stopped");
}

/* =========================================================
   FILES
========================================================= */

async function analyzeFile(file) {
  if (!file) return;

  addMessage(
    "user",
    `File: ${file.name}`
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

    WEURA.history.push({
      role: "assistant",
      content: data.answer
    });

    syncConversation();
  } catch (error) {
    addMessage(
      "assistant",
      `**File analysis failed:** ${error.message}`
    );
  } finally {
    setStatus("Ready");
  }
}

/* =========================================================
   VISION
========================================================= */

async function analyzeImage(file) {
  if (!file) return;

  addMessage(
    "user",
    `Image: ${file.name}`
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

    WEURA.history.push({
      role: "assistant",
      content: data.answer
    });

    syncConversation();
  } catch (error) {
    addMessage(
      "assistant",
      `**Vision error:** ${error.message}`
    );
  } finally {
    setStatus("Ready");
  }
}

/* =========================================================
   COPY
========================================================= */

async function copyText(text) {
  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        text
      );
    } else {
      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.value = text;

      textarea.style.position =
        "fixed";

      textarea.style.opacity =
        "0";

      document.body.appendChild(
        textarea
      );

      textarea.select();

      document.execCommand(
        "copy"
      );

      textarea.remove();
    }

    setStatus(
      "Copied to clipboard"
    );

    setTimeout(
      () => setStatus("Ready"),
      1200
    );

    return true;
  } catch {
    setStatus(
      "Copy failed"
    );

    return false;
  }
}

/* =========================================================
   VOICE
========================================================= */

function startVoice() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus(
      "Voice input is not supported"
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

  recognition.onresult = (
    event
  ) => {
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

    if (inputEl) {
      inputEl.value = result;
      autoResize();
    }
  };

  recognition.onend = () => {
    setStatus("Ready");
    WEURA.recognition = null;
  };

  recognition.onerror = () => {
    setStatus(
      "Voice input failed"
    );

    WEURA.recognition = null;
  };

  WEURA.recognition =
    recognition;

  recognition.start();
}

/* =========================================================
   SPEECH OUTPUT
========================================================= */

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

/* =========================================================
   CAMERA
========================================================= */

async function openCamera() {
  try {
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
        <video
          autoplay
          playsinline
        ></video>

        <div class="camera-actions">
          <button
            id="cameraCapture"
            type="button"
          >
            Capture
          </button>

          <button
            id="cameraClose"
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(
      modal
    );

    const video =
      modal.querySelector(
        "video"
      );

    video.srcObject =
      stream;

    modal.querySelector(
      "#cameraCapture"
    ).onclick = () => {
      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;

      canvas
        .getContext("2d")
        .drawImage(
          video,
          0,
          0
        );

      canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const file =
            new File(
              [blob],
              "camera-image.jpg",
              {
                type:
                  "image/jpeg"
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
  } catch {
    setStatus(
      "Camera access was unavailable"
    );
  }
}

function closeCamera(modal) {
  if (WEURA.mediaStream) {
    WEURA.mediaStream
      .getTracks()
      .forEach(
        (track) =>
          track.stop()
      );

    WEURA.mediaStream =
      null;
  }

  modal?.remove();
}

/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {
  const el =
    $("#statusText");

  if (el) {
    el.textContent = text;
  }
}

/* =========================================================
   TEXTAREA
========================================================= */

function autoResize() {
  if (!inputEl) return;

  inputEl.style.height =
    "auto";

  inputEl.style.height =
    Math.min(
      inputEl.scrollHeight,
      180
    ) + "px";
}

/* =========================================================
   NEW CHAT
========================================================= */

function newChat() {
  stopGeneration();

  WEURA.history = [];

  WEURA.currentConversationId =
    uid();

  messagesEl.innerHTML = "";

  showWelcome(true);

  if (inputEl) {
    inputEl.value = "";
    inputEl.style.height =
      "auto";
  }

  ensureConversation();
  saveState();
  renderConversationList();

  closeSidebarMobile();

  inputEl?.focus();
}

/* =========================================================
   HISTORY RENDER
========================================================= */

function renderHistory() {
  if (!messagesEl) return;

  messagesEl.innerHTML = "";

  if (
    WEURA.history.length === 0
  ) {
    showWelcome(true);
    return;
  }

  showWelcome(false);

  WEURA.history.forEach(
    (message) => {
      addMessage(
        message.role,
        message.content
      );
    }
  );

  smartScroll(true);
}

/* =========================================================
   SIDEBAR
========================================================= */

function toggleSidebar() {
  sidebar?.classList.toggle(
    "open"
  );

  overlay?.classList.toggle(
    "show"
  );
}

function closeSidebarMobile() {
  sidebar?.classList.remove(
    "open"
  );

  overlay?.classList.remove(
    "show"
  );
}

/* =========================================================
   SETTINGS
========================================================= */

function bindSettings() {
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

  document
    .querySelectorAll(
      "[data-setting]"
    )
    .forEach((element) => {
      const key =
        element.dataset.setting;

      if (!key) return;

      if (
        element.type ===
          "checkbox" ||
        element.type ===
          "radio"
      ) {
        element.checked =
          Boolean(
            WEURA.settings[key]
          );
      } else if (
        WEURA.settings[key] !==
        undefined
      ) {
        element.value =
          WEURA.settings[key];
      }

      element.addEventListener(
        "change",
        () => {
          if (
            element.type ===
              "checkbox" ||
            element.type ===
              "radio"
          ) {
            WEURA.settings[key] =
              element.checked;
          } else {
            WEURA.settings[key] =
              element.value;
          }

          saveState();
        }
      );
    });
}

/* =========================================================
   PROTECTION
========================================================= */

function enableProtection() {
  if (
    !WEURA.settings.protection
  ) {
    return;
  }

  document.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const key =
        event.key.toLowerCase();

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        ["u", "s"].includes(key)
      ) {
        event.preventDefault();
      }

      if (
        event.key === "F12"
      ) {
        event.preventDefault();
      }

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.shiftKey &&
        ["i", "j", "c"].includes(
          key
        )
      ) {
        event.preventDefault();
      }
    }
  );
}

/* =========================================================
   EVENTS
========================================================= */

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
  () =>
    fileInput?.click()
);

$("#imageBtn")?.addEventListener(
  "click",
  () =>
    imageInput?.click()
);

/* Files */

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

        if (!inputEl) return;

        inputEl.value =
          prompt;

        autoResize();
        inputEl.focus();
      }
    );
  });

/* Search toggle */

searchToggle?.addEventListener(
  "change",
  () => {
    WEURA.settings.webSearch =
      searchToggle.checked;

    saveState();
  }
);

/* Mode */

modeSelect?.addEventListener(
  "change",
  () => {
    WEURA.settings.mode =
      modeSelect.value;

    saveState();
  }
);

/* =========================================================
   SYSTEM THEME CHANGES
========================================================= */

window
  .matchMedia(
    "(prefers-color-scheme: dark)"
  )
  .addEventListener(
    "change",
    () => {
      if (
        WEURA.settings.theme ===
        "auto"
      ) {
        applyTheme();
      }
    }
  );

/* =========================================================
   INIT
========================================================= */

function init() {
  loadState();

  /*
    Restore the saved conversation.
  */

  const savedConversation =
    WEURA.conversations.find(
      (conversation) =>
        conversation.id ===
        WEURA.currentConversationId
    );

  if (savedConversation) {
    WEURA.history =
      Array.isArray(
        savedConversation.messages
      )
        ? savedConversation.messages.map(
            (message) => ({
              role: message.role,
              content:
                message.content
            })
          )
        : [];
  }

  /*
    If old WEURA versions have history
    but no conversation yet,
    migrate it automatically.
  */

  if (
    WEURA.history.length &&
    !savedConversation
  ) {
    WEURA.currentConversationId =
      uid();

    ensureConversation();
    syncConversation();
  }

  renderHistory();
  renderConversationList();
  bindSettings();
  enableProtection();

  if (
    searchToggle &&
    WEURA.settings.webSearch !==
      undefined
  ) {
    searchToggle.checked =
      WEURA.settings.webSearch;
  }

  if (
    modeSelect &&
    WEURA.settings.mode
  ) {
    modeSelect.value =
      WEURA.settings.mode;
  }

  setStatus("Ready");

  setTimeout(() => {
    inputEl?.focus();
  }, 100);
}

/* =========================================================
   PUBLIC API
========================================================= */

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

window.loadConversation =
  loadConversation;

window.deleteConversation =
  deleteConversation;

/* =========================================================
   START
========================================================= */

init();