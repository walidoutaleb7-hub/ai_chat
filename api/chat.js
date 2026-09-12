"use strict";

/* =========================================================
   WEURA AI — Complete Frontend Controller
   Think Beyond.
   Compatible with the current WEURA index.html + server.js
========================================================= */

(() => {
  const $ = (id) => document.getElementById(id);

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const STORAGE = {
    settings: "weura_settings",
    conversations: "weura_conversations",
    current: "weura_current_conversation",
    memory: "weura_memory"
  };

  const DEFAULT_SETTINGS = {
    theme: "dark",
    language: "auto",
    enterSend: true,
    memory: true,
    webSearch: true,
    sound: true,
    protection: false,
    typingSpeed: 18,
    mode: "smart"
  };

  const W = {
    initialized: false,
    settings: { ...DEFAULT_SETTINGS },

    conversations: [],
    currentConversationId: null,

    history: [],

    isGenerating: false,
    abortController: null,
    generationToken: 0,

    recognition: null,
    mediaStream: null,

    lastPrompt: "",
    lastAssistantMessage: ""
  };

  const D = {};

  /* =========================================================
     DOM
  ========================================================= */

  function cacheDOM() {
    D.messages = $("messages");
    D.input = $("messageInput");
    D.send = $("sendBtn");
    D.stop = $("stopBtn");

    D.welcome = $("welcome");

    D.sidebar = $("sidebar");
    D.overlay = $("overlay");

    D.mode = $("modeSelect");
    D.search = $("searchToggle");

    D.fileInput = $("fileInput");
    D.imageInput = $("imageInput");
    D.cameraInput = $("cameraInput");

    D.historyList = $("historyList");

    D.status = $("statusText");

    D.menu = $("menuBtn");
    D.newChat = $("newChatBtn");
    D.settings = $("settingsBtn");
    D.theme = $("themeBtn");

    D.voice = $("voiceBtn");
    D.camera = $("cameraBtn");
    D.file = $("fileBtn");
    D.image = $("imageBtn");
  }

  /* =========================================================
     STORAGE
  ========================================================= */

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function loadState() {
    W.settings = {
      ...DEFAULT_SETTINGS,
      ...loadJSON(STORAGE.settings, {})
    };

    W.conversations = loadJSON(
      STORAGE.conversations,
      []
    );

    if (!Array.isArray(W.conversations)) {
      W.conversations = [];
    }

    W.currentConversationId =
      localStorage.getItem(STORAGE.current) || null;
  }

  function saveState() {
    saveJSON(STORAGE.settings, W.settings);
    saveJSON(STORAGE.conversations, W.conversations);

    if (W.currentConversationId) {
      localStorage.setItem(
        STORAGE.current,
        W.currentConversationId
      );
    }
  }

  /* =========================================================
     UTILITIES
  ========================================================= */

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function escapeHTML(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(text) {
    /*
      index.html currently contains duplicate #statusText.
      Update every matching element safely.
    */
    all('[id="statusText"]').forEach((el) => {
      el.textContent = text;
    });
  }

  function isRTL(text) {
    return /[\u0590-\u08FF]/.test(text || "");
  }

  function applyDirection(text = "") {
    if (!D.input) return;

    if (W.settings.language === "ar") {
      D.input.dir = "rtl";
      document.documentElement.dir = "rtl";
      return;
    }

    if (W.settings.language === "en") {
      D.input.dir = "ltr";
      document.documentElement.dir = "ltr";
      return;
    }

    const rtl = isRTL(text);

    D.input.dir = rtl ? "rtl" : "ltr";
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }

  /* =========================================================
     THEME
  ========================================================= */

  function applyTheme() {
    let theme = W.settings.theme;

    if (theme === "auto") {
      theme = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
    }

    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;

    document.documentElement.classList.toggle(
      "dark",
      theme === "dark"
    );

    document.documentElement.classList.toggle(
      "light",
      theme === "light"
    );

    if (D.theme) {
      D.theme.title =
        `Theme: ${W.settings.theme}`;
    }
  }

  function cycleTheme() {
    const modes = ["dark", "light", "auto"];

    const current =
      modes.indexOf(W.settings.theme);

    W.settings.theme =
      modes[(current + 1) % modes.length];

    applyTheme();
    saveState();

    setStatus(
      `Theme: ${W.settings.theme}`
    );
  }

  /* =========================================================
     CONVERSATIONS
  ========================================================= */

  function createConversation() {
    const conversation = {
      id: uid(),
      title: "New conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    W.conversations.unshift(conversation);

    W.currentConversationId =
      conversation.id;

    W.history = conversation.messages;

    saveState();

    return conversation;
  }

  function getCurrentConversation() {
    return W.conversations.find(
      c => c.id === W.currentConversationId
    );
  }

  function ensureConversation() {
    let conversation =
      getCurrentConversation();

    if (!conversation) {
      conversation = createConversation();
    }

    W.history = Array.isArray(
      conversation.messages
    )
      ? conversation.messages
      : [];

    renderMessages();
    renderHistory();
  }

  function updateConversation() {
    const conversation =
      getCurrentConversation();

    if (!conversation) return;

    conversation.messages = W.history;
    conversation.updatedAt = Date.now();

    const firstUser =
      W.history.find(
        m => m.role === "user"
      );

    if (firstUser) {
      conversation.title =
        firstUser.content
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 42) ||
        "New conversation";
    }

    saveState();
  }

  function newChat() {
    W.isGenerating = false;

    if (W.abortController) {
      try {
        W.abortController.abort();
      } catch {}
    }

    W.abortController = null;

    createConversation();

    renderMessages();
    renderHistory();

    closeSidebar();

    setStatus("Ready");

    setTimeout(() => {
      D.input?.focus();
    }, 50);
  }

  function switchConversation(id) {
    const conversation =
      W.conversations.find(
        c => c.id === id
      );

    if (!conversation) return;

    W.currentConversationId = id;

    W.history =
      Array.isArray(conversation.messages)
        ? conversation.messages
        : [];

    saveState();

    renderMessages();
    renderHistory();

    closeSidebar();
  }

  function deleteConversation(id) {
    W.conversations =
      W.conversations.filter(
        c => c.id !== id
      );

    if (
      W.currentConversationId === id
    ) {
      W.currentConversationId = null;
      W.history = [];
      ensureConversation();
    }

    saveState();
    renderHistory();
  }

  /* =========================================================
     MESSAGE RENDERING
  ========================================================= */

  function renderMessages() {
    if (!D.messages) return;

    D.messages.innerHTML = "";

    if (!W.history.length) {
      if (D.welcome) {
        D.welcome.style.display = "";
      }
      return;
    }

    if (D.welcome) {
      D.welcome.style.display = "none";
    }

    W.history.forEach(message => {
      appendMessage(
        message.role,
        message.content,
        false
      );
    });

    scrollToBottom();
  }

  function appendMessage(
    role,
    content,
    scroll = true
  ) {
    if (!D.messages) return null;

    const wrapper =
      document.createElement("div");

    wrapper.className =
      `weura-message ${role}`;

    wrapper.dataset.role = role;

    const bubble =
      document.createElement("div");

    bubble.className =
      "weura-message-content";

    bubble.innerHTML =
      formatMessage(content);

    wrapper.appendChild(bubble);

    if (role === "assistant") {
      const actions =
        document.createElement("div");

      actions.className =
        "weura-message-actions";

      actions.innerHTML = `
        <button type="button" data-copy-message>
          Copy
        </button>
      `;

      wrapper.appendChild(actions);
    }

    D.messages.appendChild(wrapper);

    if (scroll) {
      scrollToBottom();
    }

    return bubble;
  }

  function formatMessage(text) {
    let html = escapeHTML(text);

    /*
      Basic Markdown-like rendering.
      This intentionally avoids injecting raw HTML.
    */

    html = html.replace(
      /```([\s\S]*?)```/g,
      (_, code) =>
        `<pre><code>${code.trim()}</code></pre>`
    );

    html = html.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

    html = html.replace(
      /\*\*([^*]+)\*\*/g,
      "<strong>$1</strong>"
    );

    html = html.replace(
      /\n/g,
      "<br>"
    );

    return html;
  }

  function scrollToBottom() {
    if (!D.messages) return;

    requestAnimationFrame(() => {
      D.messages.scrollTop =
        D.messages.scrollHeight;
    });
  }

  async function typeMessage(
    bubble,
    text,
    token
  ) {
    if (!bubble) return;

    const speed =
      Math.max(
        0,
        Number(W.settings.typingSpeed) || 0
      );

    if (
      speed === 0 ||
      token !== W.generationToken
    ) {
      bubble.innerHTML =
        formatMessage(text);

      return;
    }

    bubble.innerHTML = "";

    for (
      let i = 0;
      i < text.length;
      i++
    ) {
      if (
        token !== W.generationToken ||
        !W.isGenerating
      ) {
        bubble.innerHTML =
          formatMessage(text);

        return;
      }

      bubble.textContent += text[i];

      if (
        i % 3 === 0
      ) {
        scrollToBottom();
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              speed
            )
        );
      }
    }

    bubble.innerHTML =
      formatMessage(text);
  }

  /* =========================================================
     HISTORY UI
  ========================================================= */

  function renderHistory() {
    if (!D.historyList) return;

    D.historyList.innerHTML = "";

    W.conversations.forEach(
      conversation => {
        const item =
          document.createElement("div");

        item.className =
          "weura-history-item";

        if (
          conversation.id ===
          W.currentConversationId
        ) {
          item.classList.add("active");
        }

        const button =
          document.createElement("button");

        button.type = "button";
        button.className =
          "weura-history-open";

        button.textContent =
          conversation.title ||
          "New conversation";

        button.addEventListener(
          "click",
          () =>
            switchConversation(
              conversation.id
            )
        );

        const del =
          document.createElement("button");

        del.type = "button";
        del.className =
          "weura-history-delete";

        del.textContent = "×";

        del.addEventListener(
          "click",
          event => {
            event.preventDefault();
            event.stopPropagation();

            deleteConversation(
              conversation.id
            );
          }
        );

        item.append(
          button,
          del
        );

        D.historyList.appendChild(item);
      }
    );
  }

  /* =========================================================
     API
  ========================================================= */

  async function apiFetch(
    url,
    options = {}
  ) {
    const response =
      await fetch(url, {
        ...options,
        headers: {
          ...(options.body instanceof FormData
            ? {}
            : {
                "Content-Type":
                  "application/json"
              }),
          ...(options.headers || {})
        }
      });

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(
        typeof data === "object"
          ? data.error ||
            data.message ||
            `HTTP ${response.status}`
          : data ||
            `HTTP ${response.status}`
      );
    }

    return data;
  }

  /* =========================================================
     CHAT
  ========================================================= */

  async function sendMessage(
    forcedText = null
  ) {
    if (W.isGenerating) return;

    const text =
      forcedText ??
      D.input?.value?.trim() ??
      "";

    if (!text) return;

    W.lastPrompt = text;

    if (D.input) {
      D.input.value = "";
      autoResize();
    }

    applyDirection(text);

    W.history.push({
      role: "user",
      content: text,
      timestamp: Date.now()
    });

    appendMessage(
      "user",
      text
    );

    updateConversation();

    W.isGenerating = true;
    W.generationToken++;

    const token =
      W.generationToken;

    setGeneratingUI(true);

    setStatus("Thinking…");

    const assistantBubble =
      appendMessage(
        "assistant",
        "…"
      );

    try {
      let messages =
        W.history.map(m => ({
          role: m.role,
          content: m.content
        }));

      /*
        Optional unified search.
        The backend handles Tavily if configured.
      */

      let searchResults = null;

      if (
        W.settings.webSearch &&
        D.search?.checked
      ) {
        try {
          searchResults =
            await performSearch(
              text
            );
        } catch {
          searchResults = null;
        }
      }

      if (searchResults) {
        messages.push({
          role: "system",
          content:
            "Use these web search results when relevant:\n" +
            JSON.stringify(
              searchResults
            )
        });
      }

      W.abortController =
        new AbortController();

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
              messages,
              mode:
                W.settings.mode ||
                D.mode?.value ||
                "smart",
              language:
                W.settings.language,
              memory:
                W.settings.memory
            }),
            signal:
              W.abortController.signal
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let data;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        data =
          await response.text();
      }

      if (!response.ok) {
        throw new Error(
          typeof data === "object"
            ? data.error ||
              data.message ||
              "Server error"
            : data ||
              "Server error"
        );
      }

      const answer =
        typeof data === "string"
          ? data
          : data.answer ||
            data.response ||
            data.message ||
            data.content ||
            "I couldn't generate a response.";

      if (
        token !== W.generationToken
      ) {
        return;
      }

      W.lastAssistantMessage =
        answer;

      W.history.push({
        role: "assistant",
        content: answer,
        timestamp: Date.now()
      });

      if (assistantBubble) {
        await typeMessage(
          assistantBubble,
          answer,
          token
        );
      }

      updateConversation();

      setStatus("Ready");

      speakIfEnabled(answer);
    } catch (error) {
      if (
        error.name ===
        "AbortError"
      ) {
        if (assistantBubble) {
          assistantBubble.innerHTML =
            "<em>Generation stopped.</em>";
        }

        setStatus("Ready");
        return;
      }

      console.error(
        "WEURA chat error:",
        error
      );

      if (assistantBubble) {
        assistantBubble.innerHTML =
          `<strong>WEURA error</strong><br>${escapeHTML(
            error.message
          )}`;
      }

      setStatus("Connection error");
    } finally {
      W.isGenerating = false;
      W.abortController = null;

      setGeneratingUI(false);
    }
  }

  /* =========================================================
     SEARCH
  ========================================================= */

  async function performSearch(
    query
  ) {
    try {
      const result =
        await apiFetch(
          "/api/search",
          {
            method: "POST",
            body: JSON.stringify({
              query
            })
          }
        );

      return result;
    } catch (error) {
      console.warn(
        "Search unavailable:",
        error
      );

      return null;
    }
  }

  /* =========================================================
     GENERATION UI
  ========================================================= */

  function setGeneratingUI(
    generating
  ) {
    W.isGenerating =
      generating;

    if (D.send) {
      D.send.disabled =
        generating;
    }

    if (D.stop) {
      D.stop.style.display =
        generating
          ? ""
          : "none";
    }

    if (D.input) {
      D.input.disabled =
        false;
    }
  }

  function stopGeneration() {
    W.generationToken++;

    if (W.abortController) {
      try {
        W.abortController.abort();
      } catch {}
    }

    W.abortController = null;
    W.isGenerating = false;

    setGeneratingUI(false);
    setStatus("Ready");
  }

  /* =========================================================
     FILE ANALYSIS
  ========================================================= */

  async function analyzeFile(
    file
  ) {
    if (!file) return;

    setStatus("Analyzing file…");

    const form =
      new FormData();

    form.append(
      "file",
      file
    );

    try {
      const result =
        await apiFetch(
          "/api/file",
          {
            method: "POST",
            body: form
          }
        );

      const answer =
        result.answer ||
        result.text ||
        result.content ||
        JSON.stringify(
          result
        );

      W.history.push({
        role: "user",
        content:
          `[File: ${file.name}]`,
        timestamp: Date.now()
      });

      appendMessage(
        "user",
        `[File: ${file.name}]`
      );

      W.history.push({
        role: "assistant",
        content: answer,
        timestamp: Date.now()
      });

      appendMessage(
        "assistant",
        answer
      );

      updateConversation();

      setStatus("Ready");
    } catch (error) {
      console.error(error);
      setStatus(
        "File analysis failed"
      );

      alert(
        `WEURA: ${error.message}`
      );
    }
  }

  /* =========================================================
     IMAGE / VISION
  ========================================================= */

  async function analyzeImage(
    file
  ) {
    if (!file) return;

    setStatus(
      "Analyzing image…"
    );

    const form =
      new FormData();

    form.append(
      "image",
      file
    );

    try {
      const result =
        await apiFetch(
          "/api/vision",
          {
            method: "POST",
            body: form
          }
        );

      const answer =
        result.answer ||
        result.description ||
        result.content ||
        JSON.stringify(
          result
        );

      appendMessage(
        "user",
        `[Image: ${file.name}]`
      );

      W.history.push({
        role: "user",
        content:
          `[Image: ${file.name}]`,
        timestamp: Date.now()
      });

      appendMessage(
        "assistant",
        answer
      );

      W.history.push({
        role: "assistant",
        content: answer,
        timestamp: Date.now()
      });

      updateConversation();

      setStatus("Ready");
    } catch (error) {
      console.error(error);

      setStatus(
        "Image analysis failed"
      );

      alert(
        `WEURA: ${error.message}`
      );
    }
  }

  /* =========================================================
     VOICE INPUT
  ========================================================= */

  function startVoice() {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      alert(
        "Voice input is not supported by this browser."
      );
      return;
    }

    if (W.recognition) {
      try {
        W.recognition.stop();
      } catch {}

      W.recognition = null;

      setStatus("Ready");
      return;
    }

    const recognition =
      new Recognition();

    recognition.lang =
      W.settings.language === "ar"
        ? "ar-DZ"
        : "en-US";

    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setStatus("Listening…");
    };

    recognition.onresult = event => {
      let finalText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        finalText +=
          event.results[i][0]
            .transcript;
      }

      if (D.input) {
        D.input.value =
          finalText;

        autoResize();
        applyDirection(
          finalText
        );
      }
    };

    recognition.onerror = error => {
      console.warn(
        "Voice:",
        error
      );

      setStatus("Voice error");
    };

    recognition.onend = () => {
      W.recognition = null;
      setStatus("Ready");
    };

    W.recognition =
      recognition;

    recognition.start();
  }

  /* =========================================================
     SPEECH OUTPUT
  ========================================================= */

  function speakIfEnabled(text) {
    if (
      !W.settings.sound ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    /*
      Keep automatic speech disabled for long answers.
      User can still use browser controls if desired.
    */
  }

  /* =========================================================
     CAMERA
  ========================================================= */

  async function openCamera() {
    /*
      If the current page/browser doesn't allow
      getUserMedia, use the existing camera input.
    */

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      D.cameraInput?.click();
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true
        });

      W.mediaStream = stream;

      /*
        We don't create a separate camera UI here.
        The stream permission is requested and then
        the existing image picker is used.
      */

      stream
        .getTracks()
        .forEach(track =>
          track.stop()
        );

      W.mediaStream = null;

      D.cameraInput?.click();
    } catch (error) {
      console.warn(
        "Camera unavailable:",
        error
      );

      D.cameraInput?.click();
    }
  }

  /* =========================================================
     SIDEBAR
  ========================================================= */

  function openSidebar() {
    D.sidebar?.classList.add(
      "open",
      "active"
    );

    D.overlay?.classList.add(
      "open",
      "active"
    );
  }

  function closeSidebar() {
    D.sidebar?.classList.remove(
      "open",
      "active"
    );

    D.overlay?.classList.remove(
      "open",
      "active"
    );
  }

  function toggleSidebar() {
    if (
      D.sidebar?.classList.contains(
        "open"
      ) ||
      D.sidebar?.classList.contains(
        "active"
      )
    ) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  /* =========================================================
     AUTO RESIZE
  ========================================================= */

  function autoResize() {
    if (!D.input) return;

    D.input.style.height =
      "auto";

    D.input.style.height =
      Math.min(
        D.input.scrollHeight,
        180
      ) + "px";
  }

  /* =========================================================
     SETTINGS
  ========================================================= */

  function openSettings() {
    let modal =
      $("weuraSettingsModal");

    if (modal) {
      modal.remove();
      return;
    }

    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "weuraSettingsModal";

    modal.innerHTML = `
      <div class="weura-settings-backdrop"></div>

      <div class="weura-settings">
        <div class="weura-settings-header">
          <div>
            <strong>WEURA Settings</strong>
            <small>Think Beyond.</small>
          </div>

          <button
            type="button"
            data-close-settings
          >
            ×
          </button>
        </div>

        <label>
          Theme
          <select data-setting="theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="auto">System</option>
          </select>
        </label>

        <label>
          Language
          <select data-setting="language">
            <option value="auto">Auto</option>
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
        </label>

        <label>
          Mode
          <select data-setting="mode">
            <option value="smart">Smart</option>
            <option value="research">Research</option>
            <option value="code">Code</option>
            <option value="creative">Creative</option>
            <option value="vision">Vision</option>
            <option value="fast">Fast</option>
          </select>
        </label>

        <label>
          <span>Web search</span>
          <input
            type="checkbox"
            data-setting="webSearch"
          >
        </label>

        <label>
          <span>Memory</span>
          <input
            type="checkbox"
            data-setting="memory"
          >
        </label>

        <label>
          <span>Enter sends message</span>
          <input
            type="checkbox"
            data-setting="enterSend"
          >
        </label>

        <label>
          Typing speed
          <input
            type="range"
            min="0"
            max="80"
            step="1"
            data-setting="typingSpeed"
          >
        </label>

        <div class="weura-settings-actions">
          <button
            type="button"
            data-clear-history
          >
            Clear conversations
          </button>

          <button
            type="button"
            data-close-settings
          >
            Done
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const set =
      (key, value) => {
        W.settings[key] =
          value;

        saveState();

        if (key === "theme") {
          applyTheme();
        }

        if (key === "mode" && D.mode) {
          D.mode.value = value;
        }

        if (
          key === "language" &&
          D.input
        ) {
          applyDirection(
            D.input.value
          );
        }
      };

    modal
      .querySelectorAll(
        "[data-setting]"
      )
      .forEach(control => {
        const key =
          control.dataset.setting;

        const current =
          W.settings[key];

        if (
          control.type ===
          "checkbox"
        ) {
          control.checked =
            Boolean(current);
        } else {
          control.value =
            current;
        }

        control.addEventListener(
          "change",
          () => {
            let value;

            if (
              control.type ===
              "checkbox"
            ) {
              value =
                control.checked;
            } else if (
              control.type ===
              "range"
            ) {
              value =
                Number(
                  control.value
                );
            } else {
              value =
                control.value;
            }

            set(key, value);
          }
        );
      });

    modal
      .querySelectorAll(
        "[data-close-settings]"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => modal.remove()
        );
      });

    modal
      .querySelector(
        ".weura-settings-backdrop"
      )
      ?.addEventListener(
        "click",
        () => modal.remove()
      );

    modal
      .querySelector(
        "[data-clear-history]"
      )
      ?.addEventListener(
        "click",
        () => {
          const ok =
            confirm(
              "Delete all WEURA conversations?"
            );

          if (!ok) return;

          W.conversations = [];
          W.currentConversationId =
            null;
          W.history = [];

          saveState();
          ensureConversation();

          modal.remove();
        }
      );
  }

  /* =========================================================
     QUICK ACTIONS
  ========================================================= */

  function bindQuickActions() {
    all(
      "[data-prompt]"
    ).forEach(button => {
      if (
        button.dataset.weuraBound
      ) {
        return;
      }

      button.dataset.weuraBound =
        "1";

      button.addEventListener(
        "click",
        event => {
          event.preventDefault();

          const prompt =
            button.dataset.prompt ||
            button.getAttribute(
              "data-prompt"
            ) ||
            "";

          if (!prompt) return;

          if (D.input) {
            D.input.value =
              prompt;

            autoResize();
            applyDirection(
              prompt
            );

            D.input.focus();
          }

          if (
            button.dataset.autosend ===
            "true"
          ) {
            sendMessage(
              prompt
            );
          }
        }
      );
    });
  }

  /* =========================================================
     COPY
  ========================================================= */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(
        text
      );

      setStatus(
        "Copied"
      );

      setTimeout(
        () =>
          setStatus(
            "Ready"
          ),
        1200
      );
    } catch {
      setStatus(
        "Copy failed"
      );
    }
  }

  /* =========================================================
     EVENT BINDING
  ========================================================= */

  function bindEvents() {
    /*
      SEND
    */

    D.send?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        sendMessage();
      }
    );

    /*
      STOP
    */

    D.stop?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        stopGeneration();
      }
    );

    /*
      ENTER
    */

    D.input?.addEventListener(
      "keydown",
      event => {
        if (
          event.key !==
          "Enter"
        ) {
          return;
        }

        if (
          event.shiftKey
        ) {
          return;
        }

        if (
          !W.settings.enterSend
        ) {
          return;
        }

        event.preventDefault();

        sendMessage();
      }
    );

    D.input?.addEventListener(
      "input",
      () => {
        autoResize();
        applyDirection(
          D.input.value
        );
      }
    );

    /*
      SIDEBAR
    */

    D.menu?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        toggleSidebar();
      }
    );

    D.overlay?.addEventListener(
      "click",
      closeSidebar
    );

    /*
      NEW CHAT
    */

    D.newChat?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        newChat();
      }
    );

    /*
      SETTINGS
    */

    D.settings?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        openSettings();
      }
    );

    /*
      THEME
    */

    D.theme?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        cycleTheme();
      }
    );

    /*
      VOICE
    */

    D.voice?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        startVoice();
      }
    );

    /*
      CAMERA
    */

    D.camera?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        openCamera();
      }
    );

    /*
      FILE
    */

    D.file?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        D.fileInput?.click();
      }
    );

    /*
      IMAGE
    */

    D.image?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        D.imageInput?.click();
      }
    );

    /*
      FILE INPUT
    */

    D.fileInput?.addEventListener(
      "change",
      async () => {
        const file =
          D.fileInput.files?.[0];

        if (file) {
          await analyzeFile(file);
        }

        D.fileInput.value = "";
      }
    );

    /*
      IMAGE INPUT
    */

    D.imageInput?.addEventListener(
      "change",
      async () => {
        const file =
          D.imageInput.files?.[0];

        if (file) {
          await analyzeImage(file);
        }

        D.imageInput.value = "";
      }
    );

    /*
      CAMERA INPUT
    */

    D.cameraInput?.addEventListener(
      "change",
      async () => {
        const file =
          D.cameraInput.files?.[0];

        if (file) {
          await analyzeImage(file);
        }

        D.cameraInput.value = "";
      }
    );

    /*
      MODE
    */

    D.mode?.addEventListener(
      "change",
      () => {
        W.settings.mode =
          D.mode.value;

        saveState();
      }
    );

    /*
      SEARCH
    */

    D.search?.addEventListener(
      "change",
      () => {
        W.settings.webSearch =
          Boolean(
            D.search.checked
          );

        saveState();
      }
    );

    /*
      FORM SUBMIT FALLBACK
    */

    const form =
      D.input?.closest(
        "form"
      );

    form?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        sendMessage();
      }
    );

    /*
      MESSAGE COPY
    */

    D.messages?.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            "[data-copy-message]"
          );

        if (!button) return;

        const wrapper =
          button.closest(
            ".weura-message"
          );

        const content =
          wrapper?.querySelector(
            ".weura-message-content"
          );

        if (content) {
          copyText(
            content.innerText
          );
        }
      }
    );

    /*
      QUICK ACTIONS
    */

    bindQuickActions();

    /*
      ESC
    */

    document.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Escape"
        ) {
          closeSidebar();
        }
      }
    );
  }

  /* =========================================================
     SYSTEM THEME
  ========================================================= */

  function listenSystemTheme() {
    const media =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

    media.addEventListener?.(
      "change",
      () => {
        if (
          W.settings.theme ===
          "auto"
        ) {
          applyTheme();
        }
      }
    );
  }

  /* =========================================================
     ERROR HANDLING
  ========================================================= */

  function installErrorHandlers() {
    window.addEventListener(
      "error",
      event => {
        console.error(
          "WEURA frontend error:",
          event.error ||
            event.message
        );
      }
    );

    window.addEventListener(
      "unhandledrejection",
      event => {
        console.error(
          "WEURA promise error:",
          event.reason
        );
      }
    );
  }

  /* =========================================================
     HEALTH
  ========================================================= */

  async function checkBackend() {
    try {
      const result =
        await apiFetch(
          "/api/health"
        );

      if (
        result?.ok === false
      ) {
        setStatus(
          "Backend unavailable"
        );
        return;
      }

      setStatus("Ready");
    } catch {
      /*
        Don't break the UI if backend
        is temporarily unavailable.
      */
      setStatus(
        "Ready"
      );
    }
  }

  /* =========================================================
     INITIALIZATION
  ========================================================= */

  function init() {
    /*
      IMPORTANT:
      initialized is set ONLY after
      successful initialization.
      This fixes the old situation where
      one initialization error could leave
      every button dead forever.
    */

    if (W.initialized) {
      return;
    }

    if (W.booting) {
      return;
    }

    W.booting = true;

    try {
      cacheDOM();

      loadState();

      applyTheme();
      listenSystemTheme();

      ensureConversation();

      if (
        D.search
      ) {
        D.search.checked =
          Boolean(
            W.settings.webSearch
          );
      }

      if (
        D.mode &&
        W.settings.mode
      ) {
        const exists =
          Array.from(
            D.mode.options || []
          ).some(
            option =>
              option.value ===
              W.settings.mode
          );

        if (exists) {
          D.mode.value =
            W.settings.mode;
        }
      }

      bindEvents();

      autoResize();

      applyDirection(
        D.input?.value || ""
      );

      setStatus("Ready");

      installErrorHandlers();

      W.initialized = true;
      W.booting = false;

      requestAnimationFrame(
        () => {
          D.input?.focus();
        }
      );

      console.log(
        "%cWEURA AI%c initialized — Think Beyond.",
        "font-weight:bold;font-size:16px",
        "font-weight:normal"
      );

      checkBackend();

    } catch (error) {
      W.booting = false;

      console.error(
        "WEURA initialization failed:",
        error
      );

      setStatus(
        "Initialization error"
      );

      /*
        Do NOT set initialized=true here.
        That allows a later retry.
      */
    }
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.WEURA = {
    send: sendMessage,
    newChat,
    openSettings,
    toggleTheme: cycleTheme,
    openSidebar,
    closeSidebar,
    search: performSearch,
    stop: stopGeneration,
    analyzeFile,
    analyzeImage,
    startVoice,
    getState: () => ({
      ...W
    })
  };

  window.WEURA_API =
    window.WEURA;

  /* =========================================================
     START
  ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();