import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BillingPage from '@/app/(platform)/settings/billing/page';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, vars?: Record<string, unknown>) => {
    if (!vars) return key;
    let result = key;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{{${k}}}`, String(v));
    }
    return result;
  },
}));

vi.mock('@/utils/tailwind', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const { mockInvoiceList, mockPlanCards } = vi.hoisted(() => ({
  mockInvoiceList: vi.fn(),
  mockPlanCards: vi.fn(),
}));

const mockUseSubscription = vi.fn();
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

// Mock all billing sub-components to isolate page-level tests
vi.mock('@/components/settings/billing', () => ({
  CurrentPlanCard: () => <div data-testid='current-plan'>current-plan</div>,
  PaymentMethod: () => <div data-testid='payment-method'>payment-method</div>,
  InvoiceList: (props: Record<string, unknown>) => {
    mockInvoiceList(props);
    return <div data-testid='invoice-list'>invoice-list</div>;
  },
}));

vi.mock('@/components/settings/plan-cards', () => ({
  PlanCards: (props: Record<string, unknown>) => {
    mockPlanCards(props);
    return <div data-testid='plan-cards'>plan-cards</div>;
  },
}));

vi.mock('@/components/admin/BusinessHealthCard', () => ({
  BusinessHealthCard: () => <div data-testid='business-health-card'>business-health</div>,
}));

// ─── Tests ───────────────────────────────────────────────────────────

describe('BillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoiceList.mockClear();
    mockPlanCards.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should show error state when useSubscription returns error', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      plans: [],
      invoices: [],
      isLoading: false,
      error: new Error('fail'),
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);
    expect(screen.getByText('Failed to load billing information')).toBeTruthy();
  });

  it('should show simplified free plan view for free users', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      plans: [],
      invoices: [],
      isLoading: false,
      error: null,
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);
    expect(screen.getByText("You're on the Free plan")).toBeTruthy();
    expect(screen.getByText('Upgrade')).toBeTruthy();
    // Should still show plan cards
    expect(screen.getByTestId('plan-cards')).toBeTruthy();
    // Should NOT show usage meters
    expect(screen.queryByTestId('ai-meter')).toBeNull();
    expect(screen.queryByTestId('storage-meter')).toBeNull();
  });

  it('should show full layout for paid users and pass plan-change semantics to cards', () => {
    const currentPeriodEnd = new Date('2030-01-15T12:00:00.000Z');
    const changePlan = vi.fn();
    mockUseSubscription.mockReturnValue({
      subscription: {
        planId: 'reader',
        planName: 'Reader',
        status: 'active',
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
      plans: [],
      invoices: [],
      isLoading: false,
      error: null,
      upgradeToPlan: changePlan,
      openPortal: vi.fn(),
    });

    render(<BillingPage />);

    // Usage sections live on /settings/usage, not Billing
    expect(screen.queryByTestId('ai-meter')).toBeNull();
    expect(screen.queryByTestId('storage-meter')).toBeNull();
    expect(screen.queryByTestId('usage-history')).toBeNull();
    expect(screen.queryByTestId('mcp-display')).toBeNull();

    // Billing sections
    expect(screen.getByTestId('current-plan')).toBeTruthy();
    expect(screen.getByTestId('payment-method')).toBeTruthy();
    expect(screen.getByTestId('invoice-list')).toBeTruthy();
    expect(screen.getByTestId('plan-cards')).toBeTruthy();
    expect(mockPlanCards).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentPlanId: 'reader',
        currentPeriodEnd,
        onPlanChange: changePlan,
      }),
    );
  });

  it('should show Available Plans heading for paid users', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        planId: 'pro',
        planName: 'Pro',
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      plans: [],
      invoices: [],
      isLoading: false,
      error: null,
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);
    expect(screen.getByText('Available Plans')).toBeTruthy();
  });

  it('renders paid billing shell while invoices are still loading', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        planId: 'reader',
        planName: 'Reader',
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      plans: [],
      invoices: [],
      isLoading: false,
      invoicesLoading: true,
      plansLoading: false,
      error: null,
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);

    expect(screen.getByTestId('current-plan')).toBeTruthy();
    expect(screen.getByTestId('payment-method')).toBeTruthy();
    expect(screen.getByTestId('invoice-list')).toBeTruthy();
    expect(mockInvoiceList).toHaveBeenLastCalledWith(expect.objectContaining({ isLoading: true }));
  });

  it('renders free billing shell while plan products are still loading', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        planId: 'free',
        planName: 'Free',
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      plans: [],
      invoices: [],
      isLoading: false,
      plansLoading: true,
      error: null,
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);

    expect(screen.getByText("You're on the Free plan")).toBeTruthy();
    expect(screen.getByTestId('plan-cards')).toBeTruthy();
    expect(mockPlanCards).toHaveBeenLastCalledWith(expect.objectContaining({ isLoading: true }));
  });

  it('should show free user simplified view for free planId', () => {
    mockUseSubscription.mockReturnValue({
      subscription: {
        planId: 'free',
        planName: 'Free',
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      plans: [],
      invoices: [],
      isLoading: false,
      error: null,
      upgradeToPlan: vi.fn(),
      openPortal: vi.fn(),
    });

    render(<BillingPage />);
    expect(screen.getByText("You're on the Free plan")).toBeTruthy();
  });
});
