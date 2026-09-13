"use strict";

(() => {
  /* =========================================================
     WEURA AI — FRONTEND ENGINE
     Think Beyond.
  ========================================================= */

  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    settings: "weura_settings_v2",
    chats: "weura_chats_v2",
    memory: "weura_memory_v2"
  };

  const DEFAULT_SETTINGS = {
    theme: "auto",
    language: "auto",
    direction: "auto",
    detail: "auto",
    mode: "auto"
  };

  const state = {
    initialized: false,
    initializing: false,
    busy: false,
    abortController: null,

    searchEnabled: false,

    currentChatId: null,

    chats: [],
    memory: [],

    settings: {
      ...DEFAULT_SETTINGS
    }
  };

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safe(fn, fallback = null) {
    try {
      return fn();
    } catch (error) {
      console.error("[WEURA]", error);
      return fallback;
    }
  }

  function on(id, event, handler) {
    const element = $(id);

    if (!element) {
      console.warn(`[WEURA] Element not found: #${id}`);
      return false;
    }

    element.addEventListener(event, handler);
    return true;
  }

  function setVisible(id, visible, display = "") {
    const element = $(id);
    if (!element) return;

    element.style.display = visible
      ? display
      : "none";
  }

  /* =========================================================
     STORAGE
  ========================================================= */

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);

      return parsed ?? fallback;
    } catch (error) {
      console.warn("[WEURA] Storage read failed:", key);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch (error) {
      console.warn("[WEURA] Storage write failed:", key);
    }
  }

  function loadState() {
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...loadJSON(
        STORAGE.settings,
        {}
      )
    };

    state.chats = Array.isArray(
      loadJSON(
        STORAGE.chats,
        []
      )
    )
      ? loadJSON(
          STORAGE.chats,
          []
        )
      : [];

    state.memory = Array.isArray(
      loadJSON(
        STORAGE.memory,
        []
      )
    )
      ? loadJSON(
          STORAGE.memory,
          []
        )
      : [];
  }

  function saveState() {
    saveJSON(
      STORAGE.settings,
      state.settings
    );

    saveJSON(
      STORAGE.chats,
      state.chats
    );

    saveJSON(
      STORAGE.memory,
      state.memory
    );
  }

  /* =========================================================
     THEME
  ========================================================= */

  function applyTheme() {
    const theme =
      state.settings.theme;

    let light = false;

    if (theme === "light") {
      light = true;
    }

    if (theme === "auto") {
      light =
        window.matchMedia &&
        window.matchMedia(
          "(prefers-color-scheme: light)"
        ).matches;
    }

    document.body.classList.toggle(
      "light",
      light
    );
  }

  /* =========================================================
     DIRECTION / LANGUAGE
  ========================================================= */

  function detectDirection() {
    if (
      state.settings.direction ===
      "rtl"
    ) {
      return "rtl";
    }

    if (
      state.settings.direction ===
      "ltr"
    ) {
      return "ltr";
    }

    if (
      state.settings.language ===
      "en"
    ) {
      return "ltr";
    }

    if (
      state.settings.language ===
      "fr"
    ) {
      return "ltr";
    }

    return "rtl";
  }

  function applyDirection() {
    const direction =
      detectDirection();

    document.documentElement.dir =
      direction;

    const language =
      state.settings.language;

    if (language === "en") {
      document.documentElement.lang =
        "en";
    } else if (language === "fr") {
      document.documentElement.lang =
        "fr";
    } else {
      document.documentElement.lang =
        "ar";
    }
  }

  /* =========================================================
     CHAT
  ========================================================= */

  function createChat() {
    const now = Date.now();

    const id =
      "chat_" +
      now +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 9);

    const chat = {
      id,
      title: "محادثة جديدة",
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    state.chats.unshift(chat);
    state.currentChatId = id;

    saveState();
    renderHistory();

    return chat;
  }

  function getCurrentChat() {
    return state.chats.find(
      chat =>
        chat.id ===
        state.currentChatId
    );
  }

  function ensureChat() {
    let chat =
      getCurrentChat();

    if (!chat) {
      chat = createChat();
    }

    return chat;
  }

  function makeTitle(text) {
    const clean =
      String(text || "")
        .replace(/\s+/g, " ")
        .trim();

    if (!clean) {
      return "محادثة جديدة";
    }

    return clean.length > 40
      ? clean.slice(0, 40) + "…"
      : clean;
  }

  /* =========================================================
     HISTORY
  ========================================================= */

  function renderHistory() {
    const list =
      $("historyList");

    if (!list) return;

    list.innerHTML = "";

    const sorted =
      [...state.chats].sort(
        (a, b) =>
          Number(b.updatedAt || 0) -
          Number(a.updatedAt || 0)
      );

    sorted.forEach(chat => {
      const item =
        document.createElement(
          "button"
        );

      item.type = "button";

      item.className =
        "history-item" +
        (
          chat.id ===
          state.currentChatId
            ? " active"
            : ""
        );

      item.textContent =
        chat.title ||
        "محادثة جديدة";

      item.addEventListener(
        "click",
        () => {
          state.currentChatId =
            chat.id;

          renderHistory();
          renderMessages();
          closeSidebar();
        }
      );

      list.appendChild(item);
    });
  }

  /* =========================================================
     MESSAGE RENDERING
  ========================================================= */

  function renderMessages() {
    const container =
      $("messages");

    if (!container) return;

    const inner =
      document.createElement(
        "div"
      );

    inner.className =
      "chat-inner";

    const chat =
      getCurrentChat();

    if (
      !chat ||
      !Array.isArray(chat.messages) ||
      !chat.messages.length
    ) {
      const welcome =
        $("welcome");

      if (welcome) {
        inner.appendChild(
          welcome
        );
      }

      container.innerHTML = "";
      container.appendChild(inner);

      return;
    }

    chat.messages.forEach(
      message => {
        inner.appendChild(
          createMessageElement(
            message
          )
        );
      }
    );

    container.innerHTML = "";
    container.appendChild(inner);

    scrollBottom();
  }

  function createMessageElement(
    message
  ) {
    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      `message ${message.role || "assistant"}`;

    const avatar =
      document.createElement(
        "div"
      );

    avatar.className =
      "avatar";

    avatar.textContent =
      message.role ===
      "assistant"
        ? "W"
        : "U";

    const body =
      document.createElement(
        "div"
      );

    body.className =
      "message-body";

    const content =
      document.createElement(
        "div"
      );

    content.className =
      "message-content";

    content.textContent =
      message.content || "";

    body.appendChild(content);

    if (
      message.role ===
      "assistant"
    ) {
      const actions =
        document.createElement(
          "div"
        );

      actions.className =
        "message-actions";

      const copy =
        document.createElement(
          "button"
        );

      copy.type = "button";
      copy.textContent = "نسخ";

      copy.addEventListener(
        "click",
        async () => {
          try {
            await navigator.clipboard.writeText(
              message.content || ""
            );

            copy.textContent =
              "تم النسخ";

            setTimeout(() => {
              copy.textContent =
                "نسخ";
            }, 1200);

          } catch {
            copy.textContent =
              "تعذر النسخ";

            setTimeout(() => {
              copy.textContent =
                "نسخ";
            }, 1200);
          }
        }
      );

      actions.appendChild(copy);
      body.appendChild(actions);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(body);

    return wrapper;
  }

  function addMessage(
    role,
    content
  ) {
    const chat =
      ensureChat();

    if (!Array.isArray(chat.messages)) {
      chat.messages = [];
    }

    chat.messages.push({
      role,
      content: String(
        content || ""
      )
    });

    chat.updatedAt =
      Date.now();

    if (
      role === "user" &&
      chat.messages.length === 1
    ) {
      chat.title =
        makeTitle(content);
    }

    saveState();

    renderMessages();
    renderHistory();
  }

  function scrollBottom() {
    const element =
      $("messages");

    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollTop =
        element.scrollHeight;
    });
  }

  /* =========================================================
     STATUS
  ========================================================= */

  function setStatus(
    text,
    type = ""
  ) {
    document
      .querySelectorAll(
        ".status"
      )
      .forEach(element => {
        element.textContent =
          text;

        element.className =
          "status" +
          (
            type
              ? " " + type
              : ""
          );
      });

    const composer =
      $("composerStatus");

    if (composer) {
      composer.textContent =
        text;
    }
  }

  /* =========================================================
     HEALTH
  ========================================================= */

  async function checkHealth() {
    try {
      const response =
        await fetch(
          "/api/health",
          {
            method: "GET",
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (!data.ok) {
        throw new Error(
          "API غير جاهز"
        );
      }

      if (data.groq) {
        setStatus(
          "WEURA متصل",
          "online"
        );
      } else {
        setStatus(
          "WEURA متصل — API غير مضبوط",
          "offline"
        );
      }

    } catch (error) {
      console.warn(
        "[WEURA] Health check failed:",
        error
      );

      setStatus(
        "الخادم غير متصل",
        "offline"
      );
    }
  }

  /* =========================================================
     SEARCH
  ========================================================= */

  async function performSearch(
    query
  ) {
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

    let data = {};

    try {
      data =
        await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data.error ||
        `فشل البحث (${response.status})`
      );
    }

    return data;
  }

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  async function sendMessage() {
    if (state.busy) {
      return;
    }

    const input =
      $("messageInput");

    if (!input) {
      console.error(
        "[WEURA] #messageInput not found"
      );
      return;
    }

    const text =
      input.value.trim();

    if (!text) {
      input.focus();
      return;
    }

    input.value = "";
    resizeTextarea();

    ensureChat();

    addMessage(
      "user",
      text
    );

    state.busy = true;

    state.abortController =
      new AbortController();

    toggleBusy(true);

    try {
      let webResults = [];

      if (
        state.searchEnabled
      ) {
        setStatus(
          "جاري البحث..."
        );

        const search =
          await performSearch(
            text
          );

        webResults =
          Array.isArray(
            search.results
          )
            ? search.results
            : [];
      }

      setStatus(
        "WEURA يفكر..."
      );

      const chat =
        getCurrentChat();

      if (!chat) {
        throw new Error(
          "تعذر إنشاء المحادثة."
        );
      }

      const response =
        await fetch(
          "/api/chat",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            signal:
              state
                .abortController
                .signal,

            body: JSON.stringify({
              messages:
                chat.messages,

              mode:
                state.settings.mode,

              language:
                state.settings.language,

              memory:
                state.memory,

              webResults
            })
          }
        );

      let data = {};

      try {
        data =
          await response.json();
      } catch {
        throw new Error(
          "الخادم أرسل استجابة غير صالحة."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          `خطأ من الخادم (${response.status})`
        );
      }

      addMessage(
        "assistant",
        data.answer ||
        "لم يتم الحصول على إجابة."
      );

      setStatus(
        "WEURA جاهز.",
        "online"
      );

    } catch (error) {
      if (
        error &&
        error.name ===
        "AbortError"
      ) {
        setStatus(
          "تم إيقاف الطلب."
        );

        return;
      }

      console.error(
        "[WEURA] Send error:",
        error
      );

      addMessage(
        "assistant",
        "حدث خطأ: " +
        (
          error?.message ||
          "تعذر الاتصال بالخادم."
        )
      );

      setStatus(
        "حدث خطأ.",
        "offline"
      );

    } finally {
      state.busy = false;
      state.abortController =
        null;

      toggleBusy(false);
    }
  }

  /* =========================================================
     BUSY
  ========================================================= */

  function toggleBusy(
    busy
  ) {
    setVisible(
      "sendBtn",
      !busy,
      "grid"
    );

    setVisible(
      "stopBtn",
      busy,
      "grid"
    );

    const input =
      $("messageInput");

    if (input) {
      input.disabled =
        Boolean(busy);
    }
  }

  function stopGeneration() {
    if (
      state.abortController
    ) {
      state.abortController.abort();
    }
  }

  /* =========================================================
     FILE ANALYSIS
  ========================================================= */

  async function analyzeFile(
    file
  ) {
    if (!file) return;

    setStatus(
      "جاري تحليل الملف..."
    );

    const form =
      new FormData();

    form.append(
      "file",
      file
    );

    form.append(
      "prompt",
      "حلل هذا الملف وقدم لي ملخصاً واضحاً وأهم النقاط والملاحظات."
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

      let data = {};

      try {
        data =
          await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(
          data.error ||
          `فشل تحليل الملف (${response.status})`
        );
      }

      addMessage(
        "user",
        `📎 ملف: ${file.name}`
      );

      addMessage(
        "assistant",
        data.answer ||
        "تم تحليل الملف."
      );

      setStatus(
        "تم تحليل الملف.",
        "online"
      );

    } catch (error) {
      console.error(
        "[WEURA] File error:",
        error
      );

      addMessage(
        "assistant",
        "تعذر تحليل الملف: " +
        (
          error?.message ||
          "خطأ غير معروف"
        )
      );

      setStatus(
        "فشل تحليل الملف.",
        "offline"
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
      "جاري تحليل الصورة..."
    );

    const form =
      new FormData();

    form.append(
      "image",
      file
    );

    form.append(
      "prompt",
      "حلل هذه الصورة بدقة واشرح أهم المعلومات المرئية فيها."
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

      let data = {};

      try {
        data =
          await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(
          data.error ||
          `فشل تحليل الصورة (${response.status})`
        );
      }

      addMessage(
        "user",
        `🖼️ صورة: ${file.name}`
      );

      addMessage(
        "assistant",
        data.answer ||
        "تم تحليل الصورة."
      );

      setStatus(
        "تم تحليل الصورة.",
        "online"
      );

    } catch (error) {
      console.error(
        "[WEURA] Vision error:",
        error
      );

      addMessage(
        "assistant",
        "تعذر تحليل الصورة: " +
        (
          error?.message ||
          "خطأ غير معروف"
        )
      );

      setStatus(
        "فشل تحليل الصورة.",
        "offline"
      );
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
        "التعرف الصوتي غير مدعوم في هذا المتصفح."
      );

      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang =
      state.settings.language ===
      "en"
        ? "en-US"
        : state.settings.language ===
          "fr"
          ? "fr-FR"
          : "ar-DZ";

    recognition.interimResults =
      false;

    recognition.continuous =
      false;

    const voiceButton =
      $("voiceBtn");

    recognition.onstart =
      () => {
        voiceButton
          ?.classList
          .add("recording");

        setStatus(
          "أستمع إليك..."
        );
      };

    recognition.onresult =
      event => {
        const result =
          event
            .results?.[0]?.[0]
            ?.transcript ||
          "";

        const input =
          $("messageInput");

        if (!input) return;

        input.value =
          (
            input.value
              ? input.value + " "
              : ""
          ) + result;

        resizeTextarea();
        input.focus();
      };

    recognition.onerror =
      error => {
        console.warn(
          "[WEURA] Voice error:",
          error
        );

        setStatus(
          "تعذر استخدام الميكروفون."
        );
      };

    recognition.onend =
      () => {
        voiceButton
          ?.classList
          .remove("recording");

        if (!state.busy) {
          setStatus(
            "WEURA جاهز."
          );
        }
      };

    try {
      recognition.start();
    } catch (error) {
      console.warn(
        "[WEURA] Recognition start failed:",
        error
      );

      voiceButton
        ?.classList
        .remove("recording");
    }
  }

  /* =========================================================
     TEXTAREA
  ========================================================= */

  function resizeTextarea() {
    const input =
      $("messageInput");

    if (!input) return;

    input.style.height =
      "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        190
      ) + "px";
  }

  /* =========================================================
     SIDEBAR
  ========================================================= */

  function openSidebar() {
    $("sidebar")
      ?.classList
      .add("open");

    $("overlay")
      ?.classList
      .add("show");
  }

  function closeSidebar() {
    $("sidebar")
      ?.classList
      .remove("open");

    $("overlay")
      ?.classList
      .remove("show");
  }

  /* =========================================================
     SETTINGS
  ========================================================= */

  function openSettings() {
    $("settingsModal")
      ?.classList
      .add("show");

    $("overlay")
      ?.classList
      .add("show");

    syncSettingsUI();
  }

  function closeSettings() {
    $("settingsModal")
      ?.classList
      .remove("show");

    $("overlay")
      ?.classList
      .remove("show");
  }

  function syncSettingsUI() {
    const fields = {
      languageSetting:
        state.settings.language,

      directionSetting:
        state.settings.direction,

      themeSetting:
        state.settings.theme,

      detailSetting:
        state.settings.detail
    };

    Object.entries(fields)
      .forEach(
        ([id, value]) => {
          const element = $(id);

          if (element) {
            element.value =
              value;
          }
        }
      );
  }

  /* =========================================================
     NEW CHAT
  ========================================================= */

  function newChat() {
    createChat();

    renderMessages();
    renderHistory();

    setStatus(
      "محادثة جديدة."
    );

    $("messageInput")
      ?.focus();
  }

  /* =========================================================
     THEME
  ========================================================= */

  function cycleTheme() {
    const themes = [
      "dark",
      "light",
      "auto"
    ];

    const current =
      state.settings.theme;

    const index =
      themes.indexOf(current);

    state.settings.theme =
      themes[
        (index + 1) %
        themes.length
      ];

    saveState();
    applyTheme();
    syncSettingsUI();

    const names = {
      dark: "الوضع الداكن",
      light: "الوضع الفاتح",
      auto: "الوضع التلقائي"
    };

    setStatus(
      names[state.settings.theme]
    );
  }

  /* =========================================================
     SEARCH TOGGLE
  ========================================================= */

  function toggleSearch() {
    state.searchEnabled =
      !state.searchEnabled;

    const button =
      $("searchToggle");

    button
      ?.classList
      .toggle(
        "active",
        state.searchEnabled
      );

    setStatus(
      state.searchEnabled
        ? "البحث الذكي مفعّل."
        : "البحث الذكي متوقف."
    );
  }

  /* =========================================================
     QUICK ACTIONS
  ========================================================= */

  function bindQuickActions() {
    document
      .querySelectorAll(
        ".quick"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            const prompt =
              button.dataset.prompt ||
              "";

            const input =
              $("messageInput");

            if (!input) return;

            input.value =
              prompt;

            resizeTextarea();
            input.focus();
          }
        );
      });
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  function bindEvents() {
    /* SEND */
    on(
      "sendBtn",
      "click",
      sendMessage
    );

    on(
      "stopBtn",
      "click",
      stopGeneration
    );

    /* TEXT */
    on(
      "messageInput",
      "input",
      resizeTextarea
    );

    on(
      "messageInput",
      "keydown",
      event => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendMessage();
        }
      }
    );

    /* SIDEBAR */
    on(
      "newChatBtn",
      "click",
      newChat
    );

    on(
      "menuBtn",
      "click",
      openSidebar
    );

    on(
      "overlay",
      "click",
      () => {
        closeSidebar();
        closeSettings();
      }
    );

    /* SETTINGS */
    on(
      "settingsBtn",
      "click",
      openSettings
    );

    on(
      "closeSettings",
      "click",
      closeSettings
    );

    /* THEME */
    on(
      "themeBtn",
      "click",
      cycleTheme
    );

    on(
      "themeTopBtn",
      "click",
      cycleTheme
    );

    /* SEARCH */
    on(
      "searchToggle",
      "click",
      toggleSearch
    );

    /* MODE */
    on(
      "modeSelect",
      "change",
      event => {
        state.settings.mode =
          event.target.value;

        saveState();

        setStatus(
          `الوضع: ${event.target.options[event.target.selectedIndex]?.text || event.target.value}`
        );
      }
    );

    /* FILE */
    on(
      "fileBtn",
      "click",
      () => {
        const input =
          $("fileInput");

        if (input) {
          input.value = "";
          input.click();
        }
      }
    );

    /* IMAGE */
    on(
      "imageBtn",
      "click",
      () => {
        const input =
          $("imageInput");

        if (input) {
          input.value = "";
          input.click();
        }
      }
    );

    /* CAMERA */
    on(
      "cameraBtn",
      "click",
      () => {
        const input =
          $("cameraInput");

        if (input) {
          input.value = "";
          input.click();
        }
      }
    );

    /* VOICE */
    on(
      "voiceBtn",
      "click",
      startVoice
    );

    /* FILE INPUT */
    on(
      "fileInput",
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

    /* IMAGE INPUT */
    on(
      "imageInput",
      "change",
      event => {
        const file =
          event.target.files?.[0];

        if (file) {
          analyzeImage(file);
        }

        event.target.value = "";
      }
    );

    /* CAMERA INPUT */
    on(
      "cameraInput",
      "change",
      event => {
        const file =
          event.target.files?.[0];

        if (file) {
          analyzeImage(file);
        }

        event.target.value = "";
      }
    );

    /* SETTINGS */
    on(
      "languageSetting",
      "change",
      event => {
        state.settings.language =
          event.target.value;

        applyDirection();
        saveState();
      }
    );

    on(
      "directionSetting",
      "change",
      event => {
        state.settings.direction =
          event.target.value;

        applyDirection();
        saveState();
      }
    );

    on(
      "themeSetting",
      "change",
      event => {
        state.settings.theme =
          event.target.value;

        applyTheme();
        saveState();
      }
    );

    on(
      "detailSetting",
      "change",
      event => {
        state.settings.detail =
          event.target.value;

        saveState();
      }
    );

    /* MEMORY */
    on(
      "clearMemoryBtn",
      "click",
      () => {
        state.memory = [];

        saveState();

        setStatus(
          "تم حذف الذاكرة المحلية."
        );
      }
    );

    bindQuickActions();
  }

  /* =========================================================
     INIT
  ========================================================= */

  async function init() {
    if (
      state.initialized ||
      state.initializing
    ) {
      return;
    }

    state.initializing = true;

    try {
      console.log(
        "[WEURA] Initializing..."
      );

      loadState();

      applyTheme();
      applyDirection();

      const mode =
        $("modeSelect");

      if (mode) {
        mode.value =
          state.settings.mode;
      }

      if (!state.chats.length) {
        createChat();
      } else if (
        !state.currentChatId
      ) {
        state.currentChatId =
          state.chats[0].id;
      }

      /*
        مهم جداً:
        الأحداث تتربط قبل أي request للخادم.
        حتى لو الـ API مات، الواجهة تبقى خدامة.
      */
      bindEvents();

      renderHistory();
      renderMessages();
      resizeTextarea();

      state.initialized =
        true;

      state.initializing =
        false;

      console.log(
        "[WEURA] UI initialized."
      );

      /*
        Health check بعد تشغيل الواجهة،
        وليس قبلها.
      */
      checkHealth();

    } catch (error) {
      state.initializing =
        false;

      console.error(
        "[WEURA] Initialization error:",
        error
      );

      setStatus(
        "WEURA يعمل بوضع محدود.",
        "offline"
      );

      /*
        إذا حدث خطأ في عنصر واحد،
        نعطي فرصة لإعادة التهيئة.
      */
      setTimeout(() => {
        if (!state.initialized) {
          init();
        }
      }, 800);
    }
  }

  /* =========================================================
     GLOBAL API
  ========================================================= */

  window.WEURA = {
    send: sendMessage,

    newChat,

    openSettings,

    closeSettings,

    toggleSearch,

    theme: cycleTheme,

    getState: () => state,

    init
  };

  /* =========================================================
     BOOT
  ========================================================= */

  function boot() {
    /*
      نخلي DOM كامل موجود قبل التهيئة.
    */

    if (
      document.readyState ===
      "loading"
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

    /*
      Fallback:
      إذا لأي سبب DOMContentLoaded ما خدمش
      أو السكربت دخل في توقيت غريب.
    */
    setTimeout(() => {
      if (
        !state.initialized &&
        !state.initializing
      ) {
        init();
      }
    }, 1200);
  }

  boot();

})();