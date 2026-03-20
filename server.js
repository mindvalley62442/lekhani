// ─────────────────────────────────────────────────────────
//  Lekhani · server.js
//  Uses official @mistralai/mistralai SDK for OCR
//  (avoids node-fetch connection issues on Windows)
// ─────────────────────────────────────────────────────────

require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const path     = require('path');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const { Mistral } = require('@mistralai/mistralai');
const { buildKathakDoc } = require('./docx-generator');

const app  = express();
const PORT = process.env.PORT || 3000;

// Environment
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      scriptSrc: ["'self'"],
    },
  },
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limit to API routes
app.use('/api/', apiLimiter);

// ── Middleware ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer — keep PDF in memory (max 50 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are accepted'));
      return;
    }
    // Check file signature (magic bytes) - PDF files start with "%PDF"
    const buffer = file.buffer;
    if (buffer && buffer.length >= 5) {
      const signature = buffer.slice(0, 5).toString('ascii');
      if (!signature.startsWith('%PDF')) {
        cb(new Error('Invalid PDF file'));
        return;
      }
    }
    cb(null, true);
  }
});

// ── Helper: assert env key exists ───────────────────────
function requireEnv(key, res) {
  const val = process.env[key];
  if (!val) {
    res.status(500).json({ error: `${key} is not configured in .env` });
    return null;
  }
  return val;
}

// ── Helper: fetch with timeout ─────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────
//  POST /api/ocr
//  Accepts: multipart/form-data  { pdf: <file> }
//  Returns: { text: string }
// ────────────────────────────────────────────────────────
app.post('/api/ocr', upload.single('pdf'), async (req, res) => {
  const MISTRAL_KEY = requireEnv('MISTRAL_API_KEY', res);
  if (!MISTRAL_KEY) return;

  if (!req.file) return res.status(400).json({ error: 'No PDF file received' });

  try {
    const client = new Mistral({ apiKey: MISTRAL_KEY });

    // Convert buffer to base64 data URL — official SDK method
    const base64PDF = req.file.buffer.toString('base64');

    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type:        'document_url',
        documentUrl: `data:application/pdf;base64,${base64PDF}`
      }
    });

    // Extract text from pages
    let text = '';
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      text = ocrResponse.pages
        .map((page, i) => {
          const header  = `── Page ${page.index ?? i + 1} ──`;
          const content = page.markdown || page.text || '';
          return header + '\n\n' + content;
        })
        .join('\n\n' + '═'.repeat(48) + '\n\n');
    } else {
      text = JSON.stringify(ocrResponse, null, 2);
    }

    res.json({ text });

  } catch (err) {
    console.error('[OCR Error]', err.message);
    // Sanitize error message for production
    const errorMsg = isProduction ? 'OCR processing failed' : err.message;
    res.status(500).json({ error: errorMsg });
  }
});

// ────────────────────────────────────────────────────────
//  POST /api/summarise
//  Body: { text: string, prompt: string }
//  Returns: { summary: string }
// ────────────────────────────────────────────────────────
app.post('/api/summarise', async (req, res) => {
  const GEMINI_KEY = requireEnv('GEMINI_API_KEY', res);
  if (!GEMINI_KEY) return;

  const { text, prompt } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  // Use frontend's prompt if provided, otherwise fall back to server's default
  const systemPrompt = prompt?.trim() ||
    `
You are a scholarly Hindi-to-Gujarati explainer. You will receive OCR-extracted Hindi text from a book or chapter.

Your task:
1. Read the full text carefully and identify the logical sections the author has naturally divided the content into (based on topic shifts, headings, or narrative flow).
2. For each section, output the following format EXACTLY — no deviations:

---

## વિભાગ [number]: [Section title in Gujarati]

**મૂળ વિષય:** [One line describing what this section is about, in Gujarati]

**સમજૂતી:**
[Detailed explanation in Gujarati of what the author is conveying in this section — written as if a knowledgeable teacher is explaining the meaning and intent to a student. Minimum 3-4 sentences.]

---

3. After all sections, add a final block:

## સારાંશ
[A concise overall summary of the entire chapter in Gujarati — 4 to 6 sentences capturing the author's central message.]

Rules you must follow strictly:
- Never skip the format above. Every section must have all three parts: વિભાગ heading, મૂળ વિષય, and સમજૂતી.
- Explanation must reflect the author's intended meaning — not a literal word-for-word translation.
- Language must be formal, clear Gujarati — no mixing of Hindi or English words unless it is a technical term with no Gujarati equivalent.
- Do not add your own opinions or information beyond what the author has written.
- Section count should match the author's natural divisions — do not over-fragment or merge unrelated content.
`;

  try {
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetchWithTimeout(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role:  'user',
          parts: [{ text: systemPrompt + '\n\n---\n\nTEXT TO PROCESS:\n\n' + text }]
        }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 65536 }
      })
    }, 90000); // 90 second timeout for Gemini

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini failed (${geminiRes.status})`);
    }

    const data    = await geminiRes.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) throw new Error('No response from Gemini');

    res.json({ summary });

  } catch (err) {
    console.error('[Gemini Error]', err.message);
    // Sanitize error message for production
    const errorMsg = isProduction ? 'Summarisation failed' : err.message;
    res.status(500).json({ error: errorMsg });
  }
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ Lekhani is running → http://localhost:${PORT}\n`);
});

// ────────────────────────────────────────────────────────
//  POST /api/download
//  Body: { text: string, title?: string }
//  Returns: .docx file stream
// ────────────────────────────────────────────────────────
app.post('/api/download', async (req, res) => {
  const { text, title } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    const buffer = await buildKathakDoc(text, title || 'અધ્યાય');
    const filename = `lekhani-${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error('[DOCX Error]', err.message);
    // Sanitize error message for production
    const errorMsg = isProduction ? 'Document generation failed' : err.message;
    res.status(500).json({ error: errorMsg });
  }
});
