(() => {
  "use strict";

  /*
    WEURA AI
    Think Beyond.
  */

  window.WEURA_LOADED = true;

  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    settings: "weura_settings_v3",
    chats: "weura_chats_v3",
    memory: "weura_memory_v3"
  };

  const DEFAULT_SETTINGS = {
    theme: "auto",
    language: "en",
    direction: "ltr",
    detail: "auto",
    mode: "auto"
  };

  const state = {
    initialized: false,
    busy: false,
    abortController: null,
    searchEnabled: false,
    currentChatId: null,
    chats: [],
    memory: [],
    settings: { ...DEFAULT_SETTINGS },
    recognition: null,
    recording: false
  };

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
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...loadJSON(STORAGE.settings, {})
    };

    state.chats = loadJSON(STORAGE.chats, []);
    state.memory = loadJSON(STORAGE.memory, []);

    if (!Array.isArray(state.chats)) state.chats = [];
    if (!Array.isArray(state.memory)) state.memory = [];
  }

  function saveState() {
    saveJSON(STORAGE.settings, state.settings);
    saveJSON(STORAGE.chats, state.chats);
    saveJSON(STORAGE.memory, state.memory);
  }

  /* =========================
     THEME
  ========================= */

  function applyTheme() {
    const theme = state.settings.theme;

    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
    } else if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      document.documentElement.dataset.theme =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    }
  }

  /* =========================
     DIRECTION
  ========================= */

  function detectDirection() {
    if (state.settings.direction === "ltr") return "ltr";
    if (state.settings.direction === "rtl") return "rtl";

    return "ltr";
  }

  function applyDirection() {
    const dir = detectDirection();

    document.documentElement.dir = dir;
    document.documentElement.lang =
      state.settings.language === "ar" ? "ar" : "en";
  }

  /* =========================
     STATUS
  ========================= */

  function setStatus(text) {
    document
      .querySelectorAll("#statusText, #composerStatus")
      .forEach((el) => {
        el.textContent = text || "";
      });
  }

  function showError(error) {
    console.error("WEURA:", error);
    setStatus("Something went wrong.");
  }

  /* =========================
     CHAT
  ========================= */

  function createChat() {
    const chat = {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7),

      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    state.chats.unshift(chat);
    state.currentChatId = chat.id;

    saveJSON(STORAGE.chats, state.chats);

    return chat;
  }

  function getCurrentChat() {
    return state.chats.find(
      (chat) => chat.id === state.currentChatId
    );
  }

  function ensureChat() {
    let chat = getCurrentChat();

    if (!chat) {
      chat = createChat();
    }

    return chat;
  }

  function makeTitle(text) {
    const clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) return "New conversation";

    return clean.length > 34
      ? clean.slice(0, 34) + "..."
      : clean;
  }

  function renderHistory() {
    const list = $("historyList");
    if (!list) return;

    list.innerHTML = "";

    state.chats.forEach((chat) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className =
        "history-item" +
        (chat.id === state.currentChatId ? " active" : "");

      button.textContent = chat.title || "New conversation";

      button.addEventListener("click", () => {
        state.currentChatId = chat.id;
        renderHistory();
        renderMessages();
        closeSidebar();
      });

      list.appendChild(button);
    });
  }

  function renderMessages() {
    const container = $("messages");
    const welcome = $("welcome");

    if (!container) return;

    const chat = getCurrentChat();

    container
      .querySelectorAll(".message")
      .forEach((el) => el.remove());

    if (!chat || !chat.messages.length) {
      if (welcome) welcome.style.display = "flex";
      return;
    }

    if (welcome) welcome.style.display = "none";

    chat.messages.forEach((message) => {
      addMessageElement(
        message.role,
        message.content,
        false
      );
    });

    scrollBottom();
  }

  function addMessageElement(role, content, scroll = true) {
    const container = $("messages");
    if (!container) return null;

    const row = document.createElement("div");
    row.className = `message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = content;

    row.appendChild(bubble);
    container.appendChild(row);

    if (scroll) scrollBottom();

    return bubble;
  }

  function addMessage(role, content) {
    const chat = ensureChat();

    chat.messages.push({
      role,
      content,
      timestamp: Date.now()
    });

    chat.updatedAt = Date.now();

    if (
      role === "user" &&
      chat.title === "New conversation"
    ) {
      chat.title = makeTitle(content);
    }

    saveJSON(STORAGE.chats, state.chats);

    addMessageElement(role, content);
    renderHistory();
  }

  function scrollBottom() {
    const container = $("messages");
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  /* =========================
     BACKEND
  ========================= */

  async function checkHealth() {
    try {
      const response = await fetch("/api/health", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) throw new Error("Backend unavailable");

      setStatus("Online");
    } catch {
      setStatus("Offline");
    }
  }

  async function performSearch(query) {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query
      })
    });

    if (!response.ok) {
      throw new Error("Search failed");
    }

    return response.json();
  }

  /* =========================
     SEND
  ========================= */

  async function sendMessage(forcedText = null) {
    if (state.busy) return;

    const input = $("messageInput");

    const text =
      forcedText !== null
        ? String(forcedText).trim()
        : String(input?.value || "").trim();

    if (!text) return;

    if (input) {
      input.value = "";
      resizeTextarea();
    }

    addMessage("user", text);

    state.busy = true;
    toggleBusy(true);

    const assistantBubble =
      addMessageElement("assistant", "Thinking...", true);

    try {
      let searchData = null;

      if (state.searchEnabled) {
        try {
          searchData = await performSearch(text);
        } catch {
          searchData = null;
        }
      }

      state.abortController = new AbortController();

      const chat = getCurrentChat();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: state.abortController.signal,

        body: JSON.stringify({
          message: text,
          messages: chat?.messages || [],
          mode: state.settings.mode,
          language: state.settings.language,
          detail: state.settings.detail,
          memory: state.memory,
          search: state.searchEnabled,
          searchResults: searchData
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const answer =
        data.answer ||
        data.message ||
        data.content ||
        "I couldn't generate a response.";

      if (assistantBubble) {
        assistantBubble.textContent = answer;
      }

      if (chat) {
        chat.messages.push({
          role: "assistant",
          content: answer,
          timestamp: Date.now()
        });

        chat.updatedAt = Date.now();
      }

      saveJSON(STORAGE.chats, state.chats);
      renderHistory();
      scrollBottom();

      setStatus("Online");
    } catch (error) {
      if (error.name === "AbortError") {
        if (assistantBubble) {
          assistantBubble.textContent = "Generation stopped.";
        }
      } else {
        console.error(error);

        if (assistantBubble) {
          assistantBubble.textContent =
            "I couldn't connect to WEURA right now.";
        }

        setStatus("Connection error");
      }
    } finally {
      state.abortController = null;
      state.busy = false;
      toggleBusy(false);
    }
  }

  function toggleBusy(busy) {
    const send = $("sendBtn");
    const stop = $("stopBtn");

    if (send) {
      send.style.display = busy ? "none" : "flex";
      send.disabled = false;
    }

    if (stop) {
      stop.style.display = busy ? "flex" : "none";
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }

    state.abortController = null;
    state.busy = false;

    toggleBusy(false);
  }

  /* =========================
     FILE
  ========================= */

  async function analyzeFile(file) {
    if (!file) return;

    setStatus("Analyzing file...");

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/file", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error("File analysis failed");
      }

      const data = await response.json();

      const result =
        data.answer ||
        data.text ||
        data.content ||
        "The file was analyzed.";

      addMessage("user", `File: ${file.name}`);
      addMessage("assistant", result);

      setStatus("Online");
    } catch (error) {
      console.error(error);
      setStatus("File analysis failed");
    }
  }

  /* =========================
     IMAGE
  ========================= */

  async function analyzeImage(file) {
    if (!file) return;

    setStatus("Analyzing image...");

    try {
      const form = new FormData();
      form.append("image", file);

      const response = await fetch("/api/vision", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error("Vision failed");
      }

      const data = await response.json();

      const result =
        data.answer ||
        data.description ||
        data.content ||
        "The image was analyzed.";

      addMessage("user", `Image: ${file.name}`);
      addMessage("assistant", result);

      setStatus("Online");
    } catch (error) {
      console.error(error);
      setStatus("Image analysis failed");
    }
  }

  /* =========================
     VOICE
  ========================= */

  function startVoice() {
    if (state.recording) {
      stopVoice();
      return;
    }

    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!Recognition) {
      setStatus("Voice input is not supported.");
      return;
    }

    const recognition = new Recognition();

    recognition.lang =
      state.settings.language === "ar"
        ? "ar-DZ"
        : "en-US";

    recognition.interimResults = true;
    recognition.continuous = false;

    state.recognition = recognition;
    state.recording = true;

    const voiceBtn = $("voiceBtn");

    if (voiceBtn) {
      voiceBtn.classList.add("recording");
    }

    setStatus("Listening...");

    recognition.onresult = (event) => {
      const input = $("messageInput");
      if (!input) return;

      let finalText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        finalText += event.results[i][0].transcript;
      }

      input.value = finalText;
      resizeTextarea();
    };

    recognition.onerror = () => {
      setStatus("Voice input failed");
      stopVoice();
    };

    recognition.onend = () => {
      stopVoice();
    };

    recognition.start();
  }

  function stopVoice() {
    try {
      state.recognition?.stop();
    } catch {}

    state.recognition = null;
    state.recording = false;

    const voiceBtn = $("voiceBtn");

    if (voiceBtn) {
      voiceBtn.classList.remove("recording");
    }

    setStatus("Online");
  }

  /* =========================
     TEXTAREA
  ========================= */

  function resizeTextarea() {
    const input = $("messageInput");
    if (!input) return;

    input.style.height = "auto";
    input.style.height =
      Math.min(input.scrollHeight, 150) + "px";
  }

  /* =========================
     SIDEBAR
  ========================= */

  function openSidebar() {
    $("sidebar")?.classList.add("open");
    $("overlay")?.classList.add("show");
  }

  function closeSidebar() {
    $("sidebar")?.classList.remove("open");
    $("overlay")?.classList.remove("show");
  }

  /* =========================
     SETTINGS
  ========================= */

  function openSettings() {
    $("settingsModal")?.classList.add("show");
    syncSettingsUI();
  }

  function closeSettings() {
    $("settingsModal")?.classList.remove("show");
  }

  function syncSettingsUI() {
    const language = $("languageSetting");
    const direction = $("directionSetting");
    const theme = $("themeSetting");
    const detail = $("detailSetting");
    const mode = $("modeSelect");

    if (language) language.value = state.settings.language;
    if (direction) direction.value = state.settings.direction;
    if (theme) theme.value = state.settings.theme;
    if (detail) detail.value = state.settings.detail;
    if (mode) mode.value = state.settings.mode;
  }

  /* =========================
     NEW CHAT
  ========================= */

  function newChat() {
    createChat();

    renderHistory();
    renderMessages();

    const input = $("messageInput");

    if (input) {
      input.value = "";
      resizeTextarea();
      input.focus();
    }

    closeSidebar();
  }

  /* =========================
     THEME
  ========================= */

  function cycleTheme() {
    const order = ["auto", "dark", "light"];

    const current =
      order.indexOf(state.settings.theme);

    state.settings.theme =
      order[(current + 1) % order.length];

    applyTheme();
    syncSettingsUI();
    saveState();
  }

  /* =========================
     QUICK ACTIONS
  ========================= */

  function quickAction(action) {
    const prompts = {
      ask:
        "What can you help me with?",

      research:
        "Research this topic thoroughly and explain the important points.",

      code:
        "Help me build and debug my code.",

      creative:
        "Help me create a creative idea."
    };

    const modeMap = {
      research: "research",
      code: "code",
      creative: "creative",
      ask: "auto"
    };

    if (modeMap[action]) {
      state.settings.mode = modeMap[action];

      const mode = $("modeSelect");
      if (mode) mode.value = state.settings.mode;
    }

    const input = $("messageInput");

    if (input) {
      input.value = prompts[action] || "";
      resizeTextarea();
      input.focus();
    }
  }

  /* =========================
     EVENT BINDING
  ========================= */

  function bindClick(id, handler) {
    const element = $(id);

    if (!element) {
      console.warn(`WEURA: Missing #${id}`);
      return;
    }

    if (element.dataset.weuraBound === "1") {
      return;
    }

    element.dataset.weuraBound = "1";

    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        try {
          handler(event);
        } catch (error) {
          console.error(`WEURA ${id}`, error);
          showError(error);
        }
      },
      { passive: false }
    );
  }

  function bindEvents() {

    /* SEND */
    bindClick("sendBtn", () => {
      sendMessage();
    });

    /* STOP */
    bindClick("stopBtn", () => {
      stopGeneration();
    });

    /* NEW CHAT */
    bindClick("newChatBtn", () => {
      newChat();
    });

    /* SETTINGS */
    bindClick("settingsBtn", () => {
      openSettings();
    });

    /* THEME */
    bindClick("themeBtn", () => {
      cycleTheme();
    });

    bindClick("themeTopBtn", () => {
      cycleTheme();
    });

    /* MENU */
    bindClick("menuBtn", () => {
      openSidebar();
    });

    /* OVERLAY */
    bindClick("overlay", () => {
      closeSidebar();
    });

    /* SEARCH */
    bindClick("searchToggle", () => {
      state.searchEnabled = !state.searchEnabled;

      $("searchToggle")?.classList.toggle(
        "active",
        state.searchEnabled
      );

      setStatus(
        state.searchEnabled
          ? "Smart search enabled"
          : "Smart search disabled"
      );
    });

    /* FILE */
    bindClick("fileBtn", () => {
      const input = $("fileInput");

      if (input) {
        input.value = "";
        input.click();
      }
    });

    /* IMAGE */
    bindClick("imageBtn", () => {
      const input = $("imageInput");

      if (input) {
        input.value = "";
        input.click();
      }
    });

    /* CAMERA */
    bindClick("cameraBtn", () => {
      const input = $("cameraInput");

      if (input) {
        input.value = "";
        input.click();
      }
    });

    /* MICROPHONE */
    bindClick("voiceBtn", () => {
      if (state.recording) {
        stopVoice();
      } else {
        startVoice();
      }
    });

    /* FILE INPUT */
    const fileInput = $("fileInput");

    if (fileInput && fileInput.dataset.weuraBound !== "1") {
      fileInput.dataset.weuraBound = "1";

      fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files || []);

        files.forEach((file) => {
          analyzeFile(file);
        });
      });
    }

    /* IMAGE INPUT */
    const imageInput = $("imageInput");

    if (
      imageInput &&
      imageInput.dataset.weuraBound !== "1"
    ) {
      imageInput.dataset.weuraBound = "1";

      imageInput.addEventListener("change", () => {
        const file = imageInput.files?.[0];

        if (file) {
          analyzeImage(file);
        }
      });
    }

    /* CAMERA INPUT */
    const cameraInput = $("cameraInput");

    if (
      cameraInput &&
      cameraInput.dataset.weuraBound !== "1"
    ) {
      cameraInput.dataset.weuraBound = "1";

      cameraInput.addEventListener("change", () => {
        const file = cameraInput.files?.[0];

        if (file) {
          analyzeImage(file);
        }
      });
    }

    /* CLOSE SETTINGS */
    bindClick("closeSettings", () => {
      closeSettings();
    });

    /* CLEAR MEMORY */
    bindClick("clearMemoryBtn", () => {
      state.memory = [];
      saveJSON(STORAGE.memory, []);
      setStatus("Memory cleared");
    });

    /* LANGUAGE */
    const language = $("languageSetting");

    if (language) {
      language.addEventListener("change", () => {
        state.settings.language = language.value;

        /*
          English is the default system language.
        */

        applyDirection();
        saveState();
      });
    }

    /* DIRECTION */
    const direction = $("directionSetting");

    if (direction) {
      direction.addEventListener("change", () => {
        state.settings.direction = direction.value;

        applyDirection();
        saveState();
      });
    }

    /* THEME */
    const theme = $("themeSetting");

    if (theme) {
      theme.addEventListener("change", () => {
        state.settings.theme = theme.value;

        applyTheme();
        saveState();
      });
    }

    /* DETAIL */
    const detail = $("detailSetting");

    if (detail) {
      detail.addEventListener("change", () => {
        state.settings.detail = detail.value;
        saveState();
      });
    }

    /* MODE */
    const mode = $("modeSelect");

    if (mode) {
      mode.addEventListener("change", () => {
        state.settings.mode = mode.value;
        saveState();
      });
    }

    /* TEXTAREA */
    const input = $("messageInput");

    if (input) {

      input.addEventListener("input", () => {
        resizeTextarea();
      });

      input.addEventListener("keydown", (event) => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendMessage();
        }

      });
    }

    /* QUICK BUTTONS */
    document
      .querySelectorAll(".quick")
      .forEach((button) => {

        if (button.dataset.weuraBound === "1") {
          return;
        }

        button.dataset.weuraBound = "1";

        button.addEventListener("click", () => {
          quickAction(button.dataset.action);
        });
      });

    /* ESC */
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSidebar();
        closeSettings();
        stopVoice();
      }
    });
  }

  /* =========================
     INIT
  ========================= */

  async function init() {

    if (state.initialized) return;

    try {

      loadState();

      /*
        FORCE ENGLISH DEFAULT
        Existing user settings are preserved.
      */
      if (!state.settings.language) {
        state.settings.language = "en";
      }

      if (!state.settings.direction) {
        state.settings.direction = "ltr";
      }

      applyTheme();
      applyDirection();

      const mode = $("modeSelect");

      if (mode) {
        mode.value = state.settings.mode;
      }

      if (!state.chats.length) {
        createChat();
      } else if (!state.currentChatId) {
        state.currentChatId =
          state.chats[0].id;
      }

      bindEvents();
      renderHistory();
      renderMessages();
      resizeTextarea();
      syncSettingsUI();

      state.initialized = true;

      await checkHealth();

      console.log("WEURA AI initialized.");
    } catch (error) {

      console.error(
        "WEURA initialization error:",
        error
      );

      setStatus(
        "WEURA initialization failed."
      );
    }
  }

  /* =========================
     PUBLIC API
  ========================= */

  window.WEURA = {
    send: sendMessage,
    newChat,
    openSettings,
    toggleSearch: () => {
      $("searchToggle")?.click();
    },

    getState: () => state
  };

  /* =========================
     START
  ========================= */

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();

  }

})();