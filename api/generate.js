module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' });
  }

  try {
    const body = req.body || {};
    const prompt = body.prompt || '';
    if (!prompt) return res.status(400).json({ error: 'يجب إرسال prompt' });

    const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    let geminiRes;
    for (let attempt = 1; attempt <= 3; attempt++) {
      geminiRes = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 8192, topP: 0.95 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        })
      });
      if (geminiRes.status !== 429) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 15000));
    }

    if (!geminiRes.ok) {
      let errMsg = '';
      try { errMsg = (await geminiRes.json())?.error?.message || ''; }
      catch { errMsg = await geminiRes.text(); }
      const msgs = {
        429: 'تجاوزت الحد المجاني — انتظر دقيقة',
        400: 'API Key غير صحيح',
        403: 'API Key غير مصرح له',
        500: 'خطأ في سيرفر Gemini',
        503: 'Gemini غير متاح الآن',
      };
      return res.status(geminiRes.status).json({
        error: msgs[geminiRes.status] || `خطأ ${geminiRes.status}`,
        details: errMsg
      });
    }

    const data = await geminiRes.json();
    let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!html) return res.status(500).json({ error: 'Gemini أرجع رداً فارغاً' });

    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return res.status(200).json({ html });

  } catch (err) {
    return res.status(500).json({ error: 'خطأ داخلي', message: err.message });
  }
}
