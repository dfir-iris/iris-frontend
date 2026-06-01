<script lang="ts">
	import { getContext, setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		CASE_ASSETS_CTX,
		createCaseAssetsContext,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import {
		CASE_IOCS_CTX,
		createCaseIocsContext,
		type CaseIocsContext
	} from '$lib/contexts/case-iocs.context.svelte';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import {
		CASE_TASKS_CTX,
		createCaseTasksContext,
		type CaseTasksContext
	} from '$lib/contexts/case-tasks.context.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CaseTopbar from './components/CaseTopbar.svelte';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import { CaseManageModal } from '../../[components]/CaseModals';
	import AssetAddDialog from './assets/components/asset-add-dialog.svelte';
	import IocAddDialog from './iocs/components/ioc-add-dialog.svelte';
	import TaskAddDialog from './tasks/components/task-add-dialog.svelte';

	let { children }: { children: Snippet } = $props();

	const app = getContext<AppContext>(APP_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);

	const caseAssets = createCaseAssetsContext(() => Number(page.params.case_id));
	const caseIocs = createCaseIocsContext(() => Number(page.params.case_id));
	const caseNotes = createCaseNotesContext(() => Number(page.params.case_id));
	const caseTasks = createCaseTasksContext(() => Number(page.params.case_id));

	setContext<CaseAssetsContext>(CASE_ASSETS_CTX, caseAssets);
	setContext<CaseIocsContext>(CASE_IOCS_CTX, caseIocs);
	setContext<CaseNotesContext>(CASE_NOTES_CTX, caseNotes);
	setContext<CaseTasksContext>(CASE_TASKS_CTX, caseTasks);

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

		const current = cases.currentCase();

		if (!current || current.case_id !== case_id) {
			cases.load({ case_ids: [case_id] });
		}
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

<AssetAddDialog
	open={caseAssets.ui.showAddModal}
	onOpenChange={(open) => (caseAssets.ui.showAddModal = open)}
/>

<IocAddDialog
	open={caseIocs.ui.showAddModal}
	onOpenChange={(open) => (caseIocs.ui.showAddModal = open)}
/>

<TaskAddDialog
	open={caseTasks.ui.showAddModal}
	onOpenChange={(open) => (caseTasks.ui.showAddModal = open)}
/>
