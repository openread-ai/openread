#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));
const snapshot = (value) => Object.freeze(JSON.parse(JSON.stringify(value)));

const emptyStateSummary = (state) => ({
  authExists: state?.auth?.exists === true,
  databaseRows: Array.isArray(state?.database)
    ? state.database.reduce((total, row) => total + row.count, 0)
    : null,
  objects: Array.isArray(state?.objects) ? state.objects.length : null,
});

const isEmptyState = (state) =>
  state?.authExists === false && state.databaseRows === 0 && state.objects === 0;

export class SignupLifecycleError extends Error {
  constructor(message, { cause, report }) {
    super(message, { cause });
    this.name = 'SignupLifecycleError';
    this.report = report;
  }
}

export async function runSignupLifecycle({ runtime, runId, onEvidence = async () => {} }) {
  if (!runtime?.lifecycle) throw new Error('Missing signup account lifecycle');
  if (typeof onEvidence !== 'function') throw new Error('onEvidence must be a function');

  const credentials = runtime.lifecycle.prepareSignup(runId);
  const report = {
    ok: false,
    stage: 'prepared',
    runId,
    emailHash: createHash('sha256').update(credentials.email).digest('hex'),
    publicSignupUserCreated: false,
    immediateSessionVerified: false,
    markerVerified: false,
    authenticatedIdentityMatched: false,
    plannedCleanupCompleted: false,
    cleanupOutcome: 'not-attributable',
    finalState: null,
  };
  const emit = () => onEvidence(snapshot(report));
  await emit();

  let account;
  let primaryError;
  let cleanupError;

  try {
    await runtime.assertSignupEmailAbsent(credentials.email);
    report.stage = 'preflight-complete';
    await emit();

    const signup = await runtime.publicSignUp({
      email: credentials.email,
      password: credentials.password,
      emailRedirectTo: runtime.signupRedirectTo,
    });
    if (typeof signup?.user?.id !== 'string' || !signup.user.id) {
      throw new Error('Public signup returned no user id');
    }
    account = runtime.lifecycle.adoptSignupAccount(credentials, signup.user.id);
    report.publicSignupUserCreated = true;
    report.stage = 'public-signup-complete';
    await emit();

    const session = signup.session;
    const policyError =
      !session || session.user?.id !== account.userId || !session.access_token
        ? new Error(
            'Public signup confirmation-policy drift: expected an immediate same-user session',
          )
        : null;

    // Stamp immediately after the public user exists so even policy drift remains
    // attributable to the marker-gated cleanup authority.
    await runtime.lifecycle.stampSignupAccount(account);
    report.markerVerified = true;
    report.stage = 'marker-verified';
    await emit();

    if (policyError) throw policyError;
    report.immediateSessionVerified = true;

    const identity = await runtime.getAuthenticatedIdentity(session.access_token);
    if (identity?.id !== account.userId) {
      throw new Error('Authenticated identity lookup returned a different user');
    }
    report.authenticatedIdentityMatched = true;
    report.stage = 'identity-verified';
    await emit();

    await runtime.lifecycle.deleteMarkedAccount(account.userId);
    report.plannedCleanupCompleted = true;
    report.stage = 'planned-cleanup-complete';
    await emit();
  } catch (error) {
    primaryError = error;
    report.error = errorMessage(error).replaceAll(credentials.email, '[redacted-email]');
    report.stage = 'failed';
    await emit();
  } finally {
    if (account) {
      try {
        const cleanup = await runtime.lifecycle.cleanupPreparedAccount(account);
        report.cleanupOutcome = cleanup.outcome;
        report.finalState = emptyStateSummary(cleanup.stateAfter);
        if (cleanup.outcome !== 'already-clean' || !isEmptyState(report.finalState)) {
          throw new Error(
            `Signup lifecycle did not prove an already-clean empty final state (outcome: ${cleanup.outcome})`,
          );
        }
      } catch (error) {
        cleanupError = error;
        report.cleanupError = errorMessage(error).replaceAll(credentials.email, '[redacted-email]');
      }
    }
    report.ok = !primaryError && !cleanupError;
    report.stage = report.ok ? 'complete' : 'failed';
    await emit();
  }

  const finalReport = snapshot(report);
  if (primaryError || cleanupError) {
    throw new SignupLifecycleError(
      [primaryError ? report.error : null, cleanupError ? report.cleanupError : null]
        .filter(Boolean)
        .join('; '),
      { cause: primaryError ?? cleanupError, report: finalReport },
    );
  }
  return finalReport;
}

async function runFromCommandLine() {
  if (process.env.OPENREAD_E2E_SIGNUP_LIFECYCLE_LIVE !== '1') {
    throw new Error(
      'Signup lifecycle is disabled; set OPENREAD_E2E_SIGNUP_LIFECYCLE_LIVE=1 explicitly',
    );
  }

  const evidenceInput = process.env.OPENREAD_E2E_SIGNUP_EVIDENCE_PATH?.trim();
  if (!evidenceInput) {
    throw new Error('Signup lifecycle requires OPENREAD_E2E_SIGNUP_EVIDENCE_PATH');
  }
  const evidencePath = resolve(evidenceInput);
  const writeEvidence = async (report) => {
    await mkdir(dirname(evidencePath), { recursive: true });
    const temporary = `${evidencePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, evidencePath);
  };

  const runtime = createLiveAccountLifecycle();
  const runId = `l3a-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  try {
    const report = await runSignupLifecycle({ runtime, runId, onEvidence: writeEvidence });
    console.log(JSON.stringify(report));
  } catch (error) {
    const report = error?.report ?? {
      ok: false,
      stage: 'unattributed-failure',
      runId,
      error: errorMessage(error),
    };
    await writeEvidence(report);
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) await runFromCommandLine();
