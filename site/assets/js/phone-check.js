import { t } from './locale.js';

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
const easternArabicDigits = '۰۱۲۳۴۵۶۷۸۹';

export function normalizePhone(raw) {
  const value = String(raw ?? '')
    .replace(/[٠-٩۰-۹]/g, digit => {
      const index = arabicDigits.indexOf(digit);
      return String(index >= 0 ? index : easternArabicDigits.indexOf(digit));
    })
    .replace(/[\s().-]/g, '');

  if (!/^\+?\d+$/.test(value)) return null;
  const international = value.startsWith('+');
  const digits = value.replace(/^\+/, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (international && digits[0] === '0') return null;

  return { digits, international, normalized: international ? `+${digits}` : digits };
}

export function analyzePhone(raw, signals = {}, lang = 'ar') {
  const phone = normalizePhone(raw);
  if (!phone) {
    return {
      valid: false,
      kind: 'neutral',
      label: t('phoneInvalid', lang),
      reasons: [t('phoneLengthRule', lang)],
      copy: t('phoneNoLiveLookup', lang)
    };
  }

  const reasons = [];
  if (!phone.international) reasons.push(t('phoneNoCountryCode', lang));
  const repeated = /(\d)\1{5,}/.test(phone.digits);
  const sequential = /(?:0123456|1234567|2345678|3456789|9876543|8765432|7654321)/.test(phone.digits);
  if (repeated || sequential) reasons.push(t('phonePattern', lang));
  if (signals.code) reasons.push(t('phoneSignalCode', lang));
  if (signals.payment) reasons.push(t('phoneSignalPayment', lang));
  if (signals.pressure) reasons.push(t('phoneSignalPressure', lang));
  if (signals.link) reasons.push(t('phoneSignalLink', lang));
  if (!reasons.length) reasons.push(t('phoneNoSignals', lang));

  let kind = 'neutral';
  let label = t('phoneUnknown', lang);
  if (signals.code || signals.payment) {
    kind = 'danger';
    label = t('phoneDanger', lang);
  } else if (signals.pressure || signals.link || repeated || sequential || !phone.international) {
    kind = 'suspicious';
    label = t('phoneCaution', lang);
  }

  return { valid: true, phone, kind, label, reasons, copy: t('phoneNoLiveLookup', lang) };
}
