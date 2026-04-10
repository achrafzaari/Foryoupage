export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const { messages = [], system = '', isHtml = false } = req.body || {};

  // Try models in order — if one hits 429 try next
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite',
  ];

  const maxTokens = isHtml ? 8192 : 600;

  // Build contents
  const lastMsg = messages[messages.length - 1];
  let parts = [];

  if (system) parts.push({ text: system + '\n\n' });

  if (lastMsg && Array.isArray(lastMsg.content)) {
    lastMsg.content.forEach(c => {
      if (c.type === 'text') {
        parts.push({ text: c.text });
      } else if (c.type === 'image') {
        parts.push({ inlineData: { mimeType: c.source.media_type, data: c.source.data } });
      }
    });
  } else {
    parts.push({ text: String(lastMsg?.content || '') });
  }

  const contents = [{ role: 'user', parts }];

  let lastError = '';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
        })
      });

      const data = await r.json();

      if (r.status === 429) {
        lastError = `${model}: rate limit`;
        continue; // try next model
      }

      if (!r.ok) {
        lastError = data?.error?.message || `${model}: error ${r.status}`;
        continue;
      }

      let result = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (isHtml) {
        result = result
          .replace(/^```html\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
      }

      return res.status(200).json({ result, html: result, model });

    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  // All models failed
  return res.status(429).json({
    error: 'All Gemini models rate limited. Wait 1 minute and try again.',
    details: lastError
  });
}
