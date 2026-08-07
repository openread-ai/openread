import type { BookFormat } from './book.js';

export const CATALOG_SOURCE_FETCH_TIMEOUT_MS = 120_000;
export const CATALOG_SOURCE_FETCH_REDIRECT_LIMIT = 3;

export type CatalogDownloadFormat = BookFormat;
export type CatalogArchiveFormat = Extract<CatalogDownloadFormat, 'epub' | 'fbz' | 'cbz'>;
export type CatalogArchiveInputFormat = CatalogArchiveFormat | 'zip';
export type CatalogNonArchiveFormat = Exclude<CatalogDownloadFormat, CatalogArchiveFormat>;
export type CatalogMaterializationInputFormat = CatalogDownloadFormat | 'zip';
export const CATALOG_ARCHIVE_INPUT_FORMATS = [
  'epub',
  'fbz',
  'cbz',
  'zip',
] as const satisfies readonly CatalogArchiveInputFormat[];
export function isCatalogArchiveInputFormat(
  value: unknown,
): value is CatalogArchiveInputFormat {
  return CATALOG_ARCHIVE_INPUT_FORMATS.includes(value as CatalogArchiveInputFormat);
}
export type CatalogSourceUnavailableHealthStatus = 'source_blocked' | 'source_unavailable';
export type CatalogSourceHealthStatus = 'pending' | 'verified' | CatalogSourceUnavailableHealthStatus;
export type CatalogSourceFailureCategory =
  | 'source_blocked'
  | 'source_unavailable'
  | 'source_network'
  | 'source_timeout'
  | 'source_http'
  | 'source_validation';

export const CATALOG_SOURCE_UNAVAILABLE_HEALTH_STATUSES = [
  'source_blocked',
  'source_unavailable',
] as const satisfies readonly CatalogSourceUnavailableHealthStatus[];
export const CATALOG_SOURCE_UNAVAILABLE_IMPORT_FAILURE_ERROR_TYPES = [
  'source_blocked',
  'source_unavailable',
  'unsupported_format',
] as const;

export type CatalogContentTypeClass =
  | 'missing'
  | 'html'
  | 'xml'
  | 'pdf'
  | 'epub'
  | 'mobi'
  | 'fictionbook'
  | 'archive'
  | 'binary'
  | 'json'
  | 'text'
  | 'markdown'
  | 'other';

export type BookFormatRegistryEntry = {
  extension: BookFormat;
  extensions: readonly string[];
  mimeType: string;
  maxBytes: number;
  reader: boolean;
  localImport: boolean;
  platformUpload: boolean;
  catalogImport: boolean;
  catalogSelectionPriority: number;
  catalogAcceptHeader?: string;
  catalogContentTypeClasses?: readonly CatalogContentTypeClass[];
};

const CATALOG_IMPORT_FORMAT_SUPPORT = {
  reader: true,
  localImport: true,
  platformUpload: true,
  catalogImport: true,
} as const;

const CATALOG_ONLY_FORMAT_SUPPORT = {
  reader: true,
  localImport: true,
  platformUpload: false,
  catalogImport: true,
} as const;

export const BOOK_FORMAT_REGISTRY = {
  epub: {
    extension: 'epub',
    catalogSelectionPriority: 0,
    extensions: ['epub'],
    mimeType: 'application/epub+zip',
    maxBytes: 100 * 1024 * 1024,
    ...CATALOG_IMPORT_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/epub+zip,*/*',
    catalogContentTypeClasses: ['epub', 'binary', 'missing'],
  },
  pdf: {
    extension: 'pdf',
    catalogSelectionPriority: 1,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    maxBytes: 200 * 1024 * 1024,
    ...CATALOG_IMPORT_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/pdf,*/*',
    catalogContentTypeClasses: ['pdf', 'binary', 'missing'],
  },
  mobi: {
    extension: 'mobi',
    catalogSelectionPriority: 2,
    extensions: ['mobi'],
    mimeType: 'application/x-mobipocket-ebook',
    maxBytes: 100 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/x-mobipocket-ebook,application/octet-stream,*/*',
    catalogContentTypeClasses: ['mobi', 'binary', 'missing'],
  },
  azw: {
    extension: 'azw',
    catalogSelectionPriority: 3,
    extensions: ['azw'],
    mimeType: 'application/vnd.amazon.ebook',
    maxBytes: 100 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/vnd.amazon.ebook,application/octet-stream,*/*',
    catalogContentTypeClasses: ['mobi', 'binary', 'missing'],
  },
  azw3: {
    extension: 'azw3',
    catalogSelectionPriority: 4,
    extensions: ['azw3'],
    mimeType: 'application/vnd.amazon.ebook',
    maxBytes: 100 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/vnd.amazon.ebook,application/octet-stream,*/*',
    catalogContentTypeClasses: ['mobi', 'binary', 'missing'],
  },
  fb2: {
    extension: 'fb2',
    catalogSelectionPriority: 5,
    extensions: ['fb2'],
    mimeType: 'application/x-fictionbook+xml',
    maxBytes: 50 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/x-fictionbook+xml,application/xml,text/xml,*/*',
    catalogContentTypeClasses: ['fictionbook', 'xml', 'text', 'binary', 'missing'],
  },
  fbz: {
    extension: 'fbz',
    catalogSelectionPriority: 6,
    extensions: ['fbz'],
    mimeType: 'application/zip',
    maxBytes: 50 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/zip,application/x-zip-compressed,*/*',
    catalogContentTypeClasses: ['archive', 'binary', 'missing'],
  },
  cbz: {
    extension: 'cbz',
    catalogSelectionPriority: 7,
    extensions: ['cbz'],
    mimeType: 'application/vnd.comicbook+zip',
    maxBytes: 500 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/vnd.comicbook+zip,application/zip,application/x-zip-compressed,*/*',
    catalogContentTypeClasses: ['archive', 'binary', 'missing'],
  },
  txt: {
    extension: 'txt',
    catalogSelectionPriority: 8,
    extensions: ['txt'],
    mimeType: 'text/plain',
    maxBytes: 10 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'text/plain,*/*',
    catalogContentTypeClasses: ['text', 'binary', 'missing'],
  },
  md: {
    extension: 'md',
    catalogSelectionPriority: 9,
    extensions: ['md', 'markdown'],
    mimeType: 'text/markdown',
    maxBytes: 10 * 1024 * 1024,
    ...CATALOG_ONLY_FORMAT_SUPPORT,
    catalogAcceptHeader: 'text/markdown,text/plain,*/*',
    catalogContentTypeClasses: ['markdown', 'text', 'binary', 'missing'],
  },
} as const satisfies Record<BookFormat, BookFormatRegistryEntry>;

export const CATALOG_IMPORT_FORMATS = Object.freeze(
  (Object.keys(BOOK_FORMAT_REGISTRY) as BookFormat[]).filter(
    (format) => BOOK_FORMAT_REGISTRY[format].catalogImport,
  ),
) as readonly CatalogDownloadFormat[];

export const CATALOG_MATERIALIZATION_INPUT_FORMATS = Object.freeze([
  ...CATALOG_IMPORT_FORMATS,
  'zip' as const,
]) as readonly CatalogMaterializationInputFormat[];

export const FORMAT_MIME_TYPES: Record<BookFormat, string> = Object.fromEntries(
  Object.entries(BOOK_FORMAT_REGISTRY).map(([format, entry]) => [format, entry.mimeType]),
) as Record<BookFormat, string>;

export const FORMAT_EXTENSIONS = Object.fromEntries(
  Object.entries(BOOK_FORMAT_REGISTRY).map(([format, entry]) => [format, entry.extensions]),
) as unknown as Record<BookFormat, readonly string[]>;

export const UPLOAD_SIZE_LIMITS: Record<BookFormat, number> = Object.fromEntries(
  Object.entries(BOOK_FORMAT_REGISTRY).map(([format, entry]) => [format, entry.maxBytes]),
) as Record<BookFormat, number>;

export type CatalogSourceVerificationContract = {
  sourceUrl: string;
  url: URL;
  format: CatalogDownloadFormat;
  acceptHeader: string;
  maxBytes: number;
};

export type CatalogFormatSelectionCandidate = {
  source: string;
  sourceId: string;
  sourceUrl: string;
  format: CatalogDownloadFormat;
  artifactRevisionId: string;
  artifactExtentBytes: number;
  artifactMediaTypes: readonly string[];
  verification: CatalogSourceVerificationContract;
};

export type CatalogFormatSelectionFailureReason =
  | 'missing-candidate'
  | 'invalid-candidate'
  | 'ambiguous-candidate';

export type CatalogFormatSelectionResult<T extends CatalogFormatSelectionCandidate> =
  | {
      ok: true;
      candidate: T;
      format: CatalogDownloadFormat;
      rejectedCandidateCount: number;
    }
  | { ok: false; reason: CatalogFormatSelectionFailureReason };

export const CANONICAL_CATALOG_CATEGORIES = [
  'Science',
  'Engineering',
  'Technology',
  'Computer Science',
  'Mathematics',
  'Medicine',
  'Business & Economics',
  'History',
  'Philosophy',
  'Psychology',
  'Biography',
  'Religion',
  'Social Sciences',
  'Education',
] as const;
export type CanonicalCatalogCategory = (typeof CANONICAL_CATALOG_CATEGORIES)[number];

export type CatalogRightsEvidenceObservation = {
  text: string;
  reference: string;
};

export type CatalogMetadataRightsArtifactBinding = {
  sourceUrl: string;
  artifactRevisionId: string;
  format: CatalogDownloadFormat;
};

