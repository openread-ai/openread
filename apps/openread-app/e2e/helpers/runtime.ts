const NODE_MAJOR_RANGE = /^(\d+)\.x$/;

export function expectedNodeMajor(range: string): number {
  const match = NODE_MAJOR_RANGE.exec(range.trim());
  if (!match) throw new Error(`PLAYWRIGHT_NODE_RUNTIME_CONFIG_INVALID:${range}`);
  return Number(match[1]);
}

export function assertPlaywrightNodeRuntime(version: string, expectedRange: string): void {
  const expectedMajor = expectedNodeMajor(expectedRange);
  const actualMajor = Number(version.split('.')[0]);

  if (actualMajor === expectedMajor) return;

  throw new Error(
    `PLAYWRIGHT_NODE_RUNTIME_MISMATCH: expected ${expectedRange}, received ${version}. ` +
      'Use the Node 22 runtime shared by CI and ops/flake.nix.',
  );
}
