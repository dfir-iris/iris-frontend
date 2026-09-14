import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

// `VITE_ALLOWED_HOSTS` lets the operator open the dev server to extra
// hostnames without editing this file:
//
//   VITE_ALLOWED_HOSTS=all                       → accept any Host header
//   VITE_ALLOWED_HOSTS=iris-lab.example,foo.dev  → just these
//   (unset)                                      → Vite default (localhost)
//
// Useful when serving the dev build behind nginx with a real hostname.
// Note: this is read from `iris-frontend/.env` (or the process env when
// running `npm run dev`), NOT from iris-web/.env.
const rawAllowedHosts = process.env.VITE_ALLOWED_HOSTS;
const allowedHosts =
	rawAllowedHosts === 'all'
		? true
		: rawAllowedHosts
			? rawAllowedHosts
					.split(',')
					.map((h) => h.trim())
					.filter(Boolean)
			: undefined;

// Source-map upload for the error tracker (GlitchTip, Sentry-compatible).
//
// Without this every frame in every captured error is minified — `Ot/<` at
// `chunks/CpwxY_wc.js:21:1149` — and an issue cannot be traced to a line. The
// upload needs credentials that only exist in CI, so the whole plugin is gated
// on them: a plain `npm run build` or `npm run dev` behaves exactly as before.
//
// `sourcemap: 'hidden'` is deliberate. Maps are generated so they can be
// uploaded, but no `//# sourceMappingURL=` comment is emitted, so browsers
// never fetch them and the deployed bundle doesn't hand out readable source.
// `filesToDeleteAfterUpload` then removes them from the build output entirely,
// so they exist only between the build step and the upload step.
//
// Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT and SENTRY_URL (the
// GlitchTip base URL, e.g. https://errors.example.io) to turn it on.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const uploadSourceMaps = Boolean(sentryAuthToken && sentryOrg && sentryProject);

export default defineConfig({
	plugins: [
		// Must precede `sveltekit()` — the plugin wraps the SvelteKit build
		// hooks and has to be registered first to see them.
		...(uploadSourceMaps
			? [
					sentrySvelteKit({
						// Route instrumentation is handled by hooks.client.ts /
						// hooks.server.ts already; this plugin is here purely for
						// the source maps.
						autoInstrument: false,
						sourceMapsUploadOptions: {
							authToken: sentryAuthToken,
							org: sentryOrg,
							project: sentryProject,
							url: process.env.SENTRY_URL,
							// Must match the `release` the SDK reports at runtime
							// (runtime-config supplies it), or the uploaded maps
							// won't be matched against incoming events.
							release: { name: process.env.SENTRY_RELEASE },
							sourcemaps: {
								filesToDeleteAfterUpload: ['./.svelte-kit/output/**/*.map']
							}
						}
					})
				]
			: []),
		sveltekit()
	],

	...(uploadSourceMaps && { build: { sourcemap: 'hidden' as const } }),

	// No `test` block here on purpose — Vitest prefers `vitest.config.ts` and
	// ignores this file's, so the copy that used to live here was dead config.
	// Unit-test settings live in `vitest.config.ts`.

	server: {
		host: '0.0.0.0',
		port: 5173,
		...(allowedHosts !== undefined && { allowedHosts })
	}
});