export type CatalogMetadataRightsEvidenceInput = {
  source: string;
  sourceId: string;
  editionId: string;
  metadataSourceUrl: string;
  metadataRevisionId: string;
  languages: readonly string[];
  sourceSubjects: readonly string[];
  canonicalCategories: readonly string[];
  rights: readonly CatalogRightsEvidenceObservation[];
  formatCandidates: readonly CatalogFormatSelectionCandidate[];
  artifactBinding: CatalogMetadataRightsArtifactBinding;
};

export type CatalogMetadataRightsEvidence = {
  schemaVersion: 1;
  activation: 'inactive';
  source: string;
  sourceId: string;
  editionId: string;
  metadataSourceUrl: string;
  metadataRevisionId: string;
  sourceLanguages: readonly string[];
  canonicalLanguageTags: readonly string[];
  primaryLanguage: 'en';
  sourceSubjects: readonly string[];
  canonicalCategories: readonly CanonicalCatalogCategory[];
  rights: CatalogRightsEvidenceObservation;
  artifact: CatalogMetadataRightsArtifactBinding;
};

export type CatalogMetadataRightsEvidenceFailureReason =
  | 'invalid-identity'
  | 'invalid-metadata-evidence'
  | 'missing-language-evidence'
  | 'invalid-language-evidence'
  | 'conflicting-language-evidence'
  | 'non-english-primary'
  | 'missing-rights-evidence'
  | 'invalid-rights-evidence'
  | 'conflicting-rights-evidence'
  | 'invalid-category-evidence'
  | 'invalid-artifact-evidence'
  | 'artifact-evidence-mismatch';

export type CatalogMetadataRightsEvidenceResult =
  | { ok: true; evidence: CatalogMetadataRightsEvidence }
  | { ok: false; reason: CatalogMetadataRightsEvidenceFailureReason };

export const CATALOG_COVER_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export type CatalogCoverEvidenceCandidate = {
  source: string;
  sourceId: string;
  editionId: string;
  sourceUrl: string;
  coverRevisionId: string;
  extentBytes: number;
  modifiedAt: string;
  mediaTypes: readonly string[];
};

export type CatalogCoverEvidenceInput = {
  edition: CatalogMetadataRightsEvidence;
  formatCandidates: readonly CatalogFormatSelectionCandidate[];
  coverCandidates: readonly CatalogCoverEvidenceCandidate[];
};

export type CatalogCoverEvidence = {
  schemaVersion: 1;
  activation: 'inactive';
  source: string;
  sourceId: string;
  editionId: string;
  metadataRevisionId: string;
  artifact: CatalogMetadataRightsArtifactBinding;
  cover: {
    sourceUrl: string;
    coverRevisionId: string;
    extentBytes: number;
    modifiedAt: string;
    mediaType: string;
  };
  storage: {
    state: 'not-written';
    keyIntent: {
      kind: 'catalog_cover';
      owner: { source: string; sourceId: string };
      outputExtension: 'jpg';
    };
  };
};

export type CatalogCoverEvidenceFailureReason =
  | 'invalid-edition-evidence'
  | 'artifact-evidence-mismatch'
  | 'missing-cover-evidence'
  | 'invalid-cover-evidence'
  | 'ambiguous-cover-evidence';

export type CatalogCoverEvidenceResult =
  | { ok: true; evidence: CatalogCoverEvidence; rejectedCandidateCount: number }
  | { ok: false; reason: CatalogCoverEvidenceFailureReason };

export const CATALOG_ADMISSION_IDENTITY_DISPOSITIONS = [
  'clear',
  'excluded',
  'legacy-owned',
  'legacy-cached',
  'active-source-duplicate',
  'duplicate-work',
  'ambiguous',
] as const;
export type CatalogAdmissionIdentityDisposition =
  (typeof CATALOG_ADMISSION_IDENTITY_DISPOSITIONS)[number];

/** Precomputed by the canonical ownership/dedup layer; this evaluator performs no DB lookup. */
export type CatalogAdmissionIdentityState = {
  schemaVersion: 1;
  authority: 'catalog-identity-dedup';
  source: string;
  sourceId: string;
  disposition: CatalogAdmissionIdentityDisposition;
};

export const CATALOG_ADMISSION_DECISION_REASONS = [
  'ready',
  'invalid-identity',
  'missing-format-candidates',
  'invalid-format-candidates',
  'missing-metadata-rights-evidence',
  'metadata-evidence-mismatch',
  'metadata-fingerprint-mismatch',
  'missing-cover-evidence',
  'cover-evidence-mismatch',
  'cover-fingerprint-mismatch',
  'missing-identity-state',
  'identity-state-mismatch',
  'excluded-source-identity',
  'legacy-owned-identity',
  'legacy-cached-identity',
  'active-source-identity',
  'duplicate-work-identity',
  'ambiguous-identity-state',
] as const;
export type CatalogAdmissionDecisionReason =
  (typeof CATALOG_ADMISSION_DECISION_REASONS)[number];

export type CatalogAdmissionDecisionInput = {
  source: string;
  sourceId: string;
  editionId: string;
  formatCandidates: readonly CatalogFormatSelectionCandidate[];
  metadataRightsEvidence?: CatalogMetadataRightsEvidence;
  metadataRightsFingerprint?: string;
  coverCandidates: readonly CatalogCoverEvidenceCandidate[];
  coverEvidence?: CatalogCoverEvidence;
  coverFingerprint?: string;
  identityState?: CatalogAdmissionIdentityState;
};

export type CatalogAdmissionDecisionEvidence = {
  schemaVersion: 1;
  decision: 'ready' | 'rejected';
  reason: CatalogAdmissionDecisionReason;
  activation: 'inactive';
  storage: 'not-written';
  source: string;
  sourceId: string;
  editionId: string;
  identityDisposition: CatalogAdmissionIdentityDisposition | null;
  artifact: CatalogMetadataRightsArtifactBinding | null;
  metadataRevisionId: string | null;
  metadataRightsFingerprint: string | null;
  coverRevisionId: string | null;
  coverFingerprint: string | null;
  fingerprint: string;
};

type CatalogSourceHostPolicy = { exact: ReadonlySet<string>; suffix?: ReadonlySet<string> };

export type CatalogSourcePolicy = {
  source: string;
  cacheRedistributionAllowed: boolean;
  deviceFetchAllowed: boolean;
  allowedFormats: readonly CatalogDownloadFormat[];
  provenanceLabel: string;
  licenseRequired: boolean;
};

const CATALOG_SOURCE_POLICY_ENTRIES = [
  {
    source: 'internet-archive',
    cacheRedistributionAllowed: true,
    deviceFetchAllowed: true,
    allowedFormats: CATALOG_IMPORT_FORMATS,
    provenanceLabel: 'Internet Archive',
    licenseRequired: true,
  },
  {
    source: 'standard-ebooks',
    cacheRedistributionAllowed: true,
    deviceFetchAllowed: true,
    allowedFormats: ['epub'] as const,
    provenanceLabel: 'Standard Ebooks',
    licenseRequired: true,
  },
  {
    source: 'gutenberg',
    cacheRedistributionAllowed: true,
    deviceFetchAllowed: true,
    allowedFormats: CATALOG_IMPORT_FORMATS,
    provenanceLabel: 'Project Gutenberg',
    licenseRequired: true,
  },
  {
    source: 'openstax',
    cacheRedistributionAllowed: false,
    deviceFetchAllowed: false,
    allowedFormats: ['pdf'] as const,
    provenanceLabel: 'OpenStax',
    licenseRequired: true,
  },
  {
    source: 'oapen',
    cacheRedistributionAllowed: false,
    deviceFetchAllowed: true,
    allowedFormats: ['pdf'] as const,
    provenanceLabel: 'OAPEN',
    licenseRequired: true,
  },
  {
    source: 'goalkicker',
    cacheRedistributionAllowed: false,
    deviceFetchAllowed: false,
    allowedFormats: ['pdf'] as const,
    provenanceLabel: 'GoalKicker',
    licenseRequired: true,
  },
  {
    source: 'greenteapress',
    cacheRedistributionAllowed: true,
    deviceFetchAllowed: true,
    allowedFormats: ['pdf'] as const,
    provenanceLabel: 'Green Tea Press',
    licenseRequired: true,
  },
  {
    source: 'doab',
    cacheRedistributionAllowed: false,
    deviceFetchAllowed: true,
    allowedFormats: ['pdf'] as const,
    provenanceLabel: 'DOAB',
    licenseRequired: true,
  },
] as const satisfies readonly CatalogSourcePolicy[];

export const CATALOG_SOURCE_POLICIES: Record<string, CatalogSourcePolicy> = Object.fromEntries(
  CATALOG_SOURCE_POLICY_ENTRIES.map((policy) => [policy.source, policy]),
);

export function catalogSourcePolicy(source: unknown): CatalogSourcePolicy | null {
  return typeof source === 'string' ? (CATALOG_SOURCE_POLICIES[source] ?? null) : null;
}

export function catalogSourcePolicySqlList(): string {
  return CATALOG_SOURCE_POLICY_ENTRIES.map((policy) => `'${policy.source}'`).join(', ');
}

export function catalogExecutableSourcePolicySqlList(): string {
  return CATALOG_SOURCE_POLICY_ENTRIES.filter((policy) => policy.deviceFetchAllowed)
    .map((policy) => `'${policy.source}'`)
    .join(', ');
}

const ACADEMIC_SOURCE_ID_SUFFIX_PATTERN =
  '(doi-[A-Za-z0-9._-]+|isbn-[A-Za-z0-9._-]+|[a-z0-9]+(-[a-z0-9]+)*)';
