import { defineConfig } from 'vitest/config';
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
			? rawAllowedHosts.split(',').map((h) => h.trim()).filter(Boolean)
			: undefined;

export default defineConfig({
	plugins: [sveltekit()],

	test: {
		globals: true,
		environment: 'jsdom', // or 'happy-dom'
		setupFiles: ['./src/vitest.setup.ts'], // Add this line
		include: ['src/**/*.{test,spec}.{js,ts}']
	},

	server: {
		host: '0.0.0.0',
		port: 5173,
		...(allowedHosts !== undefined && { allowedHosts })
	}
});
