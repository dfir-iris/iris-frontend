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

<div class="flex h-screen w-full overflow-hidden dark:bg-background">
	<SideBar />

	<main class="flex min-w-0 grow flex-col">
		<TopBar />

		<div class="flex min-w-0 grow overflow-auto">
			{@render children()}
		</div>
	</main>
</div>

<CaseAddModal
	open={showCaseAdd}
	onOpenChange={(openState) => (cases.ui.showAddModal = openState)}
/>
