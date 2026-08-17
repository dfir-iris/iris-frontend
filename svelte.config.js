import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			precompress: true,
		}),
		// SvelteKit's built-in checkOrigin compares the Origin header to a single
		// Host value. Multi-hostname deployments (default slug + custom domain)
		// always fail that check on whichever hostname isn't the primary one.
		// We replicate the equivalent guard in hooks.server.ts using event.url,
		// which reflects X-Forwarded-Host and is always the actual public origin.
		csrf: {
			checkOrigin: false
		},
		// Add server proxy configuration
		alias: {
			$lib: 'src/lib'
		}
	}
};

export default config;
