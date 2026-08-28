<!--
  Preview of timeline events linked to this specific asset. Uses the same
  TimelineView the dedicated timeline page renders — so the look-and-feel
  stays consistent — but mounts its own scoped context so the asset tab
  doesn't share state with /timeline (folding, selection, paging are all
  isolated).

  Editing / flagging / commenting / etc. are not wired here: the goal is
  a read-only preview. If the user wants to act on an event they can jump
  to the full timeline (the topbar still routes there).
-->
<script lang="ts">
	import { setContext, getContext } from 'svelte';
	import { page } from '$app/state';
	import { ClockIcon, ArrowRightIcon, PlusIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import type {
		CaseTimelineEvent,
		UpdateCaseTimelineEventBody
	} from '$lib/services/case-timeline.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import TimelineView from '../../timeline/components/timeline-view.svelte';
	import TimelineEventDialog from '../../timeline/components/timeline-event-dialog.svelte';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	let {
		assetId,
		onCountChange
	}: {
		assetId: number;
		onCountChange?: (count: number) => void;
	} = $props();

	const caseId = $derived(Number(page.params.case_id));
	const baseTimeline = createCaseTimelineContext(() => caseId);

	// We want every event created/edited from this preview to remain
	// linked to the current asset, otherwise it would vanish from the
	// asset-filtered view the moment we refresh. The dialog reads its
	// timeline via `getContext`, so we publish a thin proxy that injects
	// the current asset into the payload before delegating to the real
	// context functions.
	const timeline = {
		...baseTimeline,
		createEvent: async (
			body: Parameters<typeof baseTimeline.createEvent>[0],
			options?: Parameters<typeof baseTimeline.createEvent>[1]
		) => {
			const merged = {
				...body,
				event_assets: Array.from(new Set([...(body.event_assets ?? []), assetId]))
			};
			return baseTimeline.createEvent(merged, options);
		},
		patchEvent: async (
			id: Parameters<typeof baseTimeline.patchEvent>[0],
			body: Parameters<typeof baseTimeline.patchEvent>[1],
			options?: Parameters<typeof baseTimeline.patchEvent>[2]
		) => {
			const merged = {
				...body,
				event_assets:
					body.event_assets !== undefined
						? Array.from(new Set([...body.event_assets, assetId]))
						: undefined
			};
			return baseTimeline.patchEvent(id, merged, options);
		}
	};

	setContext(CASE_TIMELINE_CTX, timeline);

	// Optional: the comments panel context is provided by the case layout.
	// If we're inside the asset *detail dialog* (modal opened from a mention
	// chip), the context may not be present — fall back gracefully.
	const commentsPanel = getContext<CommentsPanelContext | undefined>(COMMENTS_PANEL_CTX);

	let folded = $state(new Set<number>());
	let selected = $state(new Set<number>());
	let lastLoadedAsset = -1;

	// Server-side filter on this asset. Loads on tab mount and on asset
	// switch (e.g. asset detail dialog reusing the component). Resets the
	// per-instance UI state (folds/selection) on switch.
	$effect(() => {
		if (assetId === lastLoadedAsset) return;
		lastLoadedAsset = assetId;
		folded = new Set();
		selected = new Set();
		void timeline.loadEvents({ asset_id: [assetId] }, { fetch });
	});

	const events = $derived(timeline.events());

	const rootEvents = $derived.by(() => {
		const ids = new Set(events.map((e) => e.event_id));
		return events.filter((e) => !e.parent_event_id || !ids.has(e.parent_event_id));
	});

	const childrenByParent = $derived.by(() => {
		const map = new Map<number, CaseTimelineEvent[]>();
		for (const e of events) {
			if (!e.parent_event_id) continue;
			const arr = map.get(e.parent_event_id) ?? [];
			arr.push(e);
			map.set(e.parent_event_id, arr);
		}
		return map;
	});

	const groups = $derived.by<TimelineGroup[]>(() => {
		const m = new Map<string, CaseTimelineEvent[]>();
		for (const e of rootEvents) {
			const d = new Date(e.event_date).toLocaleDateString();
			m.set(d, [...(m.get(d) ?? []), e]);
		}
		return [...m.entries()].map(([date, evs]) => ({ date, events: evs }));
	});

	const toggleFold = (id: number) => {
		const next = new Set(folded);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		folded = next;
	};

	// Add/edit dialog scaffolding. Pickers (categories / assets / iocs)
	// are lazy-loaded the first time the user clicks "Add event" or any
	// per-card action that opens the dialog — there's no need to pre-fetch
	// them while the user is just browsing the tab.
	let dialogOpen = $state(false);
	let dialogLoading = $state(false);
	let editingEvent = $state<CaseTimelineEvent | undefined>(undefined);
	let selectedParent = $state<CaseTimelineEvent | undefined>(undefined);
	let confirmDeleteOpen = $state(false);
	let pendingDeleteId = $state<number | null>(null);
	let eventCategories = $state<EventCategory[]>([]);
	let caseAssets = $state<Asset[]>([]);
	let caseIocs = $state<Ioc[]>([]);
	let pickersLoaded = false;

	const loadPickers = async () => {
		if (pickersLoaded) return;
		dialogLoading = true;
		try {
			const [cats, assets, iocs] = await Promise.all([
				EventCategoriesService.list({ fetch }),
				CaseAssetsService.list(caseId, { per_page: 500 }, { fetch }),
				CaseIocsService.list(caseId, { per_page: 500 }, { fetch })
			]);
			if (cats.ok && Array.isArray(cats.data)) eventCategories = cats.data;
			if (assets.ok && assets.data && typeof assets.data !== 'string') {
				caseAssets = assets.data.data;
			}
			if (iocs.ok && iocs.data && typeof iocs.data !== 'string') {
				caseIocs = iocs.data.data;
			}
			pickersLoaded = true;
		} finally {
			dialogLoading = false;
		}
	};

	const openAddDialog = async () => {
		await loadPickers();
		editingEvent = undefined;
		selectedParent = undefined;
		dialogOpen = true;
	};

	const editEvent = async (eventId: number) => {
		await loadPickers();
		const ev = await timeline.getEvent(eventId);
		if (!ev) return;
		editingEvent = ev;
		selectedParent = undefined;
		dialogOpen = true;
	};

	const addChildEvent = async (eventId: number) => {
		await loadPickers();
		const ev = await timeline.getEvent(eventId);
		if (!ev) return;
		selectedParent = ev;
		editingEvent = undefined;
		dialogOpen = true;
	};

	const deleteEvent = (eventId: number) => {
		pendingDeleteId = eventId;
		confirmDeleteOpen = true;
	};

	const confirmDelete = async () => {
		if (pendingDeleteId == null) return;
		await timeline.removeEvent(pendingDeleteId, { fetch });
		pendingDeleteId = null;
		confirmDeleteOpen = false;
		await timeline.refresh({ asset_id: [assetId] }, { fetch });
		onCountChange?.(timeline.list.total);
	};

	const flagEvent = async (eventId: number) => {
		const ev = await timeline.getEvent(eventId);
		if (!ev) return;
		const payload: UpdateCaseTimelineEventBody = {
			event_title: ev.event_title,
			event_category_id: ev.event_category_id ?? 1,
			event_date: ev.event_date,
			event_tz: ev.event_tz,
			event_assets: ev.event_assets ?? [],
			event_iocs: ev.event_iocs ?? [],
			event_raw: ev.event_raw ?? '',
			event_source: ev.event_source ?? '',
			event_in_summary: ev.event_in_summary ?? false,
			event_in_graph: ev.event_in_graph ?? true,
			event_color: ev.event_color ?? undefined,
			event_sync_iocs_assets: false,
			event_tags: ev.event_tags ?? '',
			event_content: ev.event_content ?? '',
			parent_event_id: ev.parent_event_id ?? null,
			event_is_flagged: !ev.event_is_flagged
		};
		await timeline.patchEvent(ev.event_id, payload, { fetch });
	};

	const duplicateEvent = async (eventId: number) => {
		const ev = await timeline.getEvent(eventId);
		if (!ev) return;
		await timeline.createEvent(
			{
				event_title: `DUPLICATED - ${ev.event_title}`,
				event_category_id: ev.event_category_id ?? 1,
				event_date: ev.event_date,
				event_tz: ev.event_tz,
				event_assets: ev.event_assets ?? [],
				event_iocs: ev.event_iocs ?? [],
				event_raw: ev.event_raw ?? '',
				event_source: ev.event_source ?? '',
				event_in_summary: ev.event_in_summary ?? false,
				event_in_graph: ev.event_in_graph ?? true,
				event_color: ev.event_color ?? undefined,
				event_sync_iocs_assets: false,
				event_tags: ev.event_tags ?? '',
				event_content: ev.event_content ?? '',
				parent_event_id: ev.parent_event_id ?? null
			},
			{ fetch }
		);
		await timeline.refresh({ asset_id: [assetId] }, { fetch });
		onCountChange?.(timeline.list.total);
	};

	const showComments = async (eventId: number) => {
		if (!commentsPanel) return;
		const ev = await timeline.getEvent(eventId);
		if (!ev) return;
		commentsPanel.open({
			type: 'events',
			id: ev.event_id,
			label: ev.event_title || `Event #${ev.event_id}`
		});
	};

	const onDialogChange = async (open: boolean) => {
		dialogOpen = open;
		// On close, refresh the asset-filtered timeline so created/edited
		// events show up here, and bubble the new count to the parent so
		// the tab badge stays in sync.
		if (!open) {
			editingEvent = undefined;
			selectedParent = undefined;
			await timeline.refresh({ asset_id: [assetId] }, { fetch });
			onCountChange?.(timeline.list.total);
		}
	};
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-2 border-b pb-2">
		<div class="flex items-center gap-2">
			<ClockIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Timeline</h2>
			{#if timeline.list.total > 0}
				<span class="text-xs text-muted-foreground">
					{timeline.list.total} event{timeline.list.total === 1 ? '' : 's'}
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1">
			<Button
				variant="outline"
				size="sm"
				class="gap-x-1 text-xs"
				disabled={dialogLoading}
				onclick={openAddDialog}
			>
				<PlusIcon class="h-3 w-3" />
				Add event
			</Button>

			<Button
				variant="ghost"
				size="sm"
				class="gap-x-1 text-xs"
				onclick={() => goto(`/case/${caseId}/timeline?asset_id=${assetId}`)}
			>
				Open full timeline
				<ArrowRightIcon class="h-3 w-3" />
			</Button>
		</div>
	</div>

	<TimelineEventDialog
		bind:open={dialogOpen}
		event={editingEvent}
		{selectedParent}
		initialAssetIds={editingEvent ? [] : [assetId]}
		{eventCategories}
		parentEvents={events}
		assets={caseAssets}
		iocs={caseIocs}
		onOpenChange={onDialogChange}
	/>

	<ConfirmationDialog
		bind:open={confirmDeleteOpen}
		title="Delete event?"
		message="This timeline event will be permanently deleted. This cannot be undone."
		onConfirm={confirmDelete}
		onCancel={() => {
			confirmDeleteOpen = false;
			pendingDeleteId = null;
		}}
	/>

	{#if timeline.list.status === 'loading' && events.length === 0}
		<div class="space-y-3">
			<Skeleton class="h-20 w-full" />
			<Skeleton class="h-20 w-full" />
			<Skeleton class="h-20 w-full" />
		</div>
	{:else if timeline.list.error}
		<div
			class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
		>
			{timeline.list.error}
		</div>
	{:else if events.length === 0}
		<div class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
			No timeline events reference this asset yet.
		</div>
	{:else}
		<TimelineView
			{groups}
			{childrenByParent}
			commentCounts={{}}
			{folded}
			{selected}
			selecting={false}
			mode="list"
			onToggleSelect={() => {}}
			onToggleFold={toggleFold}
			onEdit={editEvent}
			onAddChild={addChildEvent}
			onFlag={flagEvent}
			onComments={showComments}
			onDuplicate={duplicateEvent}
			onDelete={deleteEvent}
		/>

		{#if timeline.list.nextPage !== null}
			<div class="flex justify-center pt-2">
				<Button
					size="sm"
					variant="ghost"
					disabled={timeline.list.status === 'loading_more'}
					onclick={() => void timeline.loadMore({ fetch })}
				>
					{timeline.list.status === 'loading_more' ? 'Loading…' : 'Load more'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
