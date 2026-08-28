import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// The single source of truth for the unit-test run.
//
// There used to be a second `test` block in `vite.config.ts`. Vitest prefers
// `vitest.config.ts`, so that one never took effect — which meant its
// `setupFiles` (`src/vitest.setup.ts`, with all the SvelteKit `$app`/`$env`
// mocks) was dead config, and its `include` was ignored. The two have been
// merged here and `vite.config.ts` now carries dev-server config only.
export default defineConfig({
	plugins: [sveltekit()],

	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/vitest.setup.ts'],

		// Both `.test.ts` and `.spec.ts` are collected. The old config excluded
		// `**/*.spec.ts` outright, so a unit test using that suffix would have
		// been skipped silently. Playwright's specs live in `e2e/`, outside
		// `src/`, so they are not matched here — and are excluded again below
		// as a belt-and-braces guard.
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['node_modules/**', 'e2e/**'],

		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
			reportsDirectory: './coverage',

			// Report on every source file, not just the ones a test imported —
			// otherwise untested files vanish from the denominator and the
			// percentage flatters us.
			include: ['src/**/*.{ts,svelte}'],
			exclude: [
				'src/**/__tests__/**',
				'src/**/*.{test,spec}.{js,ts}',
				'src/**/*.d.ts',
				'src/lib/types/**', // type-only, no runtime statements
				'src/lib/components/ui/**' // shadcn primitive wrappers; testing them measures upstream
			],

			// REQUIRED. Vitest defaults this to false, which means a single
			// failing test silently suppresses the entire coverage report —
			// no directory, no warning, exit code alone. CI would report
			// "coverage step succeeded" while producing nothing.
			reportOnFailure: true

			// NOTE: with `all`-file reporting, the v8 provider cannot enumerate
			// functions or branches in files no test imports, so those two
			// denominators only count touched files and read far higher than
			// reality. Quote lines/statements. Switch to the istanbul provider
			// if accurate function/branch numbers are needed.
		}
	}
});
