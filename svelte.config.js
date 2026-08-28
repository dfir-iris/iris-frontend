import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	// Compiler warnings we deliberately do not treat as failures.
	//
	// This is the `onwarn(warning, defaultHandler)` hook rather than
	// `compilerOptions.warningFilter` on purpose: `eslint-plugin-svelte`'s
	// `svelte/valid-compile` rule reads `onwarn` out of this file and ignores
	// `warningFilter`, so `warningFilter` would silence the build but leave 93
	// eslint errors standing. `onwarn` is honoured by both.
	//
	// Not calling `defaultHandler` suppresses the warning.
	onwarn: (warning, defaultHandler) => {
		// `custom_element_props_identifier` fires on every component that spreads
		// `...restProps` out of `$props()` — 93 of them, 91 being shadcn-svelte
		// generated primitives under `lib/components/ui/`, where the rest-spread
		// IS the documented idiom.
		//
		// The warning only has meaning when compiling a component to a custom
		// element (`customElement: true`), because that path needs a static list
		// of attributes to register. This is a SvelteKit app; it never compiles
		// to custom elements. "Fixing" it would mean replacing each rest-spread
		// with an exhaustive hand-written list of every HTML attribute the
		// wrapper forwards — strictly worse code, to silence advice that does not
		// apply.
		//
		// Suppressed here rather than with 93 `<!-- svelte-ignore -->` comments so
		// there is one decision in one place, and so `svelte/valid-compile` keeps
		// reporting every OTHER compiler warning as an eslint error.
		if (warning.code === 'custom_element_props_identifier') return;

		defaultHandler(warning);
	},

	kit: {
		adapter: adapter({
			precompress: true
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
