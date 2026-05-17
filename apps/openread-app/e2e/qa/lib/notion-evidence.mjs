import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import {
  activityPaths,
  ensureDir,
  evidenceFilename,
  readJsonIfExists,
  updateActivity,
} from './common.mjs';
import { contractIdsFromEvidenceValue, parseQaContract } from './contracts.mjs';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_DELETE_API_VERSION = '2025-09-03';
const NOTION_FILE_UPLOAD_VERSION = '2026-03-11';
const MAX_NOTION_UPLOAD_BYTES = 5 * 1024 * 1024;
const NOTION_UPLOAD_IMAGE_WIDTHS = [1600, 1400, 1200, 1000, 800];
const RETRYABLE_NOTION_STATUS = new Set([429, 500, 502, 503, 504]);

const DEFAULT_PLATFORM_ORDER = [
  ['web-chromium', 'Web — Chromium', 'Pending'],
  ['web-webkit', 'Web — WebKit', 'Pending'],
  ['web-edge', 'Web — Edge/Windows', 'Pending'],
  ['mobile-web-ios', 'Mobile Web — iOS', 'Pending'],
  ['mobile-web-android', 'Mobile Web — Android', 'Pending'],
  ['tauri-macos', 'Tauri — macOS', 'Pending'],
  ['native-android', 'Native — Android', 'Pending'],
  ['native-ios', 'Native — iOS', 'Pending'],
  ['tauri-windows', 'Tauri — Windows', 'Blocked'],
];

export async function ensureLightweightEvidencePage({ activity, reset = false, platforms = [] }) {
  if (activity.notionActivityPageId && !reset) return activity;

  const notionToken = notionTokenOrThrow();
  const databaseId = activityLogDatabaseIdOrThrow(activity.activityId);
  if (activity.notionActivityPageId && reset) {
    await trashNotionPage({ notionToken, pageId: activity.notionActivityPageId }).catch(() => null);
  }

  const platformRows = normalizePlatformRows(platforms);
  const now = new Date().toISOString();
  const page = await notionRequest({
    notionToken,
    path: '/v1/pages',
    method: 'POST',
    body: {
      parent: { database_id: databaseId },
      properties: {
        Title: titleProperty(
          `${activity.activityId} ${activity.title ?? 'QA'} — platform evidence`,
        ),
        'Activity ID': richTextProperty(activity.activityId),
        'Activity UUID': richTextProperty(activity.activityUuid ?? ''),
        Status: selectProperty('Validating'),
        'Current Stage': richTextProperty('Validation'),
        'Approval Status': selectProperty('Not Needed'),
        Platforms: { multi_select: platformRows.map(([id]) => ({ name: id })) },
        Branch: richTextProperty(gitBranch()),
        'Latest Attempt': richTextProperty('platform-evidence'),
        'Next Action': richTextProperty('Run and review one platform at a time.'),
        'Activity Created At': { date: { start: activity.createdAt ?? now } },
        'Last Synced At': { date: { start: now } },
      },
      children: [
        toggleBlock('Run Summary', [
          paragraphBlock(
            'Lightweight platform evidence page. One platform is run/uploaded at a time, then reviewed before moving on.',
          ),
          bulletedBlock('Format per platform: Status, Timing, Cells, Run, Evidence screenshots.'),
          bulletedBlock('Tauri Windows remains blocked until a Windows runner exists.'),
        ]),
        toggleBlock(
          'Platform Review Queue',
          platformRows.map(([id, label, status], index) =>
            bulletedBlock(`${index + 1}. ${label} (${id}) — ${status}`),
          ),
        ),
        toggleBlock(
          'Platforms',
          platformRows.map(([id, label, status]) =>
            toggleBlock(`${label} — ${id}`, [
              bulletedBlock(`Status: ${status}`),
              bulletedBlock('Timing: —'),
              bulletedBlock('Cells: —'),
              bulletedBlock('Run: —'),
              paragraphBlock(
                id === 'tauri-windows'
                  ? 'Blocked: Windows runner/host pending.'
                  : 'Evidence screenshots will be attached after this platform run passes.',
              ),
            ]),
          ),
        ),
        toggleBlock('Raw Artifacts', [
          paragraphBlock('Run artifacts are referenced in each platform section.'),
        ]),
      ],
    },
  });

  return updateActivity(activity, {
    status: 'in-progress',
    currentStage: 'validation',
    notionActivityPageId: page.id,
    notionActivityPageUrl: page.url,
  });
}

