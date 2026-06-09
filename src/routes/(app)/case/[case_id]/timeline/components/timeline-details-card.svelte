<script lang="ts">
	import {
		BlocksIcon,
		ChevronDownIcon,
		ChevronRightIcon,
		CopyIcon,
		EditIcon,
		FileSymlinkIcon,
		FlagIcon,
		ForwardIcon,
		MessagesSquareIcon,
		SettingsIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { getSharedEventId, getSharedEventUrl } from '../helpers';

	type Props = {
		event: CaseTimelineEvent;
		compact: boolean;
		childCount: number;
		commentsCount: number;
		folded: boolean;
		selected: boolean;
		selecting: boolean;
		onToggleFold: () => void;
		onToggleSelect: (eventId: number) => void;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventId: number) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventId: number) => void;
	};

	let {
		event,
		compact,
		childCount,
		commentsCount,
		folded,
		selected,
		selecting,
		onToggleFold,
		onToggleSelect,
		onEdit,
		onAddChild,
		onFlag,
		onComments,
		onDuplicate,
		onDelete
	}: Props = $props();

	const eventDate = $derived(new Date(event.event_date).toLocaleString());
	const hasChildren = $derived(childCount > 0);

	let isMenuOpen = $state(false);
</script>

<div
	class={[
		'mb-4 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-950',
		compact ? 'px-4 py-3' : 'px-5 py-4',
		selected
			? 'ring ring-amber-500'
			: event.event_id === getSharedEventId()
				? 'ring  ring-red-500'
				: ''
	]}
	role="button"
	tabindex="0"
	onclick={(e) => {
		if (!selecting) return;
		e.stopPropagation();
		onToggleSelect(event.event_id);
	}}
	onkeydown={(e) => {
		if (!selecting) return;
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		e.stopPropagation();
		onToggleSelect(event.event_id);
	}}
>
	<div class="flex items-start gap-4">
		<div class="min-w-0 flex-1">
			<div class={compact ? 'flex items-center gap-4 text-sm' : 'space-y-2'}>
				<span class="text-slate-500">{eventDate}</span>

				<button
					type="button"
					class="font-medium hover:underline"
					onclick={() => onEdit(event.event_id)}
				>
					{event.event_title}
				</button>
			</div>

			{#if !compact && event.event_content}
				<div class="mt-4 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
					<MarkDownPreview markdown={event.event_content} />
				</div>
			{/if}

			{#if hasChildren}
				<Button variant="secondary" size="sm" class="mt-3" onclick={onToggleFold}>
					{#if folded}
						<ChevronRightIcon class="mr-1 size-4" />
					{:else}
						<ChevronDownIcon class="mr-1 size-4" />
					{/if}

					Child events
				</Button>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="ghost" size="icon" onclick={() => onEdit(event.event_id)}>
							<EditIcon />
						</Button>
					</TooltipTrigger>

					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="ghost" size="icon" onclick={() => onAddChild(event.event_id)}>
							<BlocksIcon />
						</Button>
					</TooltipTrigger>

					<TooltipContent>Add child event</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="ghost" size="icon" onclick={() => onFlag(event.event_id)}>
							<FlagIcon class={event.event_is_flagged ? 'text-red-500' : ''} />
						</Button>
					</TooltipTrigger>

					<TooltipContent>{event.event_is_flagged ? 'Flagged' : 'Not flagged'}</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="ghost"
							size="icon"
							onclick={() => onComments(event.event_id)}
							class="relative"
						>
							<MessagesSquareIcon />

							{#if commentsCount}
								<span
									class="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-2xs text-white"
								>
									{commentsCount}
								</span>
							{/if}
						</Button>
					</TooltipTrigger>

					<TooltipContent>Comments</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<DropdownMenu bind:open={isMenuOpen}>
							<DropdownMenuTrigger>
								<Button variant="ghost" size="icon">
									<SettingsIcon />
								</Button>
							</DropdownMenuTrigger>

							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onclick={() => {
										navigator.clipboard
											.writeText(getSharedEventUrl(event.event_id))
											.then(() => {
												toast({
													title: 'Link copied',
													variant: 'success'
												});
											})
											.catch((e) => {
												console.error('Clipboard copy error:', e);

												toast({
													title: 'Could not copy link',
													variant: 'destructive'
												});
											});
									}}><ForwardIcon /> Share</DropdownMenuItem
								>

								<DropdownMenuItem
									onclick={() => {
										navigator.clipboard
											.writeText(
												`[<i class="fa-solid fa-bell"></i> #25](${getSharedEventUrl(event.event_id)})`
											)
											.then(() => {
												toast({
													title: 'Link copied',
													variant: 'success'
												});
											})
											.catch((e) => {
												console.error('Clipboard copy error:', e);

												toast({
													title: 'Could not copy link',
													variant: 'destructive'
												});
											});
									}}><FileSymlinkIcon /> Markdown Link</DropdownMenuItem
								>

								<DropdownMenuItem
									onclick={() => {
										onDuplicate(event.event_id);
									}}><CopyIcon /> Duplicate</DropdownMenuItem
								>

								<Separator />

								<DropdownMenuItem
									class="text-red-500"
									onclick={() => {
										onDelete(event.event_id);
									}}><Trash2Icon /> Delete</DropdownMenuItem
								>
							</DropdownMenuContent>
						</DropdownMenu>
					</TooltipTrigger>

					<TooltipContent>Event ID #{event.event_id}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>
</div>