const ACADEMIC_SOURCE_ID_PATTERN = new RegExp(
  `^(oapen|doab)-${ACADEMIC_SOURCE_ID_SUFFIX_PATTERN}$`,
);

export function catalogRetrievableSourceSqlCondition(alias = 'cb'): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error('Catalog SQL alias is invalid');
  }

  const source = `${alias}.source`;
  const sourceId = `${alias}.source_id`;
  const sourceUrl = `${alias}.source_download_url`;
  const admissionEvidence = `${alias}.admission_evidence`;
  const oapenResourceEvidence = `${admissionEvidence}->'oapenRestResource'`;
  const sha256Pattern = '^[0-9a-f]{64}$';
  const uuidPattern =
    '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$';
  return [
    `NULLIF(BTRIM(COALESCE(${sourceUrl}, '')), '') IS NOT NULL`,
    `AND ${sourceUrl} LIKE 'https://%'`,
    `AND POSITION('@' IN SPLIT_PART(${sourceUrl}, '/', 3)) = 0`,
    `AND POSITION('%' IN REGEXP_REPLACE(${sourceUrl}, '%[0-9A-Fa-f]{2}', '', 'g')) = 0`,
    `AND ${sourceUrl} !~* '%(2f|5c|3f|23)'`,
    'AND (',
    `(${source} = 'internet-archive' AND ${sourceUrl} ~* '^https://(?:[A-Za-z0-9-]+\\.)*archive\\.org/' AND (POSITION('/download/' || ${sourceId} || '/' IN ${sourceUrl}) > 0 OR POSITION('/items/' || ${sourceId} IN ${sourceUrl}) > 0))`,
    'OR',
    `(${source} = 'standard-ebooks' AND ${sourceUrl} ~* '^https://(?:www\\.)?standardebooks\\.org/' AND POSITION('/ebooks/' || ${sourceId} || '/downloads/' IN ${sourceUrl}) > 0)`,
    'OR',
    `(${source} = 'gutenberg' AND ${sourceUrl} ~* '^https://(?:www\\.)?gutenberg\\.org/')`,
    'OR',
    `(${source} = 'greenteapress' AND ${sourceUrl} ~* '^https://(?:www\\.)?greenteapress\\.com/')`,
    'OR',
    `(${source} = 'oapen' AND ${sourceId} ~ '^20\\.500\\.12657/[0-9]+$' AND ${admissionEvidence}->>'activity' = 'ACT-2056' AND ${admissionEvidence}->>'manifestChecksum' ~ '${sha256Pattern}' AND ${admissionEvidence}->>'entryChecksum' ~ '${sha256Pattern}' AND ${admissionEvidence}->>'rowChecksum' ~ '${sha256Pattern}' AND ${admissionEvidence}->>'officialCsvSha256' ~ '${sha256Pattern}' AND ${oapenResourceEvidence}->>'sourceId' = ${sourceId} AND ${oapenResourceEvidence}->>'responseSha256' ~ '${sha256Pattern}' AND ${oapenResourceEvidence}->>'originalPdfBitstreamUuid' ~ '${uuidPattern}' AND ${oapenResourceEvidence}->>'originalPdfRetrievePath' = CONCAT('/rest/bitstreams/', ${oapenResourceEvidence}->>'originalPdfBitstreamUuid', '/retrieve') AND ${sourceUrl} = CONCAT('https://library.oapen.org', ${oapenResourceEvidence}->>'originalPdfRetrievePath'))`,
    'OR',
    `(${source} = 'doab' AND CHAR_LENGTH(${sourceId}) <= 160 AND ${sourceId} ~ '^doab-${ACADEMIC_SOURCE_ID_SUFFIX_PATTERN}$' AND (${sourceUrl} ~* '^https://(?:library\\.oapen\\.org|directory\\.doabooks\\.org)/bitstream/(?:handle/)?20\\.500\\.[0-9]+/[0-9]+/(?:[0-9]+/)?[^/?#]+\\.pdf(?:[?#].*)?$' OR ${sourceUrl} ~* '^https://www\\.brepolsonline\\.net/doi/pdf/[^?#]+(?:[?#].*)?$' OR ${sourceUrl} ~* '^https://(?:www\\.)?mdpi\\.com/books/pdfview/book/[0-9]+/?(?:[?#].*)?$' OR ${sourceUrl} ~* '^https://(?:www\\.)?mdpi-res\\.com/bookfiles/book/[0-9]+/[^/?#]+\\.pdf(?:[?#].*)?$'))`,
    ')',
  ].join(' ');
}

export function catalogSourcePolicyForCatalogBook(
  catalogBook: Record<string, unknown>,
): CatalogSourcePolicy | null {
  const policy = catalogSourcePolicy(catalogBook.source);
  if (!policy) return null;
  if (typeof catalogBook.source_id !== 'string' || catalogBook.source_id.length === 0) return null;
  if (policy.licenseRequired) {
    const licenseType = catalogBook.license_type;
    if (typeof licenseType !== 'string' || licenseType.trim().length === 0) return null;
  }
  return policy;
}

export function catalogSourcePolicySupportsFormat(
  policy: CatalogSourcePolicy,
  format: CatalogDownloadFormat,
): boolean {
  return policy.allowedFormats.includes(format);
}

export function catalogBookSupportsCachedImportIntent(
  catalogBook: Record<string, unknown>,
): boolean {
  const policy = catalogSourcePolicyForCatalogBook(catalogBook);
  if (!policy?.cacheRedistributionAllowed) return false;
  const format = catalogDownloadFormat(catalogBook.format_type);
  return catalogSourcePolicySupportsFormat(policy, format);
}

export function catalogBookSupportsUserDeviceFetchIntent(
  catalogBook: Record<string, unknown>,
): boolean {
  const policy = catalogSourcePolicyForCatalogBook(catalogBook);
  if (!policy?.deviceFetchAllowed) return false;
  const format = catalogDownloadFormat(catalogBook.format_type);
  if (!catalogSourcePolicySupportsFormat(policy, format)) return false;
  catalogSourceVerificationContract(catalogBook);
  return true;
}

export const CATALOG_SERVER_MATERIALIZATION_POLICY = 'format-agnostic-streaming-v2';
export const CATALOG_SERVER_MATERIALIZATION_VERSION = 3;

export type CatalogServerMaterializationSnapshot = {
  policy: typeof CATALOG_SERVER_MATERIALIZATION_POLICY;
  source: string;
  sourceId: string;
  sourceUrl: string;
  format: CatalogMaterializationInputFormat;
  licenseType: string;
  redistributionApproved: true;
  admissionEvidence: Record<string, unknown>;
  existingProof?: {
    key: string;
    sha256: string;
    size: number;
    format: CatalogDownloadFormat;
    mediaType: string;
  };
};

export type CatalogServerMaterializationEligibility =
  | { eligible: true; snapshot: CatalogServerMaterializationSnapshot }
  | {
      eligible: false;
      reason: 'unsupported-source' | 'invalid-edition' | 'rights-denied' | 'not-admitted';
    };

const OAPEN_SERVER_HANDLE_PATTERN = /^20\.500\.12657\/[0-9]+$/;
const OAPEN_REST_RESOURCE_UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const OAPEN_SERVER_PDF_PATH_PATTERN =
  /^\/rest\/bitstreams\/([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/retrieve$/;
const OAPEN_SERVER_RIGHTS_PATTERN =
  /^(?:cc0|cc-by|cc-by-sa)-(?:1\.0|2\.0|2\.5|3\.0|4\.0)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function catalogJsonObject(value: unknown): Record<string, unknown> | null {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
    ? (decoded as Record<string, unknown>)
    : null;
}

function oapenAdmissionEvidence(value: unknown): Record<string, unknown> | null {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const evidence = decoded as Record<string, unknown>;
  if (evidence.activity !== 'ACT-2056') return null;
  for (const key of ['manifestChecksum', 'entryChecksum', 'rowChecksum', 'officialCsvSha256']) {
    if (typeof evidence[key] !== 'string' || !SHA256_PATTERN.test(evidence[key])) return null;
  }
  const resource = evidence.oapenRestResource;
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return null;
  const resourceEvidence = resource as Record<string, unknown>;
  if (
    typeof resourceEvidence.sourceId !== 'string' ||
    !OAPEN_SERVER_HANDLE_PATTERN.test(resourceEvidence.sourceId) ||
    typeof resourceEvidence.responseSha256 !== 'string' ||
    !SHA256_PATTERN.test(resourceEvidence.responseSha256) ||
    typeof resourceEvidence.originalPdfBitstreamUuid !== 'string' ||
    !OAPEN_REST_RESOURCE_UUID_PATTERN.test(resourceEvidence.originalPdfBitstreamUuid) ||
    resourceEvidence.originalPdfRetrievePath !==
      `/rest/bitstreams/${resourceEvidence.originalPdfBitstreamUuid}/retrieve`
  ) {
    return null;
  }
  return evidence;
}

function catalogMaterializationInputFormat(value: unknown): CatalogMaterializationInputFormat | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'zip') return 'zip';
  return catalogSupportedDownloadFormat(normalized) ?? null;
}

function existingCatalogMaterializationProof(
  catalogBook: Record<string, unknown>,
  format: CatalogMaterializationInputFormat,
): CatalogServerMaterializationSnapshot['existingProof'] {
  if (format === 'zip' || catalogBook.caching_status !== 'cached') return undefined;
  const key = typeof catalogBook.cached_file_key === 'string' ? catalogBook.cached_file_key.trim() : '';
  const sha256 = typeof catalogBook.file_hash === 'string' ? catalogBook.file_hash.trim() : '';
  const size = Number(catalogBook.file_size_bytes);
  if (!key || !SHA256_PATTERN.test(sha256) || !Number.isSafeInteger(size) || size <= 0) {
    return undefined;
  }
  return {
    key,
    sha256,
    size,
    format,
    mediaType: BOOK_FORMAT_REGISTRY[format].mimeType,
  };
}

