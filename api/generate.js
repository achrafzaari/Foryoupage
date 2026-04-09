module.exports = async function handler(req, res) {
  console.log(`[generate] Request started, method: ${req.method}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel' });

  // قائمة الموديلات - يجرب الأول، وإن فشل ينتقل للتالي
  const MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-lite',
  ];

  const MAX_TOKENS = 512;
  let lastError = null;

  for (const MODEL of MODELS) {
    console.log(`[generate] Trying model: ${MODEL}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: MAX_TOKENS },
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

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[generate] Model ${MODEL} failed:`, errText.substring(0, 200));
        lastError = errText;
        continue; // جرب الموديل التالي
      }

      const data = await response.json();
      let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!html) {
        console.error(`[generate] Model ${MODEL} returned empty response`);
        lastError = 'Empty response';
        continue; // جرب الموديل التالي
      }

      html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      if (!html.toLowerCase().startsWith('<!doctype')) {
        html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Landing Page</title></head><body>${html}</body></html>`;
      }

      console.log(`[generate] Success with model: ${MODEL}`);
      return res.status(200).json({ html, model: MODEL });

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[generate] Model ${MODEL} error:`, error.message);
      if (error.name === 'AbortError') {
        lastError = 'timeout';
        continue; // جرب الموديل التالي
      }
      lastError = error.message;
      continue;
    }
  }

  // كل الموديلات فشلت
  console.error('[generate] All models failed. Last error:', lastError);
  return res.status(502).json({
    error: 'All AI models are currently unavailable. Please try again later.',
    details: lastError?.substring?.(0, 200) || lastError
  });
};
