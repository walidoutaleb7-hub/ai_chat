/* ==========================================
   WEURA AI — Backend Application (app.js)
   ========================================== */

const express = require('express');
const { Groq } = require('groq-sdk');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend serving for local node server
app.use(express.static(__dirname));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'llama-3.2-11b-vision-preview';

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/config', (req, res) => {
    res.json({
        hasGroqKey: !!process.env.GROQ_API_KEY,
        chatModel: CHAT_MODEL,
        visionModel: VISION_MODEL
    });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, mode, detail, memory } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid messages payload' });
        }

        let systemPrompt = "You are WEURA AI, an advanced, elite AI assistant created by Walid Out (وليد). Motto: Think Beyond. Provide precise, professional, and well-structured responses.";
        
        if (mode === 'research') {
            systemPrompt += " Mode: Research. Provide rigorous academic and factual analysis.";
        } else if (mode === 'code') {
            systemPrompt += " Mode: Code. Provide clean, production-ready code blocks with full error handling.";
        } else if (mode === 'creative') {
            systemPrompt += " Mode: Creative. Think innovatively and offer imaginative concepts.";
        }

        if (detail === 'concise') systemPrompt += " Keep responses concise and direct.";
        if (detail === 'detailed') systemPrompt += " Provide thorough, comprehensive details.";

        if (memory && memory.length > 0) {
            systemPrompt += ` User Memory Context: ${JSON.stringify(memory)}`;
        }

        const formattedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const completion = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 4096
        });

        const responseText = completion.choices[0]?.message?.content || "No response generated.";
        res.json({ response: responseText, sources: [] });

    } catch (err) {
        console.error("Chat API Error:", err);
        res.status(500).json({ error: 'Internal server error during chat completion.' });
    }
});

// Search endpoint (Mock / Tavily integration framework)
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        // If Tavily API Key is provided, execute search
        if (process.env.TAVILY_API_KEY) {
            // Placeholder for Tavily fetch implementation
        }

        res.json({
            sources: [
                { title: query, domain: 'web-search', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }
            ]
        });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// Vision endpoint
app.post('/api/vision', upload.single('file'), async (req, res) => {
    try {
        const prompt = req.body.prompt || "Describe this image.";
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Image file is required' });
        }

        const base64Image = file.buffer.toString('base64');
        const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

        const completion = await groq.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ],
            temperature: 0.4,
            max_tokens: 2048
        });

        res.json({ response: completion.choices[0]?.message?.content || "Could not analyze image." });
    } catch (err) {
        console.error("Vision API Error:", err);
        res.status(500).json({ error: 'Vision analysis failed.' });
    }
});

// File endpoint
app.post('/api/file', upload.single('file'), async (req, res) => {
    try {
        const prompt = req.body.prompt || "Summarize this document.";
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'File is required' });

        const fileContent = file.buffer.toString('utf8');

        const completion = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                { role: 'system', content: 'You are WEURA AI document analyst.' },
                { role: 'user', content: `Prompt: ${prompt}\n\nDocument Content:\n${fileContent.substring(0, 15000)}` }
            ],
            temperature: 0.3,
            max_tokens: 2048
        });

        res.json({ response: completion.choices[0]?.message?.content || "Could not analyze document." });
    } catch (err) {
        console.error("File API Error:", err);
        res.status(500).json({ error: 'File analysis failed.' });
    }
});

module.exports = app;
