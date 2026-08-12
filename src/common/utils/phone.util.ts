/** Normalizes a USA mobile number to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizeUsMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const tenDigit = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (tenDigit.length !== 10) return null;
  // NANP: area code and exchange code can't start with 0 or 1
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(tenDigit)) return null;

  return `+1${tenDigit}`;
}
