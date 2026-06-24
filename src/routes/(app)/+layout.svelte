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
		<!--
		  TopBar is positioned `relative z-20` so it sits above the
		  page-scroll container that follows. The scroll container has
		  `overflow-auto` which creates a stacking context — without an
		  explicit z-index here, sticky cards inside a page can paint
		  over the TopBar even though the TopBar uses `sticky top-0
		  z-10` internally. Bumping it to z-20 at the layout level
		  guarantees pages can't accidentally elevate above the chrome.
		-->
		<div class="relative z-20">
			<TopBar />
		</div>

		<!--
		  `min-h-0` is load-bearing here. The default `min-height: auto`
		  on a flex child resolves to its intrinsic content height — so
		  a long page would size this div to fit, push <main> past the
		  viewport, and the `overflow-auto` would never have anything to
		  clip (no scrollbar). With `min-h-0` the div can shrink below
		  its content height and `overflow-auto` finally activates.

		  `relative z-0` parks the scroll container's stacking context
		  explicitly below the TopBar wrapper above. Sticky elements
		  inside this scroll viewport (filter cards on activities /
		  manage-cases / dim-tasks) are now safe to use `top-0` without
		  punching through the TopBar mid-scroll.
		-->
		<div class="relative z-0 flex min-h-0 min-w-0 grow overflow-auto bg-background">
			{@render children()}
		</div>
	</main>
</div>

<CaseAddModal
	open={showCaseAdd}
	onOpenChange={(openState) => (cases.ui.showAddModal = openState)}
/>
