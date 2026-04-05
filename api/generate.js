export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // الحصول على مفتاح API
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  // 🔍 التحقق من وجود المفتاح
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing');
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY not found in environment variables',
      solution: 'Add GEMINI_API_KEY in Vercel Environment Variables'
    });
  }

  console.log('API Key exists, length:', GEMINI_API_KEY.length);
  console.log('Prompt length:', prompt.length);

  try {
    // استدعاء Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          }
        })
      }
    );

    // التحقق من استجابة Gemini
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: `Gemini API error: ${response.status}`,
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!html) {
      throw new Error('No HTML generated');
    }

    // تنظيف HTML
    html = html.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

    console.log('Success! HTML length:', html.length);
    
    return res.status(200).json({ html });

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
