<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import {
		ChevronDownIcon,
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

	const isCaseButtonActive = (path: string) => {
		if (path === '') return pathname === caseBasePath || pathname === `${caseBasePath}/`;
		return (
			pathname.includes(`${caseBasePath}/${path}`) ||
			pathname.includes(`${caseBasePath}/${path}/`)
		);
	};

	const activeCaseButton = $derived(
		caseButtons.find((b) => isCaseButtonActive(b.path)) ?? caseButtons[0]
	);
</script>

<header
	style="background-color: hsl(var(--iris-blue));"
	class="shadow-elevation-1 sticky top-0 z-10 grid max-h-14 min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 text-white sm:px-5"
>
	{#if case_id !== null && pathname.startsWith('/case') && pathname !== '/cases'}
		<div class="flex min-w-0 items-center gap-2">
			<button
				onclick={() => (showSwitchContext = true)}
				title={currentCaseTitle}
				class="min-w-0 truncate text-sm font-medium text-white/90 transition-colors hover:text-white"
			>
				{currentCaseTitle}
			</button>
		</div>

		<!-- Tabs: full pill on lg+, dropdown on smaller screens -->
		<div
			class="hidden flex-nowrap items-center rounded-lg border border-white/10 bg-white/5 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md lg:flex"
		>
			{#each caseButtons as button}
				<a href={button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`}>
					<button
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 {isCaseButtonActive(
							button.path
						)
							? 'border border-white/15 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur'
							: 'text-white/75 hover:bg-white/10 hover:text-white'}"
					>
						{button.label}
					</button>
				</a>
			{/each}
		</div>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger class="lg:hidden">
				<span
					class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm font-medium backdrop-blur-md transition-colors hover:bg-white/10"
				>
					{activeCaseButton.label}
					<ChevronDownIcon size="14" />
				</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="center" class="min-w-[180px]">
				{#each caseButtons as button}
					<DropdownMenu.Item
						onclick={() =>
							goto(button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`)}
					>
						{button.label}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		<div class="col-span-2 flex min-w-0 items-center justify-start gap-2">
			<DropdownMenu.Root
				open={showGoToCase}
				onOpenChange={(open: boolean) => (showGoToCase = open)}
			>
				<DropdownMenu.Trigger>
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
				class="min-w-0 truncate text-sm font-medium transition-colors hover:text-white/80"
			>
				{currentCaseTitle}
			</button>
		</div>
	{/if}

	<div class="flex shrink-0 items-center justify-end gap-0.5">
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
