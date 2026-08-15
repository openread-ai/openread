const BYTE_MULTIPLIERS = Object.freeze({
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
});

const SENSITIVE_FIELD =
  /(?:authorization|cookie|secret|token|signature|uploadurl|downloadurl|signedurl)/i;

function parseDisplayedBytes(value) {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s+(B|KB|MB|GB|TB)$/);
  if (!match) throw new Error(`Unrecognized visible storage value: ${value}`);
  return Math.round(Number(match[1]) * BYTE_MULTIPLIERS[match[2]]);
}

export function parseVisibleStorageSnapshot(usageText, percentageText) {
  const usageMatch = usageText.trim().match(/^(.+?)\s+of\s+(.+?)\s+used$/);
  if (!usageMatch) throw new Error(`Unrecognized visible storage usage: ${usageText}`);

  const percentageMatch = percentageText.trim().match(/^([0-9]+)%$/);
  if (!percentageMatch) {
    throw new Error(`Unrecognized visible storage percentage: ${percentageText}`);
  }

  const usedText = usageMatch[1].trim();
  const totalText = usageMatch[2].trim();
  const usedBytes = parseDisplayedBytes(usedText);
  const totalBytes = parseDisplayedBytes(totalText);
  const percentage = Number(percentageMatch[1]);

  if (totalBytes <= 0) throw new Error('Visible Cloud Storage quota must be positive');
  if (usedBytes > totalBytes) throw new Error('Visible Cloud Storage usage exceeds its quota');
  if (percentage < 0 || percentage > 100) {
    throw new Error('Visible Cloud Storage percentage is outside 0–100');
  }

  return Object.freeze({
    usageText: usageText.trim(),
    percentageText: percentageText.trim(),
    usedText,
    totalText,
    usedBytes,
    totalBytes,
    percentage,
  });
}

export function redactLifecycleNetworkValue(value, fieldName = '') {
  if (SENSITIVE_FIELD.test(fieldName)) return '[REDACTED]';
  if (Array.isArray(value)) {
    return value.map((item) => redactLifecycleNetworkValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactLifecycleNetworkValue(item, key)]),
    );
  }
  if (typeof value !== 'string') return value;

  return value
    .replace(/([?&](?:X-Amz-[^=]+|token|signature)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
}

export function redactLifecycleResponseBody(body) {
  if (!body) return '';
  try {
    return JSON.stringify(redactLifecycleNetworkValue(JSON.parse(body)));
  } catch {
    return redactLifecycleNetworkValue(body);
  }
}
