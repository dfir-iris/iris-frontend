<script lang="ts">
	import '../app.css';
	import '../app.postcss';

	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/toast';
	import { handleSessionExpiration } from '$lib/utils/session-handler';
	import { setContext, onMount } from 'svelte';
	import {
		CASES_CTX,
		createCasesContext,
		type CasesContext
	} from '$lib/contexts/cases.context.svelte';
	import { APP_CTX, createAppContext, type AppContext } from '$lib/contexts/app.context.svelte';

	const { children } = $props();

	const cases: CasesContext = createCasesContext((c) => c.case_id);
	setContext(CASES_CTX, cases);

	const app: AppContext = createAppContext();
	setContext(APP_CTX, app);

	onMount(() => {
		app.init();
	});

	$effect.pre(() => {
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