export async function updatePlatformStatus({ activity, platform, status, timingLine = '—' }) {
  if (!activity.notionActivityPageId) return { skipped: true, reason: 'no notion page' };
  const notionToken = notionTokenOrThrow();
  const platformBlock = await findPlatformBlock({
    notionToken,
    pageId: activity.notionActivityPageId,
    platform,
  });
  await replaceBlockChildren({
    notionToken,
    blockId: platformBlock.id,
    blocks: [
      bulletedBlock(`Status: ${status}`),
      bulletedBlock(`Timing: ${timingLine}`),
      bulletedBlock('Cells: —'),
      bulletedBlock('Run: —'),
      paragraphBlock('Platform run is in progress.'),
    ],
  });
  return { skipped: false, platformBlockId: platformBlock.id };
}

export async function publishPlatformEvidence({
  activity,
  platform,
  laneResult,
  expectedCurrentReport,
  coveragePath,
  screenshotLimit = 1000,
}) {
  if (!activity.notionActivityPageId) return { skipped: true, reason: 'no notion page' };

  const notionToken = notionTokenOrThrow();
  const platformBlock = await findPlatformBlock({
    notionToken,
    pageId: activity.notionActivityPageId,
    platform,
  });
  const coverage = coveragePath ? readJsonIfExists(coveragePath) : null;
  const contractDetails = contractDetailsMap(coverage);
  const cells = summarizeCells({ platform, laneResult, expectedCurrentReport, coverage });
  const screenshots = scenarioEvidenceScreenshots(expectedCurrentReport.scenarios ?? [])
    .sort(compareScenariosBySetId)
    .slice(0, Math.max(0, Number(screenshotLimit)));

  await replaceBlockChildren({
    notionToken,
    blockId: platformBlock.id,
    blocks: [
      bulletedBlock(`Status: ${platformEvidenceStatus({ laneResult, cells })}`),
      bulletedBlock(`Timing: ${timingLine(laneResult)}`),
      bulletedBlock(`Cells: ${formatCellsSummary(cells)}`),
      bulletedBlock(`Run: ${laneResult.attemptId}`),
      toggleBlock('Evidence screenshots', []),
    ],
  });

  const evidenceBlock = (await children({ notionToken, blockId: platformBlock.id })).find(
    (block) => blockText(block) === 'Evidence screenshots',
  );
  if (!evidenceBlock)
    throw new Error(`Could not find Evidence screenshots block for ${platform.id}`);

  const groupedScreenshots = groupEvidenceScreenshots({ screenshots, contractDetails });
  const uploads = [];
  for (const group of groupedScreenshots) {
    const groupUploads = [];
    for (const scenario of group.scenarios) {
      const upload = await uploadFile({ notionToken, filePath: scenario.screenshotPath });
      groupUploads.push({ scenario, upload });
      uploads.push({
        scenarioId: scenario.scenarioId,
        groupId: group.id,
        screenshotName: scenario.screenshotName,
        screenshotPath: scenario.screenshotPath,
        uploadId: upload.id,
      });
    }

    await appendBlockChildren({
      notionToken,
      blockId: evidenceBlock.id,
      blocks: [
        toggleBlock(
          `${group.id} — ${group.title}`,
          groupEvidenceTreeBlocks({
            group,
            contractDetails,
            platform,
            laneResult,
            uploads: groupUploads,
          }),
        ),
      ],
    });
  }

  return {
    skipped: false,
    platformBlockId: platformBlock.id,
    cells,
    screenshots: {
      uploaded: uploads.length,
      available: screenshots.length,
      groups: groupedScreenshots.length,
    },
    uploads,
  };
}

