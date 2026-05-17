const NOTION_VERSION = '2026-03-11';
const sectionCache = new Map();

export function qaRunTrackerEnabled({ notionToken, pageId }) {
  return Boolean(notionToken && pageId);
}

export async function appendQaRunTrackerEntry({
  notionToken,
  pageId,
  sectionPath = 'Chromium',
  entry,
}) {
  if (!qaRunTrackerEnabled({ notionToken, pageId }) || !entry) return null;

  const sectionBlockId = await findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath });
  const children = typeof entry === 'string' ? [bulletedBlock(entry)] : trackerEntryBlocks(entry);
  return notionRequest({
    notionToken,
    path: `/v1/blocks/${sectionBlockId}/children`,
    method: 'PATCH',
    body: { children },
  });
}

export async function readQaRunTrackerEntries({ notionToken, pageId, sectionPath = 'Chromium' }) {
  if (!qaRunTrackerEnabled({ notionToken, pageId })) return [];
  const sectionBlockId = await findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath });
  const children = await readBlockChildrenDeep({ notionToken, blockId: sectionBlockId });
  return children.map(blockText).filter(Boolean);
}

export function summarizeRunTrackerEntries(entries, runId) {
  const runEntries = entries.filter((entry) => entry.includes(`runId=${runId}`));
  const finalScenarios = finalScenarioEntries(runEntries);
  return {
    existing: runEntries.length > 0,
    totalEntries: runEntries.length,
    completedScenarios: finalScenarios.filter((entry) => ['passed', 'flaky'].includes(entry.status))
      .length,
    failedScenarios: finalScenarios.filter((entry) =>
      ['failed', 'timed-out', 'interrupted'].includes(entry.status),
    ).length,
    skippedScenarios: finalScenarios.filter((entry) => entry.status === 'skipped').length,
    flakyScenarios: finalScenarios.filter((entry) => entry.status === 'flaky').length,
    lastEntry: runEntries.at(-1) ?? null,
  };
}

function finalScenarioEntries(runEntries) {
  const scenarios = new Map();
  for (const entry of runEntries) {
    const event = trackerValue(entry, 'event');
    if (!['scenario-complete', 'scenario-failed', 'scenario-status'].includes(event)) continue;
    const scenario = trackerValue(entry, 'scenario');
    if (!scenario) continue;
    const spec = trackerValue(entry, 'spec') ?? '';
    scenarios.set(`${spec}::${scenario}`, {
      scenario,
      status: trackerValue(entry, 'status'),
      entry,
    });
  }
  return [...scenarios.values()];
}

export function completedScenarioGrepInvert(entries, runId) {
  const runEntries = entries.filter((entry) => entry.includes(`runId=${runId}`));
  const completed = new Set(
    finalScenarioEntries(runEntries)
      .filter((entry) => ['passed', 'flaky'].includes(entry.status))
      .map((entry) => entry.scenario)
      .filter(Boolean),
  );
  if (completed.size === 0) return null;
  return [...completed].map(escapeRegex).join('|');
}

export function formatTrackerEntry(entry) {
  return machineTrackerEntry(entry);
}

function trackerEntryBlocks(entry) {
  return [
    calloutBlock(
      trackerTitle(entry),
      [...trackerDetailBlocks(entry), metadataToggleBlock(machineTrackerEntry(entry))],
      statusColor(entry.status),
    ),
  ];
}

function machineTrackerEntry(entry) {
  const parts = [
    `time=${formatTrackerTime(entry.time ?? new Date())}`,
    entry.event ? `event=${entry.event}` : null,
    entry.status ? `status=${entry.status}` : null,
    entry.activityId ? `activity=${entry.activityId}` : null,
    entry.runId ? `runId=${entry.runId}` : null,
    entry.lane ? `lane=${entry.lane}` : null,
    entry.runLevel ? `level=${entry.runLevel}` : null,
    entry.feature ? `feature=${shortLabel(entry.feature)}` : null,
    entry.manualCase ? `case=${shortLabel(entry.manualCase)}` : null,
    entry.scenario ? `scenario=${quoteValue(entry.scenario)}` : null,
    entry.spec ? `spec=${entry.spec}` : null,
    Number.isFinite(entry.retry) && entry.retry > 0 ? `retry=${entry.retry}` : null,
    Number.isFinite(entry.durationMs) ? `duration=${formatDuration(entry.durationMs)}` : null,
    Number.isFinite(entry.screenshots) ? `screenshots=${entry.screenshots}` : null,
    Number.isFinite(entry.videos) ? `videos=${entry.videos}` : null,
    Number.isFinite(entry.traces) ? `traces=${entry.traces}` : null,
    Number.isFinite(entry.completedScenarios)
      ? `completedScenarios=${entry.completedScenarios}`
      : null,
    Number.isFinite(entry.failedScenarios) ? `failedScenarios=${entry.failedScenarios}` : null,
    Number.isFinite(entry.flakyScenarios) ? `flakyScenarios=${entry.flakyScenarios}` : null,
    Number.isFinite(entry.skippedScenarios) ? `skippedScenarios=${entry.skippedScenarios}` : null,
    entry.note ? `note=${quoteValue(stripAnsi(entry.note))}` : null,
  ].filter(Boolean);

  return parts.join(' | ');
}

