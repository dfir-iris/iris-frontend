# IRIS Frontend

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE.txt)

The SvelteKit web UI for [IRIS](https://github.com/dfir-iris/iris-web), an open-source
collaborative platform for incident response teams.

> **Want to run IRIS?** Go to **[dfir-iris/iris-web](https://github.com/dfir-iris/iris-web)**
> and use its `docker compose`. This repository is a submodule of it and cannot run on its own —
> it is a UI with no backend, no database and no reverse proxy.

## Developing

Node 22 — that is what CI pins (`.github/workflows/ci.yml:20`). On Node 26,
`src/lib/stores/__tests__/auth.store.test.ts` fails.

You need a running backend to point at. Bring the stack up in `iris-web/` first, then:

```bash
cp .env.example .env    # set PUBLIC_EXTERNAL_API_URL and PUBLIC_INTERNAL_API_URL
npm install
npm run dev
```

Both URLs are required: `PUBLIC_INTERNAL_API_URL` is what the server-side code calls
(`src/lib/config/api.config.ts`), `PUBLIC_EXTERNAL_API_URL` is the browser-facing fallback used
by the SSR proxy (`src/hooks.server.ts`).

`npm run build` produces the adapter-node bundle; `npm run preview` serves it.

## Checks

The three CI gates, in the order `ci.yml` runs them:

```bash
npm run lint              # prettier --check + eslint
npm run check             # svelte-check
npm run test:unit -- --run   # vitest
```

Unit tests are `src/**/*.{test,spec}.ts`, configured in `vitest.config.ts` (not
`vite.config.ts`). Run one with `npx vitest run src/lib/stores/__tests__/auth.store.test.ts`.

## End-to-end tests

Playwright, in `e2e/`. These run against a **live stack** — bring one up in `iris-web/` first.

```bash
npx playwright install chromium
npm run test:e2e:local
```

`test:e2e:local` supplies the base URL and credentials (`https://localhost`, `administrator`)
as defaults. Plain `npm run test:e2e` does not — use it only when you set
`PLAYWRIGHT_BASE_URL`, `IRIS_E2E_USERNAME` and `IRIS_E2E_PASSWORD` yourself. See
[`e2e/README.md`](./e2e/README.md).

## Layout

```
src/routes/(app)/      the authenticated app, one directory per nav entry
src/lib/services/      one module per API resource, all built on ApiService
src/lib/stores/        .store.ts (classic) and .store.svelte.ts (runes)
src/hooks.server.ts    the SSR proxy — owns session cookies and token handling
e2e/                   Playwright specs
```

## Contributing

Pull requests go to `develop` — GitHub defaults to `master`, so change it. Please run the three
checks above before opening one.

## License

[AGPL v3 or later](./LICENSE.txt) — this repository only.