export async function gcNotionEvidence({ activityIds = [], pageIds = [], execute = false }) {
  const pages = [...new Set([...pageIds, ...activityIds.flatMap(activityPageIds)])].filter(Boolean);
  if (!pages.length) return { result: 'skipped', pages: [] };
  const notionToken = notionTokenOrThrow();
  const results = [];
  for (const pageId of pages) {
    if (!execute) {
      results.push({ pageId, action: 'would-trash' });
      continue;
    }
    const trashed = await trashNotionPage({ notionToken, pageId });
    results.push({ pageId, action: 'trashed', result: trashed.id ? 'passed' : 'unknown' });
  }
  return { result: execute ? 'passed' : 'dry-run', pages: results };
}

async function findPlatformBlock({ notionToken, pageId, platform }) {
  const top = await children({ notionToken, blockId: pageId });
  const platforms = top.find((block) => blockText(block) === 'Platforms');
  if (!platforms) throw new Error('Notion page is missing Platforms section.');
  const platformBlocks = await children({ notionToken, blockId: platforms.id });
  const existing = platformBlocks.find((block) => blockText(block).includes(`— ${platform.id}`));
  if (existing) return existing;
  const created = await appendBlockChildren({
    notionToken,
    blockId: platforms.id,
    blocks: [toggleBlock(`${platform.label ?? platform.id} — ${platform.id}`, [])],
  });
  return created.results?.[0];
}

function scenarioEvidenceScreenshots(scenarios) {
  return scenarios.flatMap((scenario) => {
    const attachments = Array.isArray(scenario.evidenceAttachments)
      ? scenario.evidenceAttachments.filter(
          (attachment) => attachment.path && existsSync(attachment.path),
        )
      : [];
    if (attachments.length) {
      return attachments.map((attachment) => ({
        ...scenario,
        screenshotPath: attachment.path,
        screenshotName: attachment.name,
        screenshotKind: 'scenario-evidence',
        evidenceAttachments: [attachment],
      }));
    }

    if (
      scenario.screenshotKind === 'scenario-evidence' &&
      scenario.screenshotPath &&
      existsSync(scenario.screenshotPath)
    ) {
      return [scenario];
    }
    return [];
  });
}

function groupEvidenceScreenshots({ screenshots, contractDetails }) {
  const groups = new Map();
  for (const scenario of screenshots) {
    const ids = scenarioGroupIds(scenario);
    for (const id of ids.length ? ids : ['scenario']) {
      const existing = groups.get(id) ?? {
        id,
        title: contractDetails.get(id)?.title ?? scenarioTitle({ scenario, contractDetails }),
        scenarios: [],
      };
      existing.scenarios.push(scenario);
      groups.set(id, existing);
    }
  }
  return [...groups.values()].sort(
    (left, right) =>
      setIdSortKey(left.id) - setIdSortKey(right.id) || left.id.localeCompare(right.id),
  );
}

function scenarioGroupIds(scenario) {
  const attachmentNames = Array.isArray(scenario.evidenceAttachments)
    ? scenario.evidenceAttachments.map((attachment) => attachment.name).join(' ')
    : '';
  const evidenceIds = contractIdsFromEvidenceValue(
    `${scenario.screenshotName ?? ''} ${attachmentNames}`,
  );
  return evidenceIds.length ? [...new Set(evidenceIds)] : scenarioIds(scenario);
}

