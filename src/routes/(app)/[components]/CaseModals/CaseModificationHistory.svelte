<script lang="ts">
	import { HistoryIcon } from 'lucide-svelte';
	import { getContext } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let showCaseHistory = $state(false);
</script>

<Popover bind:open={showCaseHistory}>
	<PopoverTrigger>
		<button class="ml-4 pt-1 transition-all hover:opacity-60">
			<HistoryIcon />
		</button>
	</PopoverTrigger>

	<PopoverContent class="w-auto p-2" align="end" side="bottom">
		<div class="flex">Modifications History</div>

		<ul class="mt-2">
			{#if currentCase?.modification_history}
				{#each Object.keys(currentCase.modification_history as object) as modification}
					<li class="text-nowrap text-xs">
						<span class="text-pink-500">
							{new Date(parseInt(modification) * 1000).toLocaleString()}
						</span>

						-

						<span class="text-nowrap">
							{(currentCase.modification_history as Record<string, Record<string, string>>)[
								modification
							].action} by {(
								currentCase.modification_history as Record<string, Record<string, string>>
							)[modification].user}
						</span>
					</li>
				{/each}
			{/if}
		</ul>
	</PopoverContent>
</Popover>
