import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

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

export default defineConfig({
	plugins: [sveltekit()],

	// No `test` block here on purpose — Vitest prefers `vitest.config.ts` and
	// ignores this file's, so the copy that used to live here was dead config.
	// Unit-test settings live in `vitest.config.ts`.

	server: {
		host: '0.0.0.0',
		port: 5173,
		...(allowedHosts !== undefined && { allowedHosts })
	}
});