function setIdSortKey(id) {
  const value = Number(String(id).split('-').at(-1));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function summarizeCells({ platform, laneResult, expectedCurrentReport, coverage }) {
  const coverageCells = coverage
    ? requiredCellsForPlatform({ coverage, platformId: platform.id })
    : [];
  if (coverageCells.length) {
    const matched = coverageCells.filter((cell) => cell.verdict === 'matched').length;
    const open = coverageCells.filter((cell) => cell.closureStatus !== 'closed').length;
    const slotGaps = coverageCells.filter(
      (cell) => (cell.slotAudit?.counts?.missingRequired ?? 0) > 0,
    ).length;
    return {
      required: coverageCells.length,
      matched,
      open,
      blocked: coverageCells.filter((cell) => cell.verdict === 'blocked-adapter').length,
      slotGaps,
      visualProofAlarms: coverageCells.filter((cell) => (cell.visualProof?.alarms?.length ?? 0) > 0)
        .length,
      visualProofWarnings: coverageCells.filter(
        (cell) => (cell.visualProof?.warnings?.length ?? 0) > 0,
      ).length,
      totalScenarios: expectedCurrentReport.summary?.total ?? laneResult.scenarioCount ?? 0,
      source: coverage.strictSlots ? 'strict-coverage+slots' : 'strict-coverage',
    };
  }

  const passedIds = new Set(
    (expectedCurrentReport.scenarios ?? [])
      .filter(
        (scenario) =>
          scenario.status === 'passed' &&
          scenario.consistency === 'matched' &&
          !scenario.evidenceGap,
      )
      .flatMap(scenarioIds),
  );
  const requiredIds = [...new Set((expectedCurrentReport.scenarios ?? []).flatMap(scenarioIds))];
  const matched = requiredIds.filter((id) => passedIds.has(id)).length;
  return {
    required: requiredIds.length,
    matched,
    open: Math.max(0, requiredIds.length - matched),
    blocked: 0,
    visualProofAlarms: 0,
    visualProofWarnings: 0,
    totalScenarios: expectedCurrentReport.summary?.total ?? laneResult.scenarioCount ?? 0,
    source: 'expected-current-report',
  };
}

function requiredCellsForPlatform({ coverage, platformId }) {
  const aliases = platformId === 'web-edge' ? ['web-edge', 'web-edge-windows'] : [platformId];
  return (coverage.matrix ?? [])
    .map((scenario) =>
      (scenario.platforms ?? []).find(
        (item) => aliases.includes(item.id) || aliases.includes(item.qaPlatformId),
      ),
    )
    .filter((cell) => cell?.requirement === 'Required');
}

function scenarioIds(scenario) {
  const attachmentNames = Array.isArray(scenario.evidenceAttachments)
    ? scenario.evidenceAttachments.map((attachment) => attachment.name).join(' ')
    : '';
  return [
    ...new Set(
      contractIdsFromEvidenceValue(
        `${scenario.scenarioId ?? ''} ${scenario.title ?? ''} ${scenario.screenshotName ?? ''} ${attachmentNames}`,
      ),
    ),
  ];
}

function compareScenariosBySetId(left, right) {
  return (
    scenarioSortKey(left) - scenarioSortKey(right) || String(left.title).localeCompare(right.title)
  );
}

function scenarioSortKey(scenario) {
  const ids = scenarioIds(scenario).map((id) => Number(id.split('-').at(-1)));
  return ids.length ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
}

function contractDetailsMap(coverage) {
  const details = new Map(parseQaContract().map((scenario) => [scenario.scenarioId, scenario]));
  for (const scenario of coverage?.matrix ?? []) {
    details.set(scenario.scenarioId, { ...(details.get(scenario.scenarioId) ?? {}), ...scenario });
  }
  return details;
}

function scenarioTitle({ scenario, contractDetails }) {
  const ids = scenarioIds(scenario);
  const titles = ids
    .map((id) => contractDetails.get(id))
    .filter(Boolean)
    .map((contract) => contract.title);
  return compact(titles.join(' / ') || scenario.title, 160);
}

function groupEvidenceTreeBlocks({ group, contractDetails, platform, laneResult, uploads }) {
  const contracts = [contractDetails.get(group.id)].filter(Boolean);
  const scenario = group.scenarios[0];
  return [
    toggleBlockRich('Expected', 'yellow_background', expectedTreeBlocks({ scenario, contracts })),
    toggleBlockRich(
      'Current',
      'green_background',
      groupCurrentTreeBlocks({ group, contracts, platform, laneResult }),
    ),
    sectionHeading('Evidence screenshots'),
    ...uploads.flatMap(({ scenario: uploadScenario, upload }) => [
      labeledBulletedBlock('Screenshot', uploadScenario.screenshotName ?? 'attached'),
      imageBlock(
        upload,
        `${platform.id} · ${group.id} · ${uploadScenario.screenshotName ?? 'evidence'} · ${laneResult.attemptId}`,
      ),
    ]),
  ];
}

function expectedTreeBlocks({ scenario, contracts }) {
  if (!contracts.length) return [bulletedBlock(compact(scenario.expected, 1800))];
  return contracts.flatMap((contract) => [
    ...(contracts.length > 1 ? [sectionHeading(`${contract.scenarioId} — ${contract.title}`)] : []),
    ...expectedContractBlocks(contract),
  ]);
}

function expectedContractBlocks(contract) {
  const setupBlocks = [
    contract.scenarioOverview ? labeledBulletedBlock('Overview', contract.scenarioOverview) : null,
    contract.preconditions ? labeledBulletedBlock('Preconditions', contract.preconditions) : null,
    contract.startState ? labeledBulletedBlock('Start state', contract.startState) : null,
  ].filter(Boolean);
  const terminalBlocks = terminalStateBlocks(contract.terminalStates);
  const assertions = contract.assertionsEvidenceItems?.length
    ? contract.assertionsEvidenceItems
    : contract.assertionsEvidence
      ? [contract.assertionsEvidence]
      : [];
  const assertionBlocks = assertions.map((item) => labeledBulletedBlock('Assertion', item));
  const screenshotBlocks = (contract.evidenceSlots ?? []).map((slot) =>
    labeledBulletedBlock('Screenshot slot', slot),
  );

  const blocks = [
    ...sectionBlocks('Contract setup', setupBlocks),
    ...sectionBlocks('Terminal states', terminalBlocks),
    ...sectionBlocks('Assertions / evidence', assertionBlocks),
    ...sectionBlocks('Screenshot evidence', screenshotBlocks),
  ];
  return blocks.length ? blocks : [bulletedBlock(`${contract.scenarioId} — ${contract.title}`)];
}

function terminalStateBlocks(value) {
  const states = parseTerminalStates(value);
  if (states.length > 1) {
    return states.map((state) => labeledBulletedBlock(`Terminal ${state.label}`, state.value));
  }
  return value ? [labeledBulletedBlock('Terminal states', value)] : [];
}

function parseTerminalStates(value) {
  return String(value ?? '')
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([^=]+?)\s*=\s*(.+)$/);
      return match ? { label: match[1].trim(), value: match[2].trim() } : null;
    })
    .filter(Boolean);
}

