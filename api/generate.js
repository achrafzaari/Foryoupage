export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, userEmail } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ADMIN_EMAIL = 'raholnichan1@gmail.com';

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 8192 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Gemini error: ' + (err?.error?.message || geminiRes.status) });
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const html = rawText.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

    return res.status(200).json({ html, isAdmin: userEmail === ADMIN_EMAIL });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }

