// Validadores de formularios compartidos.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

// Teléfono MX: 10 dígitos (con o sin formato: espacios, guiones, paréntesis)
// y prefijo +52 / 52 opcional.
const PHONE_ALLOWED_CHARS_RE = /^\+?[\d\s\-().]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_ALLOWED_CHARS_RE.test(trimmed)) return false;

  const digits = trimmed.replace(/\D/g, "");
  // 10 dígitos locales, u 12 con lada de país 52.
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("52"));
}
