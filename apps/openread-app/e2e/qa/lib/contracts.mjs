import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './common.mjs';

export const QA_CONTRACT_PATH = resolve(
  REPO_ROOT,
  'docs/testing/everything-current-state-and-qa-baseline.md',
);

export const DEFAULT_CONTRACT_PLATFORM_ALIASES = Object.freeze({
  'web-edge-windows': 'web-edge',
});

export function parseQaContract({
  contractPath = QA_CONTRACT_PATH,
  idPrefixes = null,
  platformAliases = DEFAULT_CONTRACT_PLATFORM_ALIASES,
} = {}) {
  const text = readFileSync(contractPath, 'utf8');
  const headingRegex = /^- \[[ xX]\] \*\*([A-Z]{2,5}-\d{3}) — (.+?)\*\*/gm;
  const prefixSet = idPrefixes?.length ? new Set(idPrefixes) : null;
  const matches = Array.from(text.matchAll(headingRegex)).filter((match) =>
    prefixSet ? prefixSet.has(contractPrefix(match[1])) : true,
  );

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end);
    const scenarioId = match[1];
    const title = match[2].trim();
    return {
      scenarioId,
      prefix: contractPrefix(scenarioId),
      title,
      scope: parseScenarioField(block, 'Scope'),
      scenarioOverview: parseScenarioField(block, 'Scenario overview'),
      interactionCoverage: parseScenarioField(block, 'Interaction coverage'),
      impactCoverage: parseScenarioField(block, 'Impact coverage'),
      preconditions: parseScenarioField(block, 'Preconditions'),
      startState: parseScenarioField(block, 'Start state'),
      transientStates: parseScenarioField(block, 'Transient states'),
      terminalStates: parseScenarioField(block, 'Terminal states'),
      assertionsEvidence: parseScenarioField(block, 'Assertions/evidence'),
      assertionsEvidenceItems: parseScenarioFieldItems(block, 'Assertions/evidence'),
      automationNotes: parseScenarioField(block, 'Automation notes'),
      platforms: parseScenarioPlatforms(block, platformAliases),
      evidenceSlots: parseEvidenceSlots(block),
    };
  });
}

export function contractIdsFromValue(value) {
  return Array.from(new Set(String(value ?? '').match(/[A-Z]{2,5}-\d{3}/g) ?? []));
}

export function expandCompactContractIds(value) {
  return String(value ?? '').replace(
    /([A-Z]{2,5}-\d{3})[-/]((?:\d{3}[-/]?)+)/g,
    (match, firstId, rest) => {
      const prefix = contractPrefix(firstId);
      const expanded = rest
        .split(/[-/]/)
        .filter(Boolean)
        .map((number) => `${prefix}-${number}`);
      return [firstId, ...expanded].join(' ');
    },
  );
}

export function contractIdsFromEvidenceValue(value) {
  return contractIdsFromValue(expandCompactContractIds(value));
}

export function evidenceSlotName(value) {
  return String(value ?? '').replace(/^evidence:/, '');
}

export function contractPrefix(contractId) {
  return String(contractId ?? '').split('-')[0] ?? '';
}

function parseScenarioField(block, label) {
  const lines = block.split(/\r?\n/);
  const heading = new RegExp(`^\\s+- \\*\\*${escapeRegex(label)}:\\*\\*\\s*(.*)$`);
  const chunks = [];
  let collecting = false;
  let baseIndent = null;

  for (const line of lines) {
    const match = line.match(heading);
    if (match) {
      collecting = true;
      baseIndent = leadingSpaces(line);
      const inline = match[1]?.trim();
      if (inline) chunks.push(inline);
      continue;
    }
    if (!collecting) continue;
    if (line.trim() === '') continue;
    const indent = leadingSpaces(line);
    if (indent <= baseIndent && /^\s+- \*\*.+?:\*\*/.test(line)) break;
    chunks.push(cleanContractLine(line));
  }

  return compactContractText(chunks.filter(Boolean).join(' '));
}

function parseScenarioFieldItems(block, label) {
  const lines = block.split(/\r?\n/);
  const heading = new RegExp(`^\\s+- \\*\\*${escapeRegex(label)}:\\*\\*\\s*(.*)$`);
  const items = [];
  let collecting = false;
  let baseIndent = null;

  for (const line of lines) {
    const match = line.match(heading);
    if (match) {
      collecting = true;
      baseIndent = leadingSpaces(line);
      const inline = match[1]?.trim();
      if (inline) items.push(cleanContractLine(inline));
      continue;
    }
    if (!collecting) continue;
    if (line.trim() === '') continue;
    const indent = leadingSpaces(line);
    if (indent <= baseIndent && /^\s+- \*\*.+?:\*\*/.test(line)) break;
    const item = cleanContractLine(line);
    if (item) items.push(item);
  }

  return items;
}

function parseScenarioPlatforms(block, platformAliases) {
  const lines = block.split(/\r?\n/);
  const platforms = [];
  let current = null;

  for (const line of lines) {
    const platformMatch = line.match(/^\s+- `([^`]+)`: (Required|Not required)\s*$/);
    if (platformMatch) {
      current = {
        id: platformMatch[1],
        qaPlatformId: platformAliases[platformMatch[1]] ?? platformMatch[1],
        requirement: platformMatch[2],
        contractStatus: null,
        reason: null,
      };
      platforms.push(current);
      continue;
    }

    if (!current) continue;
    const statusMatch = line.match(/^\s+- \*\*Status:\*\*\s*(.+?)\s*$/);
    if (statusMatch) {
      current.contractStatus = statusMatch[1];
      continue;
    }

    const reasonMatch = line.match(/^\s+- \*\*Reason:\*\*\s*(.+?)\s*$/);
    if (reasonMatch) current.reason = reasonMatch[1];
  }

  return platforms;
}

function parseEvidenceSlots(block) {
  const slots = [];
  let inEvidenceSection = false;
  for (const line of block.split(/\r?\n/)) {
    if (line.includes('**Screenshot evidence:**')) {
      inEvidenceSection = true;
      continue;
    }
    if (inEvidenceSection && line.match(/^\s+- \*\*/)) break;
    if (!inEvidenceSection) continue;
    const slotMatch = line.match(/`([^`]+)`/);
    if (slotMatch) slots.push(slotMatch[1]);
  }
  return slots;
}

function cleanContractLine(line) {
  return line
    .trim()
    .replace(/^-\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactContractText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leadingSpaces(value) {
  return value.match(/^\s*/)?.[0]?.length ?? 0;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