function trackerTitle(entry) {
  const status = humanStatus(entry.status);
  if (['scenario-complete', 'scenario-failed', 'scenario-status'].includes(entry.event)) {
    return `${status} — ${entry.scenario ?? 'scenario'}`;
  }
  if (entry.event === 'run-started') return `Run started — ${entry.lane ?? 'lane'}`;
  if (entry.event === 'run-resumed') return `Run resumed — ${entry.lane ?? 'lane'}`;
  if (entry.event === 'run-complete') return `Run complete — ${status}`;
  if (entry.event === 'run-blocked') return `Run blocked — ${status}`;
  if (entry.event === 'evidence-set-complete' || entry.event === 'evidence-attached') {
    return 'Evidence attached';
  }
  return `${status} — ${entry.event ?? 'event'}`;
}

function trackerDetailBlocks(entry) {
  return [
    detailBlock('Evidence', evidenceSummary(entry) ?? 'No uploaded artifacts'),
    traceSummary(entry) ? detailBlock('Traces', traceSummary(entry)) : null,
    Number.isFinite(entry.durationMs)
      ? detailBlock('Duration', formatDuration(entry.durationMs))
      : null,
    entry.feature ? detailBlock('Feature', shortLabel(entry.feature)) : null,
    entry.runId ? detailBlock('Run ID', entry.runId) : null,
    entry.lane ? detailBlock('Lane', entry.lane) : null,
    runCountSummary(entry) ? detailBlock('Counts', runCountSummary(entry)) : null,
    entry.note ? detailBlock('Note', stripAnsi(entry.note)) : null,
  ].filter(Boolean);
}

export function classifyScenario({ file = '', title = '', fallbackFeature, fallbackManualCase }) {
  const normalizedFile = file.replaceAll('\\', '/');
  const normalizedTitle = title.toLowerCase();

  if (normalizedFile.includes('/catalog/')) {
    return { feature: 'Explore catalog', manualCase: '14 Catalog and imports' };
  }
  if (normalizedFile.includes('/settings/')) {
    return { feature: 'Settings - billing and API keys', manualCase: '12 Quota and billing' };
  }
  if (normalizedFile.includes('/sync/')) {
    return { feature: 'Sync - mocked offline resilience', manualCase: '13 Sync and offline' };
  }
  if (normalizedFile.includes('/library/') || normalizedFile.includes('/ui/auth')) {
    return { feature: 'Library', manualCase: '2 Auth and library' };
  }
  if (normalizedFile.includes('/ui/open-book') || normalizedFile.includes('/activity/')) {
    return { feature: 'Smoke - auth and open book', manualCase: '2 Auth and library' };
  }
  if (normalizedFile.includes('/reader/')) {
    if (/deep link|reload|render|content|inline question/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '3 Reader routes, deep links, and render' };
    }
    if (/settings dialog|font|layout|color|behavior|language|custom/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '5a Settings dialog nested panels' };
    }
    if (/view options|speed reading|scrolled|paragraph|theme/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '5 View Options and reader modes' };
    }
    if (/footer|progress|page|section/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '6 Footer and reading controls' };
    }
    if (/sidebar|toc|notebook|book menu|search/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '9 Sidebar, book menu, search, and notebook' };
    }
    if (/annotation|selection|note|highlight/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '10 Selection popup and annotations' };
    }
    if (/header|bookmark|translation|quick action/.test(normalizedTitle)) {
      return { feature: 'Reader', manualCase: '4 Header and top-menu controls' };
    }
    return { feature: 'Reader', manualCase: fallbackManualCase ?? 'Reader' };
  }

  return {
    feature: fallbackFeature ?? 'All Chromium UI regression',
    manualCase: fallbackManualCase ?? null,
  };
}

function trackerValue(entry, key) {
  const quoted = entry.match(new RegExp(`${key}=("(?:[^"\\\\]|\\\\.)*")`));
  if (quoted?.[1]) {
    try {
      return JSON.parse(quoted[1]);
    } catch {
      return quoted[1].replace(/^"|"$/g, '');
    }
  }
  const plain = entry.match(new RegExp(`${key}=([^|]+)`));
  return plain?.[1]?.trim() ?? null;
}

async function findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath }) {
  const cacheKey = `${pageId}:${sectionPath}`;
  if (sectionCache.has(cacheKey)) return sectionCache.get(cacheKey);

  const path = String(sectionPath)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  let parentBlockId = pageId;

  for (const pathPart of path) {
    parentBlockId = await findOrCreateSectionBlockId({
      notionToken,
      pageId: parentBlockId,
      section: pathPart,
    });
  }

  sectionCache.set(cacheKey, parentBlockId);
  return parentBlockId;
}