/** Canonical eligibility gate for private server-side catalog materialization. */
export function catalogServerMaterializationEligibility(
  catalogBook: Record<string, unknown>,
): CatalogServerMaterializationEligibility {
  const source = typeof catalogBook.source === 'string' ? catalogBook.source.trim() : '';
  const sourceId = typeof catalogBook.source_id === 'string' ? catalogBook.source_id.trim() : '';
  const sourceUrl =
    typeof catalogBook.source_download_url === 'string'
      ? catalogBook.source_download_url.trim()
      : '';
  const format = catalogMaterializationInputFormat(catalogBook.format_type);
  const policy = catalogSourcePolicyForCatalogBook(catalogBook);
  if (!source || !sourceId || !sourceUrl || !format || !policy) {
    return { eligible: false, reason: 'unsupported-source' };
  }
  if (
    format === 'zip'
      ? !policy.allowedFormats.some((candidate) => candidate === 'cbz' || candidate === 'fbz')
      : !catalogSourcePolicySupportsFormat(policy, format)
  ) {
    return { eligible: false, reason: 'unsupported-source' };
  }

  const licenseType =
    typeof catalogBook.license_type === 'string' ? catalogBook.license_type.trim() : '';
  let admissionEvidence = catalogJsonObject(catalogBook.admission_evidence) ?? {};

  if (source === 'oapen') {
    if (format !== 'pdf' || !OAPEN_SERVER_HANDLE_PATTERN.test(sourceId)) {
      return { eligible: false, reason: 'invalid-edition' };
    }
    const oapenEvidence = oapenAdmissionEvidence(catalogBook.admission_evidence);
    if (!oapenEvidence) return { eligible: false, reason: 'not-admitted' };
    admissionEvidence = oapenEvidence;
    if (!OAPEN_SERVER_RIGHTS_PATTERN.test(licenseType)) {
      return { eligible: false, reason: 'rights-denied' };
    }
  } else if (!policy.cacheRedistributionAllowed) {
    return { eligible: false, reason: 'rights-denied' };
  }

  try {
    catalogSourceUrl(catalogBook, sourceUrl, format);
  } catch {
    return { eligible: false, reason: 'invalid-edition' };
  }

  return {
    eligible: true,
    snapshot: {
      policy: CATALOG_SERVER_MATERIALIZATION_POLICY,
      source,
      sourceId,
      sourceUrl,
      format,
      licenseType,
      redistributionApproved: true,
      admissionEvidence,
      ...(existingCatalogMaterializationProof(catalogBook, format)
        ? { existingProof: existingCatalogMaterializationProof(catalogBook, format) }
        : {}),
    },
  };
}

const CATALOG_SOURCE_ALLOWED_HOSTS: Record<string, CatalogSourceHostPolicy> = {
  'internet-archive': {
    exact: new Set(['archive.org', 'www.archive.org']),
    suffix: new Set(['.archive.org']),
  },
  'standard-ebooks': { exact: new Set(['standardebooks.org', 'www.standardebooks.org']) },
  gutenberg: { exact: new Set(['gutenberg.org', 'www.gutenberg.org']) },
  openstax: { exact: new Set(['assets.openstax.org']) },
  oapen: { exact: new Set(['library.oapen.org', 'www.oapen.org', 'oapen.org']) },
  goalkicker: { exact: new Set(['books.goalkicker.com', 'goalkicker.com', 'www.goalkicker.com']) },
  greenteapress: { exact: new Set(['greenteapress.com', 'www.greenteapress.com']) },
  doab: {
    exact: new Set([
      'directory.doabooks.org',
      'library.oapen.org',
      'www.brepolsonline.net',
      'mdpi.com',
      'www.mdpi.com',
      'mdpi-res.com',
      'www.mdpi-res.com',
    ]),
  },
};

const DOAB_MDPI_SOURCE_HOSTS = new Set([
  'mdpi.com',
  'www.mdpi.com',
  'mdpi-res.com',
  'www.mdpi-res.com',
]);
const OAPEN_BITSTREAM_PDF_PATH_PATTERN = /^\/bitstream\/(?:handle\/)?20\.500\.\d+\/\d+\/(?:\d+\/)?[^/]+\.pdf$/i;
const DOAB_BREPOLIS_PDF_PATH_PATTERN = /^\/doi\/pdf\/[^?#]+$/i;
const DOAB_MDPI_BOOK_VIEW_PATH_PATTERN = /^\/books\/pdfview\/book\/\d+\/?$/;
const DOAB_MDPI_RESOURCE_PDF_PATH_PATTERN = /^\/bookfiles\/book\/\d+\/[^/]+\.pdf$/i;

export class CatalogSourceAvailabilityError extends Error {
  readonly failureCategory: CatalogSourceFailureCategory;
  readonly errorType: string;
  readonly healthCheckStatus?: CatalogSourceUnavailableHealthStatus;
  readonly upstreamStatus?: number;
  readonly contentTypeClass?: string;

  constructor(
    message: string,
    options: {
      failureCategory: CatalogSourceFailureCategory;
      errorType?: string;
      healthCheckStatus?: CatalogSourceUnavailableHealthStatus;
      upstreamStatus?: number;
      contentTypeClass?: string;
    },
  ) {
    super(message);
    this.name = 'CatalogSourceAvailabilityError';
    this.failureCategory = options.failureCategory;
    this.errorType = options.errorType ?? options.failureCategory;
    this.healthCheckStatus = options.healthCheckStatus;
    this.upstreamStatus = options.upstreamStatus;
    this.contentTypeClass = options.contentTypeClass;
  }
}

export function catalogImportFormatSqlList(): string {
  return CATALOG_IMPORT_FORMATS.map((format) => `'${format}'`).join(', ');
}

export function catalogMaterializationInputFormatSqlList(): string {
  return CATALOG_MATERIALIZATION_INPUT_FORMATS.map((format) => `'${format}'`).join(', ');
}

export function isCatalogSourceUnavailableHealthStatus(
  value: unknown,
): value is CatalogSourceUnavailableHealthStatus {
  return (
    typeof value === 'string' &&
    CATALOG_SOURCE_UNAVAILABLE_HEALTH_STATUSES.includes(
      value as CatalogSourceUnavailableHealthStatus,
    )
  );
}

export function catalogSourceHealthStatusForImportFailureErrorType(
  errorType: unknown,
): CatalogSourceUnavailableHealthStatus | null {
  if (errorType === 'source_blocked') return 'source_blocked';
  if (
    typeof errorType === 'string' &&
    CATALOG_SOURCE_UNAVAILABLE_IMPORT_FAILURE_ERROR_TYPES.includes(
      errorType as (typeof CATALOG_SOURCE_UNAVAILABLE_IMPORT_FAILURE_ERROR_TYPES)[number],
    )
  ) {
    return 'source_unavailable';
  }
  return null;
}

export function catalogSourceHealthStatusForStatusRow(row: {
  caching_status?: unknown;
  cachingStatus?: unknown;
  health_check_status?: unknown;
  healthCheckStatus?: unknown;
  import_failure_error_type?: unknown;
  importFailureErrorType?: unknown;
}): CatalogSourceUnavailableHealthStatus | null {
  const healthCheckStatus = row.health_check_status ?? row.healthCheckStatus;
  if (isCatalogSourceUnavailableHealthStatus(healthCheckStatus)) return healthCheckStatus;

  const cachingStatus = row.caching_status ?? row.cachingStatus;
  if (cachingStatus !== 'failed') return null;

  return catalogSourceHealthStatusForImportFailureErrorType(
    row.import_failure_error_type ?? row.importFailureErrorType,
  );
}

export function catalogSourceHealthStatusForAvailabilityError(
  error: CatalogSourceAvailabilityError,
): CatalogSourceUnavailableHealthStatus | null {
  return error.healthCheckStatus ?? catalogSourceHealthStatusForImportFailureErrorType(error.errorType);
}

export function catalogDownloadFormat(format: unknown): CatalogDownloadFormat {
  const normalizedFormat = String(format || '')
    .trim()
    .toLowerCase() as BookFormat;
  const registryEntry = BOOK_FORMAT_REGISTRY[normalizedFormat];

  if (registryEntry?.catalogImport) return normalizedFormat as CatalogDownloadFormat;

  throw new CatalogSourceAvailabilityError(
    `Catalog format is not supported for import: ${normalizedFormat || 'missing'}`,
    {
      failureCategory: 'source_validation',
      errorType: 'unsupported_format',
    },
  );
}

export function catalogSupportedDownloadFormat(format: unknown): CatalogDownloadFormat | undefined {
  const normalizedFormat = String(format || '')
    .trim()
    .toLowerCase() as BookFormat;
  return BOOK_FORMAT_REGISTRY[normalizedFormat]?.catalogImport
    ? (normalizedFormat as CatalogDownloadFormat)
    : undefined;
}

export function sourceDownloadUrlForCatalogBook(catalogBook: Record<string, unknown>): string {
  const source = catalogBook.source as string | undefined;
  const sourceId = catalogBook.source_id as string | undefined;
  const format = catalogDownloadFormat(catalogBook.format_type);

  if (source === 'standard-ebooks' && sourceId) {
    const filename = `${sourceId.replace(/\//g, '_')}.${format}`;
    return `https://standardebooks.org/ebooks/${sourceId}/downloads/${filename}?source=download`;
  }

  return catalogBook.source_download_url as string;
}

export function sourceFailureLogUrlForCatalogBook(catalogBook: Record<string, unknown>): string {
  const sourceDownloadUrl = catalogBook.source_download_url;
  return typeof sourceDownloadUrl === 'string' ? sourceDownloadUrl : '';
}

export function catalogSourceVerificationContract(
  catalogBook: Record<string, unknown>,
): CatalogSourceVerificationContract {
  const format = catalogDownloadFormat(catalogBook.format_type);
  const sourceUrl = sourceDownloadUrlForCatalogBook(catalogBook);
  return {
    sourceUrl,
    url: catalogSourceUrl(catalogBook, sourceUrl, format),
    format,
    acceptHeader: catalogSourceAcceptHeader(format),
    maxBytes: catalogSourceMaxBytes(format),
  };
}

type NormalizedCatalogFormatSelectionCandidate<T extends CatalogFormatSelectionCandidate> = {
  candidate: T;
  sourceUrl: string;
  artifactRevisionId: string;
  format: CatalogDownloadFormat;
  priority: number;
  fingerprint: string;
};

const CATALOG_SOURCE_FILENAME_VARIANTS = ['', '.images', '.noimages'] as const;

function canonicalMediaType(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  const mediaType = value.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType) ? mediaType : null;
}

