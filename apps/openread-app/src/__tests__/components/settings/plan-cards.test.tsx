import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { PlanCards } from '@/components/settings/plan-cards';
import type { PlanDetails } from '@/libs/payment/plan-details';
import type { TierConfig } from '@/lib/tier-types';

const { mockTierConfigState } = vi.hoisted(() => ({
  mockTierConfigState: { config: undefined as TierConfig | undefined },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, vars?: Record<string, unknown>) => {
    if (!vars) return key;
    return Object.entries(vars).reduce(
      (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
      key,
    );
  },
}));

// Mock getLocale
vi.mock('@/utils/misc', () => ({
  getLocale: () => 'en-US',
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock supabase (needed by tier-config)
vi.mock('@/utils/supabase-admin.server', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

vi.mock('@/hooks/useTierConfig', async () => {
  const { getFallbackConfig } =
    await vi.importActual<typeof import('@/lib/tier-defaults')>('@/lib/tier-defaults');
  return {
    useTierConfig: () => ({
      config: mockTierConfigState.config ?? getFallbackConfig(),
      isLoading: false,
      error: null,
    }),
  };
});

// Mock eventDispatcher
const mockDispatch = vi.fn();
vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

const mockPlans: PlanDetails[] = [
  {
    name: 'Free Plan',
    plan: 'free',
    type: 'subscription',
    color: 'bg-gray-200 text-gray-800',
    hintColor: 'text-gray-800/75',
    price: 0,
    currency: 'USD',
    productId: undefined,
    interval: 'month',
    features: [{ label: 'Local reading' }, { label: 'Basic AI' }],
    limits: {
      'Cloud Storage': '1 GB',
    },
  },
  {
    name: 'Reader Plan',
    plan: 'reader',
    type: 'subscription',
    color: 'bg-blue-200 text-blue-800',
    hintColor: 'text-blue-800/75',
    price: 999,
    currency: 'USD',
    productId: 'price_reader_monthly',
    interval: 'month',
    features: [{ label: 'Everything in Free' }, { label: 'Cloud storage' }, { label: 'TTS' }],
    limits: {
      'Cloud Storage': '10 GB',
    },
  },
  {
    name: 'Pro Plan',
    plan: 'pro',
    type: 'subscription',
    color: 'bg-purple-200 text-purple-800',
    hintColor: 'text-purple-800/75',
    price: 1999,
    currency: 'USD',
    productId: 'price_pro_monthly',
    interval: 'month',
    features: [
      { label: 'Everything in Reader' },
      { label: 'AI analysis' },
      { label: 'Priority support' },
    ],
    limits: {
      'Cloud Storage': '50 GB',
    },
  },
];

describe('PlanCards', () => {
  const mockOnPlanChange = vi.fn();
  const mockOnManagePlan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTierConfigState.config = undefined;
    mockOnPlanChange.mockResolvedValue(undefined);
    mockOnManagePlan.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render all 3 plan cards from tier config', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      // Plans now come from tier config: Free, Reader, Pro
      expect(screen.getByText('Free')).toBeTruthy();
      expect(screen.getByText('Reader')).toBeTruthy();
      expect(screen.getByText('Pro')).toBeTruthy();
    });

    it('should show "Most Popular" badge on Reader plan', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      expect(screen.getByText('Most Popular')).toBeTruthy();
    });

    it('should show plan prices from tier config', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      expect(screen.getByText('$0.00')).toBeTruthy();
      expect(screen.getByText('$9.99')).toBeTruthy();
      expect(screen.getByText('$19.99')).toBeTruthy();
    });

    it('should render plan cards from the runtime tier config contract', async () => {
      const { getFallbackConfig } = await import('@/lib/tier-defaults');
      const fallback = getFallbackConfig();
      mockTierConfigState.config = {
        ...fallback,
        tiers: {
          ...fallback.tiers,
          reader: {
            ...fallback.tiers.reader,
            display_name: 'Scholar',
            display_price_cents: 1234,
          },
        },
      };

      render(<PlanCards plans={[]} onPlanChange={mockOnPlanChange} />);

      expect(screen.getByText('Scholar')).toBeTruthy();
      expect(screen.getByText('$12.34')).toBeTruthy();
    });

    it('should show feature groups', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      // Feature groups from tier config
      const aiHeaders = screen.getAllByText('AI Features');
      expect(aiHeaders.length).toBe(3);
    });

    it('should show loading skeletons when isLoading is true', () => {
      render(<PlanCards plans={[]} isLoading={true} onPlanChange={mockOnPlanChange} />);
      // Should render skeleton loaders
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Billing Cycle Toggle', () => {
    it('should show billing cycle toggle', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      expect(screen.getByText('Monthly')).toBeTruthy();
      expect(screen.getByText('Annual')).toBeTruthy();
    });

    it('should switch prices when toggling to annual', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);

      // Initially monthly: $9.99, $19.99
      expect(screen.getByText('$9.99')).toBeTruthy();

      // Switch to annual
      fireEvent.click(screen.getByText('Annual'));

      // Annual: $99.99, $199.99
      expect(screen.getByText('$99.99')).toBeTruthy();
      expect(screen.getByText('$199.99')).toBeTruthy();
    });

    it('should show "Save 17%" badge', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      expect(screen.getByText('Save 17%')).toBeTruthy();
    });
  });

  describe('Current Plan Indication', () => {
    it('should mark the current plan with Current badge', () => {
      render(
        <PlanCards plans={mockPlans} currentPlanId='reader' onPlanChange={mockOnPlanChange} />,
      );
      expect(screen.getByText('Current')).toBeTruthy();
    });

    it('should show "Current Plan" button for current plan', () => {
      render(
        <PlanCards plans={mockPlans} currentPlanId='reader' onPlanChange={mockOnPlanChange} />,
      );
      expect(screen.getByText('Current Plan')).toBeTruthy();
    });

    it('should disable the current plan button', () => {
      render(
        <PlanCards plans={mockPlans} currentPlanId='reader' onPlanChange={mockOnPlanChange} />,
      );
      const currentPlanButton = screen.getByText('Current Plan').closest('button');
      expect(currentPlanButton).toHaveProperty('disabled', true);
    });
  });

  describe('Upgrade Actions', () => {
    it('should show "Switch Plan" button for other plans when user has a plan', () => {
      render(<PlanCards plans={mockPlans} currentPlanId='free' onPlanChange={mockOnPlanChange} />);
      const switchButtons = screen.getAllByText('Switch Plan');
      // Should have 2 switch buttons (for Reader and Pro)
      expect(switchButtons.length).toBe(2);
    });

    it('should call onPlanChange directly when clicking a Free-to-Reader upgrade', async () => {
      mockOnPlanChange.mockResolvedValue(undefined);
      render(<PlanCards plans={mockPlans} currentPlanId='free' onPlanChange={mockOnPlanChange} />);

      const switchButtons = screen.getAllByText('Switch Plan');
      fireEvent.click(switchButtons[0]!);

      await waitFor(() => {
        expect(mockOnPlanChange).toHaveBeenCalledWith('reader', 'month');
      });
    });

    it('should submit a paid Reader-to-Pro upgrade directly without a confirmation', async () => {
      render(
        <PlanCards plans={mockPlans} currentPlanId='reader' onPlanChange={mockOnPlanChange} />,
      );

      fireEvent.click(screen.getByText('Switch Plan'));

      await waitFor(() => {
        expect(mockOnPlanChange).toHaveBeenCalledWith('pro', 'month');
      });
      expect(screen.queryByText('Continue with downgrade')).toBeNull();
    });

    it('should route cancellation to Free through Manage Plan instead of checkout', async () => {
      render(
        <PlanCards
          plans={mockPlans}
          currentPlanId='reader'
          onPlanChange={mockOnPlanChange}
          onManagePlan={mockOnManagePlan}
        />,
      );

      fireEvent.click(screen.getByText('Manage Plan'));

      await waitFor(() => {
        expect(mockOnManagePlan).toHaveBeenCalledTimes(1);
      });
      expect(mockOnPlanChange).not.toHaveBeenCalled();
    });

    it('should disable paid plan CTAs when product IDs are unavailable', async () => {
      const plansWithoutProductId = mockPlans.map((p) => ({
        ...p,
        productId: p.plan === 'reader' ? undefined : p.productId,
      }));

      render(
        <PlanCards
          plans={plansWithoutProductId}
          currentPlanId='free'
          onPlanChange={mockOnPlanChange}
        />,
      );

      const switchButtons = screen.getAllByText('Switch Plan');
      expect(switchButtons[0]!.closest('button')).toHaveProperty('disabled', true);
      fireEvent.click(switchButtons[0]!);

      expect(mockOnPlanChange).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('should show Processing state when upgrade is in progress', async () => {
      let resolveUpgrade: () => void;
      const slowUpgrade = new Promise<void>((resolve) => {
        resolveUpgrade = resolve;
      });
      mockOnPlanChange.mockReturnValue(slowUpgrade);

      render(<PlanCards plans={mockPlans} currentPlanId='free' onPlanChange={mockOnPlanChange} />);

      const switchButtons = screen.getAllByText('Switch Plan');
      fireEvent.click(switchButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeTruthy();
      });

      // Cleanup
      resolveUpgrade!();
    });
  });

  describe('Plan Change Restrictions', () => {
    it('confirms a Pro-to-Reader downgrade with its target and period-end effective date', async () => {
      render(
        <PlanCards
          plans={mockPlans}
          currentPlanId='pro'
          currentPeriodEnd={new Date('2030-01-15T12:00:00.000Z')}
          onPlanChange={mockOnPlanChange}
          onManagePlan={mockOnManagePlan}
        />,
      );

      fireEvent.click(screen.getByText('Switch Plan'));

      expect(screen.getByText('Downgrade to Reader?')).toBeTruthy();
      expect(
        screen.getByText(
          'Your current plan stays active until January 15, 2030. A downgrade to Reader takes effect at the end of that billing period and will not charge you today.',
        ),
      ).toBeTruthy();
      expect(mockOnPlanChange).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Continue with downgrade'));

      await waitFor(() => {
        expect(mockOnPlanChange).toHaveBeenCalledWith('reader', 'month');
      });
    });

    it('fails safely instead of inventing a downgrade date when period end is unavailable', () => {
      render(
        <PlanCards
          plans={mockPlans}
          currentPlanId='pro'
          currentPeriodEnd={null}
          onPlanChange={mockOnPlanChange}
          onManagePlan={mockOnManagePlan}
        />,
      );

      fireEvent.click(screen.getByText('Switch Plan'));

      expect(screen.queryByText('Continue with downgrade')).toBeNull();
      expect(mockOnPlanChange).not.toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Billing period end is unavailable. Please refresh and try again.',
      });
    });

    it('keeps cancel-to-Free routed through Manage Plan', () => {
      render(
        <PlanCards
          plans={mockPlans}
          currentPlanId='pro'
          currentPeriodEnd={new Date('2030-01-15T12:00:00.000Z')}
          onPlanChange={mockOnPlanChange}
          onManagePlan={mockOnManagePlan}
        />,
      );

      const manageButtons = screen.getAllByText('Manage Plan');
      expect(manageButtons).toHaveLength(1);
      expect(manageButtons[0]!.closest('button')).toHaveProperty('disabled', false);
      fireEvent.click(manageButtons[0]!);

      expect(mockOnManagePlan).toHaveBeenCalledTimes(1);
      expect(mockOnPlanChange).not.toHaveBeenCalled();
      expect(screen.queryByText('Continue with downgrade')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible check icons', () => {
      render(<PlanCards plans={mockPlans} onPlanChange={mockOnPlanChange} />);
      const checkIcons = document.querySelectorAll('[aria-hidden="true"]');
      expect(checkIcons.length).toBeGreaterThan(0);
    });
  });
});
