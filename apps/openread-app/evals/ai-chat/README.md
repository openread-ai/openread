# AI chat quality API evals

These evals test Reader AI answer quality through the real `/api/ai/agentic-chat` endpoint without browser automation. They are the primary quality path for semantic chat behavior; Playwright remains a thin UI smoke gate only.

## Run

```bash
LIVE_AI_EVALS=1 \
AI_EVAL_BASE_URL=https://app.openread.ai \
AI_EVAL_ARTIFACT_DIR=test-results/ai-chat-quality-evidence \
pnpm --filter @openread/openread-app test:ai-chat-quality
```

Required env:

- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Contract

The runner signs in as the dedicated eval user, POSTs real Reader payloads to `/api/ai/agentic-chat`, parses the NDJSON stream, and asserts:

- HTTP success
- final `text` event is emitted before stream completion
- no streamed `error` event
- first-token and complete latency
- provider/model/request ID/planner tier headers
- planner tier is present in evidence
- pinned book fixture hash/title
- required and forbidden answer concepts

## Fixture

The current quality fixture uses a small public-domain `The Strange Case Of Dr Jekyll And Mr Hyde` chapter-summary payload. This keeps the eval deterministic and legally safe while still exercising the shared agentic route, planner metadata, tool-capable payload shape, stream handling, and answer-quality rubric.

## Why not Playwright?

Playwright validates browser behavior: auth injection, Reader navigation, chat submit, DOM streaming, and mobile/desktop UI. It is intentionally too slow and indirect for large AI-quality matrices. Keep browser tests as smoke; use this API runner for response-quality regression.
