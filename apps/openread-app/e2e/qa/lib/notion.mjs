import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { activityPaths, evidenceFilename, readJsonIfExists, updateActivity } from './common.mjs';
import {
  bulleted,
  evidenceSectionPath,
  expectedCurrentBlocks,
  headingBlock,
  scenarioEvidenceBlockTitle,
  qaRunTemplateBlocks,
  rawArtifactBlocks,
  runSummaryBlocks,
  sectionToggleBlock,
} from '../templates/qa-run.mjs';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_FILE_UPLOAD_VERSION = '2026-03-11';
const MAX_NOTION_UPLOAD_BYTES = 18 * 1024 * 1024;
const RETRYABLE_NOTION_STATUS = new Set([429, 500, 502, 503, 504]);

export async function ensureQaRunNotionPage({ activity, localOnly = false }) {
  if (localOnly) return { activity, pageId: null, pageUrl: null, skipped: true };

  const notionToken = notionTokenOrThrow();
  const databaseId = activityLogDatabaseIdOrThrow(activity.activityId);
  const existing = activity.notionActivityPageId
    ? await getPage({ notionToken, pageId: activity.notionActivityPageId }).catch(() => null)
    : await findActivityPage({ notionToken, databaseId, activityId: activity.activityId });

  const git = activity.latestQaRun?.git ?? {};
  const properties = activityPageProperties({ activity, git });
  const page = existing
    ? await notionRequest({
        notionToken,
        path: `/v1/pages/${existing.id}`,
        method: 'PATCH',
        body: { properties },
      })
    : await notionRequest({
        notionToken,
        path: '/v1/pages',
        method: 'POST',
        body: {
          parent: { database_id: databaseId },
          properties,
          children: qaRunTemplateBlocks({
            activityId: activity.activityId,
            title: activity.title,
            branch: git.branch,
            commit: git.commit,
            createdAt: activity.createdAt,
          }),
        },
      });

  await ensureQaRunPageShape({ notionToken, pageId: page.id });
  const nextActivity = updateActivity(activity, {
    template: 'qa-run',
    templateVersion: 2,
    notionActivityPageId: page.id,
    notionActivityPageUrl: page.url,
  });

  return { activity: nextActivity, pageId: page.id, pageUrl: page.url, skipped: false };
}

export async function appendRunEvidence({
  activity,
  laneResult,
  stdout,
  stderr,
  localOnly = false,
  limits,
}) {
  if (localOnly) return { skipped: true };
  if (!activity.notionActivityPageId)
    throw new Error('No Notion page ID on activity; run ensure first.');

  const notionToken = notionTokenOrThrow();
  const pageId = activity.notionActivityPageId;

  await appendBlocks({
    notionToken,
    pageId,
    sectionPath: 'Run Summary',
    blocks: runSummaryBlocks({
      targetName: laneResult.targetName,
      lane: laneResult.lane,
      platform: laneResult.platform,
      project: laneResult.project,
      result: laneResult.result,
      command: laneResult.command,
      specs: laneResult.specs,
      grep: laneResult.grep,
      durationMs: laneResult.durationMs,
      screenshotCount: laneResult.screenshotCount,
      traceCount: laneResult.traceCount,
      videoCount: laneResult.videoCount,
      commit: laneResult.git?.commit,
      artifactDir: laneResult.artifactDir,
    }),
  });

  await appendBlocks({
    notionToken,
    pageId,
    sectionPath: 'Raw Artifacts',
    blocks: rawArtifactBlocks({ laneResult, stdout, stderr }),
  });

  const expectedCurrentSectionPath = evidenceSectionPath({
    platform: laneResult.platform,
    lane: laneResult.lane,
    section: 'Evidence expected vs current outcomes',
  });
  await appendBlocks({
    notionToken,
    pageId,
    sectionPath: expectedCurrentSectionPath,
    blocks: expectedCurrentBlocks({ laneResult }),
  });

  const uploads = [];
  uploads.push(
    await appendScenarioScreenshots({
      notionToken,
      pageId,
      sectionPath: expectedCurrentSectionPath,
      laneResult,
      limit: limits.screenshots,
    }),
  );
  uploads.push(
    await appendFiles({
      notionToken,
      pageId,
      sectionPath: evidenceSectionPath({
        platform: laneResult.platform,
        lane: laneResult.lane,
        section: 'Evidence traces',
      }),
      heading: `${laneResult.platform?.id ?? 'platform'} · ${laneResult.attemptId}: traces`,
      files: laneResult.traces,
      limit: limits.traces,
    }),
  );
  uploads.push(
    await appendFiles({
      notionToken,
      pageId,
      sectionPath: evidenceSectionPath({
        platform: laneResult.platform,
        lane: laneResult.lane,
        section: 'Evidence videos',
      }),
      heading: `${laneResult.platform?.id ?? 'platform'} · ${laneResult.attemptId}: videos`,
      files: laneResult.videos,
      limit: limits.videos,
    }),
  );

  const verification = await verifyQaRunNotionPage({ activity, requireEvidence: true });
  return { skipped: false, uploads, verification };
}

