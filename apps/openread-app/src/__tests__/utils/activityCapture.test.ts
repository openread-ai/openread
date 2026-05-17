import { describe, expect, it } from 'vitest';
import {
  isActivityCaptureUrl,
  parseActivityCaptureRoute,
  parseActivityCaptureTarget,
} from '@/helpers/activityCapture';

describe('activityCapture helpers', () => {
  it('detects Openread activity capture URLs', () => {
    expect(isActivityCaptureUrl('openread://activity-capture?route=/reader')).toBe(true);
    expect(isActivityCaptureUrl('openread://other?route=/reader')).toBe(false);
  });

  it('parses target metadata from activity capture URLs', () => {
    expect(
      parseActivityCaptureTarget(
        'openread://activity-capture?route=%2Freader&screen=reader&state=reader-open&book=first-library-book&auth=authenticated&account=shared-test-account&library=seeded-library&onboarding=skip',
      ),
    ).toEqual({
      route: '/reader',
      screen: 'reader',
      state: 'reader-open',
      book: 'first-library-book',
      auth: 'authenticated',
      account: 'shared-test-account',
      library: 'seeded-library',
      onboarding: 'skip',
      qa: null,
      qaScenarioId: null,
      qaTitle: null,
      qaText: null,
      qaPlan: null,
      qaCallbackUrl: null,
      qaSessionUrl: null,
    });
  });

  it('keeps route parsing compatible', () => {
    expect(parseActivityCaptureRoute('openread://activity-capture?route=/library')).toBe(
      '/library',
    );
  });

  it('rejects unsafe external routes', () => {
    expect(parseActivityCaptureTarget('openread://activity-capture?route=//evil.example')).toEqual({
      route: '/',
      screen: null,
      state: null,
      book: null,
      auth: null,
      account: null,
      library: null,
      onboarding: null,
      qa: null,
      qaScenarioId: null,
      qaTitle: null,
      qaText: null,
      qaPlan: null,
      qaCallbackUrl: null,
      qaSessionUrl: null,
    });
  });

  it('accepts only local QA callback and session URLs', () => {
    expect(
      parseActivityCaptureTarget(
        'openread://activity-capture?route=/settings/account&qaCallbackUrl=http%3A%2F%2Flocalhost%3A4321%2Fqa%2FSET-001&qaSessionUrl=http%3A%2F%2F127.0.0.1%3A4321%2Fqa-session%2FSET-001',
      )?.qaCallbackUrl,
    ).toBe('http://localhost:4321/qa/SET-001');
    expect(
      parseActivityCaptureTarget(
        'openread://activity-capture?route=/settings/account&qaCallbackUrl=http%3A%2F%2Flocalhost%3A4321%2Fqa%2FSET-001&qaSessionUrl=http%3A%2F%2F127.0.0.1%3A4321%2Fqa-session%2FSET-001',
      )?.qaSessionUrl,
    ).toBe('http://127.0.0.1:4321/qa-session/SET-001');
    expect(
      parseActivityCaptureTarget(
        'openread://activity-capture?route=/settings/account&qaCallbackUrl=https%3A%2F%2Fevil.example%2Fqa&qaSessionUrl=https%3A%2F%2Fevil.example%2Fsession',
      )?.qaCallbackUrl,
    ).toBeNull();
    expect(
      parseActivityCaptureTarget(
        'openread://activity-capture?route=/settings/account&qaCallbackUrl=https%3A%2F%2Fevil.example%2Fqa&qaSessionUrl=https%3A%2F%2Fevil.example%2Fsession',
      )?.qaSessionUrl,
    ).toBeNull();
  });
});
