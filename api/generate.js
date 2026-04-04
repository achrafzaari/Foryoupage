export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  
  // ── DEBUG: تشخيص المشكلة ──
  if (!GEMINI_KEY) {
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY is missing from environment variables',
      hint: 'Go to Vercel → Settings → Environment Variables → Add GEMINI_API_KEY'
    });
  }

  // اختبار الـ key أولاً بطلب بسيط
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  let successRes = null;
  let triedModels = [];
  let lastError = '';

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          }
        })
      });

      if (r.ok) {
        successRes = r;
        console.log(`[generate] ✅ model ${model} worked`);
        break;
      }

      const errBody = await r.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || `HTTP ${r.status}`;
      triedModels.push({ model, status: r.status, error: errMsg });
      lastError = errMsg;
      console.warn(`[generate] ❌ model ${model}: ${errMsg}`);

    } catch (fetchErr) {
      triedModels.push({ model, error: fetchErr.message });
      lastError = fetchErr.message;
    }
  }

  if (!successRes) {
    return res.status(502).json({ 
      error: 'All Gemini models failed',
      lastError,
      triedModels,
      keyPrefix: GEMINI_KEY.substring(0, 8) + '...' // أول 8 أحرف للتشخيص
    });
  }

  try {
    const data = await successRes.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة الهبوط</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
    }

    return res.status(200).json({ html });

  } catch (err) {
    return res.status(500).json({ error: 'Parse error: ' + err.message });
  }
}
