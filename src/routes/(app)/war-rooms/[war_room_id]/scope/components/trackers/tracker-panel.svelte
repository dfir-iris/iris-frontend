<!--
  One tracker tab of the Scope: the rows with their steps, asset flags,
  extra columns and note, all editable in place; search and step
  filters; bulk step changes; row history and tracker activity. Manual
  trackers also add and delete rows. The rows show as a table or as a
  board with one column per step (each user picks, per tracker). Export
  copies the rows as a table or downloads them as CSV, picking the
  columns first.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		ArrowLeft,
		ArrowRight,
		CalendarClock,
		ChevronDown,
		ChevronRight,
		Columns3,
		History,
		Loader2,
		Pencil,
		Plus,
		RefreshCw,
		Rows3,
		Search,
		Settings2,
		Trash2,
		X
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import TableExportMenu from '$lib/components/common/TableExportMenu.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/components/ui/toast';
	import AssetFlagChips from '$lib/components/common/assets/AssetFlagChips.svelte';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import TrackerSortHeader from '$lib/components/common/trackers/TrackerSortHeader.svelte';
	import {
		groupTrackerRows,
		loadTrackerLayout,
		nextTrackerSort,
		saveTrackerLayout,
		sortTrackerRows,
		trackerGroupIsValid,
		trackerGroupOptions,
		type TrackerLayout,
		type TrackerLayoutContext
	} from '$lib/components/common/trackers/tracker-layout';
	import TrackerRenameDialog from '$lib/components/common/trackers/TrackerRenameDialog.svelte';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import { useWarRoomLive } from '$lib/contexts/war-room.context.svelte';
	import type { ScopeAsset } from '$lib/services/war-room-scope.service';
	import { WarRoomsService } from '$lib/services/war-rooms.service';
	import {
		TRACKER_SOURCES,
		WarRoomTrackersService,
		filterTrackerRows,
		mergeTrackerRows,
		trackerOfferedSteps,
		TRACKER_ITEM_TYPE_LABEL,
		trackerItemName,
		trackerRowLabel,
		trackerRowRef,
		trackerStepCounts,
		trackerTimelineWarning,
		type Tracker,
		type TrackerAssetItem,
		type TrackerRow,
		type TrackerRowRef,
		type TrackerStateBody,
		type TrackerTimelineSummary,
		type TrackerValue
	} from '$lib/services/war-room-trackers.service';
	import { assetFlags, loadAssetFlags } from '$lib/stores/asset-flags.store.svelte';
	import {
		copyText,
		downloadText,
		exportFilename,
		loadColumnKeys,
		pickColumns,
		rowsToCsv,
		rowsToTsv,
		saveColumnKeys,
		type ExportScope
	} from '$lib/utils/table-export';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import ScopeFlagDialog from '../scope-flag-dialog.svelte';
	import { SELECT_CHECKBOX_CLASS, errorMessage } from '../helpers';
	import { trackerExportColumns } from '../scope-export';
	import TrackerAddRowsDialog from './tracker-add-rows-dialog.svelte';
	import TrackerBoard from './tracker-board.svelte';
	import TrackerHistoryDialog from './tracker-history-dialog.svelte';
	import TrackerItemCell from './tracker-item-cell.svelte';
	import TrackerStepsCell from '$lib/components/common/trackers/TrackerStepsCell.svelte';
	import TrackerValueCell from '$lib/components/common/trackers/TrackerValueCell.svelte';
	import {
		TRACKER_NOTE_COLUMN,
		okObject,
		trackerBoardMove,
		trackerItemCounts,
		type TrackerMemberOption
	} from '$lib/components/common/trackers/tracker-helpers';
	import type { TrackersState } from './trackers-state.svelte';

	type Props = {
		store: TrackersState;
		tracker: Tracker;
		canWrite: boolean;
		isAdmin: boolean;
	};

	let { store, tracker, canWrite, isAdmin }: Props = $props();

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-top';
	const PAGE = 200;

	let rows = $state<TrackerRow[]>([]);
	let truncated = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let q = $state('');
	let stepFilter = $state<number | 'none' | null>(null);
	let shownCount = $state(PAGE);
	let selected = $state<Set<string>>(new Set());
	let busyKeys = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let members = $state<TrackerMemberOption[]>([]);

	let historyOpen = $state(false);
	let historyRow = $state<TrackerRow | null>(null);
	let historyVersion = $state(0);
	let addOpen = $state(false);
	let deleteTrackerOpen = $state(false);
	let deleteRows = $state<TrackerRow[]>([]);
	let deleteRowsOpen = $state(false);
	let layout = $state<TrackerLayout>({ sort: null, group: null });
	/** Keys of the folded groups. */
	let collapsed = $state<Set<string>>(new Set());
	let refreshing = $state(false);
	let renameRow = $state<TrackerRow | null>(null);
	let renameOpen = $state(false);
	let flagOpen = $state(false);
	let flagTargets = $state<ScopeAsset[]>([]);

	let seq = 0;

	// The live pushes carry no author, so our own writes come back as
	// pushes too: right after this view synced its rows, the re-read they
	// trigger is skipped.
	const ECHO_MS = 2000;
	let syncedAt = 0;
	const markSynced = () => {
		syncedAt = Date.now();
	};
	const isEcho = () => Date.now() - syncedAt < ECHO_MS;

	/** Tell what a change could not write to the timelines (no case access). */
	const warnTimeline = (summary: TrackerTimelineSummary | undefined) => {
		const warning = trackerTimelineWarning(summary);
		if (warning)
			toast({ title: 'Timelines partly updated', description: warning, variant: 'warning' });
	};

	// Only the id: the store replaces the tracker object on every reload,
	// which must not count as another tracker being shown.
	const trackerId = $derived(tracker.id);

	const Icon = $derived(getTrackerIcon(tracker.icon));
	const sourceLabel = $derived(TRACKER_SOURCES.find((s) => s.value === tracker.source)?.label);
	const isManual = $derived(tracker.source === 'manual');
	const offered = $derived(trackerOfferedSteps(tracker, store.steps));
	const counts = $derived(trackerStepCounts(rows));
	const view = $derived(store.view(tracker.id));
	// The board's columns are the steps: only the search applies there.
	const filtered = $derived(
		filterTrackerRows(rows, { q, step: view === 'board' ? null : stepFilter }, tracker.columns)
	);
	// Steps offered here, plus any step a row still carries.
	const filterSteps = $derived(
		store.steps.filter((s) => offered.some((o) => o.id === s.id) || counts.byStep.has(s.id))
	);
	const layoutKey = $derived(`war-room-${trackerId}`);
	const layoutContext = $derived<TrackerLayoutContext<TrackerRow>>({
		label: trackerRowLabel,
		itemName: trackerItemName,
		typeLabel: (r) => (r.item_type ? TRACKER_ITEM_TYPE_LABEL[r.item_type] : 'Free text'),
		columns: tracker.columns,
		steps: filterSteps,
		userName: (id) => members.find((m) => m.id === id)?.name
	});
	const sorted = $derived(sortTrackerRows(filtered, layout.sort, layoutContext));
	const visible = $derived(sorted.slice(0, shownCount));
	const groupOptions = $derived(trackerGroupOptions(tracker.columns, { manual: isManual }));
	// The board's columns are the steps already: the grouping is the list's.
	const groups = $derived(
		view === 'list' && trackerGroupIsValid(layout.group, tracker.columns, isManual)
			? groupTrackerRows(visible, layout.group as string, layoutContext)
			: null
	);
	const itemCounts = $derived(trackerItemCounts(rows));
	const selectedRows = $derived(rows.filter((r) => selected.has(r.key)));
	const selectable = $derived(filtered.filter((r) => !r.restricted && trackerRowRef(r) !== null));
	const allSelected = $derived(
		selectable.length > 0 && selectable.every((r) => selected.has(r.key))
	);
	const someSelected = $derived(!allSelected && selectable.some((r) => selected.has(r.key)));
	const flagRows = $derived(
		selectedRows.filter((r) => r.item_type === 'asset' && r.item && !r.restricted)
	);
	const mixedTypes = $derived(isManual && new Set(rows.map((r) => r.item_type)).size > 1);

	const loadRows = async () => {
		const mine = ++seq;
		const res = await WarRoomTrackersService.listRows(store.warRoomId, trackerId);
		if (mine !== seq) return;
		loading = false;
		const body = okObject(res);
		if (!body || !Array.isArray(body.data)) {
			loadError = errorMessage(res, 'Unable to load the rows');
			return;
		}
		loadError = null;
		markSynced();
		rows = body.data;
		truncated = body.truncated;
		const keys = new Set(rows.map((r) => r.key));
		selected = new Set([...selected].filter((k) => keys.has(k)));
		syncCount();
	};

	const syncCount = () => {
		const current = store.tracker(tracker.id);
		if (current && !truncated && current.row_count !== rows.length) {
			store.upsertTracker({ ...current, row_count: rows.length });
		}
	};

	// New tracker shown: start from scratch.
	$effect(() => {
		void trackerId;
		untrack(() => {
			syncedAt = 0;
			rows = [];
			loading = true;
			loadError = null;
			q = '';
			stepFilter = null;
			selected = new Set();
			shownCount = PAGE;
			historyOpen = false;
			layout = loadTrackerLayout(layoutKey);
			collapsed = new Set();
		});
	});

	// Rows (re)read on tracker change and whenever the store says so
	// (live push, template applied), unless it is the echo of our write.
	let readId: number | null = null;
	$effect(() => {
		const id = trackerId;
		void store.rowsVersion;
		untrack(() => {
			const sameTracker = readId === id;
			readId = id;
			if (sameTracker && isEcho()) return;
			historyVersion += 1;
			void loadRows();
		});
	});

	$effect(() => {
		void store.loadViews();
	});

	$effect(() => {
		void loadAssetFlags();
		const id = store.warRoomId;
		void WarRoomsService.listMembers(id).then((res) => {
			if (res.ok && Array.isArray(res.data)) {
				members = res.data.map((m) => ({ id: m.user_id, name: m.user_name || m.user_login }));
			}
		});
	});

	// Mirrors follow the war room: re-read when its items change. The
	// `trackers` topic is handled by the page (store.reload bumps rowsVersion).
	useWarRoomLive(['scope', 'cases'], () => {
		if (!isEcho()) void loadRows();
	});

	async function withBusy<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
		busyKeys = new Set([...busyKeys, ...keys]);
		try {
			return await fn();
		} finally {
			const next = new Set(busyKeys);
			for (const k of keys) next.delete(k);
			busyKeys = next;
		}
	}

	/** Send a state change for `targets`; merges the returned rows. */
	const applyState = async (
		targets: TrackerRow[],
		change: Omit<TrackerStateBody, 'rows'>
	): Promise<boolean> => {
		const refs = targets.map(trackerRowRef).filter((r): r is TrackerRowRef => r !== null);
		if (refs.length === 0) return false;
		return withBusy(
			targets.map((r) => r.key),
			async () => {
				const res = await WarRoomTrackersService.updateState(store.warRoomId, tracker.id, {
					rows: refs,
					...change
				});
				const body = okObject(res);
				if (body && Array.isArray(body.data)) {
					markSynced();
					rows = mergeTrackerRows(rows, body.data);
					historyVersion += 1;
					warnTimeline(body.timeline);
					return true;
				}
				if (res.status !== 403) {
					toast({
						title: 'Could not save the change',
						description: errorMessage(res, 'The server refused the request.'),
						variant: 'destructive'
					});
				}
				return false;
			}
		);
	};

	// Step toggles in flight per row: the server copy of a row is only
	// taken once its last toggle answered, so quick clicks don't flicker.
	const pendingToggles = new Map<string, number>();

	const flipStep = (key: string, stepId: number, on: boolean) => {
		const row = rows.find((r) => r.key === key);
		if (!row || row.steps.some((s) => s.step_id === stepId) === on) return;
		const steps = on
			? [...row.steps, { step_id: stepId, set_by: null, set_at: new Date().toISOString() }]
			: row.steps.filter((s) => s.step_id !== stepId);
		rows = mergeTrackerRows(rows, [{ ...row, steps }]);
	};

	/** Steps flip at once; flipped back if the server refuses. */
	const toggleStep = async (row: TrackerRow, stepId: number, on: boolean) => {
		const ref = trackerRowRef(row);
		if (ref === null) return;
		const key = row.key;
		flipStep(key, stepId, on);
		pendingToggles.set(key, (pendingToggles.get(key) ?? 0) + 1);
		const res = await WarRoomTrackersService.updateState(store.warRoomId, trackerId, {
			rows: [ref],
			...(on ? { add_step_ids: [stepId] } : { remove_step_ids: [stepId] })
		});
		const left = (pendingToggles.get(key) ?? 1) - 1;
		if (left > 0) pendingToggles.set(key, left);
		else pendingToggles.delete(key);
		const body = okObject(res);
		if (body && Array.isArray(body.data)) {
			markSynced();
			if (left === 0) rows = mergeTrackerRows(rows, body.data);
			historyVersion += 1;
			warnTimeline(body.timeline);
			return;
		}
		flipStep(key, stepId, !on);
		if (res.status !== 403) {
			toast({
				title: 'Could not save the change',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
	};

	const setSteps = (key: string, stepIds: number[]) => {
		const row = rows.find((r) => r.key === key);
		if (!row) return;
		const kept = row.steps.filter((s) => stepIds.includes(s.step_id));
		const added = stepIds
			.filter((id) => !kept.some((s) => s.step_id === id))
			.map((step_id) => ({ step_id, set_by: null, set_at: new Date().toISOString() }));
		rows = mergeTrackerRows(rows, [{ ...row, steps: [...kept, ...added] }]);
	};

	/** Board: a card moved from one step column to another, at once; put back if refused. */
	const moveCard = async (row: TrackerRow, from: number | null, to: number | null) => {
		const change = trackerBoardMove(row, from, to);
		const ref = trackerRowRef(row);
		if (!change || ref === null) return;
		const before = row.steps.map((s) => s.step_id);
		setSteps(row.key, [
			...before.filter((id) => !change.remove_step_ids.includes(id)),
			...change.add_step_ids
		]);
		const ok = await withBusy([row.key], async () => {
			const res = await WarRoomTrackersService.updateState(store.warRoomId, trackerId, {
				rows: [ref],
				...change
			});
			const body = okObject(res);
			if (body && Array.isArray(body.data)) {
				markSynced();
				rows = mergeTrackerRows(rows, body.data);
				historyVersion += 1;
				warnTimeline(body.timeline);
				return true;
			}
			if (res.status !== 403) {
				toast({
					title: 'Could not move the row',
					description: errorMessage(res, 'The server refused the request.'),
					variant: 'destructive'
				});
			}
			return false;
		});
		if (!ok) setSteps(row.key, before);
	};

	const saveValue = (row: TrackerRow, key: string, value: TrackerValue) =>
		applyState([row], { values: { [key]: value } });

	const saveNote = (row: TrackerRow, value: TrackerValue) =>
		applyState([row], { note: typeof value === 'string' ? value : null });

	const bulkStep = async (stepId: number, on: boolean) => {
		bulkBusy = true;
		try {
			const ok = await applyState(
				selectedRows,
				on ? { add_step_ids: [stepId] } : { remove_step_ids: [stepId] }
			);
			if (ok) {
				const name = store.steps.find((s) => s.id === stepId)?.name ?? 'step';
				toast({
					title: `${on ? 'Added' : 'Removed'} ${name} on ${selectedRows.length} ${selectedRows.length === 1 ? 'row' : 'rows'}`,
					variant: 'success'
				});
			}
		} finally {
			bulkBusy = false;
		}
	};

	const toggleRow = (row: TrackerRow, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(row.key);
		else next.delete(row.key);
		selected = next;
	};

	const toggleAll = (on: boolean) => {
		const next = new Set(selected);
		for (const r of selectable) {
			if (on) next.add(r.key);
			else next.delete(r.key);
		}
		selected = next;
	};

	const openHistory = (row: TrackerRow | null) => {
		historyRow = row;
		historyOpen = true;
	};

	const openFlag = (targets: TrackerRow[]) => {
		flagTargets = targets
			.filter((r) => r.item_type === 'asset' && r.item)
			.map((r) => r.item as TrackerAssetItem as unknown as ScopeAsset);
		if (flagTargets.length) flagOpen = true;
	};

	const setLayout = (next: TrackerLayout) => {
		layout = next;
		saveTrackerLayout(layoutKey, next);
	};

	const sortBy = (key: string) => setLayout({ ...layout, sort: nextTrackerSort(layout.sort, key) });

	const groupBy = (group: string) => {
		collapsed = new Set();
		setLayout({ ...layout, group: group || null });
	};

	const toggleGroup = (key: string) => {
		const next = new Set(collapsed);
		if (!next.delete(key)) next.add(key);
		collapsed = next;
	};

	/** Re-read the rows (changes made by others meanwhile). */
	const refresh = async () => {
		if (refreshing) return;
		refreshing = true;
		try {
			historyVersion += 1;
			await loadRows();
		} finally {
			refreshing = false;
		}
	};

	const askRename = (row: TrackerRow) => {
		renameRow = row;
		renameOpen = true;
	};

	/** A free-text row keeps a label; an item row's custom label can be reset (null). */
	const saveLabel = (label: string | null): Promise<boolean> =>
		renameRow ? applyState([renameRow], { label }) : Promise.resolve(false);

	const askDeleteRows = (targets: TrackerRow[]) => {
		deleteRows = targets.filter((r) => r.row_id !== null);
		if (deleteRows.length) deleteRowsOpen = true;
	};

	const removeRows = async () => {
		const targets = deleteRows;
		bulkBusy = true;
		let failed = 0;
		try {
			for (const r of targets) {
				const res = await WarRoomTrackersService.removeRow(
					store.warRoomId,
					tracker.id,
					r.row_id as number
				);
				if (!res.ok) failed += 1;
			}
		} finally {
			bulkBusy = false;
		}
		const gone = targets.length - failed;
		if (gone)
			toast({ title: `${gone} ${gone === 1 ? 'row' : 'rows'} deleted`, variant: 'success' });
		if (failed) {
			toast({
				title: `${failed} ${failed === 1 ? 'row' : 'rows'} could not be deleted`,
				variant: 'destructive'
			});
		}
		await loadRows();
	};

	const removeTracker = async () => {
		const res = await WarRoomTrackersService.remove(store.warRoomId, tracker.id);
		if (res.ok) {
			toast({ title: `Tracker "${tracker.name}" deleted`, variant: 'success' });
			store.dropTracker(tracker.id);
		} else if (res.status !== 403) {
			toast({
				title: 'Could not delete the tracker',
				description: errorMessage(res, 'The server refused the request.'),
				variant: 'destructive'
			});
		}
	};

	const move = async (delta: -1 | 1) => {
		if (!(await store.move(tracker.id, delta))) {
			toast({ title: 'Could not move the tracker', variant: 'destructive' });
		}
	};

	const index = $derived(store.trackers.findIndex((t) => t.id === tracker.id));

	let timelineSyncing = $state(false);

	/** Write the state of the visible rows, or the past changes not written yet. */
	const syncTimeline = async () => {
		if (timelineSyncing) return;
		timelineSyncing = true;
		try {
			await store.writeTimeline(tracker.id);
		} finally {
			timelineSyncing = false;
		}
	};

	const timelineBackfill = $derived(
		tracker.timeline_sync?.mode === 'changes' ? (tracker.timeline_backfill ?? 0) : 0
	);

	// Export: "visible" is every row matching the search and step filter,
	// not only the ones rendered before "Show more".
	const exportColumns = $derived(
		trackerExportColumns(
			tracker,
			store.steps,
			(id) => assetFlags.items.find((f) => f.id === id)?.name ?? `Flag #${id}`,
			(id) => members.find((m) => m.id === id)?.name
		)
	);
	const columnsKey = $derived(`war-room-tracker-${trackerId}`);
	let exportMode = $state<'copy' | 'csv'>('csv');
	let exportOpen = $state(false);
	let exportColumnKeys = $state<string[]>([]);

	const openExport = (mode: 'copy' | 'csv') => {
		exportMode = mode;
		exportColumnKeys = loadColumnKeys(columnsKey, exportColumns);
		exportOpen = true;
	};

	const confirmExport = async (scope: ExportScope, keys: Set<string>) => {
		saveColumnKeys(columnsKey, keys);
		const picked = pickColumns(exportColumns, keys);
		const target = scope === 'all' ? rows : sorted;
		if (exportMode === 'csv') {
			downloadText(
				rowsToCsv(target, picked),
				exportFilename(`war-room-${store.warRoomId}-${tracker.name}`)
			);
		} else if (await copyText(rowsToTsv(target, picked))) {
			toast({
				title: `${target.length} ${target.length === 1 ? 'row' : 'rows'} copied`,
				variant: 'success'
			});
		} else {
			toast({
				title: 'Could not copy',
				description: 'The browser refused access to the clipboard.',
				variant: 'destructive'
			});
			return;
		}
		exportOpen = false;
	};
</script>

<div class="flex flex-col gap-3" data-testid="tracker-panel">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 items-start gap-2">
			<Icon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<div class="min-w-0">
				<h3 class="truncate text-sm font-semibold">{tracker.name}</h3>
				<p class="text-2xs text-muted-foreground">
					{sourceLabel}{tracker.source === 'manual' ? ' rows' : ' (mirrored)'}
					{#if tracker.description}· {tracker.description}{/if}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<TableExportMenu
				noun="rows"
				empty={filtered.length === 0}
				onCopy={() => openExport('copy')}
				onCsv={() => openExport('csv')}
				testId="tracker-export"
			/>
			{#if canWrite && isManual}
				<Button
					size="sm"
					class="h-8 gap-1.5"
					onclick={() => (addOpen = true)}
					data-testid="tracker-add-rows"
				>
					<Plus class="h-3.5 w-3.5" /> Add rows
				</Button>
			{/if}
			<Button
				size="icon"
				variant="outline"
				class="h-8 w-8"
				disabled={refreshing}
				onclick={refresh}
				aria-label="Refresh the rows"
				title="Refresh the rows"
				data-testid="tracker-refresh"
			>
				<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
			</Button>
			<Button
				size="sm"
				variant="outline"
				class="h-8 gap-1.5"
				onclick={() => openHistory(null)}
				data-testid="tracker-activity"
			>
				<History class="h-3.5 w-3.5" /> Activity
			</Button>
			{#if canWrite}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Tracker settings"
						data-testid="tracker-settings"
					>
						<Settings2 class="h-4 w-4" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-[200px]">
						<DropdownMenu.Item onclick={() => store.openForm(tracker)} data-testid="tracker-edit">
							<Pencil class="mr-2 h-3.5 w-3.5" /> Edit tracker…
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => (store.stepsOpen = true)}>
							Manage steps…
						</DropdownMenu.Item>
						{#if tracker.timeline_sync?.mode === 'state'}
							<DropdownMenu.Item
								disabled={timelineSyncing}
								onclick={syncTimeline}
								data-testid="tracker-timeline-sync"
							>
								<CalendarClock class="mr-2 h-3.5 w-3.5" /> Write state to timelines
							</DropdownMenu.Item>
						{:else if timelineBackfill > 0}
							<DropdownMenu.Item
								disabled={timelineSyncing}
								onclick={syncTimeline}
								data-testid="tracker-timeline-backfill"
							>
								<CalendarClock class="mr-2 h-3.5 w-3.5" />
								Write {timelineBackfill}
								{timelineBackfill === 1 ? 'past change' : 'past changes'} to timelines
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
						<DropdownMenu.Item disabled={index <= 0} onclick={() => move(-1)}>
							<ArrowLeft class="mr-2 h-3.5 w-3.5" /> Move left
						</DropdownMenu.Item>
						<DropdownMenu.Item
							disabled={index < 0 || index >= store.trackers.length - 1}
							onclick={() => move(1)}
						>
							<ArrowRight class="mr-2 h-3.5 w-3.5" /> Move right
						</DropdownMenu.Item>
						{#if isAdmin}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={() => store.openSaveTemplate(tracker.id)}>
								Save as template…
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
						<DropdownMenu.Item
							class="text-destructive focus:text-destructive"
							onclick={() => (deleteTrackerOpen = true)}
							data-testid="tracker-delete"
						>
							<Trash2 class="mr-2 h-3.5 w-3.5" /> Delete tracker…
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<div class="flex items-center gap-0.5 rounded-md border p-0.5" role="group" aria-label="View">
			<Button
				size="icon"
				variant={view === 'list' ? 'secondary' : 'ghost'}
				class="h-7 w-7"
				onclick={() => store.setView(tracker.id, 'list')}
				aria-label="List view"
				aria-pressed={view === 'list'}
				title="List view"
				data-testid="tracker-view-list"
			>
				<Rows3 class="h-4 w-4" />
			</Button>
			<Button
				size="icon"
				variant={view === 'board' ? 'secondary' : 'ghost'}
				class="h-7 w-7"
				onclick={() => store.setView(tracker.id, 'board')}
				aria-label="Board view"
				aria-pressed={view === 'board'}
				title={canWrite
					? 'Board view — drag a card to another step to move it'
					: 'Board view — one column per step'}
				data-testid="tracker-view-board"
			>
				<Columns3 class="h-4 w-4" />
			</Button>
		</div>
		<div class="relative">
			<Search
				class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				class="h-8 w-56 pl-7 text-xs"
				placeholder="Search rows…"
				bind:value={q}
				aria-label="Search rows"
				data-testid="tracker-search"
			/>
		</div>
		{#if view === 'list'}
			<select
				class="h-8 rounded-md border border-input bg-background px-2 text-xs"
				value={groups ? layout.group : ''}
				onchange={(e) => groupBy(e.currentTarget.value)}
				aria-label="Group the rows by"
				data-testid="tracker-group-by"
			>
				<option value="">No grouping</option>
				{#each groupOptions as o (o.value)}
					<option value={o.value}>Group by {o.label}</option>
				{/each}
			</select>
		{/if}
		{#if view === 'list'}
			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by step">
				<button
					type="button"
					class="rounded-full border px-2 py-0.5 text-2xs {stepFilter === null
						? 'border-primary bg-primary/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={stepFilter === null}
					onclick={() => (stepFilter = null)}
				>
					All <span class="tabular-nums">{rows.length}</span>
				</button>
				{#each filterSteps as s (s.id)}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-full p-0.5 {stepFilter === s.id
							? 'ring-2 ring-primary'
							: ''}"
						aria-pressed={stepFilter === s.id}
						onclick={() => (stepFilter = stepFilter === s.id ? null : s.id)}
						data-testid="tracker-step-filter"
					>
						<TrackerStepChip step={s} muted={!counts.byStep.get(s.id)} />
						<span class="pr-1 text-2xs tabular-nums text-muted-foreground">
							{counts.byStep.get(s.id) ?? 0}
						</span>
					</button>
				{/each}
				<button
					type="button"
					class="rounded-full border border-dashed px-2 py-0.5 text-2xs {stepFilter === 'none'
						? 'border-primary bg-primary/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={stepFilter === 'none'}
					onclick={() => (stepFilter = stepFilter === 'none' ? null : 'none')}
					data-testid="tracker-step-filter-none"
				>
					No step <span class="tabular-nums">{counts.none}</span>
				</button>
			</div>
		{/if}
	</div>

	{#if canWrite && view === 'list' && selectedRows.length > 0}
		<div
			class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs"
			data-testid="tracker-bulk-bar"
		>
			<span class="font-medium">{selectedRows.length} selected</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:opacity-50"
					disabled={bulkBusy || offered.length === 0}
					data-testid="tracker-bulk-add"
				>
					<Plus class="h-3.5 w-3.5" /> Add step
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each offered as s (s.id)}
						<DropdownMenu.Item onclick={() => bulkStep(s.id, true)}>
							<TrackerStepChip step={s} />
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:opacity-50"
					disabled={bulkBusy || filterSteps.length === 0}
					data-testid="tracker-bulk-remove"
				>
					<X class="h-3.5 w-3.5" /> Remove step
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each filterSteps as s (s.id)}
						<DropdownMenu.Item onclick={() => bulkStep(s.id, false)}>
							<TrackerStepChip step={s} />
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{#if tracker.show_asset_flags && flagRows.length > 0}
				<Button
					size="sm"
					variant="outline"
					class="h-7 text-xs"
					disabled={bulkBusy}
					onclick={() => openFlag(flagRows)}
				>
					Flags…
				</Button>
			{/if}
			{#if isManual}
				<Button
					size="sm"
					variant="outline"
					class="h-7 gap-1 text-xs text-destructive hover:text-destructive"
					disabled={bulkBusy}
					onclick={() => askDeleteRows(selectedRows)}
				>
					<Trash2 class="h-3.5 w-3.5" /> Delete
				</Button>
			{/if}
			{#if bulkBusy}<Loader2 class="h-3.5 w-3.5 animate-spin text-muted-foreground" />{/if}
			<Button
				size="sm"
				variant="ghost"
				class="ml-auto h-7 text-xs"
				onclick={() => (selected = new Set())}
			>
				Clear selection
			</Button>
		</div>
	{/if}

	{#if truncated}
		<p class="text-2xs text-amber-700 dark:text-amber-300">
			Only the first {rows.length} rows are listed.
		</p>
	{/if}

	{#if loading}
		<div class="flex justify-center py-10">
			<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
		</div>
	{:else if loadError}
		<p class="py-8 text-center text-sm text-destructive">{loadError}</p>
	{:else if rows.length === 0}
		<div class="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
			{#if isManual}
				No row yet.
				{#if canWrite}
					<button type="button" class="underline" onclick={() => (addOpen = true)}>
						Add rows
					</button>
				{/if}
			{:else}
				The war room has no {sourceLabel?.toLowerCase()} yet.
			{/if}
		</div>
	{:else if view === 'board'}
		{#if q.trim() && filtered.length === 0}
			<p class="py-8 text-center text-xs text-muted-foreground">No row matches the search.</p>
		{:else}
			<TrackerBoard
				rows={sorted}
				columnSteps={filterSteps}
				steps={store.steps}
				{offered}
				{canWrite}
				{busyKeys}
				showType={mixedTypes}
				showFlags={tracker.show_asset_flags}
				onMove={moveCard}
				onToggle={toggleStep}
				onHistory={openHistory}
				onFlags={(row) => openFlag([row])}
			/>
		{/if}
	{:else}
		<div class="max-h-[70vh] overflow-auto rounded-md border">
			<table class="w-full caption-bottom text-sm" data-testid="tracker-table">
				<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
					<tr>
						{#if canWrite}
							<th class="{TH} w-8">
								<Checkbox
									class={SELECT_CHECKBOX_CLASS}
									checked={allSelected}
									indeterminate={someSelected}
									onCheckedChange={(v) => toggleAll(!!v)}
									aria-label="Select every row"
								/>
							</th>
						{/if}
						<TrackerSortHeader
							class="{TH} min-w-48"
							label="Item"
							sortKey="item"
							sort={layout.sort}
							onSort={sortBy}
						/>
						<TrackerSortHeader
							class="{TH} min-w-40"
							label="Steps"
							sortKey="steps"
							sort={layout.sort}
							onSort={sortBy}
						/>
						{#if tracker.show_asset_flags}
							<th class="{TH} min-w-32">Flags</th>
						{/if}
						{#each tracker.columns as c (c.key)}
							<TrackerSortHeader
								class="{TH} min-w-32"
								label={c.label}
								sortKey={`col:${c.key}`}
								sort={layout.sort}
								onSort={sortBy}
							/>
						{/each}
						<TrackerSortHeader
							class="{TH} min-w-48"
							label="Note"
							sortKey="note"
							sort={layout.sort}
							onSort={sortBy}
						/>
						<TrackerSortHeader
							class="{TH} w-36"
							label="Last update"
							sortKey="updated"
							sort={layout.sort}
							onSort={sortBy}
						/>
						<th class="{TH} w-16"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#if groups}
						{#each groups as g (g.key)}
							{@const unfolded = !collapsed.has(g.key)}
							<tr class="border-b bg-muted/40" data-testid="tracker-group">
								<td colspan="99" class="px-2 py-1">
									<button
										type="button"
										class="inline-flex items-center gap-1.5 text-xs font-medium"
										aria-expanded={unfolded}
										onclick={() => toggleGroup(g.key)}
									>
										{#if unfolded}
											<ChevronDown class="h-3.5 w-3.5" aria-hidden="true" />
										{:else}
											<ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
										{/if}
										{#if g.step}
											<TrackerStepChip step={g.step} size="sm" />
										{:else}
											<span>{g.label}</span>
										{/if}
										<span class="tabular-nums text-muted-foreground">{g.rows.length}</span>
									</button>
								</td>
							</tr>
							{#if unfolded}
								{#each g.rows as row (row.key)}
									{@render trackerRow(row)}
								{/each}
							{/if}
						{:else}
							<tr>
								<td colspan="99" class="py-8 text-center text-xs text-muted-foreground">
									No row matches the filters.
								</td>
							</tr>
						{/each}
					{:else}
						{#each visible as row (row.key)}
							{@render trackerRow(row)}
						{:else}
							<tr>
								<td colspan="99" class="py-8 text-center text-xs text-muted-foreground">
									No row matches the filters.
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		{#if filtered.length > visible.length}
			<div class="flex justify-center">
				<Button variant="outline" size="sm" onclick={() => (shownCount += PAGE)}>
					Show more ({filtered.length - visible.length} left)
				</Button>
			</div>
		{/if}
	{/if}
</div>

{#snippet trackerRow(row: TrackerRow)}
	{@const busy = busyKeys.has(row.key)}
	{@const editable = canWrite && !row.restricted && trackerRowRef(row) !== null}
	<tr
		class="border-b transition-colors hover:bg-muted/50 {busy ? 'opacity-60' : ''}"
		data-testid="tracker-row"
		data-row-key={row.key}
	>
		{#if canWrite}
			<td class={TD}>
				<Checkbox
					class={SELECT_CHECKBOX_CLASS}
					checked={selected.has(row.key)}
					disabled={!editable}
					onCheckedChange={(v) => toggleRow(row, !!v)}
					aria-label={`Select ${trackerRowLabel(row)}`}
				/>
			</td>
		{/if}
		<td class={TD}>
			<TrackerItemCell {row} showType={mixedTypes} />
		</td>
		<td class={TD}>
			<TrackerStepsCell
				{row}
				steps={store.steps}
				{offered}
				canWrite={editable}
				{busy}
				onToggle={(stepId, on) => toggleStep(row, stepId, on)}
			/>
		</td>
		{#if tracker.show_asset_flags}
			<td class={TD}>
				{#if row.item_type === 'asset' && row.item && !row.restricted}
					{@const asset = row.item as TrackerAssetItem}
					{#if canWrite}
						<button
							type="button"
							class="rounded px-0.5 hover:bg-muted/60"
							aria-label={`Flags of ${asset.asset_name}`}
							onclick={() => openFlag([row])}
							data-testid="tracker-row-flags"
						>
							<AssetFlagChips flags={asset.flags} />
						</button>
					{:else}
						<AssetFlagChips flags={asset.flags} />
					{/if}
				{:else}
					<span class="text-2xs text-muted-foreground">—</span>
				{/if}
			</td>
		{/if}
		{#each tracker.columns as c (c.key)}
			<td class={TD}>
				<TrackerValueCell
					value={row.values?.[c.key]}
					column={c}
					{members}
					canWrite={editable && !busy}
					onSave={(v) => saveValue(row, c.key, v)}
				/>
			</td>
		{/each}
		<td class={TD}>
			<TrackerValueCell
				value={row.note}
				column={TRACKER_NOTE_COLUMN}
				canWrite={editable && !busy}
				onSave={(v) => saveNote(row, v)}
			/>
		</td>
		<td class="{TD} text-2xs text-muted-foreground">
			{#if row.updated_at}
				<span class="block">{mediumDateTimeFormatter(row.updated_at)}</span>
				{#if row.updated_by}<span class="block">{row.updated_by.name}</span>{/if}
			{:else}
				—
			{/if}
		</td>
		<td class={TD}>
			<div class="flex items-center gap-0.5">
				{#if !row.restricted}
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						aria-label={`History of ${trackerRowLabel(row)}`}
						title="History"
						onclick={() => openHistory(row)}
						data-testid="tracker-row-history"
					>
						<History class="h-3.5 w-3.5" />
					</Button>
				{/if}
				{#if editable}
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						aria-label={`Rename ${trackerRowLabel(row)}`}
						title="Rename the row"
						disabled={busy}
						onclick={() => askRename(row)}
						data-testid="tracker-row-rename"
					>
						<Pencil class="h-3.5 w-3.5" />
					</Button>
				{/if}
				{#if canWrite && isManual && row.row_id !== null}
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 text-destructive hover:text-destructive"
						aria-label={`Delete ${trackerRowLabel(row)}`}
						title="Delete the row"
						onclick={() => askDeleteRows([row])}
						data-testid="tracker-row-delete"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				{/if}
			</div>
		</td>
	</tr>
{/snippet}

<TrackerHistoryDialog
	bind:open={historyOpen}
	warRoomId={store.warRoomId}
	{tracker}
	steps={store.steps}
	row={historyRow}
	{rows}
	version={historyVersion}
/>

<DownloadModal
	open={exportOpen}
	title={exportMode === 'csv'
		? `Download "${tracker.name}" as CSV`
		: `Copy "${tracker.name}" as a table`}
	itemNounPlural="rows"
	availableColumns={exportColumns}
	countVisible={filtered.length}
	countAll={rows.length}
	showScope={filtered.length !== rows.length}
	initialColumnKeys={exportColumnKeys}
	confirmLabel={exportMode === 'csv' ? 'Download' : 'Copy'}
	onConfirm={confirmExport}
	onOpenChange={(v) => (exportOpen = v)}
/>

{#if canWrite}
	{#if isManual}
		<TrackerAddRowsDialog
			bind:open={addOpen}
			warRoomId={store.warRoomId}
			{tracker}
			{offered}
			{itemCounts}
			onAdded={() => void loadRows()}
		/>
	{/if}

	<TrackerRenameDialog
		bind:open={renameOpen}
		itemName={renameRow?.item_type ? trackerItemName(renameRow) : null}
		label={renameRow
			? renameRow.item_type
				? (renameRow.custom_label ?? null)
				: renameRow.label
			: null}
		onSave={saveLabel}
	/>

	<ScopeFlagDialog
		bind:open={flagOpen}
		warRoomId={store.warRoomId}
		flags={assetFlags.items}
		assets={flagTargets}
		onDone={() => void loadRows()}
	/>

	<ConfirmationDialog
		bind:open={deleteTrackerOpen}
		title={`Delete the tracker "${tracker.name}"?`}
		message={isManual
			? 'Its rows, their steps, notes, values and history are deleted. The war-room items themselves are not touched.'
			: 'The steps, notes, values and history of its rows are deleted. The war-room items themselves are not touched.'}
		confirmText="Delete tracker"
		onConfirm={removeTracker}
	/>

	<ConfirmationDialog
		bind:open={deleteRowsOpen}
		title={deleteRows.length === 1
			? `Delete the row "${trackerRowLabel(deleteRows[0])}"?`
			: `Delete ${deleteRows.length} rows?`}
		message="Their steps, notes, values and history are deleted."
		confirmText="Delete"
		onConfirm={removeRows}
	/>
{/if}
