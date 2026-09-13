/* ==========================================
   WEURA AI — Frontend Core Script (chat.js)
   ========================================== */

window.WEURA_BOOT = {
    htmlLoaded: true,
    scriptLoaded: false,
    initialized: false,
    backendReady: false
};

window.WEURA_BOOT.scriptLoaded = true;
console.log("WEURA: chat.js loaded");

const state = {
    initialized: false,
    busy: false,
    currentChatId: null,
    abortController: null,
    currentMode: 'auto',
    currentDetail: 'auto',
    searchEnabled: false,
    theme: 'dark',
    language: 'en',
    direction: 'ltr',
    chats: [],
    memory: [],
    activeAttachment: null
};

const translations = {
    en: {
        newChat: "New Chat",
        recentChats: "Recent Conversations",
        smartMemory: "Smart Memory",
        settings: "Settings",
        language: "Language",
        direction: "Text Direction",
        responseDetail: "Response Detail",
        privacyAndData: "Privacy & Data",
        clearAllData: "Clear All Local Data",
        clearMemory: "Clear Memory",
        memoryDesc: "WEURA remembers key preferences across sessions securely.",
        backendUnavailable: "Backend unavailable. Working in offline fallback mode."
    },
    ar: {
        newChat: "محادثة جديدة",
        recentChats: "المحادثات الأخيرة",
        smartMemory: "الذاكرة الذكية",
        settings: "الإعدادات",
        language: "اللغة",
        direction: "اتجاه النص",
        responseDetail: "تفاصيل الرد",
        privacyAndData: "الخصوصية والبيانات",
        clearAllData: "مسح جميع البيانات المحلية",
        clearMemory: "مسح الذاكرة",
        memoryDesc: "يحتفظ WEURA بالتفضيلات الأساسية بشكل آمن عبر الجلسات.",
        backendUnavailable: "الخادم غير متوفر حالياً. يعمل النظام بوضع الاستجابة الاحتياطي."
    }
};

function $(id) {
    return document.getElementById(id);
}

function bindClick(id, handler) {
    const el = $(id);
    if (!el) {
        console.warn(`WEURA missing element: ${id}`);
        return;
    }
    el.addEventListener('click', handler);
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        loadLocalStorage();
        applyTheme(state.theme);
        applyLanguage(state.language, state.direction);
        setupEventListeners();
        renderChatHistory();
        renderMemory();

        // Check Backend Health
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                window.WEURA_BOOT.backendReady = true;
                $('status-dot').classList.add('online');
                $('status-text').textContent = "WEURA Online";
            } else {
                throw new Error();
            }
        } catch (e) {
            $('status-dot').classList.remove('online');
            $('status-text').textContent = translations[state.language].backendUnavailable;
        }

        window.WEURA_BOOT.initialized = true;
        state.initialized = true;
        console.log("WEURA: frontend initialized successfully");

        // Dismiss Splash Screen safely
        setTimeout(() => {
            const splash = $('splash-screen');
            if (splash) splash.classList.add('hidden');
        }, 600);

    } catch (err) {
        console.error("WEURA Initialization Error:", err);
        const splash = $('splash-screen');
        if (splash) splash.classList.add('hidden');
    }
}

function loadLocalStorage() {
    try {
        const settings = localStorage.getItem('weura_settings_v4');
        if (settings) {
            const parsed = JSON.parse(settings);
            state.theme = parsed.theme || 'dark';
            state.language = parsed.language || 'en';
            state.direction = parsed.direction || 'auto';
            state.currentDetail = parsed.detail || 'auto';
        }
        const chats = localStorage.getItem('weura_chats_v4');
        if (chats) state.chats = JSON.parse(chats);

        const memory = localStorage.getItem('weura_memory_v4');
        if (memory) state.memory = JSON.parse(memory);
    } catch (e) {
        console.error("Error loading local storage:", e);
    }
}

function saveLocalStorage() {
    try {
        localStorage.setItem('weura_settings_v4', JSON.stringify({
            theme: state.theme,
            language: state.language,
            direction: state.direction,
            detail: state.currentDetail
        }));
        localStorage.setItem('weura_chats_v4', JSON.stringify(state.chats));
        localStorage.setItem('weura_memory_v4', JSON.stringify(state.memory));
    } catch (e) {
        console.error("Error saving local storage:", e);
    }
}

