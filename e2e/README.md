# E2E tests

Playwright suite. Runs against a live IRIS stack — no mocks.

## Local run

The suite hits `PLAYWRIGHT_BASE_URL` (default `https://localhost`). Bring the
stack up in `iris-web/` first, then:

```bash
# From iris-frontend/
export NO_PROXY=localhost,127.0.0.1              # bypass any corp proxy
export PLAYWRIGHT_BASE_URL=https://localhost      # nginx TLS endpoint
export IRIS_E2E_USERNAME=administrator
export IRIS_E2E_PASSWORD='MySuperAdminPassword!'  # match iris-web/.env

# Install browsers once
npx playwright install chromium

# Run
npx playwright test                # full suite
npx playwright test auth/          # just auth specs
npx playwright test --headed       # watch the browser
npx playwright test --ui           # interactive mode
```

## Structure

- `auth/` — login, logout, session
- `smoke/` — home dashboard, top-level nav
- `case/` — case-scoped features
- `helpers/auth.ts` — `login(page)`
- `helpers/api.ts` — `adminApi()` returns an authed request context; `seed.case(api, ...)`, `seed.alert`, `seed.asset`, `seed.ioc`, `seed.note`, `seed.task`, `seed.evidence`, `seed.warRoom` factories
- `helpers/ui.ts` — `expectToast`, `openSidebar`, `openDialog`, etc.

## Parity with CI

The meta-repo workflow at `iris-web/.github/workflows/e2e.yml` runs this same
suite. Locally you're driving your dev stack directly; in CI the workflow
brings up the same stack via `docker compose up -d` in the meta-repo and
points `PLAYWRIGHT_BASE_URL` at it. Same specs, same helpers, same base URL —
if it passes locally it will pass in CI (modulo image tags).
