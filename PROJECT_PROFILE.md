# ملف تعريف مشروع درع

## الحالة الحالية

بوابة توعية عربية/إنجليزية. واجهة الموقع في `site/`، والعمال في مجلدات منفصلة. آخر commit وظيفي هو `f98341b` بعد PR #8 لتصحيح نص الموافقة وPR #9 لتعريب رسائل 429/503؛ حدّث PR #10 التوثيق إلى commit `f90b8ae`. Pages Functions منشورة على الإنتاج مع موافقات صريحة وحماية بمفاتيح server-side.

## حسابات Cloudflare

| الخدمة | الحساب/المعرّف | المورد | مجلد المصدر |
|---|---|---|---|
| Pages | `Qweas12-…` / `c869e7b03e940dfdb7cbfa085e104bfc` | المشروع `cyperaman-krm`؛ `der3-cybersecurity-site.pages.dev` | `site/` |
| AI | `Al` / `94a056b1a255a040e70d9ec53ebb7ca1` | `der3-ai.al-94a.workers.dev` | `worker-ai/` |
| تحليل الروابط | `Anlayzx` / `c1d93f57cae70d680a28ceccbc88f638` | `der3-security-analysis.anlayzx-c1d.workers.dev` | `worker-analysis/` |
| بيانات | `Datas` / `b50245539bfc8ea4399123b54d5da2d6` | `der3-data-api.datas-b50.workers.dev`؛ D1 `der3-data` | `worker-data/` |

هناك حساب Cloudflare آخر اسمه `Anlayzx` بالمعرّف `de2d64c41e92d3419cc949a6a2ceb9e3`؛ لا تخلطه مع حساب عامل التحليل أعلاه.

## تدفقات المنتج

| الأداة | التدفق | حدود الخصوصية/النتيجة |
|---|---|---|
| فحص الروابط | الواجهة → Pages Function → Worker التحليل، Cloudflare Scanner فقط في الواجهة | موافقة مطلوبة لأن التقرير عام؛ `not_detected` ليس ضمان أمان. يدعم Worker كذلك VirusTotal و`both` للاختبار. |
| الأخبار | Pages Function → Worker AI `news` → Firecrawl إلزامي + Workers AI/Qwen | يتطلب consent؛ إجابة إرشادية مع مصادر، لا تثبت الخبر قطعًا. |
| الرسائل | Pages Function → Worker AI `message` | يتطلب consent؛ لا يُستخدم بحث ويب. |
| الشات | Pages Function → Worker AI `chat` | checkbox consent؛ Firecrawl عند الحاجة. النص الخام لا يُحفظ في سجل النشاط. |
| كلمات المرور المسرّبة | HIBP k-anonymity في المتصفح | SHA-1 محليًا؛ تُرسل بادئة 5 أحرف فقط، ثم تُقارن النتيجة محليًا. |
| البحث الآمن/الهاتف | غير موصولين بخدمات خارجية | البحث الآمن يبقى محليًا؛ فحص الهاتف يحلل الصيغة وإشارات السلوك محليًا، بينما البحث العكسي مؤجل. |
| بيانات الحسابات | Worker بيانات مربوط بـD1 | تسجيل، دخول، خروج، جلسات HttpOnly، وإنشاء/قراءة بلاغات مرتبطة بالحساب؛ لا تُخزّن كلمات المرور الخام. |

## الأسرار والحماية

مفتاح `API_KEY` مستقل كـWorker Secret في Worker AI وفي Worker التحليل، وقيمتاه المقابلتان `DER3_AI_WORKER_API_KEY` و`DER3_ANALYSIS_WORKER_API_KEY` كـProduction Secrets في مشروع Pages. أُنشئت القيم عشوائيًا داخل Cloudflare ولم تُطبع أو تُحفظ في Git. تبقى أسرار المزودين أصلية في عمالها: `FIRECRAWL_API_KEY` في AI، و`CLOUDFLARE_URL_SCANNER_TOKEN` و`VIRUSTOTAL_API_KEY` في التحليل.

Pages هو نقطة الدخول للمتصفح؛ يضيف أسرار المصادقة إلى طلبات Workers من الخادم فقط. Pages وWorker AI يرفضان طلبات النص بلا consent، وWorker التحليل وPages يفرضان موافقات كل مزود. حدود الجسم 16KB في Pages والعامل؛ يتم تنقيح query parameters الحساسة في روابط التحويلات.

Google Web Risk غير مستخدم حاليًا. اختبار سابق أعاد `403 PERMISSION_DENIED` مع السبب `BILLING_DISABLED` للمشروع `205809787174`. لا يوجد تعديل للفوترة.

## تحقق محلي

| المكوّن | التحقق |
|---|---|
| Worker AI | 12/12 اختبارًا؛ `wrangler deploy --dry-run` ناجح |
| Worker التحليل | 14/14 اختبارًا؛ `wrangler deploy --dry-run` ناجح |
| HIBP | 4/4 اختبارات |
| Pages Functions | اختبار محلي لموافقة AI/الروابط، مفاتيح الخادم، حد الحجم، UUID، ومسار polling لـVirusTotal |
| JavaScript والتغييرات | `node --check` و`git diff --check` ناجحان |

## تحقق الإنتاج (2026-10-22)

اكتمل مسح صفحة درع العامة من واجهة الموقع عبر Cloudflare URL Scanner بحالة `finished` ونتيجة `not_detected`؛ عرضت الواجهة تقرير Cloudflare والتحويلات، وأعاد مسار لقطة الشاشة `200 image/png` بحجم 255,230 بايت. اختُبر فاحص الأخبار بادعاء تاريخي وأعاد جوابًا ومصادر عبر Firecrawl؛ بعض النتائج كانت من منصات اجتماعية، لذا تحسين موثوقية المصادر ما زال مطلوبًا. اختُبر فاحص الرسائل بنص تصيد اصطناعي وأعاد مؤشرات ونصائح، كما أعاد الشات إجابة من AI.

بعد PR #8 ظهرت موافقات الأخبار والرسائل وترحيب الشات بالعربية والإنجليزية بصورة صحيحة في الإنتاج. بعد PR #9 تحقّق المتصفح من أن أصول الإنتاج تحتوي على رسائل 429 و503 المترجمة بالعربية والإنجليزية؛ لم يُجر اختبار ضغط أو إجبار حي لتجاوز الحد.

تبقى أداة البحث الآمن محلية، والبحث العكسي للهاتف مؤجل، بينما تحليل الهاتف المحلي متاح. عامل البيانات يجمع بيانات الحساب والبلاغات وفق المخطط الموثق ولا يخزن كلمات المرور الخام. لتحقق محلي من Pages Functions استخدم `npx wrangler pages dev site --port 8788`؛ أما `node dev-server.mjs` فيخدم معاينة ثابتة فقط.