function setupEventListeners() {
    // Sidebar toggle
    bindClick('menu-btn', () => {
        $('sidebar').classList.toggle('mobile-open');
        $('mobile-overlay').classList.toggle('show');
    });
    bindClick('sidebar-close-btn', () => {
        $('sidebar').classList.remove('mobile-open');
        $('mobile-overlay').classList.remove('show');
    });
    bindClick('mobile-overlay', () => {
        $('sidebar').classList.remove('mobile-open');
        $('mobile-overlay').classList.remove('show');
    });

    // New chat
    bindClick('new-chat-btn', () => {
        startNewChat();
        if (window.innerWidth <= 768) {
            $('sidebar').classList.remove('mobile-open');
            $('mobile-overlay').classList.remove('show');
        }
    });

    // Theme toggle
    bindClick('theme-btn', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme(state.theme);
        saveLocalStorage();
    });

    // Mode dropdown toggle
    bindClick('mode-current-btn', (e) => {
        e.stopPropagation();
        $('mode-dropdown').classList.toggle('show');
    });

    document.addEventListener('click', () => {
        const dd = $('mode-dropdown');
        if (dd) dd.classList.remove('show');
    });

    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            state.currentMode = opt.getAttribute('data-mode');
            $('current-mode-label').textContent = opt.textContent;
            $('mode-dropdown').classList.remove('show');
        });
    });

    // Quick action cards
    document.querySelectorAll('.quick-action-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            const textarea = $('composer-textarea');
            if (textarea) {
                textarea.value = prompt;
                textarea.focus();
                autoResizeTextarea(textarea);
                updateSendButtonState();
            }
        });
    });

    // Composer textarea auto-resize
    const textarea = $('composer-textarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            autoResizeTextarea(textarea);
            updateSendButtonState();
        });
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    bindClick('send-btn', sendMessage);
    bindClick('stop-btn', stopGeneration);

    // Modals
    bindClick('settings-modal-btn', () => $('settings-modal').classList.add('show'));
    bindClick('settings-close-btn', () => $('settings-modal').classList.remove('show'));
    bindClick('memory-modal-btn', () => $('memory-modal').classList.add('show'));
    bindClick('memory-close-btn', () => $('memory-modal').classList.remove('show'));
    bindClick('camera-close-btn', closeCameraModal);

    // Settings elements
    const langSelect = $('language-select');
    if (langSelect) {
        langSelect.value = state.language;
        langSelect.addEventListener('change', (e) => {
            state.language = e.target.value;
            applyLanguage(state.language, state.direction);
            saveLocalStorage();
        });
    }

    const dirSelect = $('direction-select');
    if (dirSelect) {
        dirSelect.value = state.direction;
        dirSelect.addEventListener('change', (e) => {
            state.direction = e.target.value;
            applyLanguage(state.language, state.direction);
            saveLocalStorage();
        });
    }

    const detailSelect = $('detail-select');
    if (detailSelect) {
        detailSelect.value = state.currentDetail;
        detailSelect.addEventListener('change', (e) => {
            state.currentDetail = e.target.value;
            saveLocalStorage();
        });
    }

    bindClick('clear-local-data-btn', () => {
        if (confirm("Are you sure you want to clear all local chats and settings?")) {
            localStorage.clear();
            location.reload();
        }
    });

    bindClick('clear-memory-btn', () => {
        state.memory = [];
        saveLocalStorage();
        renderMemory();
    });

    // File / Image / Camera / Mic triggers
    bindClick('file-upload-btn', () => $('hidden-file-input').click());
    bindClick('image-upload-btn', () => $('hidden-image-input').click());
    bindClick('camera-btn', openCameraModal);
    bindClick('mic-btn', handleVoiceInput);

    $('hidden-file-input').addEventListener('change', (e) => handleFileSelection(e, 'file'));
    $('hidden-image-input').addEventListener('change', (e) => handleFileSelection(e, 'image'));
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function applyLanguage(lang, dir) {
    let textDir = dir;
    if (dir === 'auto') {
        textDir = lang === 'ar' ? 'rtl' : 'ltr';
    }
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', textDir);

    // Update static i18n texts
    const t = translations[lang] || translations.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });
}

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

function updateSendButtonState() {
    const textarea = $('composer-textarea');
    const sendBtn = $('send-btn');
    if (textarea && sendBtn) {
        const hasText = textarea.value.trim().length > 0;
        const hasAttachment = state.activeAttachment !== null;
        sendBtn.disabled = !hasText && !hasAttachment;
    }
}

function startNewChat() {
    state.currentChatId = 'chat_' + Date.now();
    const newChatObj = {
        id: state.currentChatId,
        title: 'New Conversation',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    };
    state.chats.unshift(newChatObj);
    saveLocalStorage();
    renderChatHistory();
    clearWorkspace();
}

function clearWorkspace() {
    $('messages-list').innerHTML = '';
    $('welcome-screen').style.display = 'flex';
}

