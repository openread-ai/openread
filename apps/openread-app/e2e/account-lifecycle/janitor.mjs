#!/usr/bin/env node

import { createLiveAccountLifecycle } from './runtime.mjs';

if (process.env.OPENREAD_E2E_JANITOR !== '1') {
  throw new Error('E2E account janitor is disabled; set OPENREAD_E2E_JANITOR=1 explicitly');
}

const hours = Number(process.env.OPENREAD_E2E_JANITOR_MAX_AGE_HOURS ?? '6');
if (!Number.isFinite(hours) || hours < 0) {
  throw new Error('OPENREAD_E2E_JANITOR_MAX_AGE_HOURS must be a non-negative number');
}

const { lifecycle } = createLiveAccountLifecycle();
const report = await lifecycle.reapStale({ olderThanMs: Math.round(hours * 60 * 60 * 1000) });

console.log(
  JSON.stringify({
    scanned: report.scanned,
    marked: report.marked,
    eligible: report.eligible,
    skippedYoung: report.skippedYoung,
    reaped: report.reaped.length,
    failures: report.failures,
  }),
);

if (report.failures.length > 0) process.exitCode = 1;
