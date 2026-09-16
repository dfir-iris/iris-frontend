<script lang="ts">
	import { page } from '$app/state';
	import { getContext, onMount } from 'svelte';
	import {
		BugIcon,
		ChevronDownIcon,
		LeafIcon,
		SparklesIcon,
		PlusIcon,
		RefreshCwIcon,
		SquareCheckBigIcon
	} from 'lucide-svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { CHAT_PANEL_CTX, type ChatPanelContext } from '$lib/contexts/chat-panel.context.svelte';
	import BugReportDialog from '$lib/components/observability/BugReportDialog.svelte';
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
	import NotificationBell from './NotificationBell.svelte';
	import SwitchContextModal from './SwitchContextModal.svelte';
	import TopBarSearch from './TopBarSearch.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);
	// May be `undefined` on routes that don't mount the (app) layout
	// (unlikely — the topbar itself is only rendered under (app) — but
	// getContext returns undefined rather than throwing when the key
	// isn't set, so guard defensively).
	const chatPanel = getContext<ChatPanelContext | undefined>(CHAT_PANEL_CTX);
	const chatbotEnabled = $derived<boolean>(runtimeConfig.chatbot.enabled);

	const case_id = $derived<number>(cases.currentCaseId());
	const currentCase = $derived<Case>(cases.currentCase());
	const currentCaseTitle = $derived<string>(currentCase?.case_name);
	const caseBasePath = $derived<string>(`/case/${case_id}`);
	const pathname = $derived<string>(page.url.pathname);

	let showGoToCase = $state(false);
	let showSwitchContext = $state(false);
	let showBugReport = $state(false);

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
		{
			icon: RefreshCwIcon,
			tooltip: 'Switch Context (Ctrl + K)',
			action: () => (showSwitchContext = true)
		},
		{ icon: SquareCheckBigIcon, tooltip: 'Add Task Log', action: addTaskLog },
		{ icon: PlusIcon, tooltip: 'Create Case', action: createCase },
		{ icon: BugIcon, tooltip: 'Report an issue', action: () => (showBugReport = true) }
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
			pathname.includes(`${caseBasePath}/${path}`) || pathname.includes(`${caseBasePath}/${path}/`)
		);
	};

	const activeCaseButton = $derived(
		caseButtons.find((b) => isCaseButtonActive(b.path)) ?? caseButtons[0]
	);
</script>

<!--
  Flex bar with three groups: case title (left, hugs left), case-section
  nav (centre, mx-auto), action cluster (right, hugs right). The
  `mx-auto` on the centre wrapper distributes whatever empty space is
  left between the title and the action cluster evenly into the margins
  on either side of the nav — so the nav appears optically centred in
  the *gap* between those two groups, which is what the user asked for
  (rather than centred in the full viewport). When the gap shrinks past
  the nav's intrinsic width, the `min-w-0 overflow-hidden` lets the
  inline strip yield gracefully and the dropdown variant takes over.
-->
<header
	style="background-color: hsl(var(--iris-blue));"
	class="shadow-elevation-1 flex max-h-14 min-h-14 items-center gap-3 px-3 text-white sm:px-5"
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
		  Centre grid cell. Contains BOTH the inline tab strip (visible at
		  2xl+) and the dropdown trigger (visible below 2xl). Both surfaces
		  live inside one wrapping `<div>` so they occupy a single grid
		  track regardless of which one is currently rendered — previously
		  they were siblings of the header itself, so the `<DropdownMenu.Root>`
		  element took up its own column and pushed the right-hand column
		  off-grid.

		  `min-w-0 overflow-hidden` lets the inline strip be clipped if the
		  viewport really can't fit it (rather than spilling into the next
		  cell); the dropdown variant takes over below `2xl` where the strip
		  is hidden outright.
		-->
		<div class="mx-auto flex h-full min-w-0 items-stretch overflow-hidden">
			<nav
				class="hidden h-full min-w-0 items-stretch overflow-hidden 2xl:flex"
				aria-label="Case sections"
			>
				{#each caseButtons as button}
					{@const active = isCaseButtonActive(button.path)}
					<a
						href={button.path === '' ? caseBasePath : `${caseBasePath}/${button.path}`}
						class="group relative flex items-center whitespace-nowrap px-3 text-sm font-medium transition-colors {active
							? 'text-white'
							: 'text-white/65 hover:text-white'}"
						aria-current={active ? 'page' : undefined}
					>
						{button.label}
						<span
							aria-hidden="true"
							class="pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-all {active
								? 'bg-white opacity-100'
								: 'bg-white/50 opacity-0 group-hover:opacity-60'}"
						></span>
					</a>
				{/each}
			</nav>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="flex items-center 2xl:hidden">
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
		</div>
	{:else}
		<div class="flex min-w-0 flex-1 items-center justify-start gap-2">
			<DropdownMenu.Root
				open={showGoToCase}
				onOpenChange={(open: boolean) => (showGoToCase = open)}
			>
				<!--
				  One <button>, not three. DropdownMenu.Trigger and TooltipTrigger
				  each render a <button> of their own by default, so nesting them
				  (and a hand-written <button> between the two) produced markup the
				  HTML parser flattens into siblings — enough to desync hydration
				  for the entire page. `child` hands the tooltip's props down
				  instead of emitting a second element.
				-->
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							{#snippet child({ props })}
								<DropdownMenu.Trigger
									{...props}
									onclick={gotoCase}
									class="pt-1 transition-colors hover:text-white/80"
								>
									<LeafIcon size="16" />
								</DropdownMenu.Trigger>
							{/snippet}
						</TooltipTrigger>

						<TooltipContent align="center" side="top">Switch Context</TooltipContent>
					</Tooltip>
				</TooltipProvider>

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

	<!--
	  Right cluster: search input + action buttons. Hugs the right edge of
	  the flex bar naturally because the centre nav's `mx-auto` absorbs
	  all leftover space into its margins. `min-w-0` lets the cluster
	  shrink if absolutely needed without distorting the centring.
	-->
	<div class="flex min-w-0 items-center gap-1">
		<!--
		  Global search lives at the right edge of the topbar so it stays
		  reachable from every page. It manages its own expand-on-hover
		  behaviour and renders the result dropdown anchored to itself.
		-->
		<TopBarSearch />

		<div class="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true"></div>

		<NotificationBell />

		{#if chatbotEnabled && chatPanel}
			<ActionButton icon={SparklesIcon} tooltip="Yuki" action={() => chatPanel.toggle()} />
		{/if}

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

<BugReportDialog open={showBugReport} onOpenChange={(v) => (showBugReport = v)} />
