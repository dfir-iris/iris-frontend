<script lang="ts">
	import { Tag as TagIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { TagInput } from '$lib/types/resources/tag';
	import { normalizeTags } from '$lib/utils/tags';

	let {
		tags = [],
		size = 'default',
		limit = 0,
		className = ''
	}: {
		tags: TagInput;
		size?: 'small' | 'default' | 'large';
		limit?: number;
		className?: string;
	} = $props();

	const normalizedTags = $derived(normalizeTags(tags));

	const displayedTags = $derived(
		limit > 0 && normalizedTags.length > limit ? normalizedTags.slice(0, limit) : normalizedTags
	);

	const hasMore = $derived(limit > 0 && normalizedTags.length > limit);
	const moreCount = $derived(normalizedTags.length - limit);

	const sizeClasses = {
		small: 'h-5 text-xs px-1.5',
		default: 'h-6 text-xs px-2',
		large: 'h-7 text-sm px-2.5'
	};
</script>

<div class={cn('flex flex-wrap gap-1.5', className)}>
	{#each displayedTags as tag (tag.tag_id)}
		<div
			class={cn('inline-flex items-center rounded-md bg-muted', sizeClasses[size])}
			title={tag.tag_title}
		>
			{#if tag.tag_color}
				<span
					class="mr-1.5 inline-block h-2 w-2 rounded-full"
					style={`background-color: ${tag.tag_color};`}
				></span>
			{/if}

			<div
				class="flex max-w-[150px] items-center gap-1 truncate rounded-full bg-muted py-1 text-xs"
			>
				<TagIcon size={12} />
				<span>{tag.tag_title}</span>
			</div>
		</div>
	{/each}

	{#if hasMore}
		<div
			class={cn(
				'inline-flex items-center rounded-md bg-muted text-muted-foreground',
				sizeClasses[size]
			)}
		>
			+{moreCount} more
		</div>
	{/if}
</div>
