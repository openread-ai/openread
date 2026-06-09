# Live AI agentic chat evals

These evals are the production-style stability signal for Reader agentic chat. They do **not** mock model responses. They drive the Reader UI with Playwright, call the real `/api/ai/agentic-chat` route, wait for streamed output, and assert planner/provider metadata plus user-visible answer health.

## Run

```bash
LIVE_AI_EVALS=1 \
AI_EVAL_BASE_URL=https://app.openread.ai \
AI_EVAL_TEXT_BOOK_HASH=<seeded-public-domain-book-hash> \
AI_EVAL_TEXT_BOOK_TITLE_PATTERN='Pride and Prejudice' \
AI_EVAL_CATALOG_QUERY='Pride and Prejudice' \
AI_EVAL_CATALOG_BOOK_ID=<optional-exact-catalog-book-uuid> \
AI_EVAL_CATALOG_OPEN_FROM_LIBRARY=1 \
pnpm --filter @openread/openread-app test:e2e:ai-live
```

`AI_EVAL_BASE_URL` is honored only when `LIVE_AI_EVALS=1`; otherwise the normal local Playwright base URL is used. If `AI_EVAL_BASE_URL` is omitted in a live eval run, Playwright starts local `pnpm dev-web` and still calls the real AI provider configured for that environment.

## Required account/env

- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` in `apps/openread-app/.env.test.local`.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth injection.
- A dedicated eval user seeded with public-domain books for production release gates.
- Optional `AI_EVAL_CATALOG_BOOK_ID` when the catalog search query has multiple similarly titled results and the eval must open a known importable canonical catalog title.
- Optional `AI_EVAL_CATALOG_OPEN_FROM_LIBRARY=1` when that catalog title is already seeded/imported in the eval user's library and the eval should validate the canonical `catalog:<uuid>` Reader chat path directly.
- Production/provider secrets are used by the target app; the test runner does not need model API keys when targeting `https://app.openread.ai`.

## Current scenarios

- Current-page Reader question: must stream a useful answer and avoid the `full` prompt tier.
- Broad whole-book question: must stream through incremental context and avoid the `full` prompt tier.
- Catalog-imported public-domain book: must chat with a canonical `catalog:<uuid>` book reference.

## Evidence

Each scenario attaches a JSON evidence payload containing:

- answer length and timings
- planner tier, including explicit non-`unknown` planner metadata
- provider/model
- request id
- sanitized request body metadata, including the submitted latest user question, counts, and book reference but not full chapter text
- assistant message counts before/after submit so captured text is tied to the post-submit streamed response

## Policy

Keep the harness PR in draft until a true production run has attached JSON/screenshot evidence from the dedicated eval user. Run these manually/nightly/release-gated for AI-chat changes. Keep deterministic unit tests only for low-level contracts; do not treat mocked model responses as answer-quality evidence.
