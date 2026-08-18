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
		size?: 'xs' | 'small' | 'default' | 'large';
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
		// `xs` is the list-row size (EntityRow): tag icon dropped and the pill
		// squeezed to 16px so a full tag set costs one line, not two.
		xs: 'h-4 text-2xs px-1',
		small: 'h-5 text-xs px-1.5',
		default: 'h-6 text-xs px-2',
		large: 'h-7 text-sm px-2.5'
	};
</script>

<div class={cn('flex flex-wrap', size === 'xs' ? 'gap-1' : 'gap-1.5', className)}>
	{#each displayedTags as tag (tag.tag_id)}
		<div
			class={cn('inline-flex items-center rounded-md bg-muted', sizeClasses[size])}
			title={tag.tag_title}
		>
			{#if tag.tag_color}
				<span
					class={cn('inline-block h-2 w-2 rounded-full', size === 'xs' ? 'mr-1' : 'mr-1.5')}
					style={`background-color: ${tag.tag_color};`}
				></span>
			{/if}

			<div
				class={cn(
					'flex max-w-[150px] items-center gap-1 truncate rounded-full bg-muted',
					size === 'xs' ? 'text-2xs' : 'py-1 text-xs'
				)}
			>
				{#if size !== 'xs'}
					<TagIcon size={12} />
				{/if}
				<span class="truncate">{tag.tag_title}</span>
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
