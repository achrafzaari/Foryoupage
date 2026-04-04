export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // ── قائمة موديلات — يجرب واحداً تلو الآخر ──
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
  ];

  let successRes = null;
  let lastError  = 'unknown error';

  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      if (r.ok) {
        successRes = r;
        break;
      }

      const errBody = await r.json().catch(() => ({}));
      lastError = errBody?.error?.message || `HTTP ${r.status}`;
      console.warn(`[generate] model ${model} failed: ${lastError}`);

    } catch (fetchErr) {
      lastError = fetchErr.message;
      console.warn(`[generate] model ${model} fetch error: ${lastError}`);
    }
  }

  if (!successRes) {
    return res.status(502).json({ error: 'Gemini API error: ' + lastError });
  }

  try {
    const data = await successRes.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // تنظيف markdown code fences
    html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

    // التأكد من وجود DOCTYPE
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة الهبوط</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
    }

    return res.status(200).json({ html });

  } catch (err) {
    console.error('[generate] parse error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
