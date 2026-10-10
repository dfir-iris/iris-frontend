<!--
  AI suggestions of one entity (alert, cluster, case, war room).

  Unobtrusive by design: renders nothing when AI workflows are off or
  the entity has no suggestion at all; otherwise a collapsible strip
  with an open-count badge, the open suggestions, and the resolved ones
  in a collapsed history section. Kept live by the ai-suggestions store
  (socket event `ai_suggestion`).
-->
<script lang="ts">
	import { ChevronRightIcon, HistoryIcon, SparklesIcon } from 'lucide-svelte';
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
		/** Start expanded when there are open suggestions (default true). */
		autoExpand?: boolean;
	}

	let { entityType, entityId, class: className = '', autoExpand = true }: Props = $props();

	const enabled = $derived(aiSuggestionsEnabled());
	const items = $derived(aiSuggestions.list(entityType, entityId));
	const open = $derived(items.filter((s) => s.status === 'open'));
	const history = $derived(items.filter((s) => s.status !== 'open'));
	const openCount = $derived(aiSuggestionsOpenCount(items));

	let expanded = $state<boolean | null>(null);
	let historyOpen = $state(false);
	const isExpanded = $derived(expanded ?? (autoExpand && openCount > 0));

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

{#if enabled && items.length > 0}
	<section
		class={cn('rounded-md border border-violet-500/20 bg-violet-500/[0.03]', className)}
		data-testid="ai-suggestions-panel"
	>
		<button
			type="button"
			class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
			onclick={() => (expanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			<ChevronRightIcon
				size={13}
				class="shrink-0 text-muted-foreground transition-transform {isExpanded ? 'rotate-90' : ''}"
			/>
			<SparklesIcon size={13} class="shrink-0 text-violet-600 dark:text-violet-400" />
			<span class="font-semibold">Suggestions</span>
			{#if openCount > 0}
				<span
					class="rounded-full bg-violet-600 px-1.5 py-px text-2xs font-semibold tabular-nums text-white"
					aria-label={`${openCount} open`}
				>
					{openCount}
				</span>
			{:else}
				<span class="text-muted-foreground">none open</span>
			{/if}
		</button>

		{#if isExpanded}
			<div class="flex flex-col gap-1 px-2 pb-2">
				{#each open as s (s.id)}
					<AiSuggestionCard suggestion={s} {onChanged} />
				{/each}

				{#if history.length > 0}
					<div>
						<button
							type="button"
							class="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
							onclick={() => (historyOpen = !historyOpen)}
							aria-expanded={historyOpen}
						>
							<ChevronRightIcon
								size={11}
								class="transition-transform {historyOpen ? 'rotate-90' : ''}"
							/>
							<HistoryIcon size={11} />
							History ({history.length})
						</button>
						{#if historyOpen}
							<div class="mt-1 flex flex-col gap-1 opacity-90">
								{#each history as s (s.id)}
									<AiSuggestionCard suggestion={s} {onChanged} />
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</section>
{/if}
