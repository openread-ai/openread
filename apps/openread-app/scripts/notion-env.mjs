export function getNotionToken(source = { NOTION_TOKEN: process.env.NOTION_TOKEN }) {
  const token = source.NOTION_TOKEN;
  return typeof token === 'string' && token.trim() ? token : undefined;
}

export function resolveNotionToken(source, missingMessage = 'NOTION_TOKEN is required.') {
  const value = getNotionToken(source);
  if (!value) throw new Error(missingMessage);
  return value;
}
