<script lang="ts">
	import { PencilIcon, SparklesIcon } from 'lucide-svelte';

	// Per-row actions for the IOC/asset tables. Both handlers are
	// optional: a table only gets the buttons whose callback it passed,
	// which is how the case views keep the columns they had.
	export let onEdit: (() => void) | undefined = undefined;
	export let onShowEnrichment: (() => void) | undefined = undefined;
	// An object with no enrichment still gets the button, disabled —
	// "nothing was enriched" and "enrichment isn't a thing here" are
	// different answers and the analyst is asking the first question.
	export let hasEnrichment: boolean = false;
	export let editLabel: string = 'Edit';
	export let enrichmentLabel: string = 'View enrichment';
</script>

<div class="flex items-center justify-end gap-1">
	{#if onShowEnrichment}
		<button
			type="button"
			class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
			title={hasEnrichment ? enrichmentLabel : 'No enrichment'}
			aria-label={enrichmentLabel}
			disabled={!hasEnrichment}
			onclick={(e) => {
				e.stopPropagation();
				onShowEnrichment?.();
			}}
		>
			<SparklesIcon class="size-3.5" />
		</button>
	{/if}

	{#if onEdit}
		<button
			type="button"
			class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			title={editLabel}
			aria-label={editLabel}
			onclick={(e) => {
				e.stopPropagation();
				onEdit?.();
			}}
		>
			<PencilIcon class="size-3.5" />
		</button>
	{/if}
</div>
