<script lang="ts">
	import { FileLock2Icon } from 'lucide-svelte';
	import type { Evidence } from '$lib/types/resources/evidence';
	import { Badge } from '$lib/components/ui/badge';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import EntityRow from '$lib/components/common/EntityRow.svelte';
	import { toPlainSnippet } from '$lib/utils/text';

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
	const descriptionSnippet = $derived(toPlainSnippet(evidence.file_description ?? '', 70));
</script>

<EntityRow
	id={`evidence-card-${evidence.id}`}
	title={evidence.filename}
	Icon={FileLock2Icon}
	{isSelected}
>
	{#snippet titleSuffix()}
		<ClipboardCopy
			value={evidence.filename}
			tooltipText="Copy filename"
			className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
			size={12}
		/>
	{/snippet}

	{#snippet badges()}
		{#if evidence.type?.name}
			<Badge variant="secondary" class="px-2 py-0 text-2xs">{evidence.type.name}</Badge>
		{/if}

		{#if size}
			<span class="whitespace-nowrap text-2xs text-muted-foreground">{size}</span>
		{/if}
	{/snippet}

	{#snippet meta()}
		{#if evidence.date_added}
			<span class="whitespace-nowrap">{evidence.date_added}</span>
		{/if}

		{#if evidence.file_hash}
			<span class="group/hash inline-flex min-w-0 items-center gap-1">
				<span class="truncate font-mono" title={evidence.file_hash}>{evidence.file_hash}</span>
				<ClipboardCopy
					value={evidence.file_hash}
					tooltipText="Copy hash"
					className="hidden shrink-0 group-hover/hash:inline-flex"
					size={11}
				/>
			</span>
		{/if}

		{#if descriptionSnippet}
			<span class="truncate">{descriptionSnippet}</span>
		{/if}
	{/snippet}
</EntityRow>
