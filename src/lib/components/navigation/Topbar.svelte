<script>
	import { page } from '$app/stores';
	import {
		DatabaseIcon,
		GripIcon,
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

	$: pathname = $page.url.pathname;
	$: hash = $page.url.hash;

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
</script>

<header
	class="sticky top-0 flex max-h-16 min-h-16 w-full items-center bg-primary-gradient p-4 text-gray-100 drop-shadow-lg"
>
	<div class="flex grow">
		{#if pathname === '/' && hash === '#cases'}
			<div>Case Menu</div>
		{:else}
			<div>Standard Menu</div>
		{/if}
	</div>

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
