import express from 'express';

const router = express.Router();

// Piston API — free, no API key required
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const MAX_CODE_LENGTH = 20_000;
const TIMEOUT_MS = 15_000;

// Language → Piston runtime mapping
const LANG_MAP: Record<string, { language: string; version: string; filename: string }> = {
  python: { language: 'python', version: '3.10.0', filename: 'main.py' },
  py: { language: 'python', version: '3.10.0', filename: 'main.py' },
  javascript: { language: 'javascript', version: '18.15.0', filename: 'main.js' },
  js: { language: 'javascript', version: '18.15.0', filename: 'main.js' },
  typescript: { language: 'typescript', version: '5.0.3', filename: 'main.ts' },
  ts: { language: 'typescript', version: '5.0.3', filename: 'main.ts' },
  dart: { language: 'dart', version: '3.1.0', filename: 'main.dart' },
  java: { language: 'java', version: '15.0.2', filename: 'Main.java' },
  c: { language: 'c', version: '10.2.0', filename: 'main.c' },
  cpp: { language: 'c++', version: '10.2.0', filename: 'main.cpp' },
  'c++': { language: 'c++', version: '10.2.0', filename: 'main.cpp' },
  cs: { language: 'csharp', version: '6.12.0', filename: 'Main.cs' },
  csharp: { language: 'csharp', version: '6.12.0', filename: 'Main.cs' },
  go: { language: 'go', version: '1.16.2', filename: 'main.go' },
  rust: { language: 'rust', version: '1.68.2', filename: 'main.rs' },
  rb: { language: 'ruby', version: '3.0.1', filename: 'main.rb' },
  ruby: { language: 'ruby', version: '3.0.1', filename: 'main.rb' },
  php: { language: 'php', version: '8.2.3', filename: 'main.php' },
  bash: { language: 'bash', version: '5.2.0', filename: 'main.sh' },
  sh: { language: 'bash', version: '5.2.0', filename: 'main.sh' },
  sql: { language: 'sqlite3', version: '3.36.0', filename: 'main.sql' },
};

type RunBody = {
  code?: unknown;
  language?: unknown;
  stdin?: unknown;
};

router.post('/code/run', async (req, res) => {
  try {
    const body = req.body as RunBody;

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const rawLang =
      typeof body.language === 'string'
        ? body.language.trim().toLowerCase()
        : '';
    const stdin = typeof body.stdin === 'string' ? body.stdin : '';

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required.',
      });
    }

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(413).json({
        success: false,
        error: `Code is too long (max ${MAX_CODE_LENGTH} chars).`,
      });
    }

    const runtime = LANG_MAP[rawLang];
    if (!runtime) {
      return res.status(400).json({
        success: false,
        error: `Language "${rawLang}" is not supported.`,
        supported: Object.keys(LANG_MAP),
      });
    }

    const start = Date.now();

    const response = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: runtime.filename, content: code }],
        stdin,
        run_timeout: TIMEOUT_MS,
        compile_timeout: TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS + 10_000),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(
        `[WEURA] Piston error ${response.status}: ${errText.slice(0, 300)}`,
      );
      return res.status(502).json({
        success: false,
        error: `Code runner unavailable (HTTP ${response.status}).`,
      });
    }

    const data: any = await response.json();

    const compile = data?.compile ?? {};
    const run = data?.run ?? {};

    return res.json({
      success: true,
      language: rawLang,
      durationMs,
      compile: {
        stdout: String(compile.stdout ?? ''),
        stderr: String(compile.stderr ?? ''),
        code: Number(compile.code ?? 0),
      },
      run: {
        stdout: String(run.stdout ?? ''),
        stderr: String(run.stderr ?? ''),
        code: Number(run.code ?? 0),
        signal: run.signal ?? null,
        output: String(run.output ?? ''),
      },
    });
  } catch (error) {
    console.error('[WEURA] /code/run error:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Code execution failed.',
    });
  }
});

export default router;
