export default async function handler(req, res) {
  // ── CORS headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, userEmail } = req.body || {};

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
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

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      console.error('Gemini API error:', errData);
      return res.status(502).json({ error: 'Gemini API error: ' + (errData?.error?.message || geminiRes.status) });
    }

    const data = await geminiRes.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up markdown code fences if present
    html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

    // Ensure it's a full HTML document
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة الهبوط</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
    }

    return res.status(200).json({ html });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}

