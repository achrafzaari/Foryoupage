export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, userEmail } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set');
    return res.status(500).json({
      error: 'API key not configured. Please add GEMINI_API_KEY to Vercel environment variables.'
    });
  }

  console.log(`📝 Generating page for: ${userEmail || 'Unknown user'}`);
  console.log(`📏 Prompt length: ${prompt.length} characters`);
  console.log(`🔑 API Key prefix: ${GEMINI_API_KEY.substring(0, 10)}...`);

  const MODELS = [
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  let successResponse = null;
  let usedModel = '';        // ✅ التصحيح: متغير منفصل لاسم النموذج
  let triedModels = [];
  let lastError = '';

  for (const model of MODELS) {
    try {
      console.log(`🔄 Trying model: ${model}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
          })
        }
      );

      if (response.ok) {
        console.log(`✅ Success with model: ${model}`);
        successResponse = response;
        usedModel = model;   // ✅ التصحيح: حفظ اسم النموذج هنا
        break;
      }

      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson?.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      triedModels.push({ model, status: response.status, error: errorMessage });
      lastError = errorMessage;
      console.warn(`⚠️ Model ${model} failed: ${errorMessage}`);

      if (response.status === 403) {
        console.error('❌ Invalid API key, stopping further attempts');
        break;
      }

    } catch (error) {
      triedModels.push({ model, error: error.message });
      lastError = error.message;
      console.warn(`⚠️ Model ${model} error: ${error.message}`);
    }
  }

  if (!successResponse) {
    console.error('❌ All models failed:', triedModels);
    return res.status(502).json({
      error: '❌ جميع نماذج Gemini فشلت. يرجى المحاولة لاحقاً.',
      details: lastError,
      triedModels,
      keyPrefix: GEMINI_API_KEY.substring(0, 10) + '...'
    });
  }

  try {
    const data = await successResponse.json();
    let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No text generated from Gemini');
    }

    let cleanHtml = generatedText;
    cleanHtml = cleanHtml.replace(/^```html\s*/gi, '');
    cleanHtml = cleanHtml.replace(/^```\s*/gi, '');
    cleanHtml = cleanHtml.replace(/```\s*$/gi, '');
    cleanHtml = cleanHtml.trim();

    if (!cleanHtml.toLowerCase().includes('<!doctype html>')) {
      cleanHtml = `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>صفحة هبوط - ForYouPage</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box;}\nbody{font-family:sans-serif;}\n</style>\n</head>\n<body>\n${cleanHtml}\n</body>\n</html>`;
    }

    console.log(`✅ HTML generated (${cleanHtml.length} characters) using model: ${usedModel}`);

    return res.status(200).json({
      html: cleanHtml,
      length: cleanHtml.length,
      model: usedModel,      // ✅ التصحيح: إرجاع المتغير الصحيح
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error processing response:', error);
    return res.status(500).json({
      error: '⚠️ حدث خطأ في معالجة استجابة Gemini',
      details: error.message
    });
  }
}
