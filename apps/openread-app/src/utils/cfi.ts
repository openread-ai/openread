import * as CFI from 'foliate-js/epubcfi.js';

export function isCfiInLocation(
  cfi: string | null | undefined,
  location: string | null | undefined,
): boolean {
  if (!cfi || !location) return false;

  const start = CFI.collapse(location);
  const end = CFI.collapse(location, true);

  return CFI.compare(cfi, start) >= 0 && CFI.compare(cfi, end) <= 0;
}
