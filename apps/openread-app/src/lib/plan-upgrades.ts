export {
  FEATURE_REGISTRY,
  canSelectPlan,
  formatPriceDisplay,
  getFeatureDefinition,
  isBillablePlan,
  normalizeBillingInterval,
  requiresBillingPortal,
  resolveFeatureAccess,
  resolvePlanChangeDirection,
  resolvePlanUpgradeIntent,
  resolveTargetPlan,
} from '@openread/entitlements';

export type {
  BillablePlan,
  BillingInterval,
  FeatureAccessResult,
  FeatureDefinition,
  FeatureLaunchOverrides,
  PlanChangeDirection,
  UpgradeFeature,
  UpgradeIntent,
} from '@openread/entitlements';
