<script lang="ts">
	import '../app.css';

	import { ModeWatcher, mode } from 'mode-watcher';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.store';
	import { Toaster } from '$lib/components/ui/toast';
	import { handleSessionExpiration } from '$lib/utils/session-handler';

	const { children } = $props();

	$effect.pre(() => {
		auth.loadAuth(fetch, true).then((loginResponse) => {
			if (!loginResponse) {
				goto('/login');
			}
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
