export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY missing — add it in Vercel Settings → Environment Variables'
    });
  }

  // ── اختبار الـ Key أولاً ──
  const keyPrefix = GEMINI_KEY.substring(0, 10) + '...';

  const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  let successRes = null;
  let triedModels = [];
  let lastError = '';

  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
          })
        }
      );

      if (r.ok) {
        successRes = r;
        break;
      }

      const errBody = await r.json().catch(() => ({}));
      lastError = errBody?.error?.message || `HTTP ${r.status}`;
      triedModels.push({ model, error: lastError });

    } catch (e) {
      lastError = e.message;
      triedModels.push({ model, error: lastError });
    }
  }

  if (!successRes) {
    return res.status(502).json({
      error: 'Gemini API error: ' + lastError,
      keyPrefix,
      triedModels
    });
  }

  const data = await successRes.json();
  let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

  if (!html.toLowerCase().startsWith('<!doctype')) {
    html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>صفحة الهبوط</title></head><body>${html}</body></html>`;
  }

  return res.status(200).json({ html });
}

