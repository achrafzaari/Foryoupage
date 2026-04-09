export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // معالجة طلب OPTIONS المبدئي
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // الحصول على النص من الطلب
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  // مفتاح API من متغيرات البيئة في Vercel
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel Environment Variables' });

  // استخدام نموذج واحد سريع وموثوق لتجنب تجاوز المهلة (timeout)
  const MODEL = 'gemini-2.0-flash'; // يمكنك تغييره إلى gemini-2.0-flash-lite أو gemini-1.5-flash

  // مهلة قصوى للطلب (9 ثوانٍ، لأن Vercel المجانية تسمح بـ 10 ثوانٍ كحد أقصى)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9500);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,   // خفضنا القيمة لتسريع الاستجابة
            topK: 40,
            topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        })
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
      return res.status(502).json({ error: `AI API error: ${errorMsg}` });
    }

    const data = await response.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!html) {
      return res.status(502).json({ error: 'AI returned empty response' });
    }

    // تنظيف المخرجات من علامات markdown
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    // إذا لم يبدأ النص بـ <!doctype نضيف هيكل HTML كامل
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Landing Page</title>
</head>
<body>
${html}
</body>
</html>`;
    }

    return res.status(200).json({ html });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out (Vercel limit is 10s)' });
    }
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