function renderChatHistory() {
    const list = $('chat-history-list');
    if (!list) return;

    let html = `<div class="nav-section-title" data-i18n="recentChats">${translations[state.language].recentChats}</div>`;
    state.chats.forEach(chat => {
        const active = chat.id === state.currentChatId ? 'active' : '';
        html += `
            <button class="nav-item ${active}" onclick="loadChat('${chat.id}')">
                <div class="nav-item-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    <span>${escapeHtml(chat.title)}</span>
                </div>
            </button>
        `;
    });
    list.innerHTML = html;
}

window.loadChat = function(id) {
    state.currentChatId = id;
    const chat = state.chats.find(c => c.id === id);
    if (!chat) return;

    renderChatHistory();
    const msgList = $('messages-list');
    msgList.innerHTML = '';
    $('welcome-screen').style.display = chat.messages.length === 0 ? 'flex' : 'none';

    chat.messages.forEach(msg => {
        appendMessageDOM(msg.role, msg.content, msg.sources || [], false);
    });
};

function renderMemory() {
    const list = $('memory-list');
    if (!list) return;
    if (state.memory.length === 0) {
        list.innerHTML = `<div class="setting-desc">No memory items stored yet.</div>`;
        return;
    }
    let html = '';
    state.memory.forEach((mem, index) => {
        html += `<div style="background: var(--surface-2); padding: 8px 12px; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span>${escapeHtml(mem)}</span>
            <button onclick="removeMemory(${index})" style="background:none; border:none; color:var(--danger); cursor:pointer;">Remove</button>
        </div>`;
    });
    list.innerHTML = html;
}

window.removeMemory = function(index) {
    state.memory.splice(index, 1);
    saveLocalStorage();
    renderMemory();
};

function handleFileSelection(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert("File size exceeds 10MB limit.");
        return;
    }

    state.activeAttachment = {
        type: type,
        file: file,
        name: file.name
    };

    const previewBar = $('attachment-preview-bar');
    previewBar.style.display = 'flex';
    previewBar.innerHTML = `
        <div class="attachment-badge">
            <span>📎 ${escapeHtml(file.name)}</span>
            <button onclick="clearAttachment()">✕</button>
        </div>
    `;
    updateSendButtonState();
}

window.clearAttachment = function() {
    state.activeAttachment = null;
    const previewBar = $('attachment-preview-bar');
    previewBar.style.display = 'none';
    previewBar.innerHTML = '';
    $('hidden-file-input').value = '';
    $('hidden-image-input').value = '';
    updateSendButtonState();
};

let mediaStream = null;
async function openCameraModal() {
    const modal = $('camera-modal');
    modal.classList.add('show');
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        $('camera-video').srcObject = mediaStream;
    } catch (err) {
        alert("Camera permission was denied or not supported.");
        modal.classList.remove('show');
    }
}

function closeCameraModal() {
    const modal = $('camera-modal');
    modal.classList.remove('show');
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

bindClick('capture-photo-btn', () => {
    const video = $('camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
        const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
        state.activeAttachment = {
            type: 'image',
            file: file,
            name: 'camera_capture.jpg'
        };
        const previewBar = $('attachment-preview-bar');
        previewBar.style.display = 'flex';
        previewBar.innerHTML = `
            <div class="attachment-badge">
                <span>📸 camera_capture.jpg</span>
                <button onclick="clearAttachment()">✕</button>
            </div>
        `;
        updateSendButtonState();
        closeCameraModal();
    }, 'image/jpeg');
});

function handleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Voice input is not supported on this browser.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = state.language === 'ar' ? 'ar-DZ' : 'en-US';
    recognition.start();

    const micBtn = $('mic-btn');
    micBtn.classList.add('active');

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const textarea = $('composer-textarea');
        textarea.value += (textarea.value ? ' ' : '') + transcript;
        autoResizeTextarea(textarea);
        updateSendButtonState();
        micBtn.classList.remove('active');
    };

    recognition.onerror = () => {
        micBtn.classList.remove('active');
    };
    recognition.onend = () => {
        micBtn.classList.remove('active');
    };
}

