<script lang="ts">
	import { FileLock2Icon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { Evidence } from '$lib/types/resources/evidence';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	type Props = {
		evidence: Evidence;
		isSelected?: boolean;
	};

	let { evidence, isSelected = false }: Props = $props();

	const formatSize = (bytes: number | null): string => {
		if (!bytes || bytes <= 0) return '';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	};

	const size = $derived(formatSize(evidence.file_size));
</script>

<div
	id={`evidence-card-${evidence.id}`}
	class={cn(
		'group relative w-full overflow-hidden rounded-lg border p-2.5 text-sm transition-colors duration-150',
		isSelected
			? 'border-l-4 border-l-primary border-primary/40 bg-primary/10 text-foreground shadow-sm'
			: 'border-border/60 bg-card hover:border-border hover:bg-muted/40'
	)}
>
	<div class="flex items-start justify-between gap-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div
				class={cn(
					'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
					isSelected ? 'bg-primary/20' : 'bg-muted'
				)}
			>
				<FileLock2Icon
					size={14}
					class={cn(isSelected ? 'text-primary' : 'text-muted-foreground')}
				/>
			</div>

			<div class="min-w-0 flex-1">
				<div class="group/item flex items-center gap-1">
					<span class="line-clamp-2 break-all text-base font-semibold">{evidence.filename}</span>
					<ClipboardCopy
						value={evidence.filename}
						tooltipText="Copy filename"
						className="ml-1 flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
						size={14}
					/>
				</div>

				{#if evidence.type?.name}
					<div class="truncate text-xs text-muted-foreground" title={evidence.type.name}>
						{evidence.type.name}
					</div>
				{/if}
			</div>
		</div>

		{#if size}
			<span class="shrink-0 text-xs text-muted-foreground">{size}</span>
		{/if}
	</div>

	{#if evidence.date_added || evidence.file_hash}
		<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
			{#if evidence.date_added}
				<span class="text-xs text-muted-foreground">{evidence.date_added}</span>
			{/if}

			{#if evidence.file_hash}
				<div class="group/hash flex min-w-0 items-center gap-1">
					<span class="truncate font-mono text-2xs text-muted-foreground" title={evidence.file_hash}>
						{evidence.file_hash}
					</span>
					<ClipboardCopy
						value={evidence.file_hash}
						tooltipText="Copy hash"
						className="flex-shrink-0 opacity-0 group-hover/hash:opacity-100 transition-opacity"
						size={12}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
