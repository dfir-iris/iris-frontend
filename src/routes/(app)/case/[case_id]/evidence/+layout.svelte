<script lang="ts">
	import { getContext, setContext, type Snippet } from 'svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import EvidenceSidebar from './components/evidence-sidebar.svelte';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import { DEFAULT_SIDEBAR_SIZE, MAX_SIDEBAR_SIZE, MIN_SIDEBAR_SIZE } from '../constants';

	let { children }: { children: Snippet } = $props();

	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);

	setContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX, caseEvidences);
</script>

<CaseWorkspace>
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane
			defaultSize={DEFAULT_SIDEBAR_SIZE}
			minSize={MIN_SIDEBAR_SIZE}
			maxSize={MAX_SIDEBAR_SIZE}
			class="h-full min-w-0 border-r border-border/50"
		>
			<EvidenceSidebar />
		</Resizable.Pane>

		<Resizable.Handle class="bg-transparent hover:bg-border" />

		<Resizable.Pane class="h-full min-w-0 overflow-y-auto">
			{@render children()}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</CaseWorkspace>
