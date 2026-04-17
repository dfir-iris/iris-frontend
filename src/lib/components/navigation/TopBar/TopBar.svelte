<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
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
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX } from '$lib/contexts/cases.context.svelte';
	import type { CasesContext } from '$lib/contexts/cases.context.svelte';
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ActionButton from './ActionButton.svelte';
	import SwitchContextModal from './SwitchContextModal.svelte';
	import QuickActions from './QuickActions.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	const case_id = $derived<number>(cases.currentCaseId());
	const currentCase = $derived<Case>(cases.currentCase());
	const currentCaseTitle = $derived<string>(currentCase?.case_name);
	const caseBasePath = $derived<string>(`/case/${case_id}`);
	const pathname = $derived<string>(page.url.pathname);

	let showGoToCase = $state(false);
	let showSwitchContext = $state(false);
	let showQuickActions = $state(false);

	let caseNumber = $state<number | null>(null);

	const gotoCase = async () => {
		if (caseNumber !== null) {
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
		cases.ui.showAddModal = true;
	};

	const topBarButtons = [
		{ icon: RefreshCwIcon, tooltip: 'Switch Context', action: () => (showSwitchContext = true) },
		{ icon: SquareCheckBigIcon, tooltip: 'Add Task Log', action: addTaskLog },
		{ icon: DatabaseIcon, tooltip: 'Datastore', action: datastore },
		{ icon: PlusIcon, tooltip: 'Create Case', action: createCase },
		{ icon: GripIcon, tooltip: 'Quick Actions', action: () => (showQuickActions = true) }
	];

	const caseButtons = [
		{ label: 'Summary', path: '' },
		{ label: 'Notes', path: 'notes' },
		{ label: 'Assets', path: 'assets' },
		{ label: 'IOC', path: 'iocs' },
		{ label: 'Timeline', path: 'timeline' },
		{ label: 'Graph', path: 'graph' },
		{ label: 'Tasks', path: 'tasks' },
		{ label: 'Evidence', path: 'evidence' }
	];
</script>

<header
	style="background-color: hsl(var(--iris-blue));"
	class="sticky top-0 z-10 flex max-h-14 min-h-14 items-center justify-between px-5 text-white shadow-elevation-1"
>
	{#if case_id !== null && pathname.startsWith('/case') && pathname !== '/cases'}
		<div class="flex items-center overflow-auto">
			<button
				onclick={() => (showSwitchContext = true)}
				class="whitespace-nowrap text-sm font-medium text-white/90 transition-colors hover:text-white"
			>
				{currentCaseTitle}
			</button>
		</div>

		<div class="mx-2 flex flex-nowrap items-center overflow-auto rounded-lg bg-white/15 p-0.5">
			{#each caseButtons as button}
				<a href={button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`}>
					<button
						class={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
							button.path === ''
								? pathname === caseBasePath || pathname === `${caseBasePath}/`
									? 'bg-white text-iris-blue shadow-sm'
									: 'text-white/70 hover:text-white'
								: pathname.includes(`${caseBasePath}/${button.path}`) ||
									  pathname.includes(`${caseBasePath}/${button.path}/`)
									? 'bg-white text-iris-blue shadow-sm'
									: 'text-white/70 hover:text-white'
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
					<button onclick={gotoCase} class="pt-1 transition-colors hover:text-white/80">
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
				class="ml-2 text-sm font-medium hover:text-white/80 transition-colors"
			>
				{currentCaseTitle}
			</button>
		</div>
	{/if}

	<div class="flex">
		{#each topBarButtons as topBarButton}
			<ActionButton
				icon={topBarButton.icon}
				tooltip={topBarButton.tooltip}
				action={topBarButton.action}
			/>
		{/each}
	</div>
</header>

<QuickActions bind:show={showQuickActions} switchCase={() => (showSwitchContext = true)} />

<SwitchContextModal
	open={showSwitchContext}
	onConfirm={switchContext}
	onOpenChange={(openState) => (showSwitchContext = openState)}
/>
