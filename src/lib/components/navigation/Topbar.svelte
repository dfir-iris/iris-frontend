<script>
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

	$: pathname = $page.url.pathname;

	$: currentCaseID = $appContext.currentCaseID;
	$: currentCaseTitle = `#${currentCaseID} Current Case`;

	$: caseBasePath = `/case/${currentCaseID}`;

	const gotoCase = () => {
		console.log('Go To Case');
	};

	const switchContext = () => {
		console.log('Switch Context');
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

	const quickActions = () => {
		console.log('Quick Actions');
	};

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
				onclick={switchContext}
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

			<button onclick={switchContext} class="ml-2 text-sm hover:underline hover:opacity-80"
				>{currentCaseTitle}</button
			>
		</div>
	{/if}

	<div class="flex">
		<button onclick={switchContext} class="rounded-lg px-2 pb-0 pt-1 hover:bg-white/30">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<RefreshCwIcon size="16" />
					</TooltipTrigger>

					<TooltipContent align="center" side="top">Switch Context</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</button>

		<button onclick={addTaskLog} class="rounded-lg px-2 pt-1 hover:bg-white/30">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<SquareCheckBigIcon size="16" />
					</TooltipTrigger>

					<TooltipContent align="center" side="top">Add Task Log</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</button>

		<button onclick={datastore} class="rounded-lg px-2 pt-1 hover:bg-white/30">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<DatabaseIcon size="16" />
					</TooltipTrigger>

					<TooltipContent align="center" side="top">Datastore</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</button>

		<button onclick={createCase} class="rounded-lg px-2 pt-1 hover:bg-white/30">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<PlusIcon size="16" />
					</TooltipTrigger>

					<TooltipContent align="center" side="top">Create Case</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</button>

		<button onclick={quickActions} class="rounded-lg px-2 pt-1 hover:bg-white/30">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<GripIcon size="16" />
					</TooltipTrigger>

					<TooltipContent align="center" side="top">Quick Actions</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</button>
	</div>
</header>
