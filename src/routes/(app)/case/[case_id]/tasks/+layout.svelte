<script lang="ts">
	import { getContext, setContext, type Snippet } from 'svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import TasksSidebar from './components/tasks-sidebar.svelte';
	import TasksBoard from './components/tasks-board.svelte';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import { DEFAULT_SIDEBAR_SIZE, MAX_SIDEBAR_SIZE, MIN_SIDEBAR_SIZE } from '../constants';

	let { children }: { children: Snippet } = $props();

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	setContext<CaseTasksContext>(CASE_TASKS_CTX, caseTasks);
</script>

<CaseWorkspace>
	{#if caseTasks.ui.viewMode === 'board'}
		<!--
		  The board needs the whole workspace: columns don't survive being
		  squeezed into the sidebar pane. The selected task (the `children`
		  route) is reachable from a card, which opens it in the same
		  detail view as a modal.
		-->
		<TasksBoard />
	{:else}
		<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
			<Resizable.Pane
				defaultSize={DEFAULT_SIDEBAR_SIZE}
				minSize={MIN_SIDEBAR_SIZE}
				maxSize={MAX_SIDEBAR_SIZE}
				class="h-full min-w-0 border-r border-border/50"
			>
				<TasksSidebar />
			</Resizable.Pane>

			<Resizable.Handle class="bg-transparent hover:bg-border" />

			<Resizable.Pane class="h-full min-w-0 overflow-y-auto">
				{@render children()}
			</Resizable.Pane>
		</Resizable.PaneGroup>
	{/if}
</CaseWorkspace>