export async function verifyQaRunNotionPage({ activity, requireEvidence = false }) {
  if (!activity.notionActivityPageId) {
    return { result: 'failed', reason: 'activity has no notionActivityPageId' };
  }

  const notionToken = notionTokenOrThrow();
  const pageId = activity.notionActivityPageId;
  const top = await children({ notionToken, blockId: pageId });
  const topSections = top.map(blockText).filter(Boolean);
  const hasRequired = ['Run Summary', 'Platforms', 'Raw Artifacts'].every((section) =>
    topSections.includes(section),
  );

  const platforms = top.find((block) => blockText(block) === 'Platforms');
  const platformChildren = platforms ? await children({ notionToken, blockId: platforms.id }) : [];
  const legacyChromium = top.find((block) => blockText(block) === 'Chromium');
  const legacyChildren = legacyChromium
    ? await children({ notionToken, blockId: legacyChromium.id })
    : [];
  const evidenceRootChildren = [...platformChildren, ...legacyChildren];
  const featureCount = await countFeatureBlocks({ notionToken, blocks: evidenceRootChildren });
  const evidenceCount = await countEvidenceBlocks({ notionToken, blocks: evidenceRootChildren });

  const passed = hasRequired && (!requireEvidence || evidenceCount > 0);
  return {
    result: passed ? 'passed' : 'failed',
    pageId,
    pageUrl: activity.notionActivityPageUrl,
    topSections,
    featureCount,
    evidenceCount,
  };
}

async function ensureQaRunPageShape({ notionToken, pageId }) {
  for (const section of ['Run Summary', 'Platforms', 'Raw Artifacts']) {
    await findOrCreateSectionBlockId({ notionToken, pageId, section });
  }
}

async function appendBlocks({ notionToken, pageId, sectionPath, blocks }) {
  if (!blocks.length) return null;
  const blockId = await findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath });
  return appendBlockChildren({ notionToken, blockId, blocks });
}

async function appendBlockChildren({ notionToken, blockId, blocks, after = null }) {
  if (!blocks.length) return null;
  const responses = [];
  let afterBlockId = after;
  for (let index = 0; index < blocks.length; index += 80) {
    const body = { children: blocks.slice(index, index + 80) };
    if (afterBlockId) body.after = afterBlockId;
    const response = await notionRequest({
      notionToken,
      path: `/v1/blocks/${blockId}/children`,
      method: 'PATCH',
      body,
    });
    responses.push(response);
    afterBlockId = response.results?.at(-1)?.id ?? afterBlockId;
  }
  return responses.at(-1) ?? null;
}