function sectionBlocks(title, blocks) {
  return blocks.length ? [sectionHeading(title), ...blocks] : [];
}

function groupCurrentTreeBlocks({ group, contracts, platform, laneResult }) {
  const primary = group.scenarios[0] ?? {};
  const platformCell = currentPlatformCell({ contracts, platform });
  const runBlocks = [
    labeledBulletedBlock('Platform', platform.label ?? platform.id),
    labeledBulletedBlock('Verdict', primary.consistency ?? '—'),
    labeledBulletedBlock('Status', primary.status ?? '—'),
    labeledBulletedBlock('Run', laneResult.attemptId),
    labeledBulletedBlock('Evidence count', `${group.scenarios.length} screenshot slot(s)`),
  ];
  const observedBlocks = observedTerminalStates(contracts).map((item) =>
    labeledBulletedBlock('Observed terminal state', item),
  );
  const summaryBlocks = [
    labeledBulletedBlock('Evidence summary', currentSummary(primary)),
    ...visualProofBlocks(platformCell),
    ...evidenceArtifactBlocks(primary),
    ...group.scenarios.map((scenario) =>
      labeledBulletedBlock('Screenshot', scenario.screenshotName ?? 'attached'),
    ),
  ];
  return [
    ...sectionBlocks('Run metadata', runBlocks),
    ...sectionBlocks('Observed outcome', observedBlocks),
    ...sectionBlocks('Evidence summary', summaryBlocks),
  ];
}

