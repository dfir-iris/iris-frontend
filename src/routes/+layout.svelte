<script lang="ts">
	import '../app.css';

	import { ModeWatcher, mode } from 'mode-watcher';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.store';
	import { Toaster } from '$lib/components/ui/toast';
	import { handleSessionExpiration } from '$lib/utils/session-handler';

	const { children } = $props();

	$effect.pre(() => {
		// `.catch` is load-bearing, not defensive padding. With
		// `redirectOnFailure = true`, `loadAuth` signals a dead session by
		// throwing SvelteKit's `redirect(302, '/login')` — an object, not an
		// Error. Nothing awaits this promise, so an uncaught rejection went
		// straight to the SDK's `unhandledrejection` listener and reported as
		// "Object captured as promise rejection with keys: location, status"
		// (GlitchTip iris-saas-frontend#139/#140). `loadAuth` has already
		// cleared auth state by then, so the only thing left to do is the
		// navigation it asked for.
		auth
			.loadAuth(fetch, true)
			.then((loginResponse) => {
				if (!loginResponse) {
					goto('/login');
				}
			})
			.catch(() => {
				// Covers the thrown redirect and any genuine failure alike —
				// both mean "no session", and both end at the login page.
				goto('/login');
			});

		// Set UI theme
		if ($mode == 'dark') {
			document.body.classList.add('dark');
		} else {
			document.body.classList.remove('dark');
		}

		const handleSessionEvent = () => {
			handleSessionExpiration();
		};

		window.addEventListener('session-expired', handleSessionEvent);

		return () => {
			window.removeEventListener('session-expired', handleSessionEvent);
		};
	});
</script>

<svelte:head>
	<!-- Add CSP Meta Tag for browser-side enforcement -->
</svelte:head>

<!-- Light/dark scheme monitor -->
<ModeWatcher track={false} />

<Toaster />

{@render children()}