async function appendScenarioScreenshots({
  notionToken,
  pageId,
  sectionPath,
  laneResult,
  limit = 1000,
}) {
  const report = laneResult.expectedCurrentReport;
  const scenarios = (report?.scenarios ?? []).filter(
    (scenario) =>
      scenario.screenshotKind === 'scenario-evidence' &&
      scenario.screenshotPath &&
      existsSync(scenario.screenshotPath),
  );
  const selected = scenarios.slice(0, Math.max(0, limit));
  if (!selected.length) {
    return { sectionPath, uploaded: 0, total: scenarios.length, kind: 'scenario-screenshots' };
  }

  const sectionBlockId = await findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath });
  const sectionChildren = await children({ notionToken, blockId: sectionBlockId });
  const headingIndex = findLastIndex(sectionChildren, (block) =>
    blockText(block).includes(`${laneResult.attemptId}: expected vs current`),
  );
  const runBlocks = headingIndex >= 0 ? sectionChildren.slice(headingIndex + 1) : sectionChildren;
  const nextRunIndex = runBlocks.findIndex(
    (block) => block.type === 'heading_3' && blockText(block).includes(': expected vs current'),
  );
  const scopedBlocks = nextRunIndex >= 0 ? runBlocks.slice(0, nextRunIndex) : runBlocks;

  const uploaded = [];
  const failedUploads = [];
  const skippedTooLarge = [];
  for (const scenario of selected) {
    const filePath = scenario.screenshotPath;
    const fileSize = statSync(filePath).size;
    if (fileSize > MAX_NOTION_UPLOAD_BYTES) {
      skippedTooLarge.push(filePath);
      continue;
    }

    const scenarioBlock = findScenarioEvidenceBlock(scopedBlocks, scenario);
    if (!scenarioBlock) {
      failedUploads.push({ filePath, error: `Scenario block not found: ${scenario.title}` });
      continue;
    }

    try {
      const upload = await uploadFile({ notionToken, filePath });
      const block = uploadBlock(upload, `Screenshot · ${scenario.title}`);
      if (scenarioBlock.type === 'toggle') {
        await appendBlockChildren({ notionToken, blockId: scenarioBlock.id, blocks: [block] });
      } else {
        await appendBlockChildren({
          notionToken,
          blockId: sectionBlockId,
          blocks: [block],
          after: scenarioBlock.id,
        });
      }
      uploaded.push(filePath);
    } catch (error) {
      failedUploads.push({ filePath, error: error.message });
    }
  }

  return {
    sectionPath,
    uploaded: uploaded.length,
    total: scenarios.length,
    kind: 'scenario-screenshots',
    skippedTooLarge: skippedTooLarge.length,
    failedUploads,
  };
}

function findScenarioEvidenceBlock(blocks, scenario) {
  const toggleTitle = scenarioEvidenceBlockTitle(scenario);
  return blocks.find((block) => {
    const text = blockText(block);
    if (block.type === 'toggle' && text === toggleTitle) return true;
    if (block.type !== 'code') return false;
    const caption = block.code?.caption?.map((part) => part.plain_text ?? '').join('') ?? '';
    return caption === scenario.title || text.includes(`Scenario: ${scenario.title}`);
  });
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

async function appendFiles({ notionToken, pageId, sectionPath, heading, files = [], limit = 8 }) {
  const uniqueFiles = [...new Set(files)];
  const uploadable = uniqueFiles.filter(
    (filePath) => statSync(filePath).size <= MAX_NOTION_UPLOAD_BYTES,
  );
  const skippedTooLarge = uniqueFiles.length - uploadable.length;
  const selected = uploadable.slice(0, Math.max(0, limit));
  if (!selected.length) {
    if (skippedTooLarge > 0) {
      await appendBlocks({
        notionToken,
        pageId,
        sectionPath,
        blocks: [
          headingBlock(`${heading} (0 of ${files.length})`),
          bulleted(
            `${skippedTooLarge} artifact(s) skipped because they exceed Notion upload size.`,
          ),
        ],
      });
    }
    return { sectionPath, uploaded: 0, total: files.length, skippedTooLarge };
  }

  const uploads = [];
  const failedUploads = [];
  for (const [index, filePath] of selected.entries()) {
    try {
      uploads.push(await uploadFile({ notionToken, filePath, index }));
    } catch (error) {
      failedUploads.push({ filePath, error: error.message });
    }
  }

  const blocks = [
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: richText(
          `${heading} (${selected.length}${files.length > selected.length ? ` of ${files.length}` : ''})`,
        ),
      },
    },
    skippedTooLarge > 0
      ? bulleted(`${skippedTooLarge} artifact(s) skipped because they exceed Notion upload size.`)
      : null,
    failedUploads.length > 0
      ? bulleted(`${failedUploads.length} artifact upload(s) failed; see local artifact directory.`)
      : null,
    ...uploads.map((upload, index) => uploadBlock(upload, `${index + 1}. ${upload.sourceName}`)),
  ].filter(Boolean);
  await appendBlocks({ notionToken, pageId, sectionPath, blocks });
  return {
    sectionPath,
    uploaded: uploads.length,
    total: files.length,
    skippedTooLarge,
    failedUploads,
  };
}

