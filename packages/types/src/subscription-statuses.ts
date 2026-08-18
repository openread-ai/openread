export const ACTIVE_STRIPE_STATUSES = ['active', 'trialing', 'past_due'] as const;

// Entitlement-bearing IAP states: the user currently has paid access (#570).
export const ACTIVE_IAP_STATUSES = ['active', 'trialing', 'in_grace_period'] as const;

// States with no current entitlement but possible future billing. Account
// deletion must still discover and revoke these before provider identifiers
// and auth are removed, or the store can keep billing an orphan (#570).
// - pending: Google purchase awaiting payment
// - billing_retry: Apple keeps attempting collection after a billing failure
// - on_hold: Google account hold; may recover into an active subscription
// - paused: Google paused subscription; resumes into future billing
export const FUTURE_BILLING_IAP_STATUSES = ['pending', 'billing_retry', 'on_hold', 'paused'] as const;

// Everything account deletion must discover and revoke: current entitlement
// plus future-billing states. Entitlement and revocation are deliberately
// separate contracts; do not merge them (#570).
export const REVOCABLE_IAP_STATUSES = [
  ...ACTIVE_IAP_STATUSES,
  ...FUTURE_BILLING_IAP_STATUSES,
] as const;

export type ActiveStripeStatus = (typeof ACTIVE_STRIPE_STATUSES)[number];
export type ActiveIAPStatus = (typeof ACTIVE_IAP_STATUSES)[number];
export type RevocableIAPStatus = (typeof REVOCABLE_IAP_STATUSES)[number];

export function isActiveStripeStatus(
  status: string | null | undefined,
): status is ActiveStripeStatus {
  return ACTIVE_STRIPE_STATUSES.includes(status as ActiveStripeStatus);
}

export function isActiveIAPStatus(status: string | null | undefined): status is ActiveIAPStatus {
  return ACTIVE_IAP_STATUSES.includes(status as ActiveIAPStatus);
}

export function isRevocableIAPStatus(
  status: string | null | undefined,
): status is RevocableIAPStatus {
  return REVOCABLE_IAP_STATUSES.includes(status as RevocableIAPStatus);
}
