<script lang="ts">
	import { page } from '$app/stores';
	import {
		DatabaseIcon,
		GripIcon,
		LeafIcon,
		PlusIcon,
		RefreshCwIcon,
		SquareCheckBigIcon
	} from 'lucide-svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { appContext } from '$lib/stores/appContext.store';
	import ActionButton from './ActionButton.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { goto } from '$app/navigation';
	import SwitchContextModal from './SwitchContextModal.svelte';
	import QuickActions from './QuickActions.svelte';
	import { CaseService } from '$lib/services/case.service'; // NEW
	import type { Case } from '$lib/types/resources/case';

	$: pathname = $page.url.pathname;
	$: currentCaseID = $appContext.currentCaseID;

	let currentCaseName: string | null = null;
	let lastFetchedCaseId: number | null = null;

	$: if (currentCaseID && currentCaseID !== lastFetchedCaseId) {
		lastFetchedCaseId = currentCaseID;
		currentCaseName = null;

		CaseService.get(currentCaseID).then((res) => {
			if (lastFetchedCaseId !== currentCaseID) return;

			if (res?.ok && res.data) {
				const c = res.data as Case;
				currentCaseName = c.case_name ?? null;
			}
		});
	}

	$: currentCaseTitle = currentCaseID ? `${currentCaseName ?? 'Current Case'}` : `Current Case`;

	$: caseBasePath = `/case/${currentCaseID}`;

	$: showGoToCase = false;
	$: showSwitchContext = false;
	$: showQuickActions = false;

	let caseNumber: number | null = null;

	const gotoCase = async () => {
		if (caseNumber) {
			showGoToCase = false;

			await goto(`/case/${caseNumber}`);
		}
	};

	const switchContext = async (caseID: number) => {
		caseNumber = caseID;
		await gotoCase();
	};

	const addTaskLog = () => {
		console.log('Add Task Log');
	};

	const datastore = () => {
		console.log('Datastore');
	};

	const createCase = () => {
		console.log('Create Case');
	};

	const topBarButtons = [
		{ icon: RefreshCwIcon, tooltip: 'Switch Context', action: () => (showSwitchContext = true) },
		{ icon: SquareCheckBigIcon, tooltip: 'Add Task Log', action: addTaskLog },
		{ icon: DatabaseIcon, tooltip: 'Datastore', action: datastore },
		{ icon: PlusIcon, tooltip: 'Create Case', action: createCase },
		{ icon: GripIcon, tooltip: 'Quick Actions', action: () => (showQuickActions = true) }
	];

	const caseButtons = [
		{
			label: 'Summary',
			path: ''
		},
		{
			label: 'Notes',
			path: 'notes'
		},
		{
			label: 'Assets',
			path: 'assets'
		},
		{
			label: 'IOC',
			path: 'iocs'
		},
		{
			label: 'Timeline',
			path: 'timeline'
		},
		{
			label: 'Graph',
			path: 'graph'
		},
		{
			label: 'Tasks',
			path: 'tasks'
		},
		{
			label: 'Evidence',
			path: 'evidence'
		}
	];
</script>

<header
	class="sticky top-0 flex max-h-16 min-h-16 w-full items-center justify-between bg-primary-gradient p-4 text-gray-100 drop-shadow-lg"
>
	{#if pathname.startsWith('/case') && pathname !== '/cases'}
		<div class="flex items-center overflow-hidden">
			<button
				onclick={() => (showSwitchContext = true)}
				class="whitespace-nowrap text-sm hover:underline hover:opacity-80"
				>{currentCaseTitle}</button
			>
		</div>

		<div class="mx-2 flex items-center rounded-lg bg-white/10">
			{#each caseButtons as button}
				<a href={button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`}>
					<button
						class={`mx-1 rounded-lg px-3 py-2 hover:bg-white/10 ${
							button.path === ''
								? pathname === `/case/${currentCaseID}` || pathname === `/case/${currentCaseID}/`
									? 'bg-white/10'
									: ''
								: pathname === `/case/${currentCaseID}/${button.path}`
									? 'bg-white/10'
									: ''
						}`}
					>
						{button.label}
					</button>
				</a>
			{/each}
		</div>
	{:else}
		<div class="flex items-center">
			<DropdownMenu.Root
				open={showGoToCase}
				onOpenChange={(open: boolean) => (showGoToCase = open)}
			>
				<DropdownMenu.Trigger class="w-full sm:w-auto">
					<button onclick={gotoCase} class="pt-1 transition-all hover:opacity-80">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger>
									<LeafIcon size="16" />
								</TooltipTrigger>

								<TooltipContent align="center" side="top">Switch Context</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</button>
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="start" class="p-4">
					<input
						placeholder="Go to case number #"
						type="number"
						class="rounded border px-4 py-2"
						bind:value={caseNumber}
					/>

					<button class="ml-2 hover:opacity-75" onclick={gotoCase}>Go!</button>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<button
				onclick={() => (showSwitchContext = true)}
				class="ml-2 text-sm hover:underline hover:opacity-80">{currentCaseTitle}</button
			>
		</div>
	{/if}

	<div class="flex">
		{#each topBarButtons as topBarButton}
			<ActionButton
				icon={topBarButton.icon}
				tooltip={topBarButton.tooltip}
				action={topBarButton.action}
			></ActionButton>
		{/each}
	</div>
</header>

<QuickActions bind:show={showQuickActions} switchCase={() => (showSwitchContext = true)} />

<SwitchContextModal
	open={showSwitchContext}
	title="Switch Context"
	onConfirm={switchContext}
	onOpenChange={(openState) => {
		showSwitchContext = openState;
	}}
/>