async function uploadFile({ notionToken, filePath }) {
  const stat = statSync(filePath);
  const filename = evidenceFilename(filePath);
  const contentType = inferContentType(filePath);
  const created = await notionRequest({
    notionToken,
    path: '/v1/file_uploads',
    method: 'POST',
    version: NOTION_FILE_UPLOAD_VERSION,
    body: {
      mode: 'single_part',
      filename,
      content_type: contentType,
    },
  });

  const formData = new FormData();
  formData.append('file', new Blob([readFileSync(filePath)], { type: contentType }), filename);
  const sent = await notionFormRequest({
    notionToken,
    path: `/v1/file_uploads/${created.id}/send`,
    method: 'POST',
    body: formData,
  });

  return {
    sent,
    contentType,
    contentLength: stat.size,
    sourcePath: filePath,
    sourceName: filename,
  };
}

function uploadBlock(upload, caption) {
  const isImage = upload.contentType.startsWith('image/');
  const isVideo = upload.contentType.startsWith('video/');
  const type = isImage ? 'image' : isVideo ? 'video' : 'file';
  return {
    object: 'block',
    type,
    [type]: {
      type: 'file_upload',
      file_upload: { id: upload.sent.id },
      caption: richText(caption),
    },
  };
}

async function findActivityPage({ notionToken, databaseId, activityId }) {
  const res = await notionRequest({
    notionToken,
    path: `/v1/databases/${databaseId}/query`,
    method: 'POST',
    body: {
      filter: { property: 'Activity ID', rich_text: { equals: activityId } },
      page_size: 1,
    },
  });
  return res.results?.[0] ?? null;
}

async function getPage({ notionToken, pageId }) {
  return notionRequest({ notionToken, path: `/v1/pages/${pageId}`, method: 'GET' });
}

async function findOrCreateSectionPathBlockId({ notionToken, pageId, sectionPath }) {
  const parts = String(sectionPath)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  let parentId = pageId;
  for (const part of parts) {
    parentId = await findOrCreateSectionBlockId({ notionToken, pageId: parentId, section: part });
  }
  return parentId;
}

async function findOrCreateSectionBlockId({ notionToken, pageId, section }) {
  const existing = await findSectionBlock({ notionToken, pageId, section });
  if (existing) return existing.id;

  const created = await notionRequest({
    notionToken,
    path: `/v1/blocks/${pageId}/children`,
    method: 'PATCH',
    body: { children: [sectionToggleBlock(section)] },
  });
  return created.results?.[0]?.id ?? pageId;
}

