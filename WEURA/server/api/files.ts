import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';
import {
  createRequestId,
  sanitizeMemory,
} from '../security/security';

const router = express.Router();

const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_TEXT_LENGTH = 20000;
const MAX_QUESTION_LENGTH = 2000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  'pdf',
  'docx',
  'xlsx',
  'csv',
  'txt',
]);

type FileAnalyzeBody = {
  fileName?: unknown;
  fileType?: unknown;
  fileSize?: unknown;
  text?: unknown;
  question?: unknown;
  memory?: unknown;
};

function sanitizeString(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeQuestion(raw: unknown): string {
  const q = sanitizeString(raw, MAX_QUESTION_LENGTH);
  return q || 'حلل هذا الملف بالتفصيل.';
}

function buildIdentityBlock(): string {
  return (
    `You are WEURA — an AI assistant created and developed by Walid Out (وليد أوت).\n` +
    `Tagline: Think Beyond.\n\n` +
    `=== IDENTITY RULES (NON-NEGOTIABLE) ===\n` +
    `- Your name is WEURA.\n` +
    `- Your creator is Walid Out.\n` +
    `- NEVER say you were made, designed, trained, or developed by Meta, OpenAI, Google, Anthropic, DeepMind, Microsoft, xAI, or ANY other company.\n` +
    `- If asked who made you → "I am WEURA, created by Walid Out." (Arabic: "أنا WEURA، صنعني وليد أوت.")`
  );
}

function buildMemoryBlock(memory: string): string {
  if (!memory) return '';
  return (
    `=== USER MEMORY ===\n` +
    `${memory}\n\n` +
    `Use this memory only when relevant to the file analysis.`
  );
}

function buildTimeContext(): string {
  const now = new Date();
  return (
    `Current date (server): ${now.toISOString().split('T')[0]}.`
  );
}

function buildFileSystemPrompt(): string {
  return (
    `=== FILE ANALYSIS MODE ===\n\n` +
    `You are given the extracted text of a user-uploaded document. ` +
    `Your job is to analyze it accurately.\n\n` +
    `RULES:\n` +
    `1. Base every answer ONLY on the document content below.\n` +
    `2. NEVER invent content that is not in the document.\n` +
    `3. If the document does not contain the answer, say so clearly:\n` +
    `   - Arabic: "هذه المعلومة غير موجودة في الملف."\n` +
    `   - English: "This information is not in the file."\n` +
    `4. Quote directly from the document when useful.\n` +
    `5. Do NOT use web search. The document is the only source of truth.\n` +
    `6. MATCH the user's language in your reply.\n` +
    `7. Structure your answer with Markdown when helpful.\n` +
    `8. START WITH THE ANSWER directly.\n`
  );
}

function buildFileMetadataBlock(
  fileName: string,
  fileType: string,
  fileSize: number,
  textLength: number,
): string {
  const sizeLabel =
    fileSize < 1024
      ? `${fileSize} B`
      : fileSize < 1024 * 1024
        ? `${(fileSize / 1024).toFixed(1)} KB`
        : `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;

  return (
    `=== DOCUMENT METADATA ===\n` +
    `- File name: ${fileName}\n` +
    `- File type: ${fileType.toUpperCase()}\n` +
    `- File size: ${sizeLabel}\n` +
    `- Extracted text length: ${textLength} characters\n`
  );
}

function buildMessages(
  fileName: string,
  fileType: string,
  fileSize: number,
  text: string,
  question: string,
  memory: string,
): GrokMessage[] {
  const messages: GrokMessage[] = [];

  messages.push({
    role: 'system',
    content: buildIdentityBlock(),
  });

  if (memory) {
    messages.push({
      role: 'system',
      content: buildMemoryBlock(memory),
    });
  }

  messages.push({
    role: 'system',
    content: buildTimeContext(),
  });

  messages.push({
    role: 'system',
    content: buildFileSystemPrompt(),
  });

  messages.push({
    role: 'system',
    content: buildFileMetadataBlock(
      fileName,
      fileType,
      fileSize,
      text.length,
    ),
  });

  messages.push({
    role: 'system',
    content:
      `=== DOCUMENT CONTENT (extracted) ===\n\n${text}\n\n` +
      `=== END OF DOCUMENT ===`,
  });

  messages.push({
    role: 'user',
    content: question,
  });

  return messages;
}

router.post('/files/analyze', async (req, res) => {
  const requestId = createRequestId();
  res.setHeader('X-WEURA-Request-ID', requestId);

  try {
    const body = req.body as FileAnalyzeBody;

    const fileName = sanitizeString(body.fileName, MAX_FILE_NAME_LENGTH);
    const fileTypeRaw = sanitizeString(body.fileType, 16).toLowerCase();
    const text = sanitizeString(body.text, MAX_FILE_TEXT_LENGTH);
    const question = sanitizeQuestion(body.question);
    const memory = sanitizeMemory(body.memory);

    if (!ALLOWED_FILE_TYPES.has(fileTypeRaw)) {
      return res.status(400).json({
        success: false,
        error:
          'Unsupported file type. Allowed: PDF, DOCX, XLSX, CSV, TXT.',
        requestId,
      });
    }

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'fileName is required.',
        requestId,
      });
    }

    if (!text) {
      return res.status(400).json({
        success: false,
        error:
          'No readable text was found in the file. It may be empty or scanned.',
        requestId,
      });
    }

    const fileSize = typeof body.fileSize === 'number'
      ? body.fileSize
      : Number(body.fileSize) || 0;

    if (fileSize < 0 || fileSize > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        error: 'File is too large. Maximum is 10 MB.',
        requestId,
      });
    }

    const messages = buildMessages(
      fileName,
      fileTypeRaw,
      fileSize,
      text,
      question,
      memory,
    );

    const result = await askGrok(messages, {
      requestId,
      temperature: 0.3,
      maxTokens: 3000,
    });

    return res.json({
      success: true,
      content: result.content,
      model: result.model,
      provider: result.provider,
      requestId,
      file: {
        name: fileName,
        type: fileTypeRaw,
        size: fileSize,
        textLength: text.length,
      },
    });
  } catch (error) {
    console.error(`[WEURA][${requestId}] Files error:`, error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'File analysis failed.',
      requestId,
    });
  }
});

export default router;