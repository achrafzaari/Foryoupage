export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set in Vercel environment variables' });
  }

  try {
    const body = req.body || {};
    const prompt = body.prompt || '';
    if (!prompt) return res.status(400).json({ error: 'يجب إرسال prompt' });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://foryoupage-psi.vercel.app',
        'X-Title': 'ForYouPage'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
        temperature: 0.85,
      })
    });

    if (!response.ok) {
      let errMsg = '';
      try { errMsg = (await response.json())?.error?.message || ''; }
      catch { errMsg = await response.text(); }

      const STATUS_MSGS = {
        429: 'تجاوزت الحد — انتظر قليلاً وأعد المحاولة',
        401: 'API Key غير صحيح — تحقق من OPENROUTER_API_KEY',
        403: 'غير مصرح له',
        500: 'خطأ في سيرفر OpenRouter',
        503: 'OpenRouter غير متاح الآن',
      };
      return res.status(response.status).json({
        error: STATUS_MSGS[response.status] || `خطأ ${response.status}`,
        details: errMsg
      });
    }

    const data = await response.json();
    let html = data?.choices?.[0]?.message?.content || '';
    if (!html) return res.status(500).json({ error: 'OpenRouter أرجع رداً فارغاً' });

    // تنظيف backticks
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    return res.status(200).json({ html });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'خطأ داخلي', message: err.message });
  }
}
