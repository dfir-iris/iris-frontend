<script lang="ts">
	import { mentionKindIcon } from './mention-icons';
	import type { MentionKind as SharedMentionKind } from './mention-kinds';

	// Re-exported rather than declared here so the many `import type
	// { MentionKind } from './MentionList.svelte'` call sites keep working
	// while `./mention-kinds` stays the single definition.
	export type MentionKind = SharedMentionKind;

	export type MentionItem = {
		id: number | string;
		label: string;
		sublabel?: string;
		kind: MentionKind;
		/** Rendered in place of the kind icon (chat `:emoji` completions). */
		emoji?: string;
	};

	let { items, selectedIndex, onSelect } = $props<{
		items: MentionItem[];
		selectedIndex: number;
		onSelect: (item: MentionItem) => void;
	}>();
</script>

<div
	class="z-50 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
>
	{#if items.length === 0}
		<div class="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>
	{:else}
		{#each items as item, i (item.kind + ':' + item.id)}
			{@const Icon = mentionKindIcon(item.kind)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors {i ===
				selectedIndex
					? 'bg-accent text-accent-foreground'
					: 'hover:bg-accent/60'}"
				onclick={() => onSelect(item)}
			>
				{#if item.emoji}
					<span class="w-4 shrink-0 text-center text-sm leading-none">{item.emoji}</span>
				{:else}
					<Icon size="12" class="shrink-0 text-muted-foreground" />
				{/if}
				<span class="flex flex-col overflow-hidden">
					<span class="truncate font-medium">{item.label}</span>
					{#if item.sublabel}
						<span class="truncate text-2xs text-muted-foreground">{item.sublabel}</span>
					{/if}
				</span>
			</button>
		{/each}
	{/if}
</div>
