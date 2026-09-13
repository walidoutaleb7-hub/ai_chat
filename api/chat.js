"use strict";

(() => {

  const $ = id =>
    document.getElementById(id);

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

  /* =========================
     STORAGE
  ========================= */

  function loadJSON(key, fallback) {
    try {
      const value =
        localStorage.getItem(key);

      return value
        ? JSON.parse(value)
        : fallback;

    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch {}
  }

  function loadState() {
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...loadJSON(
        STORAGE.settings,
        {}
      )
    };

    state.chats =
      loadJSON(
        STORAGE.chats,
        []
      );

    state.memory =
      loadJSON(
        STORAGE.memory,
        []
      );
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

  /* =========================
     THEME
  ========================= */

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

  /* =========================
     DIRECTION
  ========================= */

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
      "ar"
    ) {
      return "rtl";
    }

    return "rtl";
  }

  function applyDirection() {

    const direction =
      detectDirection();

    document.documentElement.dir =
      direction;

    document.documentElement.lang =
      state.settings.language ===
      "en"
        ? "en"
        : state.settings.language ===
          "fr"
          ? "fr"
          : "ar";
  }

  /* =========================
     CHAT HELPERS
  ========================= */

  function createChat() {

    const id =
      "chat_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2);

    const chat = {
      id,
      title: "محادثة جديدة",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
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

  /* =========================
     HISTORY
  ========================= */

  function renderHistory() {

    const list =
      $("historyList");

    if (!list) return;

    list.innerHTML = "";

    state.chats
      .slice()
      .sort(
        (a, b) =>
          b.updatedAt -
          a.updatedAt
      )
      .forEach(chat => {

        const item =
          document.createElement(
            "div"
          );

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

        item.onclick = () => {

          state.currentChatId =
            chat.id;

          renderHistory();
          renderMessages();
          closeSidebar();
        };

        list.appendChild(item);
      });
  }

  /* =========================
     MESSAGES
  ========================= */

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
      !chat.messages.length
    ) {

      const welcome =
        document
          .querySelector(
            "#welcome"
          );

      if (welcome) {
        inner.appendChild(
          welcome
        );
      }

      container.innerHTML = "";

      container.appendChild(
        inner
      );

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

    container.appendChild(
      inner
    );

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
      `message ${message.role}`;

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

    body.appendChild(
      content
    );

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

      copy.textContent =
        "نسخ";

      copy.onclick = async () => {

        try {

          await navigator.clipboard
            .writeText(
              message.content
            );

          copy.textContent =
            "تم النسخ";

          setTimeout(() => {
            copy.textContent =
              "نسخ";
          }, 1200);

        } catch {}

      };

      actions.appendChild(
        copy
      );

      body.appendChild(
        actions
      );
    }

    wrapper.appendChild(
      avatar
    );

    wrapper.appendChild(
      body
    );

    return wrapper;
  }

  function addMessage(
    role,
    content
  ) {

    const chat =
      ensureChat();

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

    const el =
      $("messages");

    if (!el) return;

    requestAnimationFrame(() => {

      el.scrollTop =
        el.scrollHeight;

    });
  }

  /* =========================
     UI STATUS
  ========================= */

  function setStatus(
    text,
    type = ""
  ) {

    document
      .querySelectorAll(
        ".status"
      )
      .forEach(el => {

        el.textContent =
          text;

        el.className =
          "status " +
          type;

      });

    const composer =
      $("composerStatus");

    if (composer) {
      composer.textContent =
        text;
    }
  }

  /* =========================
     BACKEND HEALTH
  ========================= */

  async function checkHealth() {

    try {

      const response =
        await fetch(
          "/api/health"
        );

      const data =
        await response.json();

      if (data.ok) {

        setStatus(
          data.groq
            ? "WEURA متصل"
            : "WEURA متصل — API غير مضبوط",
          data.groq
            ? "online"
            : "offline"
        );

      } else {
        throw new Error();
      }

    } catch {

      setStatus(
        "الخادم غير متصل",
        "offline"
      );
    }
  }

  /* =========================
     SEARCH
  ========================= */

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

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "فشل البحث"
      );
    }

    return data;
  }

  /* =========================
     SEND
  ========================= */

  async function sendMessage() {

    if (state.busy) return;

    const input =
      $("messageInput");

    if (!input) return;

    const text =
      input.value.trim();

    if (!text) return;

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
          search.results || [];
      }

      setStatus(
        "WEURA يفكر..."
      );

      const chat =
        getCurrentChat();

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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "حدث خطأ في WEURA."
        );
      }

      addMessage(
        "assistant",
        data.answer ||
        "لم يتم الحصول على إجابة."
      );

      setStatus(
        "WEURA جاهز."
      );

    } catch (error) {

      if (
        error.name ===
        "AbortError"
      ) {

        setStatus(
          "تم إيقاف الطلب."
        );

        return;
      }

      console.error(error);

      addMessage(
        "assistant",
        "حدث خطأ: " +
        (
          error.message ||
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

  /* =========================
     BUSY
  ========================= */

  function toggleBusy(
    busy
  ) {

    const send =
      $("sendBtn");

    const stop =
      $("stopBtn");

    if (send) {
      send.style.display =
        busy
          ? "none"
          : "grid";
    }

    if (stop) {
      stop.style.display =
        busy
          ? "grid"
          : "none";
    }
  }

  function stopGeneration() {

    if (
      state.abortController
    ) {
      state
        .abortController
        .abort();
    }
  }

  /* =========================
     FILE
  ========================= */

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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "فشل تحليل الملف."
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
        "تم تحليل الملف."
      );

    } catch (error) {

      addMessage(
        "assistant",
        "تعذر تحليل الملف: " +
        error.message
      );

      setStatus(
        "فشل تحليل الملف.",
        "offline"
      );
    }
  }

  /* =========================
     IMAGE
  ========================= */

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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "فشل تحليل الصورة."
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
        "تم تحليل الصورة."
      );

    } catch (error) {

      addMessage(
        "assistant",
        "تعذر تحليل الصورة: " +
        error.message
      );

      setStatus(
        "فشل تحليل الصورة.",
        "offline"
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

    recognition.onstart =
      () => {

        setStatus(
          "أستمع إليك..."
        );

      };

    recognition.onresult =
      event => {

        const result =
          event.results?.[0]?.[0]
            ?.transcript || "";

        const input =
          $("messageInput");

        if (input) {

          input.value =
            (
              input.value
                ? input.value +
                  " "
                : ""
            ) + result;

          resizeTextarea();
        }

      };

    recognition.onerror =
      () => {

        setStatus(
          "تعذر استخدام الميكروفون."
        );

      };

    recognition.onend =
      () => {

        if (!state.busy) {
          setStatus(
            "WEURA جاهز."
          );
        }

      };

    recognition.start();
  }

  /* =========================
     TEXTAREA
  ========================= */

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

  /* =========================
     SIDEBAR
  ========================= */

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

  /* =========================
     SETTINGS
  ========================= */

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

          const element =
            $(id);

          if (element) {
            element.value =
              value;
          }

        }
      );
  }

  /* =========================
     NEW CHAT
  ========================= */

  function newChat() {

    createChat();

    renderMessages();
    renderHistory();

    setStatus(
      "محادثة جديدة."
    );
  }

  /* =========================
     THEME BUTTON
  ========================= */

  function cycleTheme() {

    const themes =
      [
        "dark",
        "light",
        "auto"
      ];

    const current =
      state.settings.theme;

    const index =
      themes.indexOf(
        current
      );

    state.settings.theme =
      themes[
        (index + 1) %
        themes.length
      ];

    saveState();

    applyTheme();

    syncSettingsUI();
  }

  /* =========================
     EVENTS
  ========================= */

  function bindEvents() {

    $("sendBtn")
      ?.addEventListener(
        "click",
        sendMessage
      );

    $("stopBtn")
      ?.addEventListener(
        "click",
        stopGeneration
      );

    $("messageInput")
      ?.addEventListener(
        "input",
        resizeTextarea
      );

    $("messageInput")
      ?.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
              "Enter" &&
            !event.shiftKey
          ) {

            event.preventDefault();

            sendMessage();
          }

        }
      );

    $("newChatBtn")
      ?.addEventListener(
        "click",
        newChat
      );

    $("menuBtn")
      ?.addEventListener(
        "click",
        openSidebar
      );

    $("overlay")
      ?.addEventListener(
        "click",
        () => {

          closeSidebar();
          closeSettings();

        }
      );

    $("settingsBtn")
      ?.addEventListener(
        "click",
        openSettings
      );

    $("closeSettings")
      ?.addEventListener(
        "click",
        closeSettings
      );

    $("themeBtn")
      ?.addEventListener(
        "click",
        cycleTheme
      );

    $("themeTopBtn")
      ?.addEventListener(
        "click",
        cycleTheme
      );

    $("searchToggle")
      ?.addEventListener(
        "click",
        () => {

          state.searchEnabled =
            !state.searchEnabled;

          $("searchToggle")
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
      );

    $("modeSelect")
      ?.addEventListener(
        "change",
        event => {

          state.settings.mode =
            event.target.value;

          saveState();

        }
      );

    $("fileBtn")
      ?.addEventListener(
        "click",
        () => {
          $("fileInput")?.click();
        }
      );

    $("imageBtn")
      ?.addEventListener(
        "click",
        () => {
          $("imageInput")?.click();
        }
      );

    $("cameraBtn")
      ?.addEventListener(
        "click",
        () => {
          $("cameraInput")?.click();
        }
      );

    $("voiceBtn")
      ?.addEventListener(
        "click",
        startVoice
      );

    $("fileInput")
      ?.addEventListener(
        "change",
        event => {

          analyzeFile(
            event.target.files?.[0]
          );

          event.target.value =
            "";
        }
      );

    $("imageInput")
      ?.addEventListener(
        "change",
        event => {

          analyzeImage(
            event.target.files?.[0]
          );

          event.target.value =
            "";
        }
      );

    $("cameraInput")
      ?.addEventListener(
        "change",
        event => {

          analyzeImage(
            event.target.files?.[0]
          );

          event.target.value =
            "";
        }
      );

    $("languageSetting")
      ?.addEventListener(
        "change",
        event => {

          state.settings.language =
            event.target.value;

          applyDirection();

          saveState();

        }
      );

    $("directionSetting")
      ?.addEventListener(
        "change",
        event => {

          state.settings.direction =
            event.target.value;

          applyDirection();

          saveState();

        }
      );

    $("themeSetting")
      ?.addEventListener(
        "change",
        event => {

          state.settings.theme =
            event.target.value;

          applyTheme();

          saveState();

        }
      );

    $("detailSetting")
      ?.addEventListener(
        "change",
        event => {

          state.settings.detail =
            event.target.value;

          saveState();

        }
      );

    $("clearMemoryBtn")
      ?.addEventListener(
        "click",
        () => {

          state.memory = [];

          saveState();

          setStatus(
            "تم حذف الذاكرة المحلية."
          );

        }
      );

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

  /* =========================
     INIT
  ========================= */

  async function init() {

    if (state.initialized)
      return;

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

    bindEvents();

    renderHistory();
    renderMessages();

    resizeTextarea();

    state.initialized =
      true;

    await checkHealth();

    console.log(
      "WEURA AI initialized."
    );
  }

  /* =========================
     GLOBAL API
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

})();