export const ACTIVE_STRIPE_STATUSES = ['active', 'trialing', 'past_due'] as const;
export const ACTIVE_IAP_STATUSES = ['active', 'trialing'] as const;

export type ActiveStripeStatus = (typeof ACTIVE_STRIPE_STATUSES)[number];
export type ActiveIAPStatus = (typeof ACTIVE_IAP_STATUSES)[number];

export function isActiveStripeStatus(
  status: string | null | undefined,
): status is ActiveStripeStatus {
  return ACTIVE_STRIPE_STATUSES.includes(status as ActiveStripeStatus);
}