function filenameMatchesRegistryExtension(
  filename: string,
  extensions: readonly string[],
): boolean {
  return extensions.some((extension) =>
    CATALOG_SOURCE_FILENAME_VARIANTS.some((variant) =>
      filename.endsWith(`.${extension}${variant}`),
    ),
  );
}

function normalizeCatalogFormatSelectionCandidate<T extends CatalogFormatSelectionCandidate>(
  candidate: T,
): NormalizedCatalogFormatSelectionCandidate<T> | null {
  const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
  const sourceId = typeof candidate.sourceId === 'string' ? candidate.sourceId.trim() : '';
  const sourceUrl = typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl.trim() : '';
  const artifactRevisionId =
    typeof candidate.artifactRevisionId === 'string' ? candidate.artifactRevisionId.trim() : '';
  const format = catalogSupportedDownloadFormat(candidate.format);
  if (
    !source ||
    source !== candidate.source ||
    !sourceId ||
    sourceId !== candidate.sourceId ||
    !sourceUrl ||
    sourceUrl !== candidate.sourceUrl ||
    !artifactRevisionId ||
    artifactRevisionId !== candidate.artifactRevisionId ||
    !format ||
    format !== candidate.format ||
    !Number.isSafeInteger(candidate.artifactExtentBytes) ||
    candidate.artifactExtentBytes <= 0 ||
    !Array.isArray(candidate.artifactMediaTypes) ||
    candidate.artifactMediaTypes.length === 0
  ) {
    return null;
  }

  const registry = BOOK_FORMAT_REGISTRY[format];
  if (
    !registry.reader ||
    !registry.catalogImport ||
    !Number.isSafeInteger(registry.catalogSelectionPriority) ||
    registry.catalogSelectionPriority < 0 ||
    candidate.artifactExtentBytes > registry.maxBytes
  ) {
    return null;
  }

  const mediaTypes = candidate.artifactMediaTypes.map(canonicalMediaType);
  if (mediaTypes.some((mediaType) => mediaType === null)) return null;
  const normalizedMediaTypes = [...new Set(mediaTypes as string[])].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );

  let url: URL;
  let filename: string;
  try {
    url = new URL(sourceUrl);
    filename = decodeURIComponent(url.pathname.split('/').pop() ?? '').toLowerCase();
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !filename ||
    filename.includes('/')
  ) {
    return null;
  }
  const registryEntries = Object.entries(BOOK_FORMAT_REGISTRY) as Array<
    [CatalogDownloadFormat, (typeof BOOK_FORMAT_REGISTRY)[CatalogDownloadFormat]]
  >;
  const recognizedMediaTypes = new Set(
    registryEntries.flatMap(([, entry]) => {
      const mediaType = canonicalMediaType(entry.mimeType);
      return entry.reader &&
        entry.catalogImport &&
        mediaType !== null &&
        normalizedMediaTypes.includes(mediaType)
        ? [mediaType]
        : [];
    }),
  );
  if (recognizedMediaTypes.size !== 1) return null;

  const matchingFormats = registryEntries
    .filter(([, entry]) => {
      const mediaType = canonicalMediaType(entry.mimeType);
      return (
        entry.reader &&
        entry.catalogImport &&
        candidate.artifactExtentBytes <= entry.maxBytes &&
        filenameMatchesRegistryExtension(filename, entry.extensions) &&
        mediaType !== null &&
        normalizedMediaTypes.includes(mediaType)
      );
    })
    .map(([candidateFormat]) => candidateFormat);
  if (matchingFormats.length !== 1 || matchingFormats[0] !== format) return null;

  const verification = candidate.verification;
  if (
    !verification ||
    !(verification.url instanceof URL) ||
    verification.sourceUrl !== sourceUrl ||
    verification.url.toString() !== sourceUrl ||
    verification.format !== format ||
    verification.acceptHeader !== registry.catalogAcceptHeader ||
    verification.maxBytes !== registry.maxBytes
  ) {
    return null;
  }

  const fingerprint = JSON.stringify({
    source,
    sourceId,
    sourceUrl,
    artifactRevisionId,
    artifactExtentBytes: candidate.artifactExtentBytes,
    artifactMediaTypes: normalizedMediaTypes,
    format,
    verification: {
      sourceUrl: verification.sourceUrl,
      url: verification.url.toString(),
      format: verification.format,
      acceptHeader: verification.acceptHeader,
      maxBytes: verification.maxBytes,
    },
  });
  return {
    candidate,
    sourceUrl,
    artifactRevisionId,
    format,
    priority: registry.catalogSelectionPriority,
    fingerprint,
  };
}

function formatSelectionClaimFingerprint(candidate: CatalogFormatSelectionCandidate): string {
  const verification = candidate.verification as CatalogSourceVerificationContract | undefined;
  return JSON.stringify([
    candidate.source,
    candidate.sourceId,
    candidate.sourceUrl,
    candidate.format,
    candidate.artifactRevisionId,
    candidate.artifactExtentBytes,
    Array.isArray(candidate.artifactMediaTypes)
      ? [...candidate.artifactMediaTypes].map(String).sort((left, right) =>
          left.localeCompare(right, 'en'),
        )
      : null,
    verification?.sourceUrl,
    verification?.url instanceof URL ? verification.url.toString() : verification?.url,
    verification?.format,
    verification?.acceptHeader,
    verification?.maxBytes,
  ]);
}

export function catalogFormatSelectionCandidateIsValid(
  candidate: CatalogFormatSelectionCandidate,
): boolean {
  return Boolean(candidate && normalizeCatalogFormatSelectionCandidate(candidate));
}

export function selectCanonicalCatalogFormat<T extends CatalogFormatSelectionCandidate>(
  candidates: readonly T[],
): CatalogFormatSelectionResult<T> {
  if (candidates.length === 0) return { ok: false, reason: 'missing-candidate' };

  const claimsByUrl = new Map<string, string>();
  const claimsByRevision = new Map<string, string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      return { ok: false, reason: 'invalid-candidate' };
    }
    const fingerprint = formatSelectionClaimFingerprint(candidate);
    const sourceUrl = typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl.trim() : '';
    const revision =
      typeof candidate.artifactRevisionId === 'string' ? candidate.artifactRevisionId.trim() : '';
    if (
      (sourceUrl && claimsByUrl.has(sourceUrl) && claimsByUrl.get(sourceUrl) !== fingerprint) ||
      (revision && claimsByRevision.has(revision) && claimsByRevision.get(revision) !== fingerprint)
    ) {
      return { ok: false, reason: 'ambiguous-candidate' };
    }
    if (sourceUrl) claimsByUrl.set(sourceUrl, fingerprint);
    if (revision) claimsByRevision.set(revision, fingerprint);
  }

  const normalizedCandidates = candidates.map((candidate) =>
    normalizeCatalogFormatSelectionCandidate(candidate),
  );
  if (normalizedCandidates.some((candidate) => candidate === null)) {
    return { ok: false, reason: 'invalid-candidate' };
  }
  const normalized = normalizedCandidates as Array<NormalizedCatalogFormatSelectionCandidate<T>>;

  const fingerprintsByUrl = new Map<string, string>();
  const fingerprintsByRevision = new Map<string, string>();
  const unique = new Map<string, NormalizedCatalogFormatSelectionCandidate<T>>();
  for (const candidate of normalized) {
    const urlFingerprint = fingerprintsByUrl.get(candidate.sourceUrl);
    const revisionFingerprint = fingerprintsByRevision.get(candidate.artifactRevisionId);
    if (
      (urlFingerprint && urlFingerprint !== candidate.fingerprint) ||
      (revisionFingerprint && revisionFingerprint !== candidate.fingerprint)
    ) {
      return { ok: false, reason: 'ambiguous-candidate' };
    }
    fingerprintsByUrl.set(candidate.sourceUrl, candidate.fingerprint);
    fingerprintsByRevision.set(candidate.artifactRevisionId, candidate.fingerprint);
    unique.set(candidate.fingerprint, candidate);
  }

  const ordered = [...unique.values()].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.format.localeCompare(right.format, 'en') ||
      left.artifactRevisionId.localeCompare(right.artifactRevisionId, 'en') ||
      left.sourceUrl.localeCompare(right.sourceUrl, 'en'),
  );
  const selected = ordered[0];
  if (!selected) return { ok: false, reason: 'invalid-candidate' };
  if (
    ordered.some(
      (candidate) => candidate.priority === selected.priority && candidate.format !== selected.format,
    )
  ) {
    return { ok: false, reason: 'ambiguous-candidate' };
  }

  return {
    ok: true,
    candidate: selected.candidate,
    format: selected.format,
    rejectedCandidateCount: candidates.length - unique.size,
  };
}

