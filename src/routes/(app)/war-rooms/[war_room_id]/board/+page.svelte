<!--
  War-room "Board" tab: one-glance status of every attached case.

  Made of the room's widgets, set by its writers in "Edit board" (see
  board-widgets.ts): the AI suggestions banner, KPI tiles (each a link
  into its section), the status flags over every asset the caller can
  see, one card per attached case with its flag counts and the tracker
  steps it flags, the open decisions, the computed "Needs attention" list
  — and any number of tracker counts ("10/20 contacted"), tracker
  progress (bars, donut or funnel), tracker rows ("actions required"),
  tracker breakdowns (rows per column value and step), task lists and
  notes. Each user can then hide and reorder them for themselves
  ("Customize", saved per user and per room — see board-layout.ts). Cases
  the caller cannot read are shown as locked cards (the backend only
  sends their id). Refreshes every 60 s while the tab is visible.
-->
<script lang="ts">
	import { AiSuggestionsChip, AiSuggestionsPanel } from '$lib/components/ai-suggestions';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { useWarRoomLive } from '$lib/contexts/war-room.context.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { canReadVulnerabilities } from '$lib/components/vulnerabilities/permissions';
	import { page } from '$app/state';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { getTrackerIcon } from '$lib/components/common/trackers/tracker-icon';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import {
		Activity,
		ArrowRight,
		BadgeAlert,
		Building2,
		CalendarClock,
		CircleAlert,
		Flame,
		Gavel,
		LayoutDashboard,
		ListChecks,
		Lock,
		NotebookPen,
		Pencil,
		RefreshCw,
		Server,
		ShieldOff,
		ShieldX,
		Siren,
		SlidersHorizontal,
		Timer,
		Unplug,
		UserRound,
		Users
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime, formatTime } from '$lib/utils/time-formatter';
	import { assetFlagDotClass, sortAssetFlags } from '$lib/services/asset-flags.service';
	import {
		WarRoomBoardService,
		boardBreakdownData,
		boardCountData,
		boardCountText,
		boardFlagCounts,
		type BoardFlagCount,
		boardListData,
		boardMissing,
		boardProgressData,
		boardStepBars,
		boardTasksData,
		type BoardTrackerRef,
		boardTrackerRowHref,
		boardValueLabel,
		boardVulnerabilityHrefFor,
		boardVulnerabilityKpis,
		type BoardWidgetType,
		type WarRoomBoard,
		type WarRoomBoardAttention,
		type WarRoomBoardCase,
		type WarRoomBoardKpis,
		type WarRoomBoardTask,
		type WarRoomBoardWidget,
		sortBoardCases
	} from '$lib/services/war-room-board.service';
	import { formatDecisionTarget } from '$lib/services/war-room-decisions.service';
	import {
		WarRoomTrackersService,
		type Tracker,
		type TrackerStep
	} from '$lib/services/war-room-trackers.service';
	import { WarRoomTeamsService, type WarRoomTeam } from '$lib/services/war-room-teams.service';
	import { UsersService } from '$lib/services/users.service';
	import {
		BOARD_LAYOUT_LEGACY_PREF_KEY,
		boardLayoutPrefKey,
		defaultBoardLayout,
		isDefaultBoardLayout,
		normalizeBoardLayout,
		visibleWidgets,
		type BoardLayout,
		type BoardSlot
	} from './board-layout';
	import {
		BOARD_WIDGET_TYPES,
		boardDonutArcs,
		boardSlots,
		boardStepHex,
		boardWidgetTitle
	} from './board-widgets';
	import BoardCustomize from './components/board-customize.svelte';
	import BoardEditor from './components/board-editor.svelte';

	const REFRESH_MS = 60_000;
	const LAYOUT_SAVE_MS = 600;
	const ROOM_LAYOUT = { hidden: [], columns: {} };
	const DONUT_R = 42;
	const DONUT_C = 2 * Math.PI * DONUT_R;

	const warRoomId = $derived(Number(page.params.war_room_id));

	let board = $state<WarRoomBoard | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const errorText = (res: { data?: unknown; error?: { message?: string } | null }) => {
		const data = res.data as { message?: unknown } | string | null | undefined;
		return data && typeof data === 'object' && typeof data.message === 'string'
			? data.message
			: (res.error?.message ?? undefined);
	};

	const load = async (silent = false) => {
		if (refreshing) return;
		refreshing = true;
		if (!silent) loading = board === null;
		const res = await WarRoomBoardService.get(warRoomId);
		refreshing = false;
		loading = false;
		if (res.ok && res.data && typeof res.data === 'object') {
			board = res.data as WarRoomBoard;
		} else if (!silent) {
			toast({
				title: 'Could not load the board',
				description: errorText(res),
				variant: 'destructive'
			});
		}
	};

	const onVisibility = () => {
		if (document.visibilityState === 'visible') void load(true);
	};

	// --- Widgets ----------------------------------------------------------

	const widgets = $derived(board?.widgets ?? []);
	const slots = $derived(boardSlots(widgets));
	const widgetById = $derived(new Map(widgets.map((w) => [w.id, w])));

	// --- Layout -----------------------------------------------------------
	//
	// The user's own tweaks, loaded once from their preferences and laid
	// over the room's widgets; every change is applied at once and saved
	// with a debounce. The room's layout as is is stored without an order
	// (`ROOM_LAYOUT`), so later changes to the room's board reach the user —
	// and not as null, which would bring the legacy preference back.
	let rawLayout = $state<unknown>(null);
	const layout = $derived<BoardLayout>(normalizeBoardLayout(rawLayout, slots));
	let customizing = $state(false);
	let layoutTimer: ReturnType<typeof setTimeout> | null = null;
	// A change made before the saved layout lands wins over it.
	let layoutTouched = false;

	const readPreference = async (key: string): Promise<unknown> => {
		const res = await UsersService.getMyPreference<unknown>(key);
		return res.ok && res.data && typeof res.data === 'object' ? res.data.value : null;
	};

	const loadLayout = async () => {
		// A room without its own layout starts from the one every room had
		// before layouts were per room.
		const value =
			(await readPreference(boardLayoutPrefKey(warRoomId))) ??
			(await readPreference(BOARD_LAYOUT_LEGACY_PREF_KEY));
		if (!layoutTouched && value != null) rawLayout = value;
	};

	const saveLayoutNow = async () => {
		layoutTimer = null;
		const value = isDefaultBoardLayout(layout, slots) ? ROOM_LAYOUT : $state.snapshot(layout);
		const res = await UsersService.setMyPreference(boardLayoutPrefKey(warRoomId), value);
		if (!res.ok && res.status !== 403) {
			toast({
				title: 'Could not save the board layout',
				description: res.error?.message ?? undefined,
				variant: 'destructive'
			});
		}
	};

	const setLayout = (next: BoardLayout) => {
		rawLayout = next;
		layoutTouched = true;
		if (layoutTimer) clearTimeout(layoutTimer);
		layoutTimer = setTimeout(() => void saveLayoutNow(), LAYOUT_SAVE_MS);
	};

	// --- Edit board (the room's writers) ------------------------------------

	let editing = $state(false);
	let opening = $state(false);
	let editorTrackers = $state<Tracker[]>([]);
	let editorSteps = $state<TrackerStep[]>([]);
	let editorTeams = $state<WarRoomTeam[]>([]);

	const openEditor = async () => {
		if (opening) return;
		opening = true;
		const [trackers, steps, teams] = await Promise.all([
			WarRoomTrackersService.list(warRoomId),
			WarRoomTrackersService.listSteps(warRoomId),
			WarRoomTeamsService.list(warRoomId)
		]);
		opening = false;
		editorTrackers = trackers.ok && Array.isArray(trackers.data) ? trackers.data : [];
		editorSteps = steps.ok && Array.isArray(steps.data) ? steps.data : [];
		editorTeams = teams.ok && Array.isArray(teams.data) ? teams.data : [];
		customizing = false;
		editing = true;
	};

	onMount(() => {
		void load();
		void loadLayout();
		timer = setInterval(() => {
			if (document.visibilityState === 'visible') void load(true);
		}, REFRESH_MS);
		document.addEventListener('visibilitychange', onVisibility);
	});

	// The board summarises the whole room: any change refreshes it (a save
	// of the room's widgets comes as a 'room' change), the poll above stays
	// as the fallback when the socket is down.
	useWarRoomLive(
		[
			'room',
			'members',
			'cases',
			'tasks',
			'scope',
			'vulnerabilities',
			'timelines',
			'decisions',
			'teams',
			'sitreps',
			'trackers'
		],
		() => load(true)
	);

	onDestroy(() => {
		if (timer) clearInterval(timer);
		// Don't drop a pending layout change when leaving the tab.
		if (layoutTimer) {
			clearTimeout(layoutTimer);
			void saveLayoutNow();
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibility);
		}
	});

	const flags = $derived(sortAssetFlags(board?.flags ?? []));

	// Flags over every visible asset: sum of the per-case maps.
	const totalByFlag = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const c of board?.cases ?? []) {
			if (!c.accessible || !c.by_flag) continue;
			for (const [k, v] of Object.entries(c.by_flag)) out[k] = (out[k] ?? 0) + (Number(v) || 0);
		}
		return out;
	});
	const kpis = $derived(board?.kpis ?? null);
	const flagTotals = $derived(boardFlagCounts(totalByFlag, flags, kpis?.assets ?? 0));
	// The backend omits the vulnerability KPIs and attention items without
	// `vulnerabilities_read`; the UI gate also keeps the links to the scope
	// Vulnerabilities tab away from those users.
	const userCtx = getContext<UserCtx>(USER_CTX);
	const canReadVulns = $derived(canReadVulnerabilities(userCtx));
	// The server also wants full access to the room; a refusal is a toast.
	const canWrite = $derived(userCtx?.can('war_rooms_write') === true);
	const vulnKpis = $derived(boardVulnerabilityKpis(kpis, canReadVulns));
	const decisions = $derived(board?.decisions ?? []);
	// Re-evaluated on each refresh so "in 3 h" / "overdue by" stay current.
	const now = $derived(board?.generated_at ? Date.now() : 0);
	const donePct = $derived(
		kpis && kpis.assets > 0 ? Math.round((kpis.done / kpis.assets) * 100) : 0
	);

	// Types the user may have at all (listed in Customize and Edit board)…
	const allowedType = (type: BoardWidgetType) =>
		!BOARD_WIDGET_TYPES[type].vulnerabilities || canReadVulns;
	const typeOf = (slot: BoardSlot) => widgetById.get(slot.id)?.type;
	const allowed = (slot: BoardSlot) => {
		const type = typeOf(slot);
		return !!type && allowedType(type);
	};
	// …and the widgets with data to render now.
	const renderable = (slot: BoardSlot) => {
		const type = typeOf(slot);
		return !!type && (!BOARD_WIDGET_TYPES[type].vulnerabilities || vulnKpis !== null);
	};
	const banner = $derived(visibleWidgets(layout, slots, 'banner', allowed));
	const tiles = $derived(visibleWidgets(layout, slots, 'tile', renderable));
	const mainPanels = $derived(visibleWidgets(layout, slots, 'panel', allowed, 'main'));
	const sidePanels = $derived(visibleWidgets(layout, slots, 'panel', allowed, 'side'));
	const nothingShown = $derived(
		banner.length + tiles.length + mainPanels.length + sidePanels.length === 0
	);

	const describe = (id: string) => {
		const w = widgetById.get(id);
		if (!w) return { label: id, description: '' };
		return {
			label: boardWidgetTitle(w, widgetTracker(w)?.name),
			description: BOARD_WIDGET_TYPES[w.type].description
		};
	};

	// Cases with flagged tracker steps first, locked ones last.
	const sortedCases = $derived(sortBoardCases(board?.cases ?? []));

	const trackerSteps = $derived(board?.tracker_steps ?? []);
	const stepById = $derived(new Map(trackerSteps.map((s) => [s.id, s])));

	/** The tracker a tracker widget reads, as the board sent it. */
	const widgetTracker = (w: WarRoomBoardWidget): BoardTrackerRef | null =>
		w.data && 'tracker' in w.data ? w.data.tracker : null;

	const trackerHref = (trackerId: number) => section('scope', `tab=tracker-${trackerId}`);

	/** What a count tile counts: its steps, else every row. */
	const countSub = (w: WarRoomBoardWidget, total: number): string => {
		const names = (w.config.step_ids ?? [])
			.map((id) => stepById.get(id)?.name)
			.filter((n): n is string => !!n);
		const what = names.length ? names.join(' / ') : 'rows';
		return w.config.of_total === false ? what : `${what} · out of ${total}`;
	};

	/** Why a tracker or tasks widget has nothing to draw, or null. */
	const unavailable = (w: WarRoomBoardWidget): string | null => {
		const missing = boardMissing(w.data);
		if (missing === 'tracker') return 'The tracker of this widget was deleted.';
		if (missing === 'column') return 'The column this widget groups by was deleted.';
		if (!w.data) {
			return w.type === 'tasks'
				? "You can't see this war room's tasks."
				: "You can't see this war room's trackers.";
		}
		return null;
	};

	const tasksSub = (k: WarRoomBoardKpis): string => {
		const parts = [`${k.tasks_in_progress ?? 0} in progress`];
		if (k.tasks_overdue) parts.push(`${k.tasks_overdue} overdue`);
		return parts.join(' · ');
	};

	const attentionDot: Record<string, string> = {
		high: 'bg-red-500',
		medium: 'bg-amber-500',
		low: 'bg-slate-400'
	};

	const attentionIcon = (type: string) => {
		switch (type) {
			case 'compromised_unflagged':
				return Unplug;
			case 'exception_without_decision':
				return ShieldOff;
			case 'decision_overdue':
			case 'decision_due_soon':
				return Timer;
			case 'decision_pending_vote':
			case 'decision_pending_approval':
			case 'decision_pending_implementation':
				return Gavel;
			case 'vulnerability_exploited_open':
				return Flame;
			case 'vulnerability_overdue':
				return CalendarClock;
			default:
				return CircleAlert;
		}
	};

	const attentionLink = (a: WarRoomBoardAttention): { href: string; label: string } | null => {
		const vulnerabilityHref = boardVulnerabilityHrefFor(a, canReadVulns);
		if (vulnerabilityHref) return { href: vulnerabilityHref, label: 'Review' };
		if (a.decision_id != null) {
			return { href: `/war-rooms/${warRoomId}/decisions?d=${a.decision_id}`, label: 'Review' };
		}
		if (a.case_id != null && a.asset_id != null) {
			return { href: `/case/${a.case_id}/assets/${a.asset_id}`, label: 'Open' };
		}
		if (a.task_id != null) return { href: `/war-rooms/${warRoomId}/tasks`, label: 'Open' };
		if (a.case_id != null) return { href: `/case/${a.case_id}`, label: 'Open' };
		return null;
	};

	const section = (path: string, query = '') =>
		`/war-rooms/${warRoomId}/${path}${query ? `?${query}` : ''}`;

	const flagHref = (key: string): string | null =>
		key === 'other' ? null : section('scope', `flag=${key}`);

	const flagDot = (f: BoardFlagCount): string =>
		f.key === 'none' ? 'bg-muted-foreground/25' : assetFlagDotClass(f.color);

	const decisionStatusCls = (status: string): string =>
		status === 'approved'
			? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
			: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';

	const caseStateCls = (c: WarRoomBoardCase): string =>
		(c.state_name ?? '').toLowerCase() === 'closed'
			? 'border-muted bg-muted/60 text-muted-foreground'
			: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
