export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── API Key ──
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing');
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' });
  }

  try {
    const body = req.body || {};

    // ✅ الـ dashboard يرسل prompt جاهز مباشرة
    const prompt = body.prompt || '';

    if (!prompt) {
      return res.status(400).json({ error: 'يجب إرسال prompt' });
    }

    // ── إرسال لـ Gemini ──
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      })
    });

    // ── معالجة أخطاء Gemini ──
    if (!geminiRes.ok) {
      let errMsg = '';
      try {
        const errJson = await geminiRes.json();
        errMsg = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errMsg = await geminiRes.text();
      }
      console.error('Gemini error', geminiRes.status, errMsg);

      const STATUS_MSGS = {
        429: 'تجاوزت الحد المسموح — انتظر دقيقة وأعد المحاولة',
        400: 'طلب غير صحيح — تحقق من الـ API Key',
        403: 'API Key غير مصرح له — تحقق منه في Google AI Studio',
        500: 'خطأ في سيرفر Gemini — أعد المحاولة',
        503: 'Gemini غير متاح الآن — أعد المحاولة بعد قليل',
      };

      const msg = STATUS_MSGS[geminiRes.status] || `خطأ من Gemini: ${geminiRes.status}`;
      return res.status(geminiRes.status).json({ error: msg, details: errMsg });
    }

    const data = await geminiRes.json();
    let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!html) {
      console.error('Gemini empty response:', JSON.stringify(data));
      return res.status(500).json({ error: 'Gemini أرجع رداً فارغاً', raw: data });
    }

    // ── تنظيف backticks ──
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    return res.status(200).json({ html });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'خطأ داخلي في السيرفر', message: err.message });
  }
}
