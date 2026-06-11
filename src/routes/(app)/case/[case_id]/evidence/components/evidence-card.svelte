<script lang="ts">
	import { FileLock2Icon, CopyIcon, EllipsisVerticalIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { toast } from '$lib/stores/toast.store';
	import type { Evidence } from '$lib/types/resources/evidence';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';

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

	const copy = async (value: string | null | undefined, label: string) => {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			toast({ title: `${label} copied`, variant: 'success' });
		} catch (e) {
			console.error('Clipboard copy error:', e);
			toast({ title: `Could not copy ${label.toLowerCase()}`, variant: 'destructive' });
		}
	};

	const stop = (e: Event) => {
		e.stopPropagation();
	};
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
				<span class="line-clamp-2 break-all text-base font-semibold">{evidence.filename}</span>

				{#if evidence.type?.name}
					<div class="truncate text-xs text-muted-foreground">{evidence.type.name}</div>
				{/if}
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1">
			{#if size}
				<span class="text-xs text-muted-foreground">{size}</span>
			{/if}

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<button
							type="button"
							class="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
							onclick={(e) => {
								stop(e);
								copy(evidence.filename, 'Filename');
							}}
							aria-label="Copy filename"
						>
							<CopyIcon size={12} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Copy filename</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<button
						type="button"
						class="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
						onclick={stop}
						aria-label="Quick actions"
					>
						<EllipsisVerticalIcon size={14} />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" onclick={stop}>
					<DropdownMenuLabel>Copy</DropdownMenuLabel>

					<DropdownMenuItem onclick={() => copy(evidence.filename, 'Filename')}>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						Filename
					</DropdownMenuItem>

					<DropdownMenuItem
						disabled={!evidence.file_hash}
						onclick={() => copy(evidence.file_hash, 'Hash')}
					>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						Hash
					</DropdownMenuItem>

					<DropdownMenuItem
						disabled={!evidence.file_uuid}
						onclick={() => copy(evidence.file_uuid, 'UUID')}
					>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						UUID
					</DropdownMenuItem>

					<DropdownMenuItem onclick={() => copy(String(evidence.id), 'ID')}>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						ID
					</DropdownMenuItem>

					<DropdownMenuItem
						disabled={!evidence.file_description}
						onclick={() => copy(evidence.file_description, 'Description')}
					>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						Description
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						disabled={!evidence.filename}
						onclick={() =>
							copy(
								`${evidence.filename}${evidence.file_hash ? `\n${evidence.file_hash}` : ''}`,
								'Summary'
							)}
					>
						<CopyIcon class="mr-2 h-3.5 w-3.5" />
						Filename + hash
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>

	{#if evidence.date_added || evidence.file_hash}
		<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
			{#if evidence.date_added}
				<span class="text-xs text-muted-foreground">{evidence.date_added}</span>
			{/if}

			{#if evidence.file_hash}
				<span class="truncate font-mono text-2xs text-muted-foreground">
					{evidence.file_hash}
				</span>
			{/if}
		</div>
	{/if}
</div>
