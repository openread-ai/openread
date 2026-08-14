# E2E account lifecycle

Node-only foundation for disposable OpenRead accounts:

1. provision a confirmed user with an admin-owned `app_metadata` marker;
2. return credentials so Playwright can drive the product sign-in form;
3. inventory both complete paginated user-owned R2 prefixes (`users/<id>/` and the intentional legacy `<id>/Openread/Books/`) plus canonical file/temp rows before deletion;
4. independently verify password sign-in rejection, Supabase auth-user absence, canonical DB-row absence, and both empty R2 prefixes;
5. reap stale marked accounts after interrupted runs;
6. keep a runtime-local prepared/provisioned account handle so an ambiguous admin-create response and same-process post-auth teardown remain attributable without a persistent registry;
7. adopt a public-signup user, merge and stamp its existing admin-owned `app_metadata`, and re-read the marker before marker-gated cleanup.

## Safety contract

- Destructive account cleanup requires `app_metadata.openread_e2e_disposable === true`.
- Missing marker means a hard error before R2 or auth deletion.
- Email shape is diagnostic only and is never a deletion condition.
- The janitor lists candidates from Supabase Auth, then calls the same guarded deletion function. Missing runtime-local state never blocks marked-account cleanup.
- Service-role and R2 credentials are read only from process environment in Node. They must never be passed to Playwright pages, bundled client code, logs, or committed files.
- The janitor deletes and exact-zero verifies every `predelete` target before R2 cleanup, then proves both user-owned R2 prefixes empty before auth deletion. Temp objects remain row-driven and HEAD-verified. Predelete, discovery, pagination, deletion, or verification failure leaves the marked auth user and later resources available for a retry.
- Prefix inventory carries exact `{key,size}` descriptors. Janitor output reports each reaped marked account and every removed prefix object instead of collapsing cleanup to a count.
- The Reader lifecycle closes its Playwright page before teardown inventory, fixes the test verdict before any cleanup mutation, and attaches a machine-readable report. Green requires both `already-clean` and an empty final auth/DB/prefix state; `recovered-residue` remains red after successful recovery.
- A runtime-local verified provisioning handle may recover both derived prefixes after product deletion has already removed auth. It is identity-bound to the creating Node runtime, cannot be reconstructed from plain account data, and grants no janitor authority.
- There is intentionally no durable disposable-account registry or supplementary post-auth janitor lane. That remains parked behind #562; this harness must not become a permanent compensation for unfenced product deletion.
- Before provisioning or any cleanup mutation, the service-role-only `account_deletion_schema_inventory()` RPC derives every public `user_id` target plus `plans.id` and its actual auth-user FK delete behavior from `pg_catalog`. Missing, unexpected, reclassified, malformed, or unavailable inventory fails closed.
- L3a never calls the product `/user/delete` route. It requires public `signUp` to return an immediate same-user session, service-role reads and preserves existing `app_metadata` while adding the marker, proves a same-user authenticated identity lookup, and uses only marker-gated admin cleanup.
- If public signup returns no immediate session, L3a stops as confirmation-policy drift. It never falls back to `generateLink`, `verifyOtp`, SMTP, a callback, or an email-prefix cleanup rule.
- A process crash after public signup but before marker re-read can leave one unmarked disposable account. Redacted evidence records the run ID and email hash; cleanup authority is intentionally not broadened, so an authorized operator must remove that bounded orphan manually.

## Explicit coverage boundaries

**Admin provisioning does not exercise real email signup or password recovery.** L1 proves product sign-in and account teardown only.

**L3a proves the current immediate-session public signup policy only.** It does not prove email ownership, delivery, confirmation, callback behavior, OAuth, recovery, browser UI, or native paths. Web and mobile web share the covered public auth backend; Tauri desktop, iOS, and Android remain out of scope.

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

# One explicitly authorized immediate-session public-signup proof
OPENREAD_E2E_SIGNUP_LIFECYCLE_LIVE=1 \
OPENREAD_E2E_SIGNUP_EVIDENCE_PATH=test-results/signup-lifecycle-report.json \
pnpm test:e2e:signup-lifecycle:live

# Reap marked accounts at least six hours old (override with
# OPENREAD_E2E_JANITOR_MAX_AGE_HOURS)
OPENREAD_E2E_JANITOR=1 pnpm e2e:account-janitor
```

The live commands load existing gitignored `.env.local`, `.env.web`, and `.env.test.local` values. They fail closed when any required Supabase or R2 credential is absent.

The manual GitHub Actions lifecycle workflow requires these repository secret names: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The production service-role key can read and delete any user's data; it is accepted temporarily for the owner-only workflow, but a dedicated CI Supabase project is required before another contributor receives write access.