export function buildCatalogMetadataRightsEvidence(
  input: CatalogMetadataRightsEvidenceInput,
): CatalogMetadataRightsEvidenceResult {
  if (
    !input ||
    !isExactNonemptyString(input.source) ||
    !isExactNonemptyString(input.sourceId) ||
    !isExactNonemptyString(input.editionId)
  ) {
    return { ok: false, reason: 'invalid-identity' };
  }
  const metadataSourceUrl = canonicalHttpsUrl(input.metadataSourceUrl);
  if (!isExactNonemptyString(input.metadataRevisionId) || !metadataSourceUrl) {
    return { ok: false, reason: 'invalid-metadata-evidence' };
  }

  if (!Array.isArray(input.languages) || input.languages.length === 0) {
    return { ok: false, reason: 'missing-language-evidence' };
  }
  const languageEvidence: Array<{ source: string; canonical: string; primary: string }> = [];
  for (const value of input.languages) {
    if (!isExactNonemptyString(value)) {
      return { ok: false, reason: 'invalid-language-evidence' };
    }
    try {
      const canonical = Intl.getCanonicalLocales(value)[0];
      if (!canonical) return { ok: false, reason: 'invalid-language-evidence' };
      languageEvidence.push({
        source: value,
        canonical,
        primary: new Intl.Locale(canonical).language,
      });
    } catch {
      return { ok: false, reason: 'invalid-language-evidence' };
    }
  }
  const primaryLanguages = new Set(languageEvidence.map(({ primary }) => primary));
  if (primaryLanguages.size !== 1) {
    return { ok: false, reason: 'conflicting-language-evidence' };
  }
  if (primaryLanguages.values().next().value !== 'en') {
    return { ok: false, reason: 'non-english-primary' };
  }

  if (!Array.isArray(input.rights) || input.rights.length === 0) {
    return { ok: false, reason: 'missing-rights-evidence' };
  }
  const rightsByFingerprint = new Map<string, CatalogRightsEvidenceObservation>();
  for (const observation of input.rights) {
    if (
      !observation ||
      !isExactNonemptyString(observation.text) ||
      !isExactNonemptyString(observation.reference)
    ) {
      return { ok: false, reason: 'invalid-rights-evidence' };
    }
    rightsByFingerprint.set(JSON.stringify([observation.text, observation.reference]), observation);
  }
  if (rightsByFingerprint.size !== 1) {
    return { ok: false, reason: 'conflicting-rights-evidence' };
  }
  const rights = rightsByFingerprint.values().next().value;
  if (!rights) return { ok: false, reason: 'missing-rights-evidence' };

  if (!Array.isArray(input.sourceSubjects)) {
    return { ok: false, reason: 'invalid-metadata-evidence' };
  }
  const sourceSubjects = new Set<string>();
  for (const subject of input.sourceSubjects) {
    if (!isExactNonemptyString(subject)) {
      return { ok: false, reason: 'invalid-metadata-evidence' };
    }
    sourceSubjects.add(subject);
  }
  if (!Array.isArray(input.canonicalCategories)) {
    return { ok: false, reason: 'invalid-category-evidence' };
  }
  const requestedCategories = new Set(input.canonicalCategories);
  if (
    requestedCategories.size !== input.canonicalCategories.length ||
    [...requestedCategories].some(
      (category) =>
        typeof category !== 'string' ||
        !(CANONICAL_CATALOG_CATEGORIES as readonly string[]).includes(category),
    )
  ) {
    return { ok: false, reason: 'invalid-category-evidence' };
  }

  if (!Array.isArray(input.formatCandidates) || input.formatCandidates.length === 0) {
    return { ok: false, reason: 'invalid-artifact-evidence' };
  }
  const formatSelection = selectCanonicalCatalogFormat(input.formatCandidates);
  if (!formatSelection.ok) {
    return { ok: false, reason: 'invalid-artifact-evidence' };
  }
  const selected = formatSelection.candidate;
  if (
    selected.source !== input.source ||
    selected.sourceId !== input.sourceId ||
    !input.artifactBinding ||
    input.artifactBinding.sourceUrl !== selected.sourceUrl ||
    input.artifactBinding.artifactRevisionId !== selected.artifactRevisionId ||
    input.artifactBinding.format !== selected.format
  ) {
    return { ok: false, reason: 'artifact-evidence-mismatch' };
  }

  const canonicalLanguageTags = [
    ...new Set(languageEvidence.map(({ canonical }) => canonical)),
  ].sort(compareExactStrings);
  const sourceLanguages = [...new Set(languageEvidence.map(({ source }) => source))].sort(
    compareExactStrings,
  );
  const canonicalCategories = CANONICAL_CATALOG_CATEGORIES.filter((category) =>
    requestedCategories.has(category),
  );

  return {
    ok: true,
    evidence: {
      schemaVersion: 1,
      activation: 'inactive',
      source: input.source,
      sourceId: input.sourceId,
      editionId: input.editionId,
      metadataSourceUrl,
      metadataRevisionId: input.metadataRevisionId,
      sourceLanguages,
      canonicalLanguageTags,
      primaryLanguage: 'en',
      sourceSubjects: [...sourceSubjects].sort(compareExactStrings),
      canonicalCategories,
      rights: { text: rights.text, reference: rights.reference },
      artifact: {
        sourceUrl: selected.sourceUrl,
        artifactRevisionId: selected.artifactRevisionId,
        format: selected.format,
      },
    },
  };
}

export function catalogMetadataRightsEvidenceIsValid(
  evidence: CatalogMetadataRightsEvidence,
  formatCandidates: readonly CatalogFormatSelectionCandidate[],
): boolean {
  try {
    const rebuilt = buildCatalogMetadataRightsEvidence({
      source: evidence.source,
      sourceId: evidence.sourceId,
      editionId: evidence.editionId,
      metadataSourceUrl: evidence.metadataSourceUrl,
      metadataRevisionId: evidence.metadataRevisionId,
      languages: evidence.sourceLanguages,
      sourceSubjects: evidence.sourceSubjects,
      canonicalCategories: evidence.canonicalCategories,
      rights: [evidence.rights],
      formatCandidates,
      artifactBinding: evidence.artifact,
    });
    return rebuilt.ok && catalogEvidenceEquals(rebuilt.evidence, evidence);
  } catch {
    return false;
  }
}

const CATALOG_COVER_MEDIA_TYPES = {
  'image/jpeg': { extensions: ['jpg', 'jpeg'], priority: 0 },
  'image/png': { extensions: ['png'], priority: 1 },
  'image/webp': { extensions: ['webp'], priority: 2 },
  'image/avif': { extensions: ['avif'], priority: 3 },
  'image/gif': { extensions: ['gif'], priority: 4 },
} as const;

type NormalizedCatalogCoverCandidate = {
  candidate: CatalogCoverEvidenceCandidate;
  sourceUrl: string;
  coverRevisionId: string;
  extentBytes: number;
  modifiedAt: string;
  mediaType: keyof typeof CATALOG_COVER_MEDIA_TYPES;
  mediaPriority: number;
  fingerprint: string;
};

