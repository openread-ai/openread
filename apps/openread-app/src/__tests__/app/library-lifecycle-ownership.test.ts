import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function appSource(path: string): string {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('account-library lifecycle ownership', () => {
  it('owns platform-route initialization at the shared authenticated boundary', () => {
    const layout = appSource('app/(platform)/layout.tsx');

    expect(layout).toContain('<LibraryLifecycleProvider>');
    expect(layout).toContain('<PlatformShell>{children}</PlatformShell>');
  });

  it.each([
    'app/(platform)/home/page.tsx',
    'app/(platform)/get-started/page.tsx',
    'app/(platform)/library/client.tsx',
    'app/(platform)/collections/client.tsx',
  ])('does not duplicate lifecycle ownership in %s', (path) => {
    expect(appSource(path)).not.toContain("from '@/hooks/useLibrary'");
  });

  it('retains an explicit owner for Reader outside the platform layout', () => {
    const reader = appSource('app/reader/components/Reader.tsx');

    expect(reader).toContain("import { useLibrary } from '@/hooks/useLibrary'");
  });
});
