<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { SideBar } from '$lib/components/navigation/SideBar';
	import TopBar from '$lib/components/navigation/TopBar/TopBar.svelte';
	import { CaseAddModal } from './[components]/CaseModals';
	import { APP_CTX, createAppContext, type AppContext } from '$lib/contexts/app.context.svelte';
	import {
		CASES_CTX,
		createCasesContext,
		type CasesContext
	} from '$lib/contexts/cases.context.svelte';
	import {
		ALERTS_CTX,
		createAlertsContext,
		type AlertsContext
	} from '$lib/contexts/alerts.context.svelte';

	let { children }: { children: Snippet } = $props();

	const app: AppContext = createAppContext();
	setContext(APP_CTX, app);

	const alerts: AlertsContext = createAlertsContext((a) => a.alert_id);
	setContext(ALERTS_CTX, alerts);

	const cases: CasesContext = createCasesContext((c) => c.case_id, app);
	setContext(CASES_CTX, cases);

	const showCaseAdd = $derived<boolean>(cases.ui.showAddModal);

	$effect.pre(() => {
		app.init();

		cases.load({ case_ids: [cases.currentCaseId()] });
	});
</script>

<div class="flex h-screen w-full overflow-hidden bg-background">
	<SideBar />

	<main class="flex min-w-0 grow flex-col">
		<TopBar />

		<!--
		  `min-h-0` is load-bearing here. The default `min-height: auto`
		  on a flex child resolves to its intrinsic content height — so
		  a long page would size this div to fit, push <main> past the
		  viewport, and the `overflow-auto` would never have anything to
		  clip (no scrollbar). With `min-h-0` the div can shrink below
		  its content height and `overflow-auto` finally activates.
		-->
		<div class="flex min-h-0 min-w-0 grow overflow-auto bg-background">
			{@render children()}
		</div>
	</main>
</div>

<CaseAddModal
	open={showCaseAdd}
	onOpenChange={(openState) => (cases.ui.showAddModal = openState)}
/>
