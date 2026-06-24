<script lang="ts">
	import { page } from '$app/state';
	import { getContext, onMount } from 'svelte';
	import {
		ChevronDownIcon,
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
	import TopBarSearch from './TopBarSearch.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	const case_id = $derived<number>(cases.currentCaseId());
	const currentCase = $derived<Case>(cases.currentCase());
	const currentCaseTitle = $derived<string>(currentCase?.case_name);
	const caseBasePath = $derived<string>(`/case/${case_id}`);
	const pathname = $derived<string>(page.url.pathname);

	let showGoToCase = $state(false);
	let showSwitchContext = $state(false);

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

	// Global Ctrl/Cmd + K → open the switch-context modal. Mirrors the
	// "command palette" affordance familiar from VS Code / Linear /
	// Slack — picking a case is the closest thing IRIS has to a top-
	// level palette right now. We claim the chord with preventDefault
	// because browsers default-bind it (Chrome focuses the address bar
	// with Ctrl+K).
	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
				e.preventDefault();
				showSwitchContext = true;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const addTaskLog = () => {
		console.log('Add Task Log');
	};

	const createCase = () => {
		cases.ui.showAddModal = true;
	};

	const topBarButtons = [
		{ icon: RefreshCwIcon, tooltip: 'Switch Context (Ctrl + K)', action: () => (showSwitchContext = true) },
		{ icon: SquareCheckBigIcon, tooltip: 'Add Task Log', action: addTaskLog },
		{ icon: PlusIcon, tooltip: 'Create Case', action: createCase }
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
	class="shadow-elevation-1 grid max-h-14 min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 text-white sm:px-5"
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

		<!--
		  Underline-on-active tab strip. Replaces the earlier rounded
		  pill-in-pill design — flatter, more modern, and the active
		  state reads as a real tab rather than a button-among-buttons.
		  No surrounding container card, no rounded corners on each
		  tab; everything aligns on a single horizontal baseline.
		-->
		<nav
			class="hidden h-full items-stretch lg:flex"
			aria-label="Case sections"
		>
			{#each caseButtons as button}
				{@const active = isCaseButtonActive(button.path)}
				<a
					href={button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`}
					class="group relative flex items-center px-4 text-sm font-medium transition-colors {active
						? 'text-white'
						: 'text-white/65 hover:text-white'}"
					aria-current={active ? 'page' : undefined}
				>
					{button.label}
					<span
						aria-hidden="true"
						class="pointer-events-none absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-all {active
							? 'bg-white opacity-100'
							: 'bg-white/50 opacity-0 group-hover:opacity-60'}"
					></span>
				</a>
			{/each}
		</nav>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger class="lg:hidden">
				<span
					class="flex items-center gap-1 border-b-2 border-transparent px-2 py-1.5 text-sm font-medium text-white/85 transition-colors hover:text-white aria-expanded:border-white"
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

	<div class="flex shrink-0 items-center justify-end gap-1">
		<!--
		  Global search lives at the right edge of the topbar so it stays
		  reachable from every page. It manages its own expand-on-hover
		  behaviour and renders the result dropdown anchored to itself.
		-->
		<TopBarSearch />

		<div class="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true"></div>

		{#each topBarButtons as topBarButton}
			<ActionButton
				icon={topBarButton.icon}
				tooltip={topBarButton.tooltip}
				action={topBarButton.action}
			/>
		{/each}
	</div>
</header>

<SwitchContextModal
	open={showSwitchContext}
	onConfirm={switchContext}
	onOpenChange={(openState) => (showSwitchContext = openState)}
/>