async function sendMessage() {
    const textarea = $('composer-textarea');
    const text = textarea.value.trim();
    if (!text && !state.activeAttachment) return;

    if (!state.currentChatId) {
        startNewChat();
    }

    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (chat && chat.messages.length === 0) {
        chat.title = text.length > 30 ? text.substring(0, 30) + '...' : text;
    }

    $('welcome-screen').style.display = 'none';

    let userMsgContent = text;
    if (state.activeAttachment) {
        userMsgContent += ` [Attached: ${state.activeAttachment.name}]`;
    }

    appendMessageDOM('user', userMsgContent, [], true);
    textarea.value = '';
    textarea.style.height = 'auto';
    
    const attachmentSnapshot = state.activeAttachment;
    clearAttachment();
    updateSendButtonState();

    // Show Typing Indicator
    const msgList = $('messages-list');
    const typingRow = document.createElement('div');
    typingRow.className = 'message-row ai';
    typingRow.id = 'typing-indicator-row';
    typingRow.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    msgList.appendChild(typingRow);
    scrollToBottom();

    // Toggle Send / Stop
    $('send-btn').style.display = 'none';
    $('stop-btn').style.display = 'flex';

    state.abortController = new AbortController();

    try {
        let endpoint = '/api/chat';
        let bodyData = {
            messages: chat ? chat.messages.concat({ role: 'user', content: userMsgContent }) : [{ role: 'user', content: userMsgContent }],
            mode: state.currentMode,
            detail: state.currentDetail,
            memory: state.memory
        };

        if (attachmentSnapshot) {
            const formData = new FormData();
            formData.append('file', attachmentSnapshot.file);
            formData.append('mode', state.currentMode);
            
            if (attachmentSnapshot.type === 'image' || attachmentSnapshot.file.type.startsWith('image/')) {
                endpoint = '/api/vision';
                formData.append('prompt', text || 'Describe this image.');
            } else {
                endpoint = '/api/file';
                formData.append('prompt', text || 'Analyze this document.');
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                body: formData,
                signal: state.abortController.signal
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Server error');
            
            removeTypingIndicator();
            appendMessageDOM('ai', data.response || data.result, data.sources || [], true);
            if (chat) {
                chat.messages.push({ role: 'user', content: userMsgContent });
                chat.messages.push({ role: 'assistant', content: data.response || data.result, sources: data.sources || [] });
                chat.updatedAt = Date.now();
                saveLocalStorage();
                renderChatHistory();
            }

        } else {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData),
                signal: state.abortController.signal
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Server error');

            removeTypingIndicator();
            appendMessageDOM('ai', data.response, data.sources || [], true);
            if (chat) {
                chat.messages.push({ role: 'user', content: userMsgContent });
                chat.messages.push({ role: 'assistant', content: data.response, sources: data.sources || [] });
                chat.updatedAt = Date.now();
                saveLocalStorage();
                renderChatHistory();
            }
        }

    } catch (err) {
        removeTypingIndicator();
        if (err.name !== 'AbortError') {
            appendMessageDOM('ai', 'Something went wrong. Please try again.', [], true);
        }
    } finally {
        $('send-btn').style.display = 'flex';
        $('stop-btn').style.display = 'none';
        state.abortController = null;
    }
}

function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    removeTypingIndicator();
    $('send-btn').style.display = 'flex';
    $('stop-btn').style.display = 'none';
}

function removeTypingIndicator() {
    const el = $('typing-indicator-row');
    if (el) el.remove();
}

function appendMessageDOM(role, content, sources, saveToChat) {
    const msgList = $('messages-list');
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    let parsedContent = formatMarkdown(content);

    let sourcesHtml = '';
    if (sources && sources.length > 0) {
        sourcesHtml += `<div class="sources-container"><div style="font-size:11px; font-weight:600; color:var(--muted); width:100%;">Sources</div>`;
        sources.forEach(src => {
            sourcesHtml += `
                <a href="${escapeHtml(src.url)}" target="_blank" class="source-chip">
                    <span>🌐</span>
                    <strong>${escapeHtml(src.title || src.domain || 'Source')}</strong>
                    <span>[${escapeHtml(src.domain || 'web')]</span>
                </a>
            `;
        });
        sourcesHtml += `</div>`;
    }

    let actionsHtml = '';
    if (role === 'ai') {
        actionsHtml = `
            <div class="message-actions">
                <button class="msg-action-btn" onclick="copyMessageText(this)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                </button>
            </div>
        `;
    }

    row.innerHTML = `
        <div class="message-bubble">${parsedContent}</div>
        ${sourcesHtml}
        ${actionsHtml}
    `;

    msgList.appendChild(row);
    scrollToBottom();
}

function formatMarkdown(text) {
    if (!text) return '';
    // Code blocks
    text = text.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `
            <pre><div class="code-header"><span>${lang || 'code'}</span><button class="copy-code-btn" onclick="copyCode(this)">Copy</button></div><code>${escapeHtml(code.trim())}</code></pre>
        `;
    });
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
}

window.copyCode = function(btn) {
    const code = btn.closest('pre').querySelector('code').textContent;
    navigator.clipboard.writeText(code);
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
};

window.copyMessageText = function(btn) {
    const text = btn.closest('.message-row').querySelector('.message-bubble').textContent;
    navigator.clipboard.writeText(text);
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
};

function scrollToBottom() {
    const ws = $('chat-workspace');
    if (ws) ws.scrollTop = ws.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
