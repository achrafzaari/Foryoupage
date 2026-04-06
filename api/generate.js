export default async function handler(req, res) {
  // ✅ إضافة CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // ✅ معالجة OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ✅ التأكد من أن الطريقة POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, userEmail, imgB64, imgType } = req.body;

    // ✅ التحقق من وجود prompt
    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // ✅ الحصول على مفتاح API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY is not set in environment variables');
      return res.status(500).json({ 
        error: 'API key not configured. Please add GEMINI_API_KEY to Vercel environment variables.' 
      });
    }

    // ✅ ديناميكي استيراد Gemini (لـ ES modules)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ استخدام نموذج مستقر
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
      }
    });

    let result;
    let finalPrompt = prompt;

    // ✅ تقليل طول الـ prompt إذا كان طويلاً جداً
    if (finalPrompt.length > 8000) {
      finalPrompt = finalPrompt.substring(0, 8000);
      console.log('⚠️ Prompt was truncated to 8000 chars');
    }

    console.log(`📡 Generating for: ${userEmail || 'anonymous'}`);
    console.log(`📝 Prompt length: ${finalPrompt.length} chars`);
    console.log(`🖼️ Has image: ${!!imgB64}`);

    // ✅ معالجة مع أو بدون صورة
    if (imgB64 && imgType) {
      try {
        // تنظيف base64
        let cleanBase64 = imgB64;
        if (imgB64.includes('base64,')) {
          cleanBase64 = imgB64.split('base64,')[1];
        }
        
        const imagePart = {
          inlineData: {
            data: cleanBase64,
            mimeType: imgType || 'image/jpeg'
          }
        };
        
        result = await model.generateContent([finalPrompt, imagePart]);
      } catch (imgError) {
        console.error('❌ Error with image generation:', imgError);
        // إذا فشل مع الصورة، حاول بدونها
        result = await model.generateContent(finalPrompt);
      }
    } else {
      result = await model.generateContent(finalPrompt);
    }

    const response = await result.response;
    let html = response.text();

    console.log(`✅ Generation successful, HTML length: ${html.length}`);

    // تنظيف HTML
    html = html.replace(/```html\s*/gi, '');
    html = html.replace(/```\s*/g, '');
    html = html.trim();

    // التأكد من وجود HTML صالح
    if (!html || html.length < 50) {
      throw new Error('Generated HTML is too short or empty');
    }

    if (!html.toLowerCase().includes('<!doctype') && !html.toLowerCase().includes('<html')) {
      html = `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة هبوط - ForYouPage</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box;}\nbody{font-family:'Cairo',sans-serif;background:#fff;color:#1a1a2e;line-height:1.6;padding:20px;}\n.btn{background:#1bc47d;color:#fff;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;}\n</style>\n</head>\n<body>\n<div class="container" style="max-width:1200px;margin:0 auto;">\n${html}\n</div>\n</body>\n</html>`;
    }

    return res.status(200).json({ 
      success: true,
      html: html 
    });

  } catch (error) {
    console.error('❌ Server Error:', error);
    
    // ✅ إرجاع خطأ مفهوم
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
