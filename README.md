# DFIR IRIS Frontend

Welcome to the DFIR-IRIS Frontend project. It is built with SvelteKit.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Testing

To test this app:

1. Vitest: `npm run test`
2. Playwright: `npm run test:e2e`
   * You may need to run `npx playwright install-deps` before you can install browsers below. 
   * You may need to run `npx playwright install` before to install browsers.