function currentPlatformCell({ contracts, platform }) {
  return contracts
    .flatMap((contract) => contract.platforms ?? [])
    .find(
      (cell) =>
        cell.id === platform.id ||
        cell.qaPlatformId === platform.id ||
        (platform.id === 'web-edge' && cell.id === 'web-edge-windows'),
    );
}

function visualProofBlocks(cell) {
  const alarms = cell?.visualProof?.alarms ?? [];
  const warnings = cell?.visualProof?.warnings ?? [];
  if (!alarms.length && !warnings.length) return [];
  return [
    ...alarms.flatMap((alarm) => [
      labeledBulletedBlock('Visual proof explicit deny', `${alarm.code}: ${alarm.message}`),
      labeledBulletedBlock('Required fix', alarm.requestedFix),
    ]),
    ...warnings.flatMap((warning) => [
      labeledBulletedBlock('Visual proof advisory', `${warning.code}: ${warning.message}`),
      labeledBulletedBlock('Suggested follow-up', warning.requestedFix),
    ]),
  ];
}

function evidenceArtifactBlocks(scenario) {
  const artifacts = scenario?.evidenceArtifacts ?? [];
  if (!artifacts.length) return [];
  return artifacts.map((artifact) =>
    labeledBulletedBlock(
      'Evidence artifact',
      [artifact.name, artifact.contentType, artifact.path ? basename(artifact.path) : null]
        .filter(Boolean)
        .join(' · '),
    ),
  );
}

function observedTerminalStates(contracts) {
  return contracts
    .map((contract) => {
      const success = parseTerminalStates(contract.terminalStates).find(
        (state) => state.label.toLowerCase() === 'success',
      );
      return success ? `${contract.scenarioId}: ${success.value}` : null;
    })
    .filter(Boolean);
}

function currentSummary(scenario) {
  const current = compact(scenario.current, 1800);
  if (scenario.status === 'passed' && scenario.consistency === 'matched') {
    if (current && !/matched the documented Settings baseline/i.test(current)) return current;
    return scenario.screenshotKind === 'scenario-evidence'
      ? 'Matched documented Settings baseline; scenario evidence screenshot attached.'
      : 'Matched documented Settings baseline.';
  }
  return current;
}

async function replaceBlockChildren({ notionToken, blockId, blocks }) {
  for (const child of await children({ notionToken, blockId })) {
    if (child.archived || child.in_trash) continue;
    await notionRequest({
      notionToken,
      path: `/v1/blocks/${child.id}`,
      method: 'PATCH',
      body: { archived: true },
    });
  }
  return appendBlockChildren({ notionToken, blockId, blocks });
}

async function appendBlockChildren({ notionToken, blockId, blocks }) {
  return notionRequest({
    notionToken,
    path: `/v1/blocks/${blockId}/children`,
    method: 'PATCH',
    body: { children: blocks },
  });
}

