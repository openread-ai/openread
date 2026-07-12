import type { BookFormat } from './book.js';

export const CATALOG_SOURCE_FETCH_TIMEOUT_MS = 120_000;
export const CATALOG_SOURCE_FETCH_REDIRECT_LIMIT = 3;

export type CatalogDownloadFormat = Extract<BookFormat, 'epub' | 'pdf'>;
export type CatalogSourceUnavailableHealthStatus = 'source_blocked' | 'source_unavailable';
export type CatalogSourceHealthStatus = 'pending' | 'verified' | CatalogSourceUnavailableHealthStatus;
export type CatalogSourceFailureCategory =
  | 'source_blocked'
  | 'source_unavailable'
  | 'source_network'
  | 'source_timeout'
  | 'source_http'
  | 'source_validation';

export const CATALOG_IMPORT_FORMATS = ['epub', 'pdf'] as const satisfies readonly CatalogDownloadFormat[];
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
  | 'binary'
  | 'json'
  | 'text'
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
  catalogAcceptHeader?: string;
  catalogContentTypeClasses?: readonly CatalogContentTypeClass[];
};

const CATALOG_IMPORT_FORMAT_SUPPORT = {
  reader: true,
  localImport: true,
  platformUpload: true,
  catalogImport: true,
} as const;

const NON_PLATFORM_FORMAT_SUPPORT = {
  reader: true,
  localImport: true,
  platformUpload: false,
  catalogImport: false,
} as const;

