<!--
  Header chip for the suggestions of one entity when none of them is
  open: the resolved ones are history, not worth a strip of their own,
  so they fold into a popover. Renders nothing while some are open (the
  panel shows them) or when there is none at all. Pair it with an
  `AiSuggestionsPanel` of the same entity set to `hideWhenNoneOpen`; the
  store shares the load between the two.
-->
<script lang="ts">
	import { SparklesIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import type { AiSuggestion, AiSuggestionEntityType } from '$lib/services/ai-suggestions.service';
	import {
		aiSuggestions,
		aiSuggestionsEnabled,
		aiSuggestionsOpenCount
	} from '$lib/stores/ai-suggestions.store.svelte';
	import AiSuggestionCard from './AiSuggestionCard.svelte';

	interface Props {
		entityType: AiSuggestionEntityType;
		entityId: number;
		class?: string;
	}

	let { entityType, entityId, class: className = '' }: Props = $props();

	const enabled = $derived(aiSuggestionsEnabled());
	const items = $derived(aiSuggestions.list(entityType, entityId));
	const openCount = $derived(aiSuggestionsOpenCount(items));

	$effect(() => {
		if (!enabled || !Number.isFinite(entityId) || entityId <= 0) return;
		aiSuggestions.start();
		void aiSuggestions.load(entityType, entityId);
	});

	function onChanged(updated: AiSuggestion | null) {
		if (updated) aiSuggestions.apply(updated);
		else void aiSuggestions.load(entityType, entityId);
	}
</script>

{#if enabled && items.length > 0 && openCount === 0}
	<Popover.Root>
		<Popover.Trigger
			class={cn(
				'inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/[0.04] px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-foreground',
				className
			)}
			title="Suggestions: none open"
			data-testid="ai-suggestions-chip"
		>
			<SparklesIcon size={12} class="text-violet-600 dark:text-violet-400" />
			<span>Suggestions</span>
			<span class="tabular-nums">· {items.length}</span>
		</Popover.Trigger>
		<Popover.Content align="end" class="w-[min(36rem,calc(100vw-2rem))] p-2">
			<div class="mb-1.5 px-1 text-2xs text-muted-foreground">
				None open · {items.length} in history
			</div>
			<div class="flex max-h-96 flex-col gap-1 overflow-y-auto">
				{#each items as s (s.id)}
					<AiSuggestionCard suggestion={s} {onChanged} />
				{/each}
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}