async function children({ notionToken, blockId }) {
  const results = [];
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
    results.push(...(response.results ?? []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

async function uploadFile({ notionToken, filePath }) {
  const uploadPath = prepareNotionUploadFile(filePath);
  const stat = statSync(uploadPath);
  if (stat.size > MAX_NOTION_UPLOAD_BYTES) {
    throw new Error(
      `Prepared Notion upload still exceeds 5 MiB: ${uploadPath} (${formatBytes(stat.size)})`,
    );
  }
  const contentType = inferContentType(uploadPath);
  const filename = evidenceFilename(uploadPath);
  const created = await notionRequest({
    notionToken,
    path: '/v1/file_uploads',
    method: 'POST',
    version: NOTION_FILE_UPLOAD_VERSION,
    body: { mode: 'single_part', filename, content_type: contentType },
  });
  const formData = new FormData();
  formData.append('file', new Blob([readFileSync(uploadPath)], { type: contentType }), filename);
  const sent = await notionFormRequest({
    notionToken,
    path: `/v1/file_uploads/${created.id}/send`,
    method: 'POST',
    body: formData,
  });
  return {
    ...sent,
    sourcePath: uploadPath,
    originalSourcePath: filePath,
    contentType,
    contentLength: stat.size,
  };
}

function prepareNotionUploadFile(filePath) {
  const stat = statSync(filePath);
  if (stat.size <= MAX_NOTION_UPLOAD_BYTES || !isCompressibleImage(filePath)) return filePath;
  const outputDir = join(dirname(filePath), '.notion-upload');
  ensureDir(outputDir);

  let lastError = null;
  for (const width of NOTION_UPLOAD_IMAGE_WIDTHS) {
    const outputPath = join(outputDir, `${basename(filePath, extname(filePath))}-w${width}.jpg`);
    if (existsSync(outputPath) && statSync(outputPath).size <= MAX_NOTION_UPLOAD_BYTES) {
      return outputPath;
    }
    const result = spawnSync(
      'sips',
      [
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '65',
        '--resampleWidth',
        String(width),
        filePath,
        '--out',
        outputPath,
      ],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      lastError = result.stderr || result.stdout || `sips exited ${result.status}`;
      continue;
    }
    if (existsSync(outputPath) && statSync(outputPath).size <= MAX_NOTION_UPLOAD_BYTES) {
      return outputPath;
    }
    lastError = `${outputPath} is ${formatBytes(existsSync(outputPath) ? statSync(outputPath).size : 0)}`;
  }

  throw new Error(
    `Could not prepare ${filePath} for Notion 5 MiB upload limit${lastError ? `: ${lastError}` : ''}`,
  );
}

function isCompressibleImage(filePath) {
  return ['.png', '.jpg', '.jpeg'].includes(extname(filePath).toLowerCase());
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(3)} MiB`;
}

async function trashNotionPage({ notionToken, pageId }) {
  const result = await notionRequest({
    notionToken,
    path: `/v1/pages/${pageId}`,
    method: 'PATCH',
    version: NOTION_DELETE_API_VERSION,
    body: { in_trash: true },
  }).catch(async (error) => {
    if (!String(error.message).includes('archived')) throw error;
    await notionRequest({
      notionToken,
      path: `/v1/pages/${pageId}`,
      method: 'PATCH',
      version: NOTION_DELETE_API_VERSION,
      body: { archived: false, in_trash: false },
    });
    return notionRequest({
      notionToken,
      path: `/v1/pages/${pageId}`,
      method: 'PATCH',
      version: NOTION_DELETE_API_VERSION,
      body: { in_trash: true },
    });
  });
  return result;
}

async function notionRequest({ notionToken, path, method, body, version = NOTION_API_VERSION }) {
  return notionFetchWithRetry({
    notionToken,
    path,
    method,
    headers: { 'Content-Type': 'application/json', 'Notion-Version': version },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function notionFormRequest({ notionToken, path, method, body }) {
  return notionFetchWithRetry({
    notionToken,
    path,
    method,
    headers: { 'Notion-Version': NOTION_FILE_UPLOAD_VERSION },
    body,
  });
}

async function notionFetchWithRetry({ notionToken, path, method, headers, body }) {
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`https://api.notion.com${path}`, {
        method,
        headers: { Authorization: `Bearer ${notionToken}`, ...headers },
        body,
      });
      return await parseNotionResponse(response, method, path);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryableNotionError(error)) throw error;
      await sleep(500 * attempt ** 2);
    }
  }
  throw lastError;
}

async function parseNotionResponse(response, method, path) {
  const text = await response.text();
  const json = parseNotionJson({ text, response, method, path });
  if (!response.ok) {
    const error = new Error(
      `Notion ${method} ${path} failed ${response.status}: ${text.slice(0, 500)}`,
    );
    error.responseStatus = response.status;
    throw error;
  }
  return json;
}

function parseNotionJson({ text, response, method, path }) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(
      `Notion ${method} ${path} returned non-JSON ${response.status}: ${text.slice(0, 500)}`,
    );
    error.responseStatus = response.status;
    throw error;
  }
}

