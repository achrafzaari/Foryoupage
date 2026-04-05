export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, userEmail } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
    const apiKey   =  process.env.AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI_API_KEY is not set in Vercel environment variables' });

    let html = '';

    // ── OPENROUTER ──────────────────────────────────────────
    if (provider === 'openrouter') {
      const model = process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct';
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://foryoupage.vercel.app',
          'X-Title': 'ForYouPage',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert digital marketer. Return only complete HTML code starting with <!DOCTYPE html>, no explanation, no markdown.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.85,
          max_tokens: 8192,
        }),
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(502).json({ error: `OpenRouter error ${r.status}: ${err.slice(0, 200)}` });
      }
      const d = await r.json();
      html = d?.choices?.[0]?.message?.content || '';

    // ── GEMINI ──────────────────────────────────────────────
    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 8192 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      if (!r.ok) return res.status(502).json({ error: `Gemini error ${r.status}` });
      const d = await r.json();
      html = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // ── OPENAI ──────────────────────────────────────────────
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content: 'Return only complete HTML starting with <!DOCTYPE html>, no explanation.' },
            { role: 'user',   content: prompt },
          ],
          temperature: 0.85,
          max_tokens: 8192,
        }),
      });
      if (!r.ok) return res.status(502).json({ error: `OpenAI error ${r.status}` });
      const d = await r.json();
      html = d?.choices?.[0]?.message?.content || '';

    // ── CLAUDE ──────────────────────────────────────────────
    } else if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: 'Return only complete HTML starting with <!DOCTYPE html>, no explanation.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) return res.status(502).json({ error: `Claude error ${r.status}` });
      const d = await r.json();
      html = d?.content?.[0]?.text || '';

    // ── GROQ ────────────────────────────────────────────────
    } else if (provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Return only complete HTML starting with <!DOCTYPE html>, no explanation.' },
            { role: 'user',   content: prompt },
          ],
          temperature: 0.85,
          max_tokens: 8192,
        }),
      });
      if (!r.ok) return res.status(502).json({ error: `Groq error ${r.status}` });
      const d = await r.json();
      html = d?.choices?.[0]?.message?.content || '';

    } else {
      return res.status(400).json({ error: `Unknown AI_PROVIDER: "${provider}". Use: openrouter, gemini, openai, claude, groq` });
    }

    // ── Clean markdown fences ────────────────────────────────
    const clean = html
      .replace(/^```html\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    if (!clean.includes('<!DOCTYPE')) {
      return res.status(502).json({ error: 'AI did not return valid HTML. Please try again.' });
    }

    console.log(`[generate] provider=${provider} user=${userEmail} chars=${clean.length}`);
    return res.status(200).json({ html: clean });

  } catch (err) {
    console.error('[generate] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
