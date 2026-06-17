export {
  FEATURE_REGISTRY,
  canSelectPlan,
  formatPriceDisplay,
  getFeatureDefinition,
  isBillablePlan,
  normalizeBillingInterval,
  requiresBillingPortal,
  resolveFeatureAccess,
  resolvePlanUpgradeIntent,
  resolveTargetPlan,
} from '@openread/entitlements';

export type {
  BillablePlan,
  BillingInterval,
  FeatureAccessResult,
  FeatureDefinition,
  UpgradeFeature,
  UpgradeIntent,
} from '@openread/entitlements';
