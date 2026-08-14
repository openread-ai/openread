import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { runSignupLifecycle } from '../signup-lifecycle.mjs';

const REDIRECT_TO = 'https://app.openread.ai/auth/callback';

const emptyState = {
  auth: { exists: false },
  database: [{ table: 'books', count: 0 }],
  objects: [],
};

const createRuntime = ({ signupSession = true, cleanupOutcome = 'already-clean' } = {}) => {
  const calls = [];
  const credentials = Object.freeze({
    email: 'e2e-signup-test@example.invalid',
    password: 'Test-password-Aa1!',
    createdAt: '2026-08-13T00:00:00.000Z',
  });
  const account = Object.freeze({ ...credentials, userId: 'signed-up-user' });
  const runtime = {
    signupRedirectTo: REDIRECT_TO,
    lifecycle: {
      prepareSignup: () => {
        calls.push('prepare');
        return credentials;
      },
      adoptSignupAccount: (_credentials, userId) => {
        calls.push(`adopt:${userId}`);
        return account;
      },
      stampSignupAccount: async () => calls.push('stamp'),
      deleteMarkedAccount: async () => {
        calls.push('planned-cleanup');
        return { outcome: 'recovered-residue' };
      },
      cleanupPreparedAccount: async () => {
        const plannedCleanupCompleted = calls.includes('planned-cleanup');
        calls.push('finally-cleanup');
        return {
          outcome: plannedCleanupCompleted ? cleanupOutcome : 'recovered-residue',
          stateAfter: emptyState,
        };
      },
    },
    assertSignupEmailAbsent: async () => calls.push('email-absent'),
    publicSignUp: async () => {
      calls.push('sign-up');
      return {
        user: { id: account.userId },
        session: signupSession
          ? { access_token: 'test-access-token', user: { id: account.userId } }
          : null,
      };
    },
    getAuthenticatedIdentity: async () => {
      calls.push('identity-use');
      return { id: account.userId };
    },
  };
  return { runtime, calls };
};

describe('L3a immediate-session signup lifecycle', () => {
  it('proves signup, same-ID session use, and exact already-clean final state', async () => {
    const { runtime, calls } = createRuntime();
    const reports = [];

    const report = await runSignupLifecycle({
      runtime,
      runId: 'signup-run',
      onEvidence: async (value) => reports.push(value),
    });

    assert.equal(report.ok, true);
    assert.equal(report.immediateSessionVerified, true);
    assert.equal(report.authenticatedIdentityMatched, true);
    assert.equal(report.markerVerified, true);
    assert.equal(report.cleanupOutcome, 'already-clean');
    assert.deepEqual(report.finalState, { authExists: false, databaseRows: 0, objects: 0 });
    assert.equal(report.emailHash.length, 64);
    assert.equal(JSON.stringify(report).includes('Test-password-Aa1!'), false);
    assert.equal(reports[0].stage, 'prepared');
    assert.deepEqual(calls, [
      'prepare',
      'email-absent',
      'sign-up',
      'adopt:signed-up-user',
      'stamp',
      'identity-use',
      'planned-cleanup',
      'finally-cleanup',
    ]);
  });

  it('hard-stops on confirmation-policy drift and does not attempt identity use', async () => {
    const { runtime, calls } = createRuntime({ signupSession: false });

    await assert.rejects(runSignupLifecycle({ runtime, runId: 'policy-drift' }), (error) => {
      assert.match(error.message, /confirmation-policy drift/);
      assert.equal(error.report.immediateSessionVerified, false);
      assert.equal(error.report.cleanupOutcome, 'recovered-residue');
      return true;
    });
    assert.equal(calls.includes('stamp'), true);
    assert.equal(calls.includes('identity-use'), false);
  });

  it('fails if finally must recover residue instead of observing already-clean', async () => {
    const { runtime } = createRuntime({ cleanupOutcome: 'recovered-residue' });

    await assert.rejects(
      runSignupLifecycle({ runtime, runId: 'cleanup-red' }),
      /already-clean empty final state/,
    );
  });

  it('redacts the prepared email from provider errors and reports', async () => {
    const { runtime } = createRuntime();
    runtime.publicSignUp = async ({ email }) => {
      throw new Error(`Signup rejected ${email}`);
    };

    await assert.rejects(runSignupLifecycle({ runtime, runId: 'redacted-error' }), (error) => {
      assert.equal(error.message.includes('e2e-signup-test@example.invalid'), false);
      assert.equal(JSON.stringify(error.report).includes('e2e-signup-test@example.invalid'), false);
      assert.match(error.message, /\[redacted-email\]/);
      return true;
    });
  });
});

describe('canonical L3a runner entry', () => {
  it('is manual-only and governed by its own opt-in', async () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const [workflow, packageJson] = await Promise.all([
      readFile(resolve(root, '.github/workflows/lifecycle-e2e.yml'), 'utf8'),
      readFile(resolve(root, 'apps/openread-app/package.json'), 'utf8'),
    ]);

    assert.match(workflow, /          - L3a\n/);
    assert.match(workflow, /OPENREAD_E2E_SIGNUP_LIFECYCLE_LIVE=1/);
    assert.match(
      workflow,
      /OPENREAD_E2E_SIGNUP_EVIDENCE_PATH=test-results\/signup-lifecycle-report\.json/,
    );
    assert.match(workflow, /test:e2e:signup-lifecycle:live/);
    assert.doesNotMatch(workflow, /^  (push|pull_request|schedule|release):/m);
    assert.match(
      JSON.parse(packageJson).scripts['test:e2e:signup-lifecycle:live'],
      /e2e\/signup-lifecycle\.mjs$/,
    );
  });
});
