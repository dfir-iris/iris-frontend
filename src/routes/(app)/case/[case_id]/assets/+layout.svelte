<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import {
		CASE_ASSETS_CTX,
		createCaseAssetsContext,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import AssetsSidebar from './components/assets-sidebar.svelte';
	import { DEFAULT_SIDEBAR_SIZE, MAX_SIDEBAR_SIZE, MIN_SIDEBAR_SIZE } from './constants';

	let { children }: { children: Snippet } = $props();

	const caseAssets = createCaseAssetsContext(() => Number(page.params.case_id));

	setContext<CaseAssetsContext>(CASE_ASSETS_CTX, caseAssets);
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane
			defaultSize={DEFAULT_SIDEBAR_SIZE}
			minSize={MIN_SIDEBAR_SIZE}
			maxSize={MAX_SIDEBAR_SIZE}
			class="h-full min-w-0 border-r"
		>
			<AssetsSidebar />
		</Resizable.Pane>

		<Resizable.Handle withHandle class="bg-muted hover:bg-muted-foreground/20" />

		<Resizable.Pane class="h-full min-w-0 overflow-y-auto">
			{@render children()}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