async function findOrCreateSectionBlockId({ notionToken, pageId, section }) {
  const existing = await findSectionBlockId({ notionToken, pageId, section });
  if (existing) return existing;

  const created = await notionRequest({
    notionToken,
    path: `/v1/blocks/${pageId}/children`,
    method: 'PATCH',
    body: {
      children: [
        {
          object: 'block',
          type: 'toggle',
          toggle: { rich_text: [{ type: 'text', text: { content: section.slice(0, 1_900) } }] },
        },
      ],
    },
  });
  return created.results?.[0]?.id ?? pageId;
}

async function findSectionBlockId({ notionToken, pageId, section }) {
  const children = await readBlockChildren({ notionToken, blockId: pageId });
  const match = children.find(
    (block) => blockText(block) === String(section) && blockSupportsChildren(block),
  );
  return match?.id ?? null;
}

async function readBlockChildren({ notionToken, blockId }) {
  const children = [];
  let cursor = null;
  do {
    const query = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : '?page_size=100';
    const response = await notionRequest({
      notionToken,
      path: `/v1/blocks/${blockId}/children${query}`,
      method: 'GET',
    });
    children.push(...(response.results ?? []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return children;
}

async function readBlockChildrenDeep({ notionToken, blockId }) {
  const direct = await readBlockChildren({ notionToken, blockId });
  const nested = [];
  for (const child of direct) {
    nested.push(child);
    if (child.has_children && blockSupportsChildren(child)) {
      nested.push(...(await readBlockChildrenDeep({ notionToken, blockId: child.id })));
    }
  }
  return nested;
}

function blockText(block) {
  const value = block[block.type]?.rich_text ?? [];
  return value.map((part) => part.plain_text ?? '').join('');
}

function blockSupportsChildren(block) {
  return ['toggle', 'callout', 'column', 'column_list', 'synced_block', 'template'].includes(
    block.type,
  );
}

async function notionRequest({ notionToken, path, method, body }) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion request failed: ${method} ${path} ${res.status} ${text}`);
  }

  return res.json();
}

function calloutBlock(title, children, color) {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: richText(title, { bold: true }),
      color,
      children,
    },
  };
}

function detailBlock(label, value) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        ...richText(`${label}: `, { bold: true }),
        ...richText(String(value ?? '').slice(0, 1_800)),
      ],
    },
  };
}

function metadataToggleBlock(metadata) {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: richText('Automation metadata'),
      children: [
        {
          object: 'block',
          type: 'code',
          code: {
            language: 'plain text',
            rich_text: richText(metadata.slice(0, 1_900)),
          },
        },
      ],
    },
  };
}

function bulletedBlock(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: richText(String(text).slice(0, 1_900)),
    },
  };
}

function richText(content, annotations = {}) {
  return [
    {
      type: 'text',
      text: { content: String(content ?? '').slice(0, 1_900) },
      annotations,
    },
  ];
}

function statusColor(status) {
  if (status === 'passed') return 'green_background';
  if (['failed', 'timed-out', 'interrupted'].includes(status)) return 'red_background';
  if (status === 'flaky') return 'yellow_background';
  if (status === 'running') return 'blue_background';
  if (status === 'skipped') return 'gray_background';
  return 'default';
}

function humanStatus(status) {
  const value = String(status ?? 'status').replaceAll('-', ' ');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function evidenceSummary(entry) {
  const parts = [
    artifactCount(entry.screenshots, 'screenshot'),
    artifactCount(entry.videos, 'video'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function traceSummary(entry) {
  const count = artifactCount(entry.traces, 'trace');
  return count ? `${count} retained locally` : null;
}

function artifactCount(value, label) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function runCountSummary(entry) {
  const flaky = Number.isFinite(entry.flakyScenarios) ? entry.flakyScenarios : 0;
  const passed = Number.isFinite(entry.completedScenarios)
    ? Math.max(0, entry.completedScenarios - flaky)
    : null;
  const parts = [
    Number.isFinite(passed) ? `${passed} passed` : null,
    flaky > 0 ? `${flaky} flaky` : null,
    Number.isFinite(entry.failedScenarios) ? `${entry.failedScenarios} failed` : null,
    Number.isFinite(entry.skippedScenarios) && entry.skippedScenarios > 0
      ? `${entry.skippedScenarios} skipped`
      : null,
  ].filter(Boolean);
  return parts.join(', ');
}

function shortLabel(value) {
  return String(value ?? '')
    .replace(/^Feature:\s*/i, '')
    .replace(/^Manual case\s*/i, '')
    .trim();
}

function stripAnsi(value) {
  return String(value ?? '').replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function quoteValue(value) {
  return JSON.stringify(
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220),
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function formatTrackerTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}
