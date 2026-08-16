export function getNotionToken(
  source = {
    NOTION_TOKEN: process.env.NOTION_TOKEN,
    NOTION_API_KEY: process.env.NOTION_API_KEY,
  },
) {
  return source.NOTION_TOKEN || source.NOTION_API_KEY;
}

export function resolveNotionToken(
  source,
  missingMessage = 'NOTION_TOKEN or legacy NOTION_API_KEY is required.',
) {
  const value = getNotionToken(source);
  if (!value) throw new Error(missingMessage);
  return value;
}
