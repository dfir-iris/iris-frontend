<script lang="ts">
	import { getContext, onMount, type Snippet } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CaseTopbar from './components/CaseTopbar.svelte';

	let { children }: { children: Snippet } = $props();

	const cases = getContext<CasesContext>(CASES_CTX);

	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	onMount(() => {
		cases.load({ case_ids: [cases.currentCaseId()] });
	});
</script>

{#if !currentCase}
	<div class="flex flex-col overflow-hidden">
		<div class="flex items-start gap-y-1 overflow-y-auto border-b p-4 shadow">
			<div class="mb-2 flex w-full flex-col items-start">
				<Skeleton class="mb-2 h-3 w-8" />
				<Skeleton class="h-6 w-24" />
				<Skeleton class="mt-4 h-8 w-1/2" />
			</div>
		</div>
	</div>
{:else}
	<div class="flex w-full grow flex-col bg-background">
		<!-- NO PROPS -->
		<CaseTopbar />

		<div class="flex grow overflow-y-auto bg-muted">
			{@render children()}
		</div>
	</div>
{/if}
