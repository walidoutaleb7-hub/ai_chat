import express from 'express';
import { askGrok, GrokMessage } from '../grok/grok';

const router = express.Router();

router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body as {
      messages?: GrokMessage[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'messages must be a non-empty array.',
      });
    }

    const safeMessages: GrokMessage[] = messages
      .filter(
        (message) =>
          message &&
          ['system', 'user', 'assistant'].includes(message.role) &&
          typeof message.content === 'string'
      )
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 30000),
      }));

    if (!safeMessages.length) {
      return res.status(400).json({
        success: false,
        error: 'No valid messages were provided.',
      });
    }

    const result = await askGrok(safeMessages);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[WEURA] Chat error:', error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unexpected server error occurred.',
    });
  }
});

export default router;