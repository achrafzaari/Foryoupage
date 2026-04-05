export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // السماح بالوصول من أي مكان (للتطوير)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, userEmail } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // 1. قراءة المفاتيح من متغيرات البيئة في Vercel
    const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
    const apiKey = process.env.AI_API_KEY;
    
    // فحص وجود المفتاح
    if (!apiKey) {
      console.error('❌ AI_API_KEY is not set in Vercel environment variables');
      return res.status(500).json({ 
        error: 'AI_API_KEY is missing. Please add it in Vercel Dashboard → Settings → Environment Variables.' 
      });
    }

    let html = '';

    // ── OPENROUTER (المُوصى به لأنه الأسهل والأرخص) ──
    if (provider === 'openrouter') {
      const model = process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct';
      console.log(`🚀 Calling OpenRouter with model: ${model}`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://foryoupage.vercel.app',
          'X-Title': 'ForYouPage',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'أنت خبير تسويق ومطور واجهات أمامية. قم بإنشاء صفحة هبوط كاملة وجذابة باستخدام HTML و CSS و JavaScript. يجب أن يكون الرد HTML فقط يبدأ بـ <!DOCTYPE html>، بدون أي شرح إضافي أو علامات Markdown.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.85,
          max_tokens: 8192,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenRouter error (${response.status}):`, errorText);
        return res.status(502).json({ 
          error: `AI service error (${response.status}): ${errorText.slice(0, 200)}` 
        });
      }
      
      const data = await response.json();
      html = data?.choices?.[0]?.message?.content || '';
      console.log(`✅ OpenRouter success, HTML length: ${html.length}`);
    }
    // ── GEMINI ──
    else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 8192 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
      
      if (!response.ok) {
        console.error(`❌ Gemini error: ${response.status}`);
        return res.status(502).json({ error: `Gemini error ${response.status}` });
      }
      
      const data = await response.json();
      html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    else {
      return res.status(400).json({ 
        error: `Unknown AI_PROVIDER: "${provider}". Use: openrouter, gemini, openai, claude, groq` 
      });
    }

    // تنظيف الناتج من علامات Markdown
    let cleanHtml = html
      .replace(/^```html\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    // التحقق من صحة الناتج
    if (!cleanHtml.includes('<!DOCTYPE') && !cleanHtml.includes('<html')) {
      console.error('❌ AI did not return valid HTML. First 200 chars:', cleanHtml.slice(0, 200));
      return res.status(502).json({ 
        error: 'AI did not return valid HTML. Please try again or change the prompt.' 
      });
    }

    console.log(`✅ Generation successful for user: ${userEmail}, HTML size: ${cleanHtml.length} chars`);
    return res.status(200).json({ html: cleanHtml });

  } catch (err) {
    console.error('❌ Fatal error in generate API:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