export function buildCatalogCoverEvidence(
  input: CatalogCoverEvidenceInput,
): CatalogCoverEvidenceResult {
  const edition = input?.edition;
  if (
    !edition ||
    edition.schemaVersion !== 1 ||
    edition.activation !== 'inactive' ||
    !isExactNonemptyString(edition.source) ||
    !isExactNonemptyString(edition.sourceId) ||
    !isExactNonemptyString(edition.editionId) ||
    !isExactNonemptyString(edition.metadataRevisionId) ||
    !edition.artifact
  ) {
    return { ok: false, reason: 'invalid-edition-evidence' };
  }

  if (!Array.isArray(input.formatCandidates) || input.formatCandidates.length === 0) {
    return { ok: false, reason: 'artifact-evidence-mismatch' };
  }
  const artifactSelection = selectCanonicalCatalogFormat(input.formatCandidates);
  if (
    !artifactSelection.ok ||
    artifactSelection.candidate.source !== edition.source ||
    artifactSelection.candidate.sourceId !== edition.sourceId ||
    artifactSelection.candidate.sourceUrl !== edition.artifact.sourceUrl ||
    artifactSelection.candidate.artifactRevisionId !== edition.artifact.artifactRevisionId ||
    artifactSelection.candidate.format !== edition.artifact.format
  ) {
    return { ok: false, reason: 'artifact-evidence-mismatch' };
  }

  if (!Array.isArray(input.coverCandidates) || input.coverCandidates.length === 0) {
    return { ok: false, reason: 'missing-cover-evidence' };
  }

  const normalized: NormalizedCatalogCoverCandidate[] = [];
  for (const candidate of input.coverCandidates) {
    if (
      !candidate ||
      candidate.source !== edition.source ||
      candidate.sourceId !== edition.sourceId ||
      candidate.editionId !== edition.editionId ||
      !isExactNonemptyString(candidate.coverRevisionId) ||
      !Number.isSafeInteger(candidate.extentBytes) ||
      candidate.extentBytes <= 0 ||
      candidate.extentBytes > CATALOG_COVER_EVIDENCE_MAX_BYTES ||
      !isExactNonemptyString(candidate.modifiedAt) ||
      !isStrictCatalogCoverModifiedTimestamp(candidate.modifiedAt) ||
      !Array.isArray(candidate.mediaTypes) ||
      candidate.mediaTypes.length === 0
    ) {
      return { ok: false, reason: 'invalid-cover-evidence' };
    }

    const sourceUrl = canonicalHttpsUrl(candidate.sourceUrl);
    if (!sourceUrl) return { ok: false, reason: 'invalid-cover-evidence' };
    const url = new URL(sourceUrl);
    const hostPolicy = CATALOG_SOURCE_ALLOWED_HOSTS[edition.source];
    if (
      url.port !== '' ||
      /%(?:00|23|2f|3f|5c)/i.test(url.pathname) ||
      !hostPolicy ||
      !isCatalogSourceHostAllowed(url.hostname, hostPolicy) ||
      !catalogCoverUrlMatchesEdition(edition.source, edition.sourceId, edition.editionId, url)
    ) {
      return { ok: false, reason: 'invalid-cover-evidence' };
    }

    const mediaTypes = new Set<string>();
    for (const value of candidate.mediaTypes) {
      if (!isExactNonemptyString(value)) {
        return { ok: false, reason: 'invalid-cover-evidence' };
      }
      mediaTypes.add(value.split(';', 1)[0]!.trim().toLowerCase());
    }
    if (mediaTypes.size !== 1) return { ok: false, reason: 'invalid-cover-evidence' };
    const mediaType = [...mediaTypes][0] as keyof typeof CATALOG_COVER_MEDIA_TYPES;
    const mediaPolicy = CATALOG_COVER_MEDIA_TYPES[mediaType];
    if (
      !mediaPolicy ||
      !mediaPolicy.extensions.some((extension) =>
        url.pathname.toLowerCase().endsWith(`.${extension}`),
      )
    ) {
      return { ok: false, reason: 'invalid-cover-evidence' };
    }

    const fingerprint = JSON.stringify([
      edition.source,
      edition.sourceId,
      edition.editionId,
      sourceUrl,
      candidate.coverRevisionId,
      candidate.extentBytes,
      candidate.modifiedAt,
      mediaType,
    ]);
    normalized.push({
      candidate,
      sourceUrl,
      coverRevisionId: candidate.coverRevisionId,
      extentBytes: candidate.extentBytes,
      modifiedAt: candidate.modifiedAt,
      mediaType,
      mediaPriority: mediaPolicy.priority,
      fingerprint,
    });
  }

  const fingerprintsByUrl = new Map<string, string>();
  const fingerprintsByRevision = new Map<string, string>();
  const unique = new Map<string, NormalizedCatalogCoverCandidate>();
  for (const candidate of normalized) {
    const urlFingerprint = fingerprintsByUrl.get(candidate.sourceUrl);
    const revisionFingerprint = fingerprintsByRevision.get(candidate.coverRevisionId);
    if (
      (urlFingerprint && urlFingerprint !== candidate.fingerprint) ||
      (revisionFingerprint && revisionFingerprint !== candidate.fingerprint)
    ) {
      return { ok: false, reason: 'ambiguous-cover-evidence' };
    }
    fingerprintsByUrl.set(candidate.sourceUrl, candidate.fingerprint);
    fingerprintsByRevision.set(candidate.coverRevisionId, candidate.fingerprint);
    unique.set(candidate.fingerprint, candidate);
  }

  const selected = [...unique.values()].sort(
    (left, right) =>
      right.extentBytes - left.extentBytes ||
      left.mediaPriority - right.mediaPriority ||
      compareExactStrings(left.sourceUrl, right.sourceUrl) ||
      compareExactStrings(left.coverRevisionId, right.coverRevisionId),
  )[0];
  if (!selected) return { ok: false, reason: 'missing-cover-evidence' };

  return {
    ok: true,
    rejectedCandidateCount: input.coverCandidates.length - unique.size,
    evidence: {
      schemaVersion: 1,
      activation: 'inactive',
      source: edition.source,
      sourceId: edition.sourceId,
      editionId: edition.editionId,
      metadataRevisionId: edition.metadataRevisionId,
      artifact: { ...edition.artifact },
      cover: {
        sourceUrl: selected.sourceUrl,
        coverRevisionId: selected.coverRevisionId,
        extentBytes: selected.extentBytes,
        modifiedAt: selected.modifiedAt,
        mediaType: selected.mediaType,
      },
      storage: {
        state: 'not-written',
        keyIntent: {
          kind: 'catalog_cover',
          owner: { source: edition.source, sourceId: edition.sourceId },
          outputExtension: 'jpg',
        },
      },
    },
  };
}

export function catalogCoverEvidenceIsValid(
  evidence: CatalogCoverEvidence,
  edition: CatalogMetadataRightsEvidence,
  formatCandidates: readonly CatalogFormatSelectionCandidate[],
  coverCandidates: readonly CatalogCoverEvidenceCandidate[],
): boolean {
  try {
    const rebuilt = buildCatalogCoverEvidence({
      edition,
      formatCandidates,
      coverCandidates,
    });
    return rebuilt.ok && catalogEvidenceEquals(rebuilt.evidence, evidence);
  } catch {
    return false;
  }
}

function catalogEvidenceEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => catalogEvidenceEquals(value, right[index]))
    );
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort(compareExactStrings);
  const rightKeys = Object.keys(rightRecord).sort(compareExactStrings);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && catalogEvidenceEquals(leftRecord[key], rightRecord[key]),
    )
  );
}

type CatalogCoverOwnershipPolicy = (sourceId: string, editionId: string, url: URL) => boolean;

const CATALOG_COVER_OWNERSHIP_POLICIES: Readonly<Record<string, CatalogCoverOwnershipPolicy>> = {
  gutenberg: (sourceId, editionId, url) => {
    const sourceMatch = sourceId.match(/^gutenberg-([1-9][0-9]*)$/);
    const editionMatch = editionId.match(/^ebooks\/([1-9][0-9]*)$/);
    if (!sourceMatch || sourceMatch[1] !== editionMatch?.[1]) return false;
    try {
      const ebookId = sourceMatch[1];
      const pathname = decodeURIComponent(url.pathname);
      return new RegExp(
        `^/cache/epub/${ebookId}/pg${ebookId}\\.cover\\.(?:small|medium)\\.(?:jpe?g|png|webp|avif|gif)$`,
        'i',
      ).test(pathname);
    } catch {
      return false;
    }
  },
};

function catalogCoverUrlMatchesEdition(
  source: string,
  sourceId: string,
  editionId: string,
  url: URL,
): boolean {
  return CATALOG_COVER_OWNERSHIP_POLICIES[source]?.(sourceId, editionId, url) ?? false;
}

function isStrictCatalogCoverModifiedTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))?$/,
  );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1]!;
}

function isExactNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function canonicalHttpsUrl(value: unknown): string | null {
  if (!isExactNonemptyString(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function compareExactStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function catalogSourceAcceptHeader(format: CatalogMaterializationInputFormat): string {
  if (format === 'zip') return 'application/zip,application/x-zip-compressed,*/*';
  return BOOK_FORMAT_REGISTRY[format].catalogAcceptHeader!;
}

export function catalogSourceMaxBytes(format: CatalogMaterializationInputFormat): number {
  if (format === 'zip') {
    return Math.max(BOOK_FORMAT_REGISTRY.cbz.maxBytes, BOOK_FORMAT_REGISTRY.fbz.maxBytes);
  }
  return BOOK_FORMAT_REGISTRY[format].maxBytes;
}

function isCatalogSourceHostAllowed(hostname: string, policy: CatalogSourceHostPolicy): boolean {
  const normalizedHostname = hostname.toLowerCase();
  if (policy.exact.has(normalizedHostname)) return true;
  return Array.from(policy.suffix || []).some((suffix) => normalizedHostname.endsWith(suffix));
}

function isInternetArchiveSourcePath(url: URL, sourceId: string): boolean {
  const [, firstSegment, secondSegment, thirdSegment] = url.pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment));

  if (firstSegment === 'download' && secondSegment === sourceId) return true;
  if (/^\d+$/.test(firstSegment || '') && secondSegment === 'items' && thirdSegment === sourceId) {
    return true;
  }

  return false;
}

function isAcademicSourceIdValid(
  source: string | undefined,
  sourceId: string | undefined,
): boolean {
  if (source !== 'oapen' && source !== 'doab') return true;
  if (!sourceId || sourceId.length > 160) return false;
  if (source === 'oapen' && OAPEN_SERVER_HANDLE_PATTERN.test(sourceId)) return true;
  return sourceId.startsWith(`${source}-`) && ACADEMIC_SOURCE_ID_PATTERN.test(sourceId);
}

function isOapenSourceUrl(
  catalogBook: Record<string, unknown>,
  url: URL,
  format: CatalogMaterializationInputFormat,
): boolean {
  if (
    format !== 'pdf' ||
    url.hostname.toLowerCase() !== 'library.oapen.org' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return false;
  }
  const sourceId =
    typeof catalogBook.source_id === 'string' ? catalogBook.source_id.trim() : '';
  const admissionEvidence = oapenAdmissionEvidence(catalogBook.admission_evidence);
  const resourceEvidence = admissionEvidence?.oapenRestResource as
    | Record<string, unknown>
    | undefined;
  const pathMatch = decodeURIComponent(url.pathname).match(OAPEN_SERVER_PDF_PATH_PATTERN);
  return (
    OAPEN_SERVER_HANDLE_PATTERN.test(sourceId) &&
    resourceEvidence?.sourceId === sourceId &&
    resourceEvidence.originalPdfBitstreamUuid === pathMatch?.[1] &&
    resourceEvidence.originalPdfRetrievePath === url.pathname
  );
}

function isDoabSourceUrl(url: URL, format: CatalogMaterializationInputFormat): boolean {
  if (format !== 'pdf') return false;

  const hostname = url.hostname.toLowerCase();
  const decodedPathname = decodeURIComponent(url.pathname);
  if (hostname === 'library.oapen.org' || hostname === 'directory.doabooks.org') {
    return OAPEN_BITSTREAM_PDF_PATH_PATTERN.test(decodedPathname);
  }
  if (hostname === 'www.brepolsonline.net') {
    return DOAB_BREPOLIS_PDF_PATH_PATTERN.test(decodedPathname);
  }
  if (hostname === 'mdpi.com' || hostname === 'www.mdpi.com') {
    return DOAB_MDPI_BOOK_VIEW_PATH_PATTERN.test(decodedPathname);
  }
  if (DOAB_MDPI_SOURCE_HOSTS.has(hostname)) {
    return DOAB_MDPI_RESOURCE_PDF_PATH_PATTERN.test(decodedPathname);
  }
  return false;
}

export function catalogSourceUrl(
  catalogBook: Record<string, unknown>,
  sourceUrl: string,
  format: CatalogMaterializationInputFormat = catalogDownloadFormat(catalogBook.format_type),
): URL {
  const source = catalogBook.source as string | undefined;
  const sourceId = catalogBook.source_id as string | undefined;
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('Catalog source URL is invalid');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Catalog source URL must use HTTPS');
  }

  if (url.port && url.port !== '443') {
    throw new Error('Catalog source URL must use the default HTTPS port');
  }

  if (url.username || url.password) {
    throw new Error('Catalog source URL must not include credentials');
  }

  const allowedHosts = source ? CATALOG_SOURCE_ALLOWED_HOSTS[source] : undefined;
  if (!allowedHosts || !isCatalogSourceHostAllowed(url.hostname, allowedHosts)) {
    throw new Error(`Catalog source host is not authorized for ${source || 'unknown source'}`);
  }

  if (source === 'internet-archive' && sourceId && !isInternetArchiveSourcePath(url, sourceId)) {
    throw new Error('Internet Archive source URL does not match catalog source id');
  }

  if (source === 'standard-ebooks' && sourceId) {
    const expectedPrefix = `/ebooks/${sourceId}/downloads/`;
    if (!decodeURIComponent(url.pathname).startsWith(expectedPrefix)) {
      throw new Error('Standard Ebooks source URL does not match catalog source id');
    }
  }

  if (!isAcademicSourceIdValid(source, sourceId)) {
    throw new Error(`Catalog source id is not valid for ${source || 'unknown source'}`);
  }

  if (source === 'oapen' && !isOapenSourceUrl(catalogBook, url, format)) {
    throw new Error('OAPEN source URL does not match catalog source policy');
  }

  if (source === 'doab' && !isDoabSourceUrl(url, format)) {
    throw new Error('DOAB source URL does not match catalog source policy');
  }

  return url;
}

export function catalogContentTypeClass(contentType: string | null): CatalogContentTypeClass {
  const normalizedContentType = (contentType || '').toLowerCase();
  if (!normalizedContentType) return 'missing';
  if (normalizedContentType.includes('html')) return 'html';
  if (normalizedContentType.includes('fictionbook')) return 'fictionbook';
  if (normalizedContentType.includes('xml')) return 'xml';
  if (normalizedContentType.includes('pdf')) return 'pdf';
  if (normalizedContentType.includes('epub')) return 'epub';
  if (
    normalizedContentType.includes('mobipocket') ||
    normalizedContentType.includes('amazon.ebook')
  ) {
    return 'mobi';
  }
  if (normalizedContentType.includes('comicbook') || normalizedContentType.includes('zip')) {
    return 'archive';
  }
  if (normalizedContentType.includes('octet-stream') || normalizedContentType.includes('binary')) {
    return 'binary';
  }
  if (normalizedContentType.includes('json')) return 'json';
  if (normalizedContentType.includes('markdown')) return 'markdown';
  if (normalizedContentType.includes('text/')) return 'text';
  return 'other';
}

export function catalogExpectedContentTypeMatches(
  format: CatalogMaterializationInputFormat,
  contentTypeClass: CatalogContentTypeClass,
): boolean {
  if (format === 'zip') {
    return (['archive', 'binary', 'missing'] as const).includes(
      contentTypeClass as 'archive' | 'binary' | 'missing',
    );
  }
  const allowedContentTypeClasses = BOOK_FORMAT_REGISTRY[format].catalogContentTypeClasses as
    | readonly CatalogContentTypeClass[]
    | undefined;
  return allowedContentTypeClasses?.includes(contentTypeClass) ?? false;
}

export function catalogSourceAvailabilityErrorForResponse(
  response: Response,
  format: CatalogMaterializationInputFormat,
): CatalogSourceAvailabilityError {
  const contentTypeClass = catalogContentTypeClass(response.headers.get('content-type'));
  const upstreamStatus = response.status;

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return new CatalogSourceAvailabilityError(
      `Source blocked with ${upstreamStatus} ${contentTypeClass} response`,
      {
        failureCategory: 'source_blocked',
        errorType: 'source_blocked',
        healthCheckStatus: 'source_blocked',
        upstreamStatus,
        contentTypeClass,
      },
    );
  }

  if (upstreamStatus === 404 || upstreamStatus === 410) {
    return new CatalogSourceAvailabilityError(
      `Source unavailable with ${upstreamStatus} response`,
      {
        failureCategory: 'source_unavailable',
        errorType: 'source_unavailable',
        healthCheckStatus: 'source_unavailable',
        upstreamStatus,
        contentTypeClass,
      },
    );
  }

  if (upstreamStatus >= 500) {
    return new CatalogSourceAvailabilityError(`Source returned ${upstreamStatus}`, {
      failureCategory: 'source_http',
      errorType: 'source_http_error',
      upstreamStatus,
      contentTypeClass,
    });
  }

  if (!catalogExpectedContentTypeMatches(format, contentTypeClass)) {
    return new CatalogSourceAvailabilityError(
      `Source unavailable: expected ${format} but received ${contentTypeClass}`,
      {
        failureCategory: 'source_unavailable',
        errorType: 'source_unavailable',
        healthCheckStatus: 'source_unavailable',
        upstreamStatus,
        contentTypeClass,
      },
    );
  }

  return new CatalogSourceAvailabilityError(`Source returned ${upstreamStatus}`, {
    failureCategory: 'source_http',
    errorType: 'source_http_error',
    upstreamStatus,
    contentTypeClass,
  });
}

export function catalogSourceAvailabilityErrorForContentType(
  contentType: string,
  format: CatalogMaterializationInputFormat,
): CatalogSourceAvailabilityError | null {
  const contentTypeClass = catalogContentTypeClass(contentType);
  if (catalogExpectedContentTypeMatches(format, contentTypeClass)) return null;

  return new CatalogSourceAvailabilityError(
    `Source unavailable: expected ${format} but received ${contentTypeClass}`,
    {
      failureCategory:
        contentTypeClass === 'html' || contentTypeClass === 'xml'
          ? 'source_blocked'
          : 'source_unavailable',
      errorType:
        contentTypeClass === 'html' || contentTypeClass === 'xml'
          ? 'source_blocked'
          : 'source_unavailable',
      healthCheckStatus:
        contentTypeClass === 'html' || contentTypeClass === 'xml'
          ? 'source_blocked'
          : 'source_unavailable',
      contentTypeClass,
    },
  );
}

export type CatalogFileSignatureResult =
  | { ok: true; format: CatalogDownloadFormat }
  | { ok: false; reason: 'invalid' | 'ambiguous' };

function zipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function textProbeBytesAreValid(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  return !bytes.some((byte) => byte === 0 || byte < 0x09 || (byte > 0x0d && byte < 0x20));
}

/** Validate only bounded leading bytes collected by remote source-health probes. */
export function catalogFileProbeBytesAreValid(
  bytes: Uint8Array,
  format: CatalogDownloadFormat,
): boolean {
  switch (format) {
    case 'pdf':
      return bytes.length >= 4 && asciiAt(bytes, 0, 4) === '%PDF';
    case 'epub':
    case 'fbz':
    case 'cbz':
      return zipSignature(bytes);
    case 'mobi':
    case 'azw':
    case 'azw3':
      return bytes.length >= 68 && asciiAt(bytes, 60, 68) === 'BOOKMOBI';
    case 'fb2': {
      try {
        const text = new TextDecoder('utf-8', { fatal: true })
          .decode(bytes)
          .replace(/^\uFEFF/, '')
          .trimStart();
        return text.startsWith('<FictionBook') ||
          (text.startsWith('<?xml') && text.includes('<FictionBook'));
      } catch {
        return false;
      }
    }
    case 'txt':
    case 'md':
      return textProbeBytesAreValid(bytes);
  }
}

export function catalogFileProbeBytesAvailabilityError(
  bytes: Uint8Array,
  format: CatalogDownloadFormat,
): CatalogSourceAvailabilityError | null {
  if (catalogFileProbeBytesAreValid(bytes, format)) return null;
  return new CatalogSourceAvailabilityError(
    `Source returned invalid ${format.toUpperCase()} probe bytes`,
    {
      failureCategory: 'source_unavailable',
      errorType: 'source_unavailable',
      healthCheckStatus: 'source_unavailable',
    },
  );
}
