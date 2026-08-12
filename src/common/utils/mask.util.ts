/**
 * Masks a full name so only the first letter of each word is visible,
 * e.g. "Raj Gaikwad" -> "R*j G*******d" style masking used on the public scan page.
 */
export function maskName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((word) => maskWord(word))
    .join(' ');
}

function maskWord(word: string): string {
  if (word.length <= 2) {
    return word[0] + '*'.repeat(word.length - 1);
  }
  return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
}

/**
 * Masks a phone number leaving only the last N digits visible, e.g. "+14155552671" -> "******2671".
 */
export function maskMobile(mobile: string, visibleDigits = 4): string {
  const digits = mobile.replace(/\D/g, '');
  const visible = digits.slice(-visibleDigits);
  return '*'.repeat(Math.max(digits.length - visibleDigits, 6)) + visible;
}
