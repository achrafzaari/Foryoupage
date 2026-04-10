export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel Environment Variables' });

  try {
    const { messages = [], system = '', isHtml = false } = req.body || {};

    // Build Gemini prompt
    const model = isHtml ? 'gemini-2.0-flash' : 'gemini-2.0-flash';
    const maxTokens = isHtml ? 8192 : 600;

    // Convert messages to Gemini format
    const geminiParts = [];
    if (system) geminiParts.push({ text: system + '\n\n' });
    messages.forEach(m => {
      geminiParts.push({ text: (m.role === 'user' ? 'User: ' : 'Assistant: ') + 
        (Array.isArray(m.content) 
          ? m.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
          : m.content) 
      });
    });

    // Handle image if present
    const contents = [];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && Array.isArray(lastMsg.content)) {
      const parts = [];
      if (system) parts.push({ text: system + '\n\n' });
      lastMsg.content.forEach(c => {
        if (c.type === 'text') {
          parts.push({ text: c.text });
        } else if (c.type === 'image') {
          parts.push({ inlineData: { mimeType: c.source.media_type, data: c.source.data } });
        }
      });
      contents.push({ role: 'user', parts });
    } else {
      const fullText = system 
        ? system + '\n\nUser request: ' + (messages[messages.length-1]?.content || '')
        : (messages[messages.length-1]?.content || '');
      contents.push({ role: 'user', parts: [{ text: fullText }] });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: isHtml ? 0.7 : 0.5,
        }
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ 
        error: data?.error?.message || 'Gemini API error',
        details: data 
      });
    }

    let result = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (isHtml) {
      result = result
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    }

    return res.status(200).json({ result, html: result });

  } catch (err) {
    console.error('[generate] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
