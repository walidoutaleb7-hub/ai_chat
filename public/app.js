document.addEventListener('DOMContentLoaded', () => {
    // Hide splash screen after load
    setTimeout(() => {
        document.getElementById('splash-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
    }, 1500);

    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages-container');
    const welcomeBanner = document.getElementById('welcome-banner');
    const modeSelector = document.getElementById('mode-selector');
    
    const fileBtn = document.getElementById('file-btn');
    const fileInput = document.getElementById('file-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const cameraBtn = document.getElementById('camera-btn');
    const micBtn = document.getElementById('mic-btn');

    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const langSelect = document.getElementById('lang-select');
    const detailSelect = document.getElementById('detail-select');
    const clearDataBtn = document.getElementById('clear-data-btn');

    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatHistoryList = document.getElementById('chat-history-list');

    let currentFile = null;
    let chats = JSON.parse(localStorage.getItem('weura_chats') || '[]');
    let currentChatId = null;

    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Sidebar toggles
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    if (sidebarClose) sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));

    // Settings Modal
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    settingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));

    // Language & Direction Change
    langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        localStorage.setItem('weura_lang', lang);
    });

    // File Picker Trigger
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            currentFile = e.target.files[0];
            attachmentPreview.textContent = `Attached: ${currentFile.name}`;
            attachmentPreview.classList.remove('hidden');
        }
    });

    // Camera Trigger
    cameraBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();
            
            // Simple capture modal logic or direct capture simulation for robust deployment
            alert('Camera accessed successfully. Ready for capture integration.');
            stream.getTracks().forEach(track => track.stop());
        } catch (err) {
            alert('Camera permission denied or unavailable.');
        }
    });

    // Microphone Speech-to-Text
    micBtn.addEventListener('click', () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech Recognition is not supported in this browser.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = langSelect.value === 'ar' ? 'ar-SA' : 'en-US';
        recognition.start();

        recognition.onresult = (event) => {
            userInput.value = event.results[0][0].transcript;
        };
        recognition.onerror = () => {
            alert('Microphone error occurred.');
        };
    });

    // Clear Data
    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all local history?')) {
            localStorage.clear();
            chats = [];
            renderHistory();
            messagesContainer.innerHTML = '';
            welcomeBanner.classList.remove('hidden');
            settingsModal.classList.add('hidden');
        }
    });

    // Send Message Handler
    async function handleSendMessage() {
        const text = userInput.value.trim();
        if (!text && !currentFile) return;

        if (welcomeBanner) welcomeBanner.classList.add('hidden');

        // Append User Message
        appendMessage(text || `[Attached File: ${currentFile.name}]`, 'user');
        const userQuery = text;
        userInput.value = '';
        userInput.style.height = 'auto';

        const formData = new FormData();
        formData.append('prompt', userQuery);
        formData.append('mode', modeSelector.value);
        formData.append('detail', detailSelect.value);
        if (currentFile) {
            formData.append('file', currentFile);
            currentFile = null;
            attachmentPreview.classList.add('hidden');
        }

        // Add loading indicator
        const loadingId = appendMessage('Thinking...', 'assistant loading');

        try {
            let response;
            if (formData.has('file')) {
                response = await fetch('/api/vision', {
                    method: 'POST',
                    body: formData
                });
            } else {
                response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: userQuery }],
                        mode: modeSelector.value,
                        detail: detailSelect.value
                    })
                });
            }

            const data = await response.json();
            removeMessage(loadingId);

            if (data.error) {
                appendMessage(`Error: ${data.error}`, 'assistant');
            } else {
                appendMessage(data.reply, 'assistant');
                saveChatHistory(userQuery, data.reply);
            }
        } catch (err) {
            removeMessage(loadingId);
            appendMessage('Something went wrong. Please check your connection.', 'assistant');
        }
    }

    sendBtn.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        const msgId = 'msg-' + Date.now() + Math.random();
        msgDiv.id = msgId;
        msgDiv.className = `message ${sender}`;
        msgDiv.textContent = text;
        messagesContainer.appendChild(msgDiv);
        chatViewport.scrollTop = chatViewport.scrollHeight;
        return msgId;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function saveChatHistory(q, a) {
        chats.unshift({ id: Date.now(), title: q, q, a });
        localStorage.setItem('weura_chats', JSON.stringify(chats));
        renderHistory();
    }

    function renderHistory() {
        chatHistoryList.innerHTML = '';
        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.textContent = chat.title;
            div.addEventListener('click', () => {
                messagesContainer.innerHTML = '';
                welcomeBanner.classList.add('hidden');
                appendMessage(chat.q, 'user');
                appendMessage(chat.a, 'assistant');
            });
            chatHistoryList.appendChild(div);
        });
    }

    newChatBtn.addEventListener('click', () => {
        messagesContainer.innerHTML = '';
        welcomeBanner.classList.remove('hidden');
    });

    renderHistory();
});
