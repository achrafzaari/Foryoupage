export default async function handler(req, res) {

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

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 8192, topP: 0.95 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    };

    // ── Retry تلقائي عند 429 (3 محاولات) ──
    let geminiRes;
    for (let attempt = 1; attempt <= 3; attempt++) {
      geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (geminiRes.status !== 429) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 5000)); // 5s ثم 10s
    }

    // ── معالجة الأخطاء ──
    if (!geminiRes.ok) {
      let errMsg = '';
      try { errMsg = (await geminiRes.json())?.error?.message || ''; }
      catch { errMsg = await geminiRes.text(); }

      const STATUS_MSGS = {
        429: 'الحد المجاني ممتلئ — انتظر دقيقة وأعد المحاولة',
        400: 'طلب غير صحيح — تحقق من الـ API Key',
        403: 'API Key غير مصرح له',
        500: 'خطأ في سيرفر Gemini — أعد المحاولة',
        503: 'Gemini غير متاح الآن — أعد المحاولة بعد قليل',
      };
      return res.status(geminiRes.status).json({
        error: STATUS_MSGS[geminiRes.status] || `خطأ ${geminiRes.status}`,
        details: errMsg
      });
    }

    const data = await geminiRes.json();
    let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!html) return res.status(500).json({ error: 'Gemini أرجع رداً فارغاً' });

    // تنظيف backticks
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    return res.status(200).json({ html });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'خطأ داخلي', message: err.message });
  }
}
