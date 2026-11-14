# Worker تحليل الروابط — `der3-security-analysis`

عامل مستقل في حساب Cloudflare `Anlayzx`، المعرّف `c1d93f57cae70d680a28ceccbc88f638`، ويُبنى من `worker-analysis/` عبر Workers Builds على `main` مع الجذر `/worker-analysis/`.

## المسارات والحماية

| المسار | الاستخدام |
|---|---|
| `GET /health` | مؤشرات منطقية لوجود bindings والأسرار فقط، بلا قيم. |
| `POST /api/check/url` | يتطلب `X-API-Key`، وJSON بحد 16KB، ورابطًا عامًا، ووضعًا وموافقة مناسبة. |
| `GET /api/check/url/{scanId}` | استرجاع نتيجة Cloudflare؛ يتطلب `X-API-Key` ومعرّف UUID صالحًا. |
| `GET /api/check/url/{scanId}/screenshot` | صورة Cloudflare PNG؛ يتطلب المفتاح ومعرّف UUID صالحًا. |
| `GET /api/check/url/virustotal/{analysisId}` | حالة/نتيجة تحليل VirusTotal؛ يتطلب المفتاح ومعرّف تحليل صالحًا. |

الأوضاع: `cloudflare` مع `publicScanConsent: true`، و`virustotal` مع `virusTotalConsent: true`، و`both` مع الموافقتين. Cloudflare Scanner ينتج تقريرًا عامًا. VirusTotal قد يضيف الروابط لمجموعة المجتمع؛ احترم `429 Retry-After` ولا تعِد الإرسال مبكرًا. واجهة درع تستخدم Cloudflare فقط حاليًا.

يُرفض محتوى غير JSON أو أكبر من 16KB، والروابط التي تحتوي كلمات استعلام حساسة معروفة أو عناوين IP محلية/محجوزة، بما فيها IPv4-mapped IPv6. عند إعادة نتيجة Scanner تُنقّح معاملات URL الحساسة وتُحد التحويلات. لا ترسل روابط خاصة أو روابط تسجيل دخول/رموز وصول. `not_detected` و`unclassified` لا يثبتان الأمان، كما لا يمكن للمصدر وحده تأكيد سلامة كل DNS redirect.

## الأسرار

`API_KEY` سر مصادقة العامل؛ يُحتفظ بنظيره فقط في Cloudflare Pages باسم `DER3_ANALYSIS_WORKER_API_KEY`. القيم موجودة في إعدادات Cloudflare الإنتاجية ولم تُطبع أو تُحفظ في المستودع. الأسرار الأصلية لهذا العامل هي `CLOUDFLARE_URL_SCANNER_TOKEN` و`VIRUSTOTAL_API_KEY`. Google Web Risk غير مستخدم: الاختبار السابق أعاد `403 PERMISSION_DENIED / BILLING_DISABLED` للمشروع `205809787174`.

## التحقق والنشر

نجحت الاختبارات المحلية **14/14** واجتاز `npx wrangler deploy --dry-run`. Pages proxy يوصل طلبات المتصفح دون كشف `API_KEY`. دمج الفرع إلى `main` مطلوب قبل اختبار `/health` والمسارات من الموقع المنشور.

```bash
npm ci
npm test
npx wrangler deploy --dry-run
```
