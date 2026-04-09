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

  const MODEL = 'gemini-2.0-flash-lite';
  const MAX_TOKENS = 128; // تم التخفيض بشكل كبير لضمان السرعة

  // منطق إعادة المحاولة (Retry logic) للتعامل مع الأخطاء العابرة
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        console.error(`Gemini error (attempt ${attempt + 1}):`, errText);
        if (attempt === MAX_RETRIES) {
          return res.status(502).json({ error: `Gemini API error: ${response.status}`, details: errText.substring(0, 200) });
        }
        continue; // أعد المحاولة
      }

      const data = await response.json();
      let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!html) return res.status(502).json({ error: 'Empty response from Gemini' });

      html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      if (!html.toLowerCase().startsWith('<!doctype')) {
        html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Landing Page</title></head><body>${html}</body></html>`;
      }

      return res.status(200).json({ html });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Fetch error (attempt ${attempt + 1}):`, error);
      if (attempt === MAX_RETRIES) {
        if (error.name === 'AbortError') {
          return res.status(504).json({ error: 'Request timed out (Vercel 10s limit).' });
        }
        return res.status(500).json({ error: `Internal server error: ${error.message}` });
      }
    }
  }
};
