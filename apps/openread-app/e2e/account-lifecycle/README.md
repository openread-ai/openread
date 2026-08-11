# E2E account lifecycle

Node-only foundation for disposable OpenRead accounts:

1. provision a confirmed user with an admin-owned `app_metadata` marker;
2. return credentials so Playwright can drive the product sign-in form;
3. inventory the complete paginated `users/<id>/` R2 prefix plus canonical file/temp rows before deletion;
4. independently verify password sign-in rejection, Supabase auth-user absence, canonical DB-row absence, and an empty R2 prefix;
5. reap stale marked accounts after interrupted runs.

## Safety contract

- Destructive account cleanup requires `app_metadata.openread_e2e_disposable === true`.
- Missing marker means a hard error before R2 or auth deletion.
- Email shape is diagnostic only and is never a deletion condition.
- The janitor lists candidates from Supabase Auth, then calls the same guarded deletion function.
- Service-role and R2 credentials are read only from process environment in Node. They must never be passed to Playwright pages, bundled client code, logs, or committed files.
- The janitor deletes and exact-zero verifies every `predelete` target before R2 cleanup, then proves the R2 prefix empty before auth deletion. Predelete, discovery, pagination, deletion, or verification failure leaves the marked auth user and later resources available for a retry.
- Before provisioning or any cleanup mutation, the service-role-only `account_deletion_schema_inventory()` RPC derives every public `user_id` target plus `plans.id` and its actual auth-user FK delete behavior from `pg_catalog`. Missing, unexpected, reclassified, malformed, or unavailable inventory fails closed.

## Explicit coverage gap

**Admin provisioning does not exercise real email signup or password recovery.** A lifecycle using this mechanism proves product sign-in and account teardown. Signup and recovery require a separate inbox contract and must not be claimed from this evidence.

Billing and IAP cancellation are best-effort product behavior and are not proven by this auth/DB/R2 lifecycle. The deletion descriptor contract records each ownership column, exact auth-user `deleteRule`, and `cleanupMode` (`cascade` or `predelete`). Its runtime comparison is code-list versus the database-derived inventory, not another repository fixture, so a new/missing target or FK-rule change blocks provisioning and deletion. Because production `user_catalog_wishlist` has no auth-user cascade, it is classified `predelete`; the product route deletes and verifies it before deleting auth.

The additive RPC migration must be reviewed and applied through the separately gated migration workflow before this capability can run against an environment. Merging this code does not authorize migration application.

## Commands

From `apps/openread-app`:

```bash
# Pure safety and behavior tests; no remote mutation
pnpm test:e2e:account-lifecycle

# Read-only integration test: query the configured database schema at runtime
# and compare it directly with the descriptor contract
pnpm test:e2e:account-lifecycle:schema

# One explicitly authorized live marked-user proof
OPENREAD_E2E_ACCOUNT_LIFECYCLE_LIVE=1 pnpm test:e2e:account-lifecycle:live

# Reap marked accounts at least six hours old (override with
# OPENREAD_E2E_JANITOR_MAX_AGE_HOURS)
OPENREAD_E2E_JANITOR=1 pnpm e2e:account-janitor
```

The live commands load existing gitignored `.env.local`, `.env.web`, and `.env.test.local` values. They fail closed when any required Supabase or R2 credential is absent.
