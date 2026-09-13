const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { Groq } = require('groq-sdk');

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const groqApiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: groqApiKey || 'dummy-key' });

const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'connected', timestamp: new Date().toISOString() });
});

// Config
app.get('/api/config', (req, res) => {
    res.json({
        defaultModel: CHAT_MODEL,
        visionModel: VISION_MODEL,
        searchEnabled: !!process.env.TAVILY_API_KEY
    });
});

// Helper for Tavily Search
async function performTavilySearch(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, query, max_results: 3 })
        });
        const data = await response.json();
        return (data.results || []).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
            domain: new URL(r.url).hostname
        }));
    } catch (err) {
        console.error('Search error:', err);
        return [];
    }
}

// POST /api/chat
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, mode, detail, memory, useSearch } = req.body;
        let systemPrompt = "You are WEURA AI, a futuristic, advanced, intelligent, professional, and elegant AI assistant. Think Beyond.";
        
        if (detail === 'concise') systemPrompt += " Keep your answers concise and direct.";
        else if (detail === 'detailed') systemPrompt += " Provide thorough, comprehensive, and deeply structured technical analysis.";

        let formattedMessages = [{ role: 'system', content: systemPrompt }];
        
        if (memory && Array.isArray(memory) && memory.length > 0) {
            formattedMessages.push({ role: 'system', content: `User Smart Memory Context: ${JSON.stringify(memory)}` });
        }

        let searchResults = [];
        if (useSearch && messages && messages.length > 0) {
            const lastMsg = messages[messages.length - 1].content;
            searchResults = await performTavilySearch(lastMsg);
            if (searchResults.length > 0) {
                formattedMessages.push({
                    role: 'system',
                    content: `Web Search Results:\n` + searchResults.map(s => `- [${s.title}](${s.url}): ${s.snippet}`).join('\n')
                });
            }
        }

        if (messages && Array.isArray(messages)) {
            messages.forEach(m => {
                formattedMessages.push({ role: m.role || 'user', content: m.content });
            });
        }

        const completion = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages: formattedMessages,
            temperature: mode === 'creative' ? 0.8 : 0.5,
            max_tokens: 2048
        });

        const reply = completion.choices[0]?.message?.content || "No response generated.";
        res.json({ reply, sources: searchResults });
    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/vision
app.post('/api/vision', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const prompt = req.body.prompt || 'Analyze this image in detail.';

        const completion = await groq.chat.completions.create({
            model: VISION_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }
            ],
            max_tokens: 1024
        });

        res.json({ reply: completion.choices[0]?.message?.content || 'Could not analyze image.' });
    } catch (error) {
        console.error('Vision API Error:', error);
        res.status(500).json({ error: 'Vision processing failed.' });
    }
});

// POST /api/file
app.post('/api/file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        const buffer = req.file.buffer;
        const filename = req.file.originalname.toLowerCase();
        let extractedText = '';

        if (filename.endsWith('.pdf')) {
            const parsed = await pdfParse(buffer);
            extractedText = parsed.text;
        } else if (filename.endsWith('.docx')) {
            const parsed = await mammoth.extractRawText({ buffer });
            extractedText = parsed.value;
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            extractedText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        } else if (filename.endsWith('.txt')) {
            extractedText = buffer.toString('utf8');
        } else {
            return res.status(400).json({ error: 'Unsupported file format.' });
        }

        const completion = await groq.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                { role: 'system', content: 'You are WEURA AI. Analyze the following extracted file content and summarize or answer the user prompt.' },
                { role: 'user', content: `File Content:\n${extractedText.substring(0, 15000)}\n\nPrompt: ${req.body.prompt || 'Summarize this document.'}` }
            ],
            max_tokens: 1500
        });

        res.json({ reply: completion.choices[0]?.message?.content || 'File processed successfully.' });
    } catch (error) {
        console.error('File API Error:', error);
        res.status(500).json({ error: 'Failed to process file.' });
    }
});

// POST /api/search
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required.' });
        const results = await performTavilySearch(query);
        res.json({ results });
    } catch (error) {
        console.error('Search API Error:', error);
        res.status(500).json({ error: 'Search failed.' });
    }
});

// POST /api/memory
app.post('/api/memory', (req, res) => {
    res.json({ status: 'ok', message: 'Memory received successfully.' });
});

module.exports = app;
