<script lang="ts">
	import { getContext } from 'svelte';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import {
		CASE_TIMELINE_CTX,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import TimelineEventForm, { type TimelineEventFormData } from './timeline-event-form.svelte';

	type Props = {
		open: boolean;
		event?: CaseTimelineEvent;
		eventCategories: EventCategory[];
		parentEvents: CaseTimelineEvent[];
		assets: Asset[];
		iocs: Ioc[];
		// Timelines registered on the case. Omitted callers (asset/ioc
		// detail "open timeline event" affordance) just don't render the
		// timelines section — the backend's default-timeline auto-attach
		// still keeps the event visible in the main timeline view.
		timelines?: CaseTimeline[];
		// Timelines preselected when opening the dialog for a brand-new
		// event. Drives the "create event already attached to the active
		// timelines" affordance: the dialog opens with the currently
		// visible timelines ticked.
		initialTimelineIds?: number[];
		selectedParent?: CaseTimelineEvent;
		// When creating a brand-new event (no `event` prop), the host can
		// preset the linked assets/iocs — used by the asset/ioc detail
		// timeline tabs to pin the surrounding context as a starting point.
		initialAssetIds?: number[];
		initialIocIds?: number[];
		// Optional refresh / add affordances next to the Link-to pickers
		// inside the form. The timeline page wires these to refetch its
		// local asset/IOC list and open the asset/IOC add modals; other
		// hosts (asset/ioc detail tabs) omit them.
		onRefreshAssets?: () => void | Promise<void>;
		onAddAsset?: () => void;
		onRefreshIocs?: () => void | Promise<void>;
		onAddIoc?: () => void;
		onOpenChange: (open: boolean) => void;
	};

	type FieldValue = string | number | boolean | number[] | null;

	let {
		open = $bindable(),
		event,
		eventCategories,
		parentEvents,
		assets,
		iocs,
		timelines = [],
		initialTimelineIds = [],
		selectedParent,
		initialAssetIds = [],
		initialIocIds = [],
		onRefreshAssets,
		onAddAsset,
		onRefreshIocs,
		onAddIoc,
		onOpenChange
	}: Props = $props();

	const timeline = getContext<CaseTimelineContext>(CASE_TIMELINE_CTX);

	let isSaving = $state(false);

	const dateFromEvent = (value?: string): string => {
		if (!value) return new Date().toISOString().slice(0, 10);

		return value.slice(0, 10);
	};

	const timeFromEvent = (value?: string): string => {
		if (!value) return '00:00:00.000';

		const time = value.split('T')[1] ?? '00:00:00.000';

		return time.slice(0, 12);
	};

	let form = $state<TimelineEventFormData>({
		event_title: '',
		event_date: dateFromEvent(),
		event_time: '00:00:00.000',
		event_tz: '+00:00',
		event_content: '',
		event_raw: '',
		event_source: '',
		event_tags: '',
		event_category_id: null,
		parent_event_id: null,
		event_assets: [],
		event_iocs: [],
		event_in_summary: false,
		event_in_graph: true,
		event_sync_iocs_assets: true,
		event_color: null,
		timeline_ids: []
	});

	const reset = () => {
		const resolveAssetIds = (): number[] => {
			if (event?.event_assets !== undefined) return event.event_assets;
			if (!event && initialAssetIds.length > 0) return initialAssetIds;
			return (event?.assets ?? [])
				.map((a) => assets.find((ca) => ca.asset_name === a.name)?.asset_id)
				.filter((id): id is number => id !== undefined);
		};

		const resolveIocIds = (): number[] => {
			if (event?.event_iocs !== undefined) return event.event_iocs;
			if (!event && initialIocIds.length > 0) return initialIocIds;
			return (event?.iocs ?? [])
				.map((i) => iocs.find((ci) => ci.ioc_value === i.name)?.ioc_id)
				.filter((id): id is number => id !== undefined);
		};

		const resolveTimelineIds = (): number[] => {
			if (event?.timeline_ids !== undefined) return [...event.timeline_ids];
			if (!event && initialTimelineIds.length > 0) return [...initialTimelineIds];
			// Brand-new event with no preselection: default to the case's
			// default timeline so the event shows up in the user's
			// current view without an extra step.
			const fallback = timelines.find((t) => t.is_default)?.timeline_id;
			return fallback != null ? [fallback] : [];
		};

		form = {
			event_title: event?.event_title ?? '',
			event_date: dateFromEvent(event?.event_date),
			event_time: timeFromEvent(event?.event_date),
			event_tz: event?.event_tz ?? '+00:00',
			event_content: event?.event_content ?? '',
			event_raw: event?.event_raw ?? '',
			event_source: event?.event_source ?? '',
			event_tags: event?.event_tags ?? '',
			event_category_id: event?.event_category_id ?? null,
			parent_event_id: event?.parent_event_id ?? selectedParent?.event_id ?? null,
			event_assets: resolveAssetIds(),
			event_iocs: resolveIocIds(),
			event_in_summary: event?.event_in_summary ?? false,
			event_in_graph: event?.event_in_graph ?? true,
			event_sync_iocs_assets: false,
			event_color: event?.event_color ?? null,
			timeline_ids: resolveTimelineIds()
		};

		isSaving = false;
	};

	const close = () => {
		onOpenChange(false);
	};

	const updateField = (field: keyof TimelineEventFormData, value: FieldValue) => {
		form = {
			...form,
			[field]: value
		};
	};

	const toEventDate = () => `${form.event_date}T${form.event_time}`;

	const save = async () => {
		if (!form.event_title.trim() || !form.event_date || !form.event_time || !form.event_tz) {
			toast({
				title: 'Missing required fields',
				description: 'Event title, date, time and timezone are required.',
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			const payload = {
				event_title: form.event_title.trim(),
				event_category_id: form.event_category_id ?? 1,
				event_date: toEventDate(),
				event_tz: form.event_tz,
				event_assets: form.event_assets,
				event_iocs: form.event_iocs,
				event_raw: form.event_raw,
				event_source: form.event_source,
				event_in_summary: form.event_in_summary,
				event_in_graph: form.event_in_graph,
				event_color: form.event_color ?? undefined,
				event_sync_iocs_assets: form.event_sync_iocs_assets,
				event_tags: form.event_tags,
				event_content: form.event_content,
				parent_event_id: form.parent_event_id,
				timeline_ids: form.timeline_ids
			};

			const saved = event
				? await timeline.patchEvent(event.event_id, payload, { fetch })
				: await timeline.createEvent(payload, { fetch });

			if (!saved) {
				throw new Error(`Failed to ${event ? 'update' : 'create'} event`);
			}

			toast({
				title: event ? 'Event updated' : 'Event created',
				description: event
					? 'Timeline event updated successfully.'
					: 'Timeline event created successfully.',
				variant: 'success'
			});

			close();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: event ? 'Update failed' : 'Create failed',
				description: message,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (open) reset();
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) close();
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">
				{event ? 'Edit event' : 'Add event'}
			</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
			<TimelineEventForm
				data={form}
				{eventCategories}
				{parentEvents}
				{assets}
				{iocs}
				{timelines}
				{onRefreshAssets}
				{onAddAsset}
				{onRefreshIocs}
				{onAddIoc}
				onUpdateField={updateField}
			/>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>

			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					Saving...
				{:else}
					{event ? 'Save event' : 'Add event'}
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
