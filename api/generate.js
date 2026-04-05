export default async function handler(req, res) {
  // السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, userEmail } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // مفتاح API من متغيرات البيئة
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set');
    return res.status(500).json({ 
      error: 'API key not configured. Add GEMINI_API_KEY to Vercel environment variables.' 
    });
  }

  console.log(`Generating for: ${userEmail || 'unknown'}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // تنظيف HTML
    html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
    
    if (!html.toLowerCase().includes('<!doctype html>')) {
      html = `<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة هبوط</title>\n</head>\n<body>\n${html}\n</body>\n</html>`;
    }

    console.log(`Success! HTML length: ${html.length}`);
    return res.status(200).json({ html });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
