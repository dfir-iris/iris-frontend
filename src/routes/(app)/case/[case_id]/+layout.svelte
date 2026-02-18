<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CaseTopbar from './components/CaseTopbar.svelte';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import { CaseManageModal } from '../../[components]/CaseModals';

	let { children }: { children: Snippet } = $props();

	const app = getContext<AppContext>(APP_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);

	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	const refresh = async () => {
		const id = cases.currentCaseId();
		await cases.load({ case_ids: [id] });
	};

	$effect(() => {
		const case_id = Number(page.params.case_id);
		if (!Number.isInteger(case_id)) return;

		if (app.state.currentCaseID !== case_id) {
			app.state.currentCaseID = case_id;
		}

		cases.load({ case_ids: [cases.currentCaseId()] });
	});
</script>

{#if !currentCase}
	<div class="flex flex-col overflow-hidden">
		<div class="flex items-start gap-y-1 overflow-y-auto border-b p-4 shadow">
			<div class="mb-2 flex w-full flex-col items-start">
				<Skeleton class="mb-2 h-3 w-8" />
				<Skeleton class="h-6 w-24" />
				<Skeleton class="mt-4 h-8 w-1/2" />
			</div>
		</div>
	</div>
{:else}
	<div class="flex w-full grow flex-col bg-background">
		<CaseTopbar />

		<div class="flex grow overflow-y-auto bg-muted">
			{@render children()}
		</div>
	</div>
{/if}

<CaseManageModal
	open={cases.ui.showManageModal}
	onOpenChange={(openState) => {
		cases.ui.showManageModal = openState;

		if (!openState) {
			refresh();
		}
	}}
/>
