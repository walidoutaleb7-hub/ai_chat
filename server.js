const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROK_API_KEY = process.env.GROK_API_KEY;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// Chat Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, mode, detail } = req.body;
        if (!GROK_API_KEY) {
            return res.status(500).json({ error: 'GROK_API_KEY is not configured on the server.' });
        }

        let systemPrompt = "You are WEURA AI, created by Walid Out. Think Beyond. Professional, precise, advanced AI.";
        if (mode === 'code') systemPrompt += " Focus heavily on clean, well-commented code blocks.";
        if (mode === 'research') systemPrompt += " Provide deep, analytical, and structured research insights.";
        if (mode === 'creative') systemPrompt += " Emphasize creative expression and out-of-the-box thinking.";
        
        const fullMessages = [
            { role: "system", content: systemPrompt },
            ...messages
        ];

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-beta",
                messages: fullMessages,
                stream: false,
                temperature: detail === 'detailed' ? 0.7 : 0.3
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Grok API error');
        }

        res.json({ reply: data.choices[0].message.content });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// Vision & File Analysis Endpoint
app.post('/api/vision', upload.single('file'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const file = req.file;

        if (!GROK_API_KEY) {
            return res.status(500).json({ error: 'GROK_API_KEY is not configured.' });
        }

        let fileContentText = "";
        let base64Image = "";

        if (file) {
            if (file.mimetype.startsWith('image/')) {
                base64Image = `data:${file.mimetype};base64,${file.file.toString('base64')}`;
            } else {
                fileContentText = file.buffer.toString('utf8');
            }
        }

        const userMessageContent = [];
        if (prompt) userMessageContent.push({ type: "text", text: prompt });
        if (fileContentText) userMessageContent.push({ type: "text", text: `File Content:\n${fileContentText}` });
        if (base64Image) {
            userMessageContent.push({
                type: "image_url",
                image_url: { url: base64Image }
            });
        }

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-beta",
                messages: [
                    { role: "system", content: "You are WEURA AI, analyzing files and images with precision." },
                    { role: "user", content: userMessageContent }
                ]
            })
        });

        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (err) {
        console.error('Vision/File error:', err);
        res.status(500).json({ error: 'Failed to process file or image.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`WEURA AI server running on port ${PORT}`);
});
