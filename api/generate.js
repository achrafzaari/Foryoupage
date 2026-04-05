export default async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── API Key ──
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY missing');
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' });
  }

  try {
    const body = req.body || {};

    // ── استقبال بيانات المنتج من الـ dashboard ──
    const {
      description = '',
      productName = '',
      price = '',
      oldPrice = '',
      currency = 'USD',
      platform = 'shopify',
      country = '',
      colors = [],
      sizes = [],
      offers = [],
      brandName = '',
      imageUrl = '',
      lang = 'ar',
      style = 'modern',
    } = body;

    if (!description && !productName) {
      return res.status(400).json({ error: 'يجب إرسال وصف المنتج أو اسمه' });
    }

    // ── بناء الـ Prompt ──
    const langLabel = lang === 'ar' ? 'العربية' : lang === 'fr' ? 'الفرنسية' : 'الإنجليزية';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    const prompt = `
أنت خبير تسويق رقمي وخبير تطوير ويب. مهمتك إنشاء صفحة هبوط (Landing Page) احترافية وجاهزة للبيع.

## معلومات المنتج:
- الاسم: ${productName || 'منتج'}
- الوصف: ${description}
- السعر الحالي: ${price} ${currency}
${oldPrice ? `- السعر القديم (قبل الخصم): ${oldPrice} ${currency}` : ''}
${country ? `- الدولة المستهدفة: ${country}` : ''}
${brandName ? `- اسم الماركة: ${brandName}` : ''}
${colors.length ? `- الألوان المتاحة: ${colors.join(', ')}` : ''}
${sizes.length ? `- المقاسات المتاحة: ${sizes.join(', ')}` : ''}
${offers.length ? `- العروض الخاصة: ${offers.join(' | ')}` : ''}
${imageUrl ? `- صورة المنتج: ${imageUrl}` : ''}
- لغة الصفحة: ${langLabel}
- اتجاه النص: ${dir}
- النمط البصري: ${style}
- المنصة: ${platform}

## المطلوب:
اكتب كود HTML كامل لصفحة هبوط احترافية تحتوي على:

1. **Header** - شريط علوي بسيط مع اسم الماركة
2. **Hero Section** - صورة المنتج + عنوان جذاب + وصف مقنع + زر "اطلب الآن"
3. **مزايا المنتج** - 3 إلى 4 نقاط قوية مع أيقونات
4. **السعر والعرض** - عرض السعر مع الخصم إن وجد + عداد تنازلي للإلحاح
5. **اختيار اللون والمقاس** - إن وجدا
6. **العروض الخاصة** - إن وجدت
7. **آراء العملاء** - 3 تقييمات وهمية مقنعة
8. **زر الطلب النهائي** - بارز وجذاب
9. **Footer** - بسيط مع روابط

## شروط الكود:
- HTML واحد كامل مع CSS و JS مضمّنين (لا ملفات خارجية عدا Google Fonts)
- متجاوب 100% مع الجوال
- اتجاه النص: ${dir}
- لغة المحتوى: ${langLabel} فقط
- ألوان جذابة تناسب المنتج
- تأثيرات CSS بسيطة وأنيمايشن خفيف
- زر الطلب يفتح WhatsApp أو نموذج بسيط
- لا تضع أي تعليقات أو شرح — فقط كود HTML نظيف كامل
- ابدأ مباشرة بـ <!DOCTYPE html> وانتهِ بـ </html>
`;

    // ── إرسال لـ Gemini ──
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192,
          topP: 0.95,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      })
    });

    // ── معالجة أخطاء Gemini ──
    if (!geminiRes.ok) {
      let errMsg = '';
      try {
        const errJson = await geminiRes.json();
        errMsg = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errMsg = await geminiRes.text();
      }
      console.error(`❌ Gemini ${geminiRes.status}:`, errMsg);

      const STATUS_MSGS = {
        429: 'تجاوزت الحد المسموح — انتظر دقيقة وأعد المحاولة',
        400: 'طلب غير صحيح — تحقق من الـ API Key',
        403: 'API Key غير مصرح له — تحقق منه في Google AI Studio',
        500: 'خطأ في سيرفر Gemini — أعد المحاولة',
        503: 'Gemini غير متاح الآن — أعد المحاولة بعد قليل',
      };

      const msg = STATUS_MSGS[geminiRes.status] || `خطأ من Gemini: ${geminiRes.status}`;
      return res.status(geminiRes.status).json({ error: msg, details: errMsg });
    }

    const data = await geminiRes.json();
    let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!html) {
      console.error('❌ Gemini رد فارغ:', JSON.stringify(data));
      return res.status(500).json({ error: 'Gemini أرجع رداً فارغاً', raw: data });
    }

    // ── تنظيف الكود من backticks إن وجدت ──
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    // ── حساب التكلفة التقريبية ──
    const inputTokens  = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(html.length / 4);
    const cost = ((inputTokens * 0.000075 + outputTokens * 0.0003) / 1000).toFixed(6);

    return res.status(200).json({
      html,
      tokens: { input: inputTokens, output: outputTokens },
      cost_usd: cost,
      model: 'gemini-1.5-flash'
    });

  } catch (err) {
    console.error('❌ Server error:', err);
    return res.status(500).json({ error: 'خطأ داخلي في السيرفر', message: err.message });
  }
}
