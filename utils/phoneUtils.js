
// Characters customers actually type in a phone number: optional leading +,
// digits, spaces, dashes and parentheses (e.g. "+34 612 345 678").
const PHONE_ALLOWED_CHARS = /^\+?[\d\s\-()]+$/;

// 7 digits covers the shortest real local numbers; 15 is the E.164 maximum.
// Counting digits (not characters) rejects separator-only junk like "----".
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

// Trim a phone value from a request body or profile; anything non-string-like
// (null, undefined, objects) collapses to an empty string.
exports.normalizePhone = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

// True when the value is a plausible, contactable phone number
exports.isValidPhone = (value) => {
  const phone = exports.normalizePhone(value);
  if (!phone || !PHONE_ALLOWED_CHARS.test(phone)) return false;

  const digitCount = phone.replace(/\D/g, '').length;
  return digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS;
};
