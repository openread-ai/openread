const REDACTED_FRAGMENT = '#<redacted>';

export function redactUrlFragment(url: string): string {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    return url;
  }
  return `${url.slice(0, hashIndex)}${REDACTED_FRAGMENT}`;
}