async function findSectionBlock({ notionToken, pageId, section }) {
  let cursor = null;
  do {
    const query = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : '?page_size=100';
    const res = await notionRequest({
      notionToken,
      path: `/v1/blocks/${pageId}/children${query}`,
      method: 'GET',
    });
    const match = res.results?.find(
      (block) => !block.archived && !block.in_trash && blockText(block) === section,
    );
    if (match) return match;
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return null;
}

async function children({ notionToken, blockId }) {
  const results = [];
  let cursor = null;
  do {
    const query = cursor
      ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100`
      : '?page_size=100';
    const res = await notionRequest({
      notionToken,
      path: `/v1/blocks/${blockId}/children${query}`,
      method: 'GET',
    });
    results.push(...(res.results ?? []).filter((block) => !block.archived && !block.in_trash));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return results;
}

async function countFeatureBlocks({ notionToken, blocks }) {
  let count = 0;
  for (const block of blocks) {
    if (blockText(block).startsWith('Feature:')) count += 1;
    if (block.has_children) {
      count += await countFeatureBlocks({
        notionToken,
        blocks: await children({ notionToken, blockId: block.id }),
      });
    }
  }
  return count;
}

async function countEvidenceBlocks({ notionToken, blocks, insideEvidence = false }) {
  let count = 0;
  for (const block of blocks) {
    const inEvidenceTree = insideEvidence || blockText(block).startsWith('Evidence ');
    if (inEvidenceTree && ['image', 'video', 'file', 'code'].includes(block.type)) count += 1;
    if (block.has_children) {
      count += await countEvidenceBlocks({
        notionToken,
        blocks: await children({ notionToken, blockId: block.id }),
        insideEvidence: inEvidenceTree,
      });
    }
  }
  return count;
}

function blockText(block) {
  return block?.[block.type]?.rich_text?.map((part) => part.plain_text ?? '').join('') ?? '';
}

function activityPageProperties({ activity, git }) {
  const title = `${activity.activityId} · ${activity.title}`.slice(0, 1900);
  return {
    Title: { title: richText(title) },
    'Activity ID': { rich_text: richText(activity.activityId) },
    'Activity UUID': { rich_text: richText(activity.activityUuid ?? '') },
    Status: { select: { name: 'Validating' } },
    'Current Stage': { rich_text: richText('Validation') },
    'Approval Status': { select: { name: 'Not Needed' } },
    Platforms: {
      multi_select: (activity.latestQaRun?.platforms ?? ['web-chromium']).map((name) => ({
        name,
      })),
    },
    'Latest Attempt': { rich_text: richText(activity.latestQaRun?.attemptId ?? '') },
    'Next Action': {
      rich_text: richText(
        activity.latestQaRun?.nextTarget
          ? `Run ${activity.latestQaRun.nextTarget}`
          : 'Review QA evidence.',
      ),
    },
    Branch: { rich_text: richText(git?.branch ?? '') },
    'Worktree Path': { rich_text: richText(process.cwd()) },
    'Activity Created At': { date: { start: activity.createdAt } },
    'Last Synced At': { date: { start: new Date().toISOString() } },
  };
}

function activityLogDatabaseIdOrThrow(activityId) {
  const paths = activityPaths(activityId);
  const config = readJsonIfExists(`${paths.artifactRoot}/notion-activity-log.json`);
  const databaseId =
    process.env.OPENREAD_NOTION_ACTIVITY_LOG_DATABASE ?? config?.activityLogDatabaseId;
  if (!databaseId)
    throw new Error(
      'Activity Log database ID missing. Set OPENREAD_NOTION_ACTIVITY_LOG_DATABASE or create notion-activity-log.json.',
    );
  return databaseId;
}

function notionTokenOrThrow() {
  const credential = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY;
  if (!credential)
    throw new Error('NOTION_TOKEN or NOTION_API_KEY is required unless --local-only is set.');
  return credential;
}

async function notionRequest({ notionToken, path, method, body, version = NOTION_API_VERSION }) {
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`https://api.notion.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': version,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) return response.json();

    const message = `Notion request failed: ${method} ${path} ${response.status} ${await response.text()}`;
    lastError = new Error(message);
    if (!RETRYABLE_NOTION_STATUS.has(response.status) || attempt === maxAttempts) throw lastError;
    await sleep(500 * attempt ** 2);
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionFormRequest({ notionToken, path, method, body }) {
  const response = await fetch(`https://api.notion.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_FILE_UPLOAD_VERSION,
    },
    body,
  });
  if (!response.ok)
    throw new Error(
      `Notion upload failed: ${method} ${path} ${response.status} ${await response.text()}`,
    );
  return response.json();
}

function richText(text) {
  return [{ type: 'text', text: { content: String(text ?? '').slice(0, 1900) } }];
}

function inferContentType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.json') return 'application/json';
  if (ext === '.txt' || ext === '.log') return 'text/plain';
  return 'application/octet-stream';
}
