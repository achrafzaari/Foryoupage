export default async function handler(req, res) {
  // سجل بداية الطلب (سيظهر في logs Vercel)
  console.log(`[generate] Request started, method: ${req.method}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[generate] OPTIONS request handled');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    console.log('[generate] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    console.log('[generate] Missing prompt');
    return res.status(400).json({ error: 'prompt is required' });
  }
  console.log(`[generate] Prompt received (length: ${prompt.length})`);

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    console.error('[generate] GEMINI_API_KEY missing');
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel' });
  }
  console.log('[generate] API key present');

  // استخدام نموذج سريع جداً وتقليل عدد التوكينات
  const MODEL = 'gemini-2.0-flash-lite';
  const MAX_TOKENS = 512; // مهم جداً: 512 فقط لضمان السرعة

  // مهلة 9 ثوانٍ (Vercel يقطع عند 10 ثوانٍ)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('[generate] Aborting fetch due to timeout (9s)');
    controller.abort();
  }, 9000);

  try {
    console.log(`[generate] Calling Gemini API with model ${MODEL}...`);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: MAX_TOKENS,
            topK: 40,
            topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        })
      }
    );

    clearTimeout(timeoutId);
    console.log(`[generate] Gemini response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[generate] Gemini error (${response.status}):`, errorText);
      return res.status(502).json({
        error: `Gemini API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[generate] HTML received, length: ${html.length}`);

    if (!html) {
      console.error('[generate] Empty response from Gemini');
      return res.status(502).json({ error: 'AI returned empty response' });
    }

    // تنظيف وتغليف HTML
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Landing Page</title>
</head>
<body>
${html}
</body>
</html>`;
    }

    console.log('[generate] Success, returning HTML');
    return res.status(200).json({ html });
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[generate] Fetch or processing error:', error);
    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Request timed out (Vercel limit ~10s). Try shorter prompt or reduce maxOutputTokens further.'
      });
    }
    return res.status(500).json({ error: 'Internal error: ' + error.message });
  }
}