function isRetryableNotionError(error) {
  return (
    RETRYABLE_NOTION_STATUS.has(error.responseStatus) ||
    String(error.message ?? '').includes('returned non-JSON')
  );
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function normalizePlatformRows(platforms) {
  const explicit = platforms.map((platform) => [
    platform.id,
    labelForPlatform(platform.id, platform.label),
    'Pending',
  ]);
  return explicit.length ? explicit : DEFAULT_PLATFORM_ORDER;
}

function labelForPlatform(id, fallback) {
  return (
    new Map(DEFAULT_PLATFORM_ORDER.map(([platformId, label]) => [platformId, label])).get(id) ??
    fallback ??
    id
  );
}

function formatCellsSummary(cells) {
  const blocked = cells.blocked ? `, ${cells.blocked} blocked` : '';
  const slotGaps = cells.slotGaps ? `, ${cells.slotGaps} slot gaps` : '';
  const visualProofDeny = cells.visualProofAlarms
    ? `, ${cells.visualProofAlarms} visual proof explicit denies`
    : '';
  const visualProofAdvice = cells.visualProofWarnings
    ? `, ${cells.visualProofWarnings} visual proof advisories`
    : '';
  return `${cells.matched}/${cells.required} matched, ${cells.open} open${blocked}${slotGaps}${visualProofDeny}${visualProofAdvice} (${cells.source})`;
}

function platformEvidenceStatus({ laneResult, cells }) {
  if (laneResult.result !== 'passed') return 'Failed';
  if (cells.open > 0) return 'Needs Changes';
  return 'Passed';
}

function timingLine(laneResult) {
  return `${formatTime(laneResult.startedAt ?? laneResult.createdAt)} → ${formatTime(laneResult.finishedAt)} · ${formatDuration(laneResult.durationMs)}`;
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().replace('T', ' ').slice(0, 16);
}

function formatDuration(ms) {
  const duration = Number(ms);
  if (!Number.isFinite(duration)) return '—';
  const seconds = Math.round(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function blockText(block) {
  return (block?.[block.type]?.rich_text ?? []).map((part) => part.plain_text ?? '').join('');
}

function activityPageIds(activityId) {
  const activity = readJsonIfExists(activityPaths(activityId).activityPath);
  return activity?.notionActivityPageId ? [activity.notionActivityPageId] : [];
}

function titleProperty(text) {
  return { title: richText(text) };
}

function richTextProperty(text) {
  return { rich_text: richText(text) };
}

function selectProperty(name) {
  return { select: { name } };
}

function paragraphBlock(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } };
}

function labeledBulletedBlock(label, text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [richTextPart(`${label}: `, { bold: true }), richTextPart(compact(text, 1800))],
    },
  };
}

function bulletedBlock(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function sectionHeading(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [richTextPart(text, { bold: true })] },
  };
}

function toggleBlock(text, children = []) {
  return { object: 'block', type: 'toggle', toggle: { rich_text: richText(text), children } };
}

function toggleBlockRich(text, color, children = []) {
  return {
    object: 'block',
    type: 'toggle',
    toggle: { rich_text: [richTextPart(text, { bold: true, color })], children },
  };
}

function imageBlock(upload, caption) {
  return {
    object: 'block',
    type: 'image',
    image: { type: 'file_upload', file_upload: { id: upload.id }, caption: richText(caption) },
  };
}

function richText(text) {
  return [richTextPart(text)];
}

function richTextPart(text, annotations = {}) {
  return {
    type: 'text',
    text: { content: String(text ?? '').slice(0, 1900) },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
      ...annotations,
    },
  };
}

function inferContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function compact(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function gitBranch() {
  return process.env.GIT_BRANCH ?? '';
}

function notionTokenOrThrow() {
  const credential = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY;
  if (!credential) throw new Error('NOTION_TOKEN or NOTION_API_KEY is required.');
  return credential;
}

function activityLogDatabaseIdOrThrow(activityId) {
  const config = readJsonIfExists(
    `${activityPaths(activityId).artifactRoot}/notion-activity-log.json`,
  );
  const databaseId =
    process.env.OPENREAD_NOTION_ACTIVITY_LOG_DATABASE ?? config?.activityLogDatabaseId;
  if (!databaseId) throw new Error('OPENREAD_NOTION_ACTIVITY_LOG_DATABASE is required.');
  return databaseId;
}
