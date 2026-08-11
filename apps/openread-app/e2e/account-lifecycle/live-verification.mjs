#!/usr/bin/env node

import { createLiveAccountLifecycle } from './runtime.mjs';

if (process.env.OPENREAD_E2E_ACCOUNT_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Live account lifecycle verification is disabled; set OPENREAD_E2E_ACCOUNT_LIFECYCLE_LIVE=1 explicitly',
  );
}

const runtime = createLiveAccountLifecycle();
let account;

try {
  account = await runtime.lifecycle.provision(`live-${Date.now()}`);
  const session = await runtime.lifecycle.signIn(account);
  await runtime.seedSentinelArtifact(account);

  const proof = await runtime.finalizeThroughProductApi(account, session.access_token);

  if (!proof.signInRejected || !proof.r2PrefixEmpty || proof.objects.length !== 1) {
    throw new Error('Live account lifecycle proof was incomplete');
  }

  console.log(
    JSON.stringify({
      ok: true,
      signInRejected: proof.signInRejected,
      verifiedTables: proof.database.length,
      verifiedObjects: proof.objects.length,
      r2PrefixEmpty: proof.r2PrefixEmpty,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));

  if (account) {
    try {
      await runtime.lifecycle.deleteMarkedAccount(account.userId);
    } catch (cleanupError) {
      console.error(
        `Marked-account cleanup did not complete: ${
          cleanupError instanceof Error ? cleanupError.message : cleanupError
        }`,
      );
    }
  }
  process.exitCode = 1;
}