</script>

{#snippet doneBar(done: number, total: number, height: string)}
	{@const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0}
	<div
		class={['flex w-full overflow-hidden rounded-full bg-muted', height]}
		role="img"
		aria-label={total > 0 ? `${done} of ${total} assets done` : 'No assets'}
	>
		<span class="h-full bg-emerald-500" style:width={`${pct}%`}></span>
	</div>
{/snippet}

<div class="h-full w-full overflow-y-auto bg-background">
	<div class="mx-auto flex max-w-[1680px] flex-col gap-4 p-4 sm:p-5">
		<div class="flex flex-wrap items-center gap-3">
			<div>
				<h1 class="text-lg font-semibold leading-tight">Board</h1>
				<p class="text-xs text-muted-foreground">
					{#if kpis}
						{kpis.cases}
						{kpis.cases === 1 ? 'case' : 'cases'}
						{#if kpis.cases_accessible !== kpis.cases}
							({kpis.cases_accessible} visible to you)
						{/if}
						·
					{/if}
					{#if board?.generated_at}
						updated {formatTime(board.generated_at)} · refreshes every minute
					{:else}
						refreshes every minute
					{/if}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<AiSuggestionsChip entityType="war_room" entityId={warRoomId} />
				{#if canWrite}
					<Button
						size="sm"
						variant={editing ? 'secondary' : 'outline'}
						onclick={() => void openEditor()}
						disabled={!board || editing || opening}
						title="Set the widgets of this war room's board, for everyone"
						data-testid="board-edit-toggle"
					>
						<Pencil class="mr-1 h-3.5 w-3.5" /> Edit board
					</Button>
				{/if}
				<Button
					size="sm"
					variant={customizing ? 'secondary' : 'outline'}
					onclick={() => (customizing = !customizing)}
					disabled={!board || editing}
					aria-pressed={customizing}
					title="Hide or reorder widgets, only for you"
					data-testid="board-customize-toggle"
				>
					<SlidersHorizontal class="mr-1 h-3.5 w-3.5" /> Customize
				</Button>
				<Button
					size="sm"
					variant="outline"
					onclick={() => load()}
					disabled={refreshing}
					aria-label="Refresh board"
				>
					<RefreshCw class={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
				</Button>
			</div>
		</div>

		{#if editing && board}
			<BoardEditor
				{warRoomId}
				widgets={board.widgets ?? []}
				customized={board.board_customized === true}
				trackers={editorTrackers}
				steps={editorSteps}
				teams={editorTeams}
				available={allowedType}
				onSaved={() => load(true)}
				onClose={() => (editing = false)}
			/>
		{:else if customizing && board}
			<BoardCustomize
				{layout}
				{slots}
				{describe}
				available={allowed}
				onChange={setLayout}
				onReset={() => setLayout(defaultBoardLayout(slots))}
				onClose={() => (customizing = false)}
			/>
		{/if}

		{#each banner as w (w.id)}
			{#if typeOf(w) === 'ai_suggestions'}
				<AiSuggestionsPanel
					entityType="war_room"
					entityId={warRoomId}
					class="bg-card"
					hideWhenNoneOpen
				/>
			{/if}
		{/each}

		{#if loading}
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				{#each Array(5) as _}
					<Skeleton class="h-24 w-full" />
				{/each}
			</div>
			<Skeleton class="h-64 w-full" />
		{:else if !board || !kpis}
			<div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
				<p class="text-sm text-muted-foreground">The board could not be loaded.</p>
				<Button variant="outline" size="sm" onclick={() => load()}>Retry</Button>
			</div>
		{:else}
			{#if nothingShown}
				<div
					class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center"
				>
					<p class="text-sm text-muted-foreground">
						{widgets.length ? 'Every widget is hidden.' : 'The board has no widget.'}
					</p>
					{#if widgets.length && !customizing && !editing}
						<Button variant="outline" size="sm" onclick={() => (customizing = true)}>
							<SlidersHorizontal class="mr-1 h-3.5 w-3.5" /> Customize
						</Button>
					{/if}
				</div>
			{/if}

			{#if tiles.length}
				<div
					class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
					data-testid="board-kpis"
				>
					{#each tiles as slot (slot.id)}
						{@const w = widgetById.get(slot.id)}
						{#if w}{@render tile(w, kpis)}{/if}
					{/each}
				</div>
			{/if}

			{#if mainPanels.length || sidePanels.length}
				<div class={['grid gap-4', mainPanels.length && sidePanels.length && 'xl:grid-cols-3']}>
					{#if mainPanels.length}
						<div class={['flex min-w-0 flex-col gap-4', sidePanels.length && 'xl:col-span-2']}>
							{#each mainPanels as slot (slot.id)}
								{@const w = widgetById.get(slot.id)}
								{#if w}{@render panel(w, board, true)}{/if}
							{/each}
						</div>
					{/if}
					{#if sidePanels.length}
						<div class="flex min-w-0 flex-col gap-4">
							{#each sidePanels as slot (slot.id)}
								{@const w = widgetById.get(slot.id)}
								{#if w}{@render panel(w, board, mainPanels.length === 0)}{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
		<div class="h-12"></div>
	</div>
</div>

{#snippet tile(w: WarRoomBoardWidget, k: WarRoomBoardKpis)}
	{#if w.type === 'kpi_compromised'}
		{@render kpi(
			'Compromised',
			k.compromised,
			`${k.unflagged} ${k.unflagged === 1 ? 'asset' : 'assets'} without a flag`,
			Unplug,
			k.compromised > 0 ? 'text-red-600 dark:text-red-400' : '',
			section('scope', 'compromised=1')
		)}
	{:else if w.type === 'kpi_decisions'}
		{@render kpi(
			'Open decisions',
			k.decisions_open,
			k.decisions_overdue > 0
				? `${k.decisions_overdue} overdue · ${k.decisions_due_24h} due in 24 h`
				: `${k.decisions_due_24h} due in 24 h`,
			Gavel,
			k.decisions_overdue > 0
				? 'text-red-600 dark:text-red-400'
				: k.decisions_open > 0
					? 'text-amber-600 dark:text-amber-400'
					: '',
			section('decisions')
		)}
	{:else if w.type === 'kpi_exceptions'}
		{@render kpi(
			'Exceptions',
			k.exceptions,
			k.exceptions > 0 ? 'Assets with an exception flag' : 'None',
			ShieldOff,
			k.exceptions > 0 ? 'text-amber-600 dark:text-amber-400' : '',
			section('scope', 'view=board')
		)}
	{:else if w.type === 'kpi_tasks'}
		{@render kpi(
			'Open tasks',
			k.tasks_open,
			k.tasks_in_progress === undefined ? 'War-room tasks' : tasksSub(k),
			ListChecks,
			k.tasks_overdue ? 'text-amber-600 dark:text-amber-400' : '',
			section('tasks')
		)}
	{:else if w.type === 'flags'}
		<div class="shadow-elevation-1 rounded-xl border border-border/60 bg-card p-4 sm:col-span-2">
			<div class="flex items-center justify-between text-xs font-medium text-muted-foreground">
				Flags · {k.assets}
				{k.assets === 1 ? 'asset' : 'assets'}
				<a
					href={section('scope', 'view=board')}
					class="inline-flex items-center gap-1 text-primary hover:underline"
				>
					Scope <ArrowRight class="h-3 w-3" />
				</a>
			</div>
			<div class="mt-1.5 flex items-baseline gap-2">
				<span class="text-2xl font-semibold tabular-nums">{donePct}%</span>
				<span class="text-2xs text-muted-foreground">done</span>
			</div>
			<div class="mt-2">{@render doneBar(k.done, k.assets, 'h-2')}</div>
			{#if flagTotals.length}
				<ul
					class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground"
					data-testid="board-flag-totals"
				>
					{#each flagTotals as s (s.key)}
						{@const href = flagHref(s.key)}
						<li>
							<svelte:element
								this={href ? 'a' : 'span'}
								{href}
								class={[
									'inline-flex items-center gap-1 rounded',
									href && 'hover:text-foreground hover:underline'
								]}
								title={`${s.label}: ${s.count} (${Math.round(s.pct)}% of the assets)`}
							>
								<span class={['h-2 w-2 rounded-full', flagDot(s)]}></span>
								{s.label}
								<span class="tabular-nums text-foreground">{s.count}</span>
							</svelte:element>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if vulnKpis && w.type === 'vuln_open'}
		{@render kpi(
			'Open vulnerabilities',
			vulnKpis.open,
			'Open findings on case assets',
			ShieldX,
			vulnKpis.open > 0 ? 'text-amber-600 dark:text-amber-400' : '',
			section('scope', 'tab=vulnerabilities')
		)}
	{:else if vulnKpis && w.type === 'vuln_exploited'}
		{@render kpi(
			'Exploited & open',
			vulnKpis.exploitedOpen,
			vulnKpis.exploitedOpen > 0 ? 'Exploited and not fixed yet' : 'No exploited finding left open',
			Flame,
			vulnKpis.exploitedOpen > 0 ? 'text-red-600 dark:text-red-400' : '',
			section('scope', 'vulnerable=exploited'),
			vulnKpis.exploitedOpen > 0
		)}
	{:else if vulnKpis && w.type === 'vuln_overdue'}
		{@render kpi(
			'Overdue',
			vulnKpis.overdue,
			'Open findings past their due date',
			CalendarClock,
			vulnKpis.overdue > 0 ? 'text-amber-600 dark:text-amber-400' : '',
			section('scope', 'tab=vulnerabilities')
		)}
	{:else if vulnKpis && w.type === 'vuln_kev'}
		{@render kpi(
			'KEV open',
			vulnKpis.kevOpen,
			'Open findings listed in CISA KEV',
			BadgeAlert,
			vulnKpis.kevOpen > 0 ? 'text-red-600 dark:text-red-400' : '',
			section('scope', 'tab=vulnerabilities')
		)}
	{:else if vulnKpis && w.type === 'vuln_assets'}
		{@render kpi(
			'Vulnerable assets',
			vulnKpis.vulnerableAssets,
			'Assets with an open finding',
			Server,
			'',
			section('scope', 'vulnerable=open')
		)}
	{:else if w.type === 'tracker_count'}
		{@const data = boardCountData(w.data)}
		{@const ref = widgetTracker(w)}
		{#if data && ref}
			{@render kpi(
				boardWidgetTitle(w, ref.name),
				`${boardCountText(data, w.config.of_total !== false)}${data.truncated ? '+' : ''}`,
				countSub(w, data.total),
				getTrackerIcon(ref.icon),
				'',
				trackerHref(ref.id)
			)}
		{:else}
			<div
				class="shadow-elevation-1 rounded-xl border border-dashed border-border/60 bg-card p-4"
				data-testid="board-kpi"
			>
				<div class="text-xs font-medium text-muted-foreground">{boardWidgetTitle(w)}</div>
				<p class="mt-2 text-2xs text-muted-foreground">{unavailable(w)}</p>
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet panel(w: WarRoomBoardWidget, b: WarRoomBoard, wide: boolean)}
	{#if w.type === 'cases'}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby={`board-${w.id}-title`}
			data-testid="board-cases"
		>
			<header class="flex items-center gap-2 border-b px-4 py-2.5">
				<LayoutDashboard class="h-4 w-4 text-muted-foreground" />
				<h3 id={`board-${w.id}-title`} class="text-sm font-semibold">{boardWidgetTitle(w)}</h3>
				<span class="ml-auto text-2xs text-muted-foreground">Assets by flag</span>
			</header>
			{#if sortedCases.length === 0}
				<p class="py-8 text-center text-xs text-muted-foreground">
					No case attached to this war room yet.
				</p>
			{:else}
				<div class={['grid gap-2 p-3', wide && 'md:grid-cols-2 2xl:grid-cols-3']}>
					{#each sortedCases as c (c.case_id)}
						{#if !c.accessible}
							<article
								class="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground"
								data-testid="board-case-locked"
							>
								<Lock class="h-4 w-4 shrink-0" />
								<span class="font-mono text-xs">#{c.case_id}</span>
								<span class="truncate">Restricted case — you don't have access</span>
							</article>
						{:else}
							{@const caseFlags = boardFlagCounts(c.by_flag, flags, c.assets_total ?? 0)}
							{@const highlights = (c.highlights ?? []).filter((h) => stepById.has(h.step_id))}
							<article
								class={[
									'hover:shadow-elevation-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow',
									highlights.length && 'border-amber-500/60 ring-1 ring-amber-500/30'
								]}
								data-testid="board-case"
							>
								<div class="flex items-start gap-2">
									<div class="min-w-0 flex-1">
										<a
											href={`/case/${c.case_id}`}
											class="block truncate text-sm font-semibold leading-tight hover:underline"
										>
											<span class="font-mono text-xs font-normal text-muted-foreground"
												>#{c.case_id}</span
											>
											{c.case_name ?? ''}
										</a>
										<p
											class="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted-foreground"
										>
											{#if c.customer_name}
												<Building2 class="h-3 w-3" />{c.customer_name}
											{/if}
											{#if c.owner_name}
												<span>·</span><UserRound class="h-3 w-3" />{c.owner_name}
											{/if}
										</p>
									</div>
									<div class="flex shrink-0 flex-col items-end gap-1">
										{#if c.state_name}
											<span
												class={[
													'rounded-md border px-1.5 py-0.5 text-2xs font-medium',
													caseStateCls(c)
												]}>{c.state_name}</span
											>
										{/if}
										{#if c.severity_name}
											<span class="text-2xs text-muted-foreground">{c.severity_name}</span>
										{/if}
									</div>
								</div>
								<div class="mt-3">
									{@render doneBar(c.by_kind?.done ?? 0, c.assets_total ?? 0, 'h-1.5')}
									<div class="mt-1 flex justify-between text-2xs text-muted-foreground">
										<span>
											<span class="font-medium tabular-nums text-foreground"
												>{c.by_kind?.done ?? 0}/{c.assets_total ?? 0}</span
											>
											done
										</span>
										<span>{c.assets_compromised ?? 0} compromised</span>
									</div>
								</div>
								<div class="mt-2.5 flex items-center gap-3 text-2xs text-muted-foreground">
									<a
										href={`/case/${c.case_id}/assets`}
										class="inline-flex items-center gap-1 hover:text-foreground"
										title="Assets"
									>
										<Server class="h-3 w-3" />{c.assets_total ?? 0}
									</a>
									<span class="inline-flex items-center gap-1" title="Open tasks">
										<ListChecks class="h-3 w-3" />{c.tasks_open ?? 0} open
									</span>
									{#if (c.tasks_in_progress ?? 0) > 0}
										<span
											class="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300"
											title="Tasks in progress"
										>
											<Activity class="h-3 w-3" />{c.tasks_in_progress} in progress
										</span>
									{/if}
									{#if (c.by_kind?.exception ?? 0) > 0}
										<span
											class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
											title="Assets with an exception flag"
										>
											<ShieldOff class="h-3 w-3" />{c.by_kind?.exception}
										</span>
									{/if}
								</div>
								{#if highlights.length}
									<ul class="mt-2 flex flex-wrap gap-1" data-testid="board-case-highlights">
										{#each highlights as h (h.step_id)}
											{@const step = stepById.get(h.step_id)}
											{#if step}
												<li>
													<TrackerStepChip
														step={{
															...step,
															name: h.count > 1 ? `${step.name} ×${h.count}` : step.name
														}}
														title={`${h.count} tracker ${h.count === 1 ? 'row' : 'rows'}: ${step.name}`}
													/>
												</li>
											{/if}
										{/each}
									</ul>
								{/if}
								{#if caseFlags.length}
									<ul
										class="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 text-2xs text-muted-foreground"
									>
										{#each caseFlags as s (s.key)}
											<li class="inline-flex items-center gap-1">
												<span class={['h-1.5 w-1.5 rounded-full', flagDot(s)]}></span>
												{s.label}
												{s.count}
											</li>
										{/each}
									</ul>
								{/if}
							</article>
						{/if}
					{/each}
				</div>
			{/if}
		</section>
	{:else if w.type === 'tracker_progress' || w.type === 'tracker_list' || w.type === 'tracker_breakdown'}
		{@const ref = widgetTracker(w)}
		{@const problem = unavailable(w)}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby={`board-${w.id}-title`}
			data-testid={`board-${w.type.replace('_', '-')}`}
		>
			{@render panelHead(
				w,
				ref ? getTrackerIcon(ref.icon) : ListChecks,
				boardWidgetTitle(w, ref?.name),
				ref ? { href: trackerHref(ref.id), label: 'Tracker' } : null,
				null
			)}
			{#if problem}
				<p class="px-4 py-6 text-center text-xs text-muted-foreground">{problem}</p>
			{:else if w.type === 'tracker_progress'}
				{@render progress(w)}
			{:else if w.type === 'tracker_list'}
				{@render trackerList(w)}
			{:else}
				{@render breakdown(w)}
			{/if}
		</section>
	{:else if w.type === 'tasks'}
		{@const data = boardTasksData(w.data)}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby={`board-${w.id}-title`}
			data-testid="board-tasks"
		>
			{@render panelHead(
				w,
				Activity,
				w.title || (w.config.in_progress_only ? 'Actions in progress' : 'Open tasks'),
				{ href: section('tasks'), label: 'All tasks' },
				data ? data.in_progress : null
			)}
			{#if !data}
				<p class="px-4 py-6 text-center text-xs text-muted-foreground">{unavailable(w)}</p>
			{:else if data.tasks.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">
					{w.config.in_progress_only ? 'No task in progress.' : 'No open task.'}
				</p>
			{:else}
				<ul class="max-h-96 divide-y overflow-y-auto">
					{#each data.tasks as t (t.task_id)}
						{@render taskRow(t)}
					{/each}
				</ul>
				{#if data.total > data.tasks.length}
					<a
						href={section('tasks')}
						class="inline-flex items-center gap-1 border-t px-4 py-2 text-2xs text-primary hover:underline"
					>
						{data.total - data.tasks.length} more <ArrowRight class="h-3 w-3" />
					</a>
				{/if}
			{/if}
		</section>
	{:else if w.type === 'note'}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby={`board-${w.id}-title`}
			data-testid="board-note"
		>
			{@render panelHead(w, NotebookPen, boardWidgetTitle(w), null, null)}
			{#if w.config.text?.trim()}
				<MarkDownPreview markdown={w.config.text} class="px-4 py-3 text-sm" />
			{:else}
				<p class="px-4 py-6 text-center text-xs text-muted-foreground">Empty note.</p>
			{/if}
		</section>
	{:else if w.type === 'decisions'}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby="board-decisions-title"
			data-testid="board-decisions"
		>
			<header class="flex items-center gap-2 border-b px-4 py-2.5">
				<Gavel class="h-4 w-4 text-muted-foreground" />
				<h3 id="board-decisions-title" class="text-sm font-semibold">Open decisions</h3>
				<span
					class="rounded-full bg-amber-500/15 px-1.5 text-2xs font-medium tabular-nums text-amber-700 dark:text-amber-300"
					>{decisions.length}</span
				>
				<a
					href={section('decisions')}
					class="ml-auto inline-flex items-center gap-1 text-2xs text-primary hover:underline"
				>
					All decisions <ArrowRight class="h-3 w-3" />
				</a>
			</header>
			{#if decisions.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">No open decision.</p>
			{:else}
				<ul class="max-h-80 divide-y overflow-y-auto">
					{#each decisions as d (d.decision_id)}
						<li>
							<a
								href={section('decisions', `d=${d.decision_id}`)}
								class="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50"
								data-testid="board-decision"
							>
								<span class="mt-0.5 shrink-0 font-mono text-2xs text-muted-foreground">{d.ref}</span
								>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium" title={d.title}>{d.title}</p>
									<p class="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
										{#if d.target_at}
											<span
												class={[
													'inline-flex items-center gap-1',
													d.overdue && 'font-medium text-red-600 dark:text-red-400',
													d.due_soon && 'text-amber-700 dark:text-amber-300'
												]}
												title={formatDateTime(d.target_at)}
											>
												<Timer class="h-3 w-3" />{formatDecisionTarget(d.target_at, now)}
											</span>
										{:else}
											<span>No target date</span>
										{/if}
										{#if d.status === 'proposed' && d.pending_approvers > 0}
											<span>· {d.pending_approvers} vote(s) pending</span>
										{/if}
									</p>
								</div>
								<span
									class={[
										'shrink-0 rounded-md border px-1.5 py-0.5 text-2xs font-medium capitalize',
										decisionStatusCls(d.status)
									]}>{d.status}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else if w.type === 'attention'}
		<section
			class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
			aria-labelledby="board-attention-title"
			data-testid="board-attention"
		>
			<header class="flex items-center gap-2 border-b px-4 py-2.5">
				<Siren class="h-4 w-4 text-muted-foreground" />
				<h3 id="board-attention-title" class="text-sm font-semibold">Needs attention</h3>
				<span
					class="ml-auto rounded-full bg-red-500/15 px-1.5 text-2xs font-medium tabular-nums text-red-700 dark:text-red-300"
					>{b.attention.length}</span
				>
			</header>
			{#if b.attention.length === 0}
				<p class="py-8 text-center text-xs text-muted-foreground">Nothing needs attention.</p>
			{:else}
				<ul class="divide-y">
					{#each b.attention as a, i (`${a.type}:${a.case_id ?? ''}:${a.asset_id ?? ''}:${a.decision_id ?? ''}:${a.task_id ?? ''}:${i}`)}
						{@const Icon = attentionIcon(a.type)}
						{@const link = attentionLink(a)}
						<li class="flex items-start gap-3 px-4 py-2.5" data-testid="board-attention-item">
							<span
								class={[
									'mt-1.5 h-2 w-2 shrink-0 rounded-full',
									attentionDot[a.severity] ?? 'bg-slate-400'
								]}
								aria-label={`${a.severity} priority`}
							></span>
							<div class="min-w-0 flex-1">
								<p class="flex items-center gap-1.5 text-sm font-medium">
									<Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span class="min-w-0 break-words">{a.label}</span>
								</p>
								{#if a.case_id != null}
									<p class="truncate text-xs text-muted-foreground">Case #{a.case_id}</p>
								{/if}
							</div>
							{#if link}
								<a
									href={link.href}
									class="shrink-0 rounded-md border px-2 py-1 text-2xs font-medium hover:bg-muted"
									>{link.label}</a
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if b.generated_at}
				<p class="border-t px-4 py-2 text-2xs text-muted-foreground">
					Computed {formatDateTime(b.generated_at)}
				</p>
			{/if}
		</section>
	{/if}
{/snippet}

{#snippet panelHead(
	w: WarRoomBoardWidget,
	Icon: typeof Unplug,
	title: string,
	link: { href: string; label: string } | null,
	inProgress: number | null
)}
	<header class="flex items-center gap-2 border-b px-4 py-2.5">
		<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
		<h3 id={`board-${w.id}-title`} class="min-w-0 truncate text-sm font-semibold" {title}>
			{title}
		</h3>
		{#if inProgress !== null}
			<span
				class="rounded-full bg-sky-500/15 px-1.5 text-2xs font-medium tabular-nums text-sky-700 dark:text-sky-300"
				title="In progress">{inProgress}</span
			>
		{/if}
		{#if link}
			<a
				href={link.href}
				class="ml-auto inline-flex shrink-0 items-center gap-1 text-2xs text-primary hover:underline"
			>
				{link.label}
				<ArrowRight class="h-3 w-3" />
			</a>
		{/if}
	</header>
{/snippet}

{#snippet progress(w: WarRoomBoardWidget)}
	{@const data = boardProgressData(w.data)}
	{#if data}
		{@const bars = boardStepBars(data, trackerSteps)}
		{@const display = w.config.display ?? 'bars'}
		{@const total = `${data.rows_total}${data.truncated ? '+' : ''}`}
		<div class="p-3" data-testid="board-tracker-steps">
			{#if data.rows_total === 0}
				<p class="py-3 text-center text-xs text-muted-foreground">No row yet.</p>
			{:else if display === 'donut'}
				{@const values = [...bars.map((bar) => bar.count), data.rows_without_step]}
				{@const arcs = boardDonutArcs(values, DONUT_C)}
				<div class="flex flex-wrap items-center gap-4">
					<div class="relative h-32 w-32 shrink-0">
						<svg
							viewBox="0 0 100 100"
							class="h-full w-full -rotate-90"
							role="img"
							aria-label={bars.map((bar) => `${bar.step.name}: ${bar.count}`).join(', ')}
						>
							<circle
								cx="50"
								cy="50"
								r={DONUT_R}
								fill="none"
								stroke-width="12"
								class="stroke-muted"
							/>
							{#each arcs as arc, i (i)}
								{#if arc.length > 0}
									<circle
										cx="50"
										cy="50"
										r={DONUT_R}
										fill="none"
										stroke-width="12"
										stroke={i < bars.length ? boardStepHex(bars[i].step.color) : '#94a3b8'}
										stroke-dasharray={`${arc.length} ${DONUT_C - arc.length}`}
										stroke-dashoffset={arc.offset}
									/>
								{/if}
							{/each}
						</svg>
						<div class="absolute inset-0 flex flex-col items-center justify-center">
							<span class="text-xl font-semibold tabular-nums">{total}</span>
							<span class="text-2xs text-muted-foreground">rows</span>
						</div>
					</div>
					<ul class="flex min-w-0 flex-1 flex-col gap-1.5">
						{#each bars as bar (bar.step.id)}
							<li class="flex items-center gap-2 text-2xs">
								<TrackerStepChip step={bar.step} />
								<span class="ml-auto tabular-nums text-muted-foreground">
									<span class="font-medium text-foreground">{bar.count}</span>/{total}
								</span>
							</li>
						{/each}
						{#if data.rows_without_step > 0}
							<li class="flex items-center gap-2 text-2xs text-muted-foreground">
								<span class="h-2 w-2 rounded-full bg-slate-400"></span> No step yet
								<span class="ml-auto tabular-nums">{data.rows_without_step}/{total}</span>
							</li>
						{/if}
					</ul>
				</div>
			{:else}
				<!-- Bars (left aligned) or a funnel (centred, narrowing). -->
				<ul class="flex flex-col gap-1.5">
					{#each bars as bar (bar.step.id)}
						<li
							class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-2xs"
							title={`${bar.step.name}: ${bar.count} of ${data.rows_total}`}
						>
							<TrackerStepChip step={bar.step} />
							{#if display === 'funnel'}
								<div class="flex justify-center">
									<span
										class={['h-5 rounded-sm', assetFlagDotClass(bar.step.color)]}
										style:width={`${Math.max(bar.pct, 1.5)}%`}
									></span>
								</div>
							{:else}
								<div class="flex h-1.5 overflow-hidden rounded-full bg-muted">
									<span
										class={['h-full', assetFlagDotClass(bar.step.color)]}
										style:width={`${bar.pct}%`}
									></span>
								</div>
							{/if}
							<span class="tabular-nums text-muted-foreground">
								<span class="font-medium text-foreground">{bar.count}</span>/{total}
							</span>
						</li>
					{/each}
					{#if data.rows_without_step > 0 && display !== 'funnel'}
						<li
							class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-2xs text-muted-foreground"
						>
							<span class="truncate">No step yet</span>
							<div class="flex h-1.5 overflow-hidden rounded-full bg-muted">
								<span
									class="h-full bg-muted-foreground/30"
									style:width={`${(data.rows_without_step / data.rows_total) * 100}%`}
								></span>
							</div>
							<span class="tabular-nums">{data.rows_without_step}/{total}</span>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet trackerList(w: WarRoomBoardWidget)}
	{@const data = boardListData(w.data)}
	{@const ref = widgetTracker(w)}
	{#if data && ref}
		{#if data.rows.length === 0}
			<p class="py-6 text-center text-xs text-muted-foreground">No row.</p>
		{:else}
			<ul class="max-h-96 divide-y overflow-y-auto" data-testid="board-tracker-rows">
				{#each data.rows as row (row.key)}
					<li class="flex items-center gap-2 px-4 py-1.5 text-xs">
						{#if row.restricted}
							<Lock class="h-3 w-3 shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate italic text-muted-foreground"
								>Restricted item</span
							>
						{:else}
							{@const name = row.label ?? `#${row.row_id ?? row.item_id}`}
							<a
								href={boardTrackerRowHref(warRoomId, ref.id, row)}
								class="min-w-0 flex-1 truncate hover:underline"
								title={row.custom_label ? `${row.custom_label} (${name})` : name}
								>{row.custom_label ?? name}{#if row.custom_label}<span
										class="ml-1 text-muted-foreground">{name}</span
									>{/if}</a
							>
						{/if}
						<span class="flex shrink-0 flex-wrap justify-end gap-1">
							{#each row.step_ids as sid (sid)}
								{@const rs = stepById.get(sid)}
								{#if rs}
									<TrackerStepChip step={rs} />
								{/if}
							{/each}
						</span>
						{#if row.case_ids.length > 1}
							<span class="shrink-0 text-2xs text-muted-foreground"
								>{row.case_ids.length} cases</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.total > data.rows.length}
			<a
				href={trackerHref(ref.id)}
				class="inline-flex items-center gap-1 border-t px-4 py-2 text-2xs text-primary hover:underline"
			>
				{data.total - data.rows.length} more <ArrowRight class="h-3 w-3" />
			</a>
		{/if}
	{/if}
{/snippet}

{#snippet breakdown(w: WarRoomBoardWidget)}
	{@const data = boardBreakdownData(w.data)}
	{#if data}
		{@const cols = data.step_ids
			.map((id, i) => ({ step: stepById.get(id), i }))
			.filter((c): c is { step: TrackerStep; i: number } => !!c.step)}
		{#if data.groups.length === 0}
			<p class="py-6 text-center text-xs text-muted-foreground">No row yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-xs" data-testid="board-tracker-breakdown">
					<thead>
						<tr class="border-b text-left text-2xs text-muted-foreground">
							<th class="px-4 py-2 font-medium">{data.column_label}</th>
							<th class="px-2 py-2 text-right font-medium">Rows</th>
							{#each cols as c (c.step.id)}
								<th class="px-2 py-2 text-right font-medium">
									<TrackerStepChip step={c.step} />
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.groups as g (String(g.value))}
							<tr>
								<td class={['px-4 py-1.5', g.value === null && 'italic text-muted-foreground']}>
									{boardValueLabel(g.value)}
								</td>
								<td class="px-2 py-1.5 text-right font-medium tabular-nums">{g.rows}</td>
								{#each cols as c (c.step.id)}
									{@const n = g.counts[c.i] ?? 0}
									<td
										class={[
											'px-2 py-1.5 text-right tabular-nums',
											n === 0 && 'text-muted-foreground/50'
										]}
										title={`${boardValueLabel(g.value)} · ${c.step.name}: ${n} of ${g.rows}`}
									>
										{n}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.truncated}
				<p class="border-t px-4 py-1.5 text-2xs text-muted-foreground">
					Too many rows: the figures cover the first {data.rows_total}.
				</p>
			{/if}
		{/if}
	{/if}
{/snippet}

{#snippet taskRow(t: WarRoomBoardTask)}
	<li>
		<a
			href={section('tasks')}
			class="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50"
			data-testid="board-task"
		>
			<span
				class={[
					'mt-1.5 h-2 w-2 shrink-0 rounded-full',
					t.in_progress ? 'bg-sky-500' : 'bg-muted-foreground/30'
				]}
				aria-hidden="true"
			></span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium" title={t.title}>{t.title}</p>
				<p class="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
					{#if t.assignee_name}
						<span class="inline-flex items-center gap-1"
							><UserRound class="h-3 w-3" />{t.assignee_name}</span
						>
					{/if}
					{#if t.teams.length}
						<span class="inline-flex items-center gap-1"
							><Users class="h-3 w-3" />{t.teams.join(', ')}</span
						>
					{/if}
					{#if t.source_case_id != null}
						<span>Case #{t.source_case_id}</span>
					{/if}
					{#if t.due_at}
						<span
							class={[
								'inline-flex items-center gap-1',
								t.overdue && 'font-medium text-red-600 dark:text-red-400'
							]}
							title={formatDateTime(t.due_at)}
						>
							<Timer class="h-3 w-3" />{t.overdue ? 'Overdue · ' : 'Due '}{formatDateTime(t.due_at)}
						</span>
					{/if}
				</p>
			</div>
			{#if t.status}
				<span
					class={[
						'shrink-0 rounded-md border px-1.5 py-0.5 text-2xs font-medium',
						t.in_progress
							? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
							: 'border-border text-muted-foreground'
					]}>{t.status}</span
				>
			{/if}
		</a>
	</li>
{/snippet}

{#snippet kpi(
	label: string,
	value: number | string,
	sub: string,
	Icon: typeof Unplug,
	tone: string,
	href: string,
	alert: boolean = false
)}
	<a
		{href}
		class={[
			'shadow-elevation-1 hover:shadow-elevation-2 group block rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			alert
				? 'border-red-500/50 bg-red-500/10 hover:border-red-500/80 dark:bg-red-500/15'
				: 'border-border/60 bg-card hover:border-ring/40'
		]}
		aria-label={`${label}: ${value}. ${sub}. Open`}
		data-testid="board-kpi"
	>
		<div class="flex items-center justify-between text-xs font-medium text-muted-foreground">
			{label}
			<Icon class={`h-4 w-4 ${tone}`} />
		</div>
		<div class={['mt-1.5 text-2xl font-semibold tabular-nums', tone]}>{value}</div>
		<div class="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
			<span class="min-w-0 flex-1 truncate" title={sub}>{sub}</span>
			<ArrowRight
				class="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
				aria-hidden="true"
			/>
		</div>
	</a>
{/snippet}
