export type SectionIdentityCandidate = string | number | null | undefined;

function normalizeIdentity(value: SectionIdentityCandidate): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function sectionIdentityWithoutFragment(
  value: SectionIdentityCandidate,
): string | undefined {
  const normalized = normalizeIdentity(value);
  if (!normalized) return undefined;
  const hashIndex = normalized.indexOf('#');
  return hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
}

export function sectionIdentitiesMatch(
  candidate: SectionIdentityCandidate,
  target: SectionIdentityCandidate,
): boolean {
  const normalizedCandidate = normalizeIdentity(candidate);
  const normalizedTarget = normalizeIdentity(target);
  if (!normalizedCandidate || !normalizedTarget) return false;

  if (normalizedCandidate === normalizedTarget) return true;

  const candidateBase = sectionIdentityWithoutFragment(normalizedCandidate);
  const targetBase = sectionIdentityWithoutFragment(normalizedTarget);
  return Boolean(candidateBase && targetBase && candidateBase === targetBase);
}

export function findSectionIdentityIndex<T>(
  items: readonly T[],
  target: SectionIdentityCandidate,
  getCandidates: (item: T) => readonly SectionIdentityCandidate[],
): number {
  if (normalizeIdentity(target) === undefined) return -1;
  return items.findIndex((item) =>
    getCandidates(item).some((candidate) => sectionIdentitiesMatch(candidate, target)),
  );
}
