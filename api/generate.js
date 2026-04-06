import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, userEmail, imgB64, imgType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ استخدام نموذج أصغر وأسرع لتقليل الاستهلاك
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-8b",  // أصغر حجماً من flash العادي
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,  // قللنا من 8192
      }
    });

    let result;

    // ✅ إضافة تأخير إذا كانت هناك صورة
    if (imgB64 && imgType) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // تأخير 1 ثانية
      
      const base64Data = imgB64.includes('base64,') 
        ? imgB64.split('base64,')[1] 
        : imgB64;
      
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: imgType || 'image/jpeg'
        }
      };
      
      result = await model.generateContent([prompt, imagePart]);
    } else {
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    let html = response.text();

    html = html.replace(/```html\s*/gi, '');
    html = html.replace(/```\s*/g, '');
    html = html.trim();

    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة هبوط - ForYouPage</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box;}\nbody{font-family:'Cairo',sans-serif;background:#fff;color:#1a1a2e;line-height:1.6;}\n.container{max-width:1200px;margin:0 auto;padding:20px;}\n.btn{background:#1bc47d;color:#fff;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;}\n</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;
    }

    return res.status(200).json({ 
      html: html,
      success: true 
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // ✅ معالجة خاصة لخطأ 429
    if (error.message?.includes('429') || error.status === 429) {
      return res.status(429).json({ 
        error: 'الطلب مزدحم حالياً. يرجى الانتظار 30 ثانية والمحاولة مرة أخرى.',
        retryAfter: 30
      });
    }
    
    let errorMessage = 'فشل في توليد الصفحة';
    if (error.message?.includes('API key')) {
      errorMessage = 'مشكلة في مفتاح API';
    } else if (error.message?.includes('quota')) {
      errorMessage = 'تم تجاوز الحصة اليومية المجانية. جرب غداً أو قم بترقية حسابك.';
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
}
