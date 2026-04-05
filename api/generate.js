export default async function handler(req, res) {
  // ── إعدادات CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // معالجة طلب OPTIONS (لـ CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // السماح فقط بـ POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, userEmail } = req.body;

  // التحقق من وجود الـ prompt
  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // ── التحقق من مفتاح API ──
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    return res.status(500).json({ 
      error: 'API key not configured. Please add GEMINI_API_KEY to Vercel environment variables.' 
    });
  }

  // تسجيل الطلب (للمراقبة)
  console.log(`📝 Generating for: ${userEmail || 'Unknown'}`);
  console.log(`📏 Prompt length: ${prompt.length} chars`);
  console.log(`🔑 API Key prefix: ${GEMINI_API_KEY.substring(0, 8)}...`);

  // ── نماذج Gemini (مرتبة حسب الأفضلية والسرعة) ──
  const MODELS = [
    { name: 'gemini-1.5-flash', timeout: 55000 },      // ✅ الأسرع والأكثر استقراراً
    { name: 'gemini-2.0-flash', timeout: 55000 },      // ✅ جديد وسريع
    { name: 'gemini-1.5-pro', timeout: 60000 },        // 🔄 جودة عالية لكن أبطأ
    { name: 'gemini-pro', timeout: 60000 },            // 🔄 احتياطي أخير
  ];

  let successResponse = null;
  let usedModel = '';
  let errors = [];

  // ── تجربة كل نموذج حتى ينجح واحد ──
  for (const model of MODELS) {
    try {
      console.log(`🔄 Trying model: ${model.name}...`);
      
      // إعداد مهلة للطلب
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), model.timeout);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
          })
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`✅ Success with model: ${model.name}`);
        successResponse = response;
        usedModel = model.name;
        break;
      }

      // تسجيل الخطأ
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson?.error?.message || errorMsg;
      } catch {
        errorMsg = errorText || errorMsg;
      }
      
      errors.push({ model: model.name, status: response.status, error: errorMsg });
      console.warn(`⚠️ Model ${model.name} failed: ${errorMsg}`);

      // إذا كان المفتاح غير صالح، لا تبقى تجرب
      if (response.status === 403 || response.status === 401) {
        console.error('❌ Invalid API key, stopping');
        break;
      }

    } catch (error) {
      clearTimeout(timeoutId);
      errors.push({ model: model.name, error: error.message });
      console.warn(`⚠️ Model ${model.name} error: ${error.message}`);
    }
  }

  // ── إذا فشلت جميع النماذج ──
  if (!successResponse) {
    console.error('❌ All models failed:', errors);
    return res.status(502).json({
      error: '❌ فشل الاتصال بـ Gemini AI. يرجى المحاولة لاحقاً.',
      details: errors[0]?.error || 'Unknown error',
      triedModels: errors,
      tip: 'تأكد من إضافة GEMINI_API_KEY في إعدادات Vercel'
    });
  }

  // ── معالجة الاستجابة الناجحة ──
  try {
    const data = await successResponse.json();
    let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!html) {
      throw new Error('No text generated from Gemini');
    }

    // تنظيف HTML
    html = html.replace(/^```html\s*/gi, '');
    html = html.replace(/^```\s*/gi, '');
    html = html.replace(/```\s*$/gi, '');
    html = html.trim();
    
    // التأكد من وجود Doctype
    if (!html.toLowerCase().includes('<!doctype html>')) {
      html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>صفحة هبوط - ForYouPage</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Cairo',sans-serif;background:#fff;color:#1a1a2e;}
    .container{max-width:1200px;margin:0 auto;padding:20px;}
  </style>
</head>
<body>
${html}
</body>
</html>`;
    }

    console.log(`✅ HTML generated successfully!`);
    console.log(`📊 Length: ${html.length} chars`);
    console.log(`🤖 Model used: ${usedModel}`);
    
    return res.status(200).json({ 
      html: html,
      length: html.length,
      model: usedModel,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Processing error:', error);
    return res.status(500).json({ 
      error: '⚠️ حدث خطأ في معالجة استجابة Gemini',
      details: error.message
    });
  }
}