export const BOOK_FORMAT_REGISTRY = {
  epub: {
    extension: 'epub',
    extensions: ['epub'],
    mimeType: 'application/epub+zip',
    maxBytes: 100 * 1024 * 1024,
    ...CATALOG_IMPORT_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/epub+zip,*/*',
    catalogContentTypeClasses: ['epub', 'binary', 'missing'],
  },
  pdf: {
    extension: 'pdf',
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    maxBytes: 200 * 1024 * 1024,
    ...CATALOG_IMPORT_FORMAT_SUPPORT,
    catalogAcceptHeader: 'application/pdf,*/*',
    catalogContentTypeClasses: ['pdf', 'binary', 'missing'],
  },
  mobi: {
    extension: 'mobi',
    extensions: ['mobi'],
    mimeType: 'application/x-mobipocket-ebook',
    maxBytes: 100 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  azw: {
    extension: 'azw',
    extensions: ['azw'],
    mimeType: 'application/vnd.amazon.ebook',
    maxBytes: 100 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  azw3: {
    extension: 'azw3',
    extensions: ['azw3'],
    mimeType: 'application/vnd.amazon.ebook',
    maxBytes: 100 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  fb2: {
    extension: 'fb2',
    extensions: ['fb2'],
    mimeType: 'application/x-fictionbook+xml',
    maxBytes: 50 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  fbz: {
    extension: 'fbz',
    extensions: ['fbz'],
    mimeType: 'application/x-fictionbook+xml',
    maxBytes: 50 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  cbz: {
    extension: 'cbz',
    extensions: ['cbz'],
    mimeType: 'application/vnd.comicbook+zip',
    maxBytes: 500 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  txt: {
    extension: 'txt',
    extensions: ['txt'],
    mimeType: 'text/plain',
    maxBytes: 10 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
  md: {
    extension: 'md',
    extensions: ['md', 'markdown'],
    mimeType: 'text/markdown',
    maxBytes: 10 * 1024 * 1024,
    ...NON_PLATFORM_FORMAT_SUPPORT,
  },
} as const satisfies Record<BookFormat, BookFormatRegistryEntry>;

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
    `(${source} = 'oapen' AND CHAR_LENGTH(${sourceId}) <= 160 AND (${sourceId} ~ '^oapen-${ACADEMIC_SOURCE_ID_SUFFIX_PATTERN}$' OR (${sourceId} ~ '^20\\.500\\.12657/[0-9]+$' AND SUBSTRING(${sourceUrl} FROM '/bitstream/(?:handle/)?(20\\.500\\.12657/[0-9]+)(?:/|$)') = ${sourceId})) AND ${sourceUrl} ~* '^https://library\\.oapen\\.org/bitstream/(?:handle/)?20\\.500\\.[0-9]+/[0-9]+/(?:[0-9]+/)?[^/?#]+\\.pdf(?:[?#].*)?$')`,
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

export const CATALOG_SERVER_MATERIALIZATION_POLICY = 'oapen-act-2056-v1';
export const CATALOG_SERVER_MATERIALIZATION_VERSION = 1;

export type CatalogServerMaterializationSnapshot = {
  policy: typeof CATALOG_SERVER_MATERIALIZATION_POLICY;
  source: 'oapen';
  sourceId: string;
  sourceUrl: string;
  format: 'pdf';
  licenseType: string;
  redistributionApproved: true;
  admissionEvidence: Record<string, unknown>;
};

export type CatalogServerMaterializationEligibility =
  | { eligible: true; snapshot: CatalogServerMaterializationSnapshot }
  | {
      eligible: false;
      reason: 'unsupported-source' | 'invalid-edition' | 'rights-denied' | 'not-admitted';
    };

const OAPEN_SERVER_HANDLE_PATTERN = /^20\.500\.12657\/[0-9]+$/;
const OAPEN_SERVER_PDF_PATH_PATTERN =
  /^\/bitstream\/(?:handle\/)?(20\.500\.12657\/[0-9]+)(?:\/[0-9]+)?\/[^/?#]+\.pdf$/i;
const OAPEN_SERVER_RIGHTS_PATTERN =
  /^(?:cc0|cc-by|cc-by-sa)-(?:1\.0|2\.0|2\.5|3\.0|4\.0)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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
  return evidence;
}

/**
 * Canonical eligibility gate for private server-side catalog materialization.
 * This deliberately does not alter the generic OAPEN cache policy: only the
 * bounded ACT-2056 editions with checksum-bound admission evidence are eligible.
 */
export function catalogServerMaterializationEligibility(
  catalogBook: Record<string, unknown>,
): CatalogServerMaterializationEligibility {
  if (
    catalogBook.source !== 'oapen' ||
    String(catalogBook.format_type ?? '').trim().toLowerCase() !== 'pdf'
  ) {
    return { eligible: false, reason: 'unsupported-source' };
  }
  const sourceId = typeof catalogBook.source_id === 'string' ? catalogBook.source_id.trim() : '';
  const sourceUrl =
    typeof catalogBook.source_download_url === 'string'
      ? catalogBook.source_download_url.trim()
      : '';
  if (!OAPEN_SERVER_HANDLE_PATTERN.test(sourceId)) {
    return { eligible: false, reason: 'invalid-edition' };
  }
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { eligible: false, reason: 'invalid-edition' };
  }
  let pathMatch: RegExpMatchArray | null;
  try {
    pathMatch = decodeURIComponent(url.pathname).match(OAPEN_SERVER_PDF_PATH_PATTERN);
  } catch {
    return { eligible: false, reason: 'invalid-edition' };
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'library.oapen.org' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    /%(?:2f|5c|3f|23)/i.test(url.pathname) ||
    pathMatch?.[1] !== sourceId
  ) {
    return { eligible: false, reason: 'invalid-edition' };
  }
  const licenseType =
    typeof catalogBook.license_type === 'string' ? catalogBook.license_type.trim() : '';
  if (!OAPEN_SERVER_RIGHTS_PATTERN.test(licenseType)) {
    return { eligible: false, reason: 'rights-denied' };
  }
  const admissionEvidence = oapenAdmissionEvidence(catalogBook.admission_evidence);
  if (!admissionEvidence) return { eligible: false, reason: 'not-admitted' };
  return {
    eligible: true,
    snapshot: {
      policy: CATALOG_SERVER_MATERIALIZATION_POLICY,
      source: 'oapen',
      sourceId,
      sourceUrl,
      format: 'pdf',
      licenseType,
      redistributionApproved: true,
      admissionEvidence,
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

export function catalogSourceAcceptHeader(format: CatalogDownloadFormat): string {
  return BOOK_FORMAT_REGISTRY[format].catalogAcceptHeader!;
}

export function catalogSourceMaxBytes(format: CatalogDownloadFormat): number {
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
  url: URL,
): boolean {
  if (source !== 'oapen' && source !== 'doab') return true;
  if (!sourceId || sourceId.length > 160) return false;
  if (source === 'oapen' && OAPEN_SERVER_HANDLE_PATTERN.test(sourceId)) {
    try {
      return (
        decodeURIComponent(url.pathname).match(OAPEN_SERVER_PDF_PATH_PATTERN)?.[1] === sourceId
      );
    } catch {
      return false;
    }
  }
  return sourceId.startsWith(`${source}-`) && ACADEMIC_SOURCE_ID_PATTERN.test(sourceId);
}

function isOapenSourceUrl(url: URL, format: CatalogDownloadFormat): boolean {
  if (format !== 'pdf' || url.hostname.toLowerCase() !== 'library.oapen.org') return false;
  return OAPEN_BITSTREAM_PDF_PATH_PATTERN.test(decodeURIComponent(url.pathname));
}

function isDoabSourceUrl(url: URL, format: CatalogDownloadFormat): boolean {
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
  format = catalogDownloadFormat(catalogBook.format_type),
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

  if (!isAcademicSourceIdValid(source, sourceId, url)) {
    throw new Error(`Catalog source id is not valid for ${source || 'unknown source'}`);
  }

  if (source === 'oapen' && !isOapenSourceUrl(url, format)) {
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
  if (normalizedContentType.includes('xml')) return 'xml';
  if (normalizedContentType.includes('pdf')) return 'pdf';
  if (normalizedContentType.includes('epub') || normalizedContentType.includes('zip')) {
    return 'epub';
  }
  if (normalizedContentType.includes('octet-stream') || normalizedContentType.includes('binary')) {
    return 'binary';
  }
  if (normalizedContentType.includes('json')) return 'json';
  if (normalizedContentType.includes('text/')) return 'text';
  return 'other';
}

export function catalogExpectedContentTypeMatches(
  format: CatalogDownloadFormat,
  contentTypeClass: CatalogContentTypeClass,
): boolean {
  const allowedContentTypeClasses = BOOK_FORMAT_REGISTRY[format].catalogContentTypeClasses as
    | readonly CatalogContentTypeClass[]
    | undefined;
  return allowedContentTypeClasses?.includes(contentTypeClass) ?? false;
}

export function catalogSourceAvailabilityErrorForResponse(
  response: Response,
  format: CatalogDownloadFormat,
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
  format: CatalogDownloadFormat,
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

export function catalogPdfBytesAreValid(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && asciiAt(bytes, 0, 4) === '%PDF';
}

export function catalogEpubBytesAreValid(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytesContainAscii(bytes, 'mimetypeapplication/epub+zip') ||
      bytesContainAscii(bytes, 'META-INF/container.xml'))
  );
}

export function catalogFileBytesAreValid(bytes: Uint8Array, format: CatalogDownloadFormat): boolean {
  return format === 'pdf' ? catalogPdfBytesAreValid(bytes) : catalogEpubBytesAreValid(bytes);
}

export function catalogFileBytesAvailabilityError(
  bytes: Uint8Array,
  format: CatalogDownloadFormat,
): CatalogSourceAvailabilityError | null {
  if (catalogFileBytesAreValid(bytes, format)) return null;
  return new CatalogSourceAvailabilityError(`Source returned invalid ${format.toUpperCase()} bytes`, {
    failureCategory: 'source_unavailable',
    errorType: 'source_unavailable',
    healthCheckStatus: 'source_unavailable',
  });
}

export function catalogFileBytesValidationError(
  bytes: Uint8Array,
  format: CatalogDownloadFormat,
): Error | null {
  return catalogFileBytesAvailabilityError(bytes, format);
}

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function bytesContainAscii(bytes: Uint8Array, needle: string): boolean {
  if (!needle) return true;
  const needleBytes = Array.from(needle, (char) => char.charCodeAt(0));
  const limit = bytes.length - needleBytes.length;
  for (let index = 0; index <= limit; index++) {
    let matched = true;
    for (let needleIndex = 0; needleIndex < needleBytes.length; needleIndex++) {
      if (bytes[index + needleIndex] !== needleBytes[needleIndex]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}
