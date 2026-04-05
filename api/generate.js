export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── قراءة الـ body ──
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'prompt is required and must be a non-empty string' });
  }

  // ── الـ Key ──
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured',
      fix: 'Go to Vercel → Settings → Environment Variables → Add GEMINI_API_KEY'
    });
  }

  // ── قائمة الموديلات بالأولوية ──
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  let successRes  = null;
  let lastError   = '';
  let usedModel   = '';
  const triedModels = [];

  for (const model of MODELS) {
    try {
      const r = await fetch(
        `${BASE_URL}/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt.trim() }] }],
            generationConfig: {
              temperature:     0.7,
              maxOutputTokens: 8192,
              topK:            40,
              topP:            0.95,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          })
        }
      );

      if (r.ok) {
        successRes = r;
        usedModel  = model;
        console.log(`[generate] ✅ model=${model}`);
        break;
      }

      const errBody = await r.json().catch(() => ({}));
      lastError = errBody?.error?.message || `HTTP ${r.status}`;
      triedModels.push({ model, status: r.status, error: lastError });
      console.warn(`[generate] ❌ model=${model} → ${lastError}`);

    } catch (fetchErr) {
      lastError = fetchErr.message;
      triedModels.push({ model, error: lastError });
      console.warn(`[generate] ❌ model=${model} fetch error → ${lastError}`);
    }
  }

  // ── كل الموديلات فشلت ──
  if (!successRes) {
    return res.status(502).json({
      error: `Gemini API error: ${lastError}`,
      keyPrefix:    GEMINI_KEY.substring(0, 10) + '...',
      triedModels,
      hint: 'Check your GEMINI_API_KEY at aistudio.google.com/app/apikey'
    });
  }

  // ── معالجة الرد ──
  try {
    const data = await successRes.json();

    // فحص إذا Gemini أعاد محتوى
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) {
      return res.status(502).json({
        error: 'Gemini returned empty response',
        model: usedModel,
        finishReason: data.candidates?.[0]?.finishReason || 'unknown'
      });
    }

    // تنظيف الـ markdown
    let html = rawText
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // التأكد من DOCTYPE
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>صفحة الهبوط</title>
</head>
<body>
${html}
</body>
</html>`;
    }

    return res.status(200).json({
      html,
      model: usedModel
    });

  } catch (parseErr) {
    console.error('[generate] parse error:', parseErr);
    return res.status(500).json({
      error: 'Failed to parse Gemini response: ' + parseErr.message
    });
  }
}
