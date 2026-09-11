'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.WEURA_MODEL || 'gpt-5.6-luna';

const ROOT = __dirname;

const SYSTEM_PROMPT = `
You are WEURA AI, a helpful, intelligent and friendly AI assistant.

Rules:
- Answer in the same language as the user.
- Support Arabic, Algerian Darija, French and English.
- Be accurate and do not invent facts.
- Explain clearly when the user needs detail.
- When writing code, provide clean and complete code.
- Treat previous messages as conversation context.
`;

function sendJSON(res, status, data) {
    const body = JSON.stringify(data);

    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });

    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;

        req.setEncoding('utf8');

        req.on('data', chunk => {
            size += Buffer.byteLength(chunk);

            if (size > 2_000_000) {
                reject(new Error('Request too large'));
                req.destroy();
                return;
            }

            body += chunk;
        });

        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function cleanMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter(item =>
            item &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string'
        )
        .slice(-40)
        .map(item => ({
            role: item.role,
            content: item.content.slice(0, 20000)
        }));
}

function extractReply(data) {

    if (
        typeof data.output_text === 'string' &&
        data.output_text.trim()
    ) {
        return data.output_text.trim();
    }

    let result = [];

    if (Array.isArray(data.output)) {

        for (const item of data.output) {

            if (
                item &&
                item.type === 'message' &&
                Array.isArray(item.content)
            ) {

                for (const part of item.content) {

                    if (
                        part &&
                        part.type === 'output_text' &&
                        typeof part.text === 'string'
                    ) {
                        result.push(part.text);
                    }

                }
            }
        }
    }

    return result.join('\n').trim();
}

async function chat(req, res) {

    if (!API_KEY) {

        return sendJSON(res, 500, {
            error: 'OPENAI_API_KEY is missing.',
            code: 'MISSING_API_KEY'
        });
    }

    let body;

    try {
        body = await readBody(req);
    } catch (error) {

        return sendJSON(res, 413, {
            error: 'Request body is too large.'
        });
    }

    let data;

    try {
        data = JSON.parse(body);
    } catch (error) {

        return sendJSON(res, 400, {
            error: 'Invalid JSON.'
        });
    }

    const messages = cleanMessages(
        data.messages || data.history
    );

    const message =
        typeof data.message === 'string'
            ? data.message.trim()
            : '';

    if (!messages.length && !message) {

        return sendJSON(res, 400, {
            error: 'Message is required.'
        });
    }

    const input = messages.length
        ? messages
        : [
            {
                role: 'user',
                content: message
            }
        ];

    try {

        const response = await fetch(
            'https://api.openai.com/v1/responses',
            {
                method: 'POST',

                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({

                    model: MODEL,

                    instructions: SYSTEM_PROMPT,

                    input: input,

                    max_output_tokens: 3000
                })
            }
        );

        const raw = await response.text();

        let result;

        try {
            result = JSON.parse(raw);
        } catch {
            result = {
                error: {
                    message: raw
                }
            };
        }

        if (!response.ok) {

            console.error(
                'OpenAI API ERROR:',
                response.status,
                result
            );

            return sendJSON(
                res,
                response.status >= 500
                    ? 502
                    : response.status,
                {
                    error:
                        result?.error?.message ||
                        'OpenAI returned an error.',

                    code:
                        result?.error?.code ||
                        'OPENAI_ERROR'
                }
            );
        }

        const reply = extractReply(result);

        if (!reply) {

            return sendJSON(res, 502, {
                error: 'The AI returned an empty response.'
            });
        }

        return sendJSON(res, 200, {

            success: true,

            reply: reply,

            model: MODEL,

            responseId: result.id || null
        });

    } catch (error) {

        console.error(
            'SERVER ERROR:',
            error
        );

        return sendJSON(res, 502, {
            error:
                'Could not connect to OpenAI.',
            details:
                error.message
        });
    }
}

function serveIndex(res) {

    const file = path.join(
        ROOT,
        'index.html'
    );

    fs.readFile(
        file,
        (error, data) => {

            if (error) {

                return sendJSON(res, 500, {
                    error:
                        'index.html not found.'
                });
            }

            res.writeHead(200, {
                'Content-Type':
                    'text/html; charset=utf-8',

                'Cache-Control':
                    'no-cache'
            });

            res.end(data);
        }
    );
}

const server = http.createServer(
    async (req, res) => {

        try {

            if (
                req.method === 'GET' &&
                req.url === '/api/health'
            ) {

                return sendJSON(res, 200, {
                    ok: true,
                    service: 'WEURA AI',
                    model: MODEL
                });
            }

            if (
                req.method === 'POST' &&
                req.url === '/api/chat'
            ) {

                return await chat(
                    req,
                    res
                );
            }

            if (
                req.method === 'GET' &&
                (
                    req.url === '/' ||
                    req.url === '/index.html'
                )
            ) {

                return serveIndex(res);
            }

            res.writeHead(404, {
                'Content-Type':
                    'application/json; charset=utf-8'
            });

            res.end(
                JSON.stringify({
                    error: 'Not found'
                })
            );

        } catch (error) {

            console.error(error);

            sendJSON(res, 500, {
                error:
                    'Internal server error.'
            });
        }
    }
);

server.listen(
    PORT,
    HOST,
    () => {

        console.log('');
        console.log('==============================');
        console.log('       WEURA AI SERVER');
        console.log('==============================');
        console.log('');
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log(
            `Model: ${MODEL}`
        );
        console.log(
            `API Key: ${API_KEY ? 'LOADED ✓' : 'MISSING ✗'}`
        );
        console.log('');
    }
);