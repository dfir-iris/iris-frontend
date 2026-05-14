<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		EditIcon,
		FlagIcon,
		MessageCircleIcon,
		SettingsIcon
	} from 'lucide-svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import { Button } from '$lib/components/ui/button';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';

	type Props = {
		event: CaseTimelineEvent;
		compact: boolean;
		childCount: number;
		folded: boolean;
		onToggleFold: () => void;
		onEdit: (eventId: number) => void;
	};

	let { event, compact, childCount, folded, onToggleFold, onEdit }: Props = $props();

	const eventDate = $derived(new Date(event.event_date).toLocaleString());
	const hasChildren = $derived(childCount > 0);
</script>

<article
	class={[
		'mb-4 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-950',
		compact ? 'px-4 py-3' : 'px-5 py-4'
	]}
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
			<Button variant="ghost" size="icon" onclick={() => onEdit(event.event_id)}>
				<EditIcon class="size-4" />
			</Button>

			<Button variant="ghost" size="icon"><FlagIcon class="size-4" /></Button>
			<Button variant="ghost" size="icon"><MessageCircleIcon class="size-4" /></Button>
			<Button variant="ghost" size="icon"><SettingsIcon class="size-4" /></Button>
		</div>
	</div>
</article>
