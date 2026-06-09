<script lang="ts">
	import { getContext, setContext, type Snippet } from 'svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import IocsSidebar from './components/iocs-sidebar.svelte';
	import { DEFAULT_SIDEBAR_SIZE, MAX_SIDEBAR_SIZE, MIN_SIDEBAR_SIZE } from '../constants';

	let { children }: { children: Snippet } = $props();

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);

	setContext<CaseIocsContext>(CASE_IOCS_CTX, caseIocs);
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane
			defaultSize={DEFAULT_SIDEBAR_SIZE}
			minSize={MIN_SIDEBAR_SIZE}
			maxSize={MAX_SIDEBAR_SIZE}
			class="h-full min-w-0 border-r"
		>
			<IocsSidebar />
		</Resizable.Pane>

		<Resizable.Handle withHandle class="bg-muted hover:bg-muted-foreground/20" />

		<Resizable.Pane class="h-full min-w-0 overflow-y-auto">
			{@render children()}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
