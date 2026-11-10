<!--
  Options of the picture of the cards: which timelines, in one picture
  or one each, how the cards are laid out and what they show.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { RefreshCwIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import type {
		TimelineImageFormat,
		TimelineImageLayout,
		TimelineImageOptions,
		TimelineImageTheme
	} from '../image-export';

	export type TimelineImageRequest = {
		/** Empty: every event of the case. */
		timelineIds: number[];
		/** One picture per timeline rather than all of them in one. */
		separate: boolean;
		format: TimelineImageFormat;
		options: TimelineImageOptions;
	};

	type Props = {
		open: boolean;
		timelines: CaseTimeline[];
		/** Ticked on open: the timelines the sidebar shows. */
		initialTimelineIds: number[];
		initialLayout: TimelineImageLayout;
		initialTheme: TimelineImageTheme;
		isProcessing?: boolean;
		onConfirm: (request: TimelineImageRequest) => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open,
		timelines,
		initialTimelineIds,
		initialLayout,
		initialTheme,
		isProcessing = false,
		onConfirm,
		onOpenChange
	}: Props = $props();

	let timelineIds = $state<Set<number>>(new Set());
	let arrangement = $state<'merged' | 'separate'>('merged');
	let format = $state<TimelineImageFormat>('png');
	let layout = $state<TimelineImageLayout>('tree');
	let theme = $state<TimelineImageTheme>('light');
	let descriptions = $state(true);
	let links = $state(true);
	let tags = $state(true);

	// Reset on each opening only, not when the timelines change under it.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const known = new Set(timelines.map((t) => t.timeline_id));
			timelineIds = new Set(initialTimelineIds.filter((id) => known.has(id)));
			arrangement = 'merged';
			layout = initialLayout;
			theme = initialTheme;
		});
	});

	const toggleTimeline = (id: number, checked: boolean) => {
		const next = new Set(timelineIds);
		if (checked) next.add(id);
		else next.delete(id);
		timelineIds = next;
	};

	const confirm = () =>
		onConfirm({
			// In the sidebar's order, which is the order of the legend.
			timelineIds: timelines.map((t) => t.timeline_id).filter((id) => timelineIds.has(id)),
			separate: timelineIds.size > 1 && arrangement === 'separate',
			format,
			options: { layout, theme, descriptions, links, tags }
		});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-[525px]">
		<Dialog.Header>
			<Dialog.Title>Export timeline as image</Dialog.Title>
			<Dialog.Description>
				A picture of the event cards, every event included. The filters of the cards apply.
			</Dialog.Description>
		</Dialog.Header>

		{#if isProcessing}
			<div class="flex flex-col items-center justify-center gap-2 p-8">
				<RefreshCwIcon class="h-8 w-8 animate-spin text-primary" />
				<p class="text-muted-foreground">Drawing the timeline…</p>
			</div>
		{:else}
			<div class="grid gap-4 py-2">
				{#if timelines.length}
					<div class="flex flex-col gap-2">
						<Label class="font-semibold">Timelines</Label>
						<div class="max-h-48 overflow-y-auto rounded-md border p-2">
							{#each timelines as t (t.timeline_id)}
								<div class="flex items-center gap-2 rounded p-1 hover:bg-muted/50">
									<Checkbox
										id={`image-timeline-${t.timeline_id}`}
										checked={timelineIds.has(t.timeline_id)}
										onCheckedChange={(checked) => toggleTimeline(t.timeline_id, checked === true)}
									/>
									{#if t.color}
										<span
											class="h-2 w-2 shrink-0 rounded-full"
											style={`background-color: ${t.color};`}
											aria-hidden="true"
										></span>
									{/if}
									<Label
										for={`image-timeline-${t.timeline_id}`}
										class="w-full cursor-pointer truncate text-sm font-normal"
									>
										{t.name}
									</Label>
								</div>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">
							{timelineIds.size === 0
								? 'None ticked: every event of the case.'
								: `Events on any of the ${timelineIds.size === 1 ? 'ticked timeline' : `${timelineIds.size} ticked timelines`}.`}
						</p>
					</div>

					{#if timelineIds.size > 1}
						<div class="flex flex-col gap-2">
							<Label class="font-semibold">Pictures</Label>
							<RadioGroup.Root bind:value={arrangement} class="flex gap-4">
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="merged" id="image-merged" />
									<Label for="image-merged" class="font-normal">One for all timelines</Label>
								</div>
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="separate" id="image-separate" />
									<Label for="image-separate" class="font-normal">One per timeline</Label>
								</div>
							</RadioGroup.Root>
						</div>
					{/if}
				{/if}

				<div class="grid grid-cols-3 gap-4">
					<div class="flex flex-col gap-2">
						<Label class="font-semibold">Format</Label>
						<RadioGroup.Root bind:value={format} class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="png" id="image-png" />
								<Label for="image-png" class="font-normal">PNG</Label>
							</div>
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="svg" id="image-svg" />
								<Label for="image-svg" class="font-normal">SVG</Label>
							</div>
						</RadioGroup.Root>
					</div>

					<div class="flex flex-col gap-2">
						<Label class="font-semibold">Layout</Label>
						<RadioGroup.Root bind:value={layout} class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="tree" id="image-tree" />
								<Label for="image-tree" class="font-normal">Tree</Label>
							</div>
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="list" id="image-list" />
								<Label for="image-list" class="font-normal">List</Label>
							</div>
						</RadioGroup.Root>
					</div>

					<div class="flex flex-col gap-2">
						<Label class="font-semibold">Theme</Label>
						<RadioGroup.Root bind:value={theme} class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="light" id="image-light" />
								<Label for="image-light" class="font-normal">Light</Label>
							</div>
							<div class="flex items-center gap-2">
								<RadioGroup.Item value="dark" id="image-dark" />
								<Label for="image-dark" class="font-normal">Dark</Label>
							</div>
						</RadioGroup.Root>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<Label class="font-semibold">On the cards</Label>
					<div class="flex flex-wrap gap-x-4 gap-y-2">
						<div class="flex items-center gap-2">
							<Checkbox
								id="image-descriptions"
								checked={descriptions}
								onCheckedChange={(checked) => (descriptions = checked === true)}
							/>
							<Label for="image-descriptions" class="font-normal">Descriptions</Label>
						</div>
						<div class="flex items-center gap-2">
							<Checkbox
								id="image-links"
								checked={links}
								onCheckedChange={(checked) => (links = checked === true)}
							/>
							<Label for="image-links" class="font-normal">Assets and IOCs</Label>
						</div>
						<div class="flex items-center gap-2">
							<Checkbox
								id="image-tags"
								checked={tags}
								onCheckedChange={(checked) => (tags = checked === true)}
							/>
							<Label for="image-tags" class="font-normal">Tags</Label>
						</div>
					</div>
				</div>
			</div>

			<Dialog.Footer>
				<Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button onclick={confirm}>Export</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
