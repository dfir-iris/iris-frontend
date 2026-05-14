<script lang="ts">
	import { getContext } from 'svelte';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import {
		CASE_TIMELINE_CTX,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import TimelineEventForm, { type TimelineEventFormData } from './timeline-event-form.svelte';

	type Props = {
		open: boolean;
		event?: CaseTimelineEvent;
		eventCategories: EventCategory[];
		parentEvents: CaseTimelineEvent[];
		onOpenChange: (open: boolean) => void;
	};

	type FieldValue = string | number | boolean | number[] | null;

	let { open = $bindable(), event, eventCategories, parentEvents, onOpenChange }: Props = $props();

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
		event_color: null
	});

	const reset = () => {
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
			parent_event_id: event?.parent_event_id ?? null,
			event_assets: event?.event_assets ?? [],
			event_iocs: event?.event_iocs ?? [],
			event_in_summary: event?.event_in_summary ?? false,
			event_in_graph: event?.event_in_graph ?? true,
			event_sync_iocs_assets: false,
			event_color: event?.event_color ?? null
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
				parent_event_id: form.parent_event_id
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
			<TimelineEventForm data={form} {eventCategories} {parentEvents} onUpdateField={updateField} />
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
