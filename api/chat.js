window.WEURA_BOOT.scriptLoaded = true;

try {
    const state = {
        theme: 'system',
        lang: 'en',
        dir: 'ltr',
        mode: 'auto',
        detail: 'auto',
        useSearch: false,
        chats: JSON.parse(localStorage.getItem('weura_chats') || '[]'),
        currentChatId: null,
        memory: JSON.parse(localStorage.getItem('weura_memory') || '[]'),
        connected: false,
        abortController: null
    };

    function bindClick(id, handler) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`Missing element: ${id}`);
            return;
        }
        el.addEventListener("click", handler);
    }

    function initSplash() {
        const splash = document.getElementById('splash-screen');
        setTimeout(() => {
            if (splash) splash.classList.add('hidden');
        }, 1200);
        setTimeout(() => {
            if (splash) splash.remove();
        }, 1800);
    }

    async function checkHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            state.connected = data.status === 'connected';
            updateStatusUI();
        } catch (err) {
            state.connected = false;
            updateStatusUI();
        }
    }

    function updateStatusUI() {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (dot && text) {
            if (state.connected) {
                dot.className = 'status-dot';
                text.textContent = 'Connected';
            } else {
                dot.className = 'status-dot offline';
                text.textContent = 'Offline';
            }
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('weura_theme') || 'system';
        state.theme = savedTheme;
        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        let actualTheme = theme;
        if (theme === 'system') {
            actualTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        if (actualTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('weura_theme', theme);
    }

    function initEventListeners() {
        bindClick('sidebar-toggle-btn', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        });

        bindClick('close-sidebar-btn', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('open');
        });

        bindClick('theme-toggle-btn', () => {
            const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
            state.theme = nextTheme;
            applyTheme(nextTheme);
        });

        bindClick('search-toggle-btn', () => {
            state.useSearch = !state.useSearch;
            const btn = document.getElementById('search-toggle-btn');
            if (btn) {
                btn.style.borderColor = state.useSearch ? 'var(--accent-blue)' : 'var(--border-color)';
                btn.style.boxShadow = state.useSearch ? '0 0 10px var(--accent-glow)' : 'none';
            }
        });

        bindClick('settings-open-btn', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('active');
        });

        bindClick('settings-close-btn', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('active');
        });

        bindClick('new-chat-btn', () => {
            startNewChat();
        });

        bindClick('send-btn', () => {
            handleSendMessage();
        });

        const input = document.getElementById('composer-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
            input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        }

        document.querySelectorAll('.quick-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                if (prompt && input) {
                    input.value = prompt;
                    handleSendMessage();
                }
            });
        });

        const themeSelect = document.getElementById('setting-theme');
        if (themeSelect) {
            themeSelect.value = state.theme;
            themeSelect.addEventListener('change', (e) => {
                state.theme = e.target.value;
                applyTheme(state.theme);
            });
        }

        const langSelect = document.getElementById('setting-lang');
        if (langSelect) {
            langSelect.value = state.lang;
            langSelect.addEventListener('change', (e) => {
                state.lang = e.target.value;
                document.documentElement.setAttribute('lang', state.lang);
                document.documentElement.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
            });
        }

        const modeSelector = document.getElementById('mode-selector');
        if (modeSelector) {
            modeSelector.addEventListener('change', (e) => {
                state.mode = e.target.value;
            });
        }

        bindClick('file-upload-btn', () => document.getElementById('file-input')?.click());
        bindClick('image-upload-btn', () => document.getElementById('image-input')?.click());

        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                await handleFileUpload(file);
            });
        }

        const imageInput = document.getElementById('image-input');
        if (imageInput) {
            imageInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                await handleVisionUpload(file);
            });
        }

        bindClick('camera-btn', () => {
            triggerCameraCapture();
        });

        bindClick('mic-btn', () => {
            triggerVoiceInput();
        });

        bindClick('clear-memory-btn', () => {
            state.memory = [];
            localStorage.removeItem('weura_memory');
            alert('Smart memory cleared successfully.');
        });
    }

    function startNewChat() {
        state.currentChatId = 'chat_' + Date.now();
        const container = document.getElementById('chat-container');
        if (container) {
            container.innerHTML = `
                <div class="welcome-screen" id="welcome-screen">
                    <h1 class="welcome-title">WEURA AI</h1>
                    <p class="welcome-subtitle">Think Beyond. What would you like to explore or build today?</p>
                    <div class="quick-actions-grid">
                        <div class="quick-card" data-prompt="Analyze recent architectural trends in AI systems.">⚡ Smart Research</div>
                        <div class="quick-card" data-prompt="Write a robust asynchronous Express API handler.">💻 Code Architecture</div>
                        <div class="quick-card" data-prompt="Explain quantum computing principles simply.">🌌 Quantum Systems</div>
                        <div class="quick-card" data-prompt="Draft a futuristic sci-fi narrative concept.">🚀 Creative Vision</div>
                    </div>
                </div>
            `;
            document.querySelectorAll('.quick-card').forEach(card => {
                card.addEventListener('click', () => {
                    const prompt = card.getAttribute('data-prompt');
                    const input = document.getElementById('composer-input');
                    if (prompt && input) {
                        input.value = prompt;
                        handleSendMessage();
                    }
                });
            });
        }
    }

    async function handleSendMessage() {
        const input = document.getElementById('composer-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';

        const welcome = document.getElementById('welcome-screen');
        if (welcome) welcome.remove();

        appendMessage(text, 'user');

        const container = document.getElementById('chat-container');
        const aiMsgId = 'ai_msg_' + Date.now();
        appendMessage('Thinking...', 'ai', aiMsgId);

        try {
            state.abortController = new AbortController();
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: text }],
                    mode: state.mode,
                    detail: state.detail,
                    memory: state.memory,
                    useSearch: state.useSearch
                }),
                signal: state.abortController.signal
            });

            const data = await res.json();
            updateAiMessage(aiMsgId, data.reply || 'Something went wrong.');
        } catch (err) {
            if (err.name === 'AbortError') {
                updateAiMessage(aiMsgId, 'Generation stopped.');
            } else {
                updateAiMessage(aiMsgId, 'Something went wrong. Please try again.');
            }
        }
    }

    function appendMessage(text, role, id = null) {
        const container = document.getElementById('chat-container');
        if (!container) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        if (id) msgDiv.id = id;

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'W';

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = text;

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    function updateAiMessage(id, text) {
        const msgDiv = document.getElementById(id);
        if (msgDiv) {
            const bubble = msgDiv.querySelector('.msg-bubble');
            if (bubble) bubble.textContent = text;
        }
        const container = document.getElementById('chat-container');
        if (container) container.scrollTop = container.scrollHeight;
    }

    async function handleFileUpload(file) {
        const welcome = document.getElementById('welcome-screen');
        if (welcome) welcome.remove();

        appendMessage(`Uploaded file: ${file.name}`, 'user');
        const aiMsgId = 'ai_file_' + Date.now();
        appendMessage('Processing document...', 'ai', aiMsgId);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('prompt', 'Summarize and analyze this document.');

        try {
            const res = await fetch('/api/file', { method: 'POST', body: formData });
            const data = await res.json();
            updateAiMessage(aiMsgId, data.reply || data.error);
        } catch (err) {
            updateAiMessage(aiMsgId, 'Failed to process file.');
        }
    }

    async function handleVisionUpload(file) {
        const welcome = document.getElementById('welcome-screen');
        if (welcome) welcome.remove();

        appendMessage(`Uploaded image: ${file.name}`, 'user');
        const aiMsgId = 'ai_vision_' + Date.now();
        appendMessage('Analyzing visual data...', 'ai', aiMsgId);

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', 'Analyze this image.');

        try {
            const res = await fetch('/api/vision', { method: 'POST', body: formData });
            const data = await res.json();
            updateAiMessage(aiMsgId, data.reply || data.error);
        } catch (err) {
            updateAiMessage(aiMsgId, 'Failed to analyze image.');
        }
    }

    function triggerCameraCapture() {
        navigator.mediaDevices?.getUserMedia({ video: true }).then(stream => {
            alert('Camera connected successfully. Capture feature active.');
            stream.getTracks().forEach(track => track.stop());
        }).catch(() => {
            alert('Camera permission denied or not supported.');
        });
    }

    function triggerVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech Recognition is not supported in this browser.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = state.lang === 'ar' ? 'ar-SA' : 'en-US';
        recognition.onstart = () => { console.log('Voice recording started...'); };
        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            const input = document.getElementById('composer-input');
            if (input) input.value = transcript;
        };
        recognition.onerror = () => { alert('Voice recognition error.'); };
        recognition.start();
    }

    initSplash();
    initTheme();
    initEventListeners();
    checkHealth();

    window.WEURA_BOOT.initialized = true;
} catch (error) {
    console.error('WEURA Initialization Error:', error);
}
