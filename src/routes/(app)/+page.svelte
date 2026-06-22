<!--
  Dashboard landing. Goal: a calm, useful overview the user lands on after
  login. The earlier version was dominated by 4 oversized KPI tiles (two of
  which always showed 0 because nothing populated them) and a tab-switched
  table. This version keeps things compact and scannable:

  - Greeting + 3 inline KPI chips at the top
  - Two columns: recent open cases (wider) and recent alerts (narrower)
  - A row of "what next" actions for fast nav into the rest of the app

  Everything is one-click navigable and the most recent items are visible
  immediately, no tab switching required.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		ActivityIcon,
		AlertTriangleIcon,
		ArrowRightIcon,
		BellRingIcon,
		BoxesIcon,
		CheckCheckIcon,
		LayersIcon,
		PlusIcon,
		RefreshCwIcon,
		ShieldAlertIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { current_user } from '$lib/stores/auth.store';
	import { ApiService } from '$lib/services/api.service';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus, Severity as SeverityName } from '$lib/components/ui/badge/types';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Case } from '$lib/types/resources/case';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	const alerts = getContext<AlertsContext | undefined>(ALERTS_CTX);
	const cases = getContext<CasesContext | undefined>(CASES_CTX);

	type DashState<T> = {
		total: number;
		items: T[];
		loading: boolean;
		error: string | null;
	};

	type UserTask = {
		task_id: number;
		task_title: string;
		task_last_update?: string;
		task_case?: string;
		case_id: number;
		status_name?: string;
	};

	// Raw shape of /dashboard/tasks/list — the backend returns flat row
	// dicts (not full CaseTaskSchema objects), so we read top-level
	// fields rather than navigating nested `case`/`status` relationships.
	type RawTask = {
		task_id: number;
		task_title: string;
		task_last_update?: string | null;
		task_case?: string;
		case_id?: number;
		status_name?: string;
	};

	type ActivityEntry = {
		id?: number;
		case_id?: number | null;
		case_name?: string | null;
		user_name?: string | null;
		activity_date?: string | null;
		activity_desc?: string | null;
	};

	const PREVIEW_LIMIT = 5;
	const TREND_DAYS = 30;
	// Sample size for the trend/severity-breakdown derived from alerts.
	// 1000 covers an active SOC's last month without being expensive.
	const TREND_SAMPLE_SIZE = 1000;

	type TrendBucket = { date: string; label: string; count: number };
	type SeverityCount = { name: string; count: number; color: string };

	// Lucide-friendly tones, kept consistent with the SeverityBadge colors.
	const SEVERITY_TONES: Record<string, string> = {
		Critical: 'bg-red-500',
		High: 'bg-orange-500',
		Medium: 'bg-amber-500',
		Low: 'bg-emerald-500',
		Unspecified: 'bg-slate-400'
	};

	// Alert statuses that mean "this alert is done and out of the queue".
	// Everything else (New / Assigned / In progress / Pending / Unspecified)
	// counts as open. We resolve the matching status IDs at runtime via the
	// status list because the IDs aren't stable across installs.
	const TERMINAL_ALERT_STATUS = new Set(['Closed', 'Merged', 'Escalated']);

	// Dashboard scope is "what's on this user's plate" — we filter cases by
	// owner and alerts by owner. Users without an id (e.g. before whoami
	// resolves) get a global view as a graceful fallback.
	const myUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);

	let openCasesState = $state<DashState<Case>>({ total: 0, items: [], loading: true, error: null });
	let alertsState = $state<DashState<Alert>>({ total: 0, items: [], loading: true, error: null });
	let tasksState = $state<DashState<UserTask>>({
		total: 0,
		items: [],
		loading: true,
		error: null
	});
	let activityState = $state<{
		items: ActivityEntry[];
		loading: boolean;
		loadingMore: boolean;
		allLoaded: boolean;
		error: string | null;
	}>({
		items: [],
		loading: true,
		loadingMore: false,
		allLoaded: false,
		error: null
	});

	// Aggregate visualizations derived from a single larger alert pull —
	// trend per day + severity breakdown — so we don't fire N separate
	// per-bucket queries.
	let trendState = $state<{
		buckets: TrendBucket[];
		bySeverity: SeverityCount[];
		total: number;
		loading: boolean;
		error: string | null;
	}>({
		buckets: [],
		bySeverity: [],
		total: 0,
		loading: true,
		error: null
	});

	// Cases-per-month trend across the last 6 months. Bucketed coarser
	// than alerts because case volume is naturally lower; a month grain
	// is the right level to surface seasonality / workload swings.
	const CASES_TREND_MONTHS = 6;
	let casesTrendState = $state<{
		buckets: TrendBucket[];
		total: number;
		loading: boolean;
		error: string | null;
	}>({ buckets: [], total: 0, loading: true, error: null });


	const firstName = $derived(
		($current_user?.user_name ?? '').split(/[\s,]/)[0] || 'investigator'
	);

	const greeting = (): string => {
		const h = new Date().getHours();
		if (h < 5) return 'Working late';
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	};

	// Pull total + page-one preview in one shot. The list response already
	// has pagination.total which is all we need for the KPI chips.
	const unwrapPaginated = <T,>(
		res: unknown
	): { total: number; items: T[] } => {
		const r = res as { data?: { total?: number; data?: T[] } } | null;
		const data = r?.data;
		return {
			total: typeof data?.total === 'number' ? data.total : 0,
			items: Array.isArray(data?.data) ? (data.data as T[]) : []
		};
	};

	// "Open" cases per the user's mental model means `state.state_name !==
	// 'Closed'`. The backend `is_open=true` flag actually filters on
	// `close_date IS NULL`, which can miss cases where the state was
	// flipped to Closed without setting close_date (we hit this earlier
	// when adding the state picker). To get a stable "open" view we pull
	// the state list, learn the Closed state id, and ask the backend to
	// exclude it. We over-fetch a bit to handle the edge case where a
	// Closed-but-no-close_date case sneaks in via `is_open=true`.
	const SAMPLE_SIZE = 50;
	const loadOpenCases = async () => {
		if (!cases) {
			openCasesState = { ...openCasesState, loading: false };
			return;
		}
		openCasesState.loading = true;
		openCasesState.error = null;
		try {
			const states = (await cases.loadStates()) ?? [];
			const closedStateId = states.find((s) => s.state_name === 'Closed')?.state_id ?? null;

			const res = await cases.listPaginated({
				page: 1,
				per_page: SAMPLE_SIZE,
				is_open: true,
				...(myUserId != null ? { case_owner_id: myUserId } : {})
			});
			const { total, items } = unwrapPaginated<Case>(res);
			const openItems =
				closedStateId != null
					? items.filter((c) => c.state?.state_id !== closedStateId)
					: items;

			// The backend `total` is the unfiltered count; once we've
			// excluded Closed-with-no-close_date entries client-side the
			// real total is at best an approximation. Use the smaller of
			// the two as a more honest signal.
			openCasesState = {
				total: Math.min(total, openItems.length || total),
				items: openItems.slice(0, PREVIEW_LIMIT),
				loading: false,
				error: null
			};
		} catch (e) {
			openCasesState = { ...openCasesState, loading: false, error: (e as Error).message };
		}
	};

	// Alerts: the API only takes a single `alert_status_id`, so we use the
	// generic `custom_conditions` mechanism to exclude terminal statuses
	// (Closed / Merged / Escalated) server-side. This keeps both the count
	// (pagination.total) and the rows accurate without any client-side
	// filtering hacks.
	const OPEN_ALERTS_CONDITIONS = JSON.stringify([
		{
			field: 'status.status_name',
			operator: 'not_in',
			value: [...TERMINAL_ALERT_STATUS]
		}
	]);

	// Build the date-bucket trend + severity breakdown from a single alerts
	// pull over the trend window. Buckets are seeded with zero counts so
	// quiet days still render and the X axis stays continuous.
	const loadTrend = async () => {
		if (!alerts) {
			trendState = { ...trendState, loading: false };
			return;
		}
		trendState.loading = true;
		trendState.error = null;
		try {
			const end = new Date();
			const start = new Date(end);
			start.setDate(end.getDate() - (TREND_DAYS - 1));
			start.setHours(0, 0, 0, 0);

			const toIso = (d: Date) => d.toISOString();

			const res = await alerts.listPaginated({
				page: 1,
				per_page: TREND_SAMPLE_SIZE,
				creation_start_date: toIso(start),
				creation_end_date: toIso(end),
				...(myUserId != null ? { alert_owner_id: myUserId } : {})
			});
			const { items, total } = unwrapPaginated<Alert>(res);

			// Seed empty buckets for every day in the window so the chart
			// renders a continuous strip even when nothing happened.
			const buckets: TrendBucket[] = [];
			const bucketByKey = new Map<string, TrendBucket>();
			for (let i = 0; i < TREND_DAYS; i++) {
				const d = new Date(start);
				d.setDate(start.getDate() + i);
				const key = d.toISOString().slice(0, 10);
				const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
				const bucket: TrendBucket = { date: key, label, count: 0 };
				buckets.push(bucket);
				bucketByKey.set(key, bucket);
			}

			const sevCounts = new Map<string, number>();
			for (const a of items) {
				const key = (a.alert_creation_time ?? '').slice(0, 10);
				const bucket = bucketByKey.get(key);
				if (bucket) bucket.count += 1;

				const sevName = a.severity?.severity_name ?? 'Unspecified';
				sevCounts.set(sevName, (sevCounts.get(sevName) ?? 0) + 1);
			}

			const bySeverity: SeverityCount[] = ['Critical', 'High', 'Medium', 'Low', 'Unspecified']
				.map((name) => ({
					name,
					count: sevCounts.get(name) ?? 0,
					color: SEVERITY_TONES[name] ?? 'bg-slate-400'
				}))
				.filter((s) => s.count > 0);

			trendState = {
				buckets,
				bySeverity,
				total,
				loading: false,
				error: null
			};
		} catch (e) {
			trendState = { ...trendState, loading: false, error: (e as Error).message };
		}
	};

	// Cases opened per month across the last CASES_TREND_MONTHS months.
	// We fetch a generous page (cases volume is much lower than alerts)
	// and bucket by year-month client-side. Bucket keys are seeded so
	// quiet months still render a slot in the chart.
	const CASES_TREND_SAMPLE = 500;
	const loadCasesTrend = async () => {
		if (!cases) {
			casesTrendState = { ...casesTrendState, loading: false };
			return;
		}
		casesTrendState.loading = true;
		casesTrendState.error = null;
		try {
			const end = new Date();
			const start = new Date(end.getFullYear(), end.getMonth() - (CASES_TREND_MONTHS - 1), 1);
			const startIso = `${start.toISOString().slice(0, 10)}T00:00:00`;
			const endIso = `${end.toISOString().slice(0, 10)}T23:59:59`;

			const res = await cases.listPaginated({
				page: 1,
				per_page: CASES_TREND_SAMPLE,
				start_open_date: startIso,
				end_open_date: endIso
			});
			const { items } = unwrapPaginated<Case>(res);

			const buckets: TrendBucket[] = [];
			const bucketByKey = new Map<string, TrendBucket>();
			for (let i = 0; i < CASES_TREND_MONTHS; i++) {
				const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
				const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
				const label = d.toLocaleDateString(undefined, { month: 'short' });
				const bucket: TrendBucket = { date: key, label, count: 0 };
				buckets.push(bucket);
				bucketByKey.set(key, bucket);
			}

			let total = 0;
			for (const c of items) {
				if (!c.open_date) continue;
				const d = new Date(c.open_date);
				if (Number.isNaN(d.getTime())) continue;
				const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
				const bucket = bucketByKey.get(key);
				if (bucket) {
					bucket.count += 1;
					total += 1;
				}
			}

			casesTrendState = { buckets, total, loading: false, error: null };
		} catch (e) {
			casesTrendState = { ...casesTrendState, loading: false, error: (e as Error).message };
		}
	};

	const loadAlerts = async () => {
		if (!alerts) {
			alertsState = { ...alertsState, loading: false };
			return;
		}
		alertsState.loading = true;
		alertsState.error = null;
		try {
			const res = await alerts.listPaginated({
				page: 1,
				per_page: PREVIEW_LIMIT,
				custom_conditions: OPEN_ALERTS_CONDITIONS,
				...(myUserId != null ? { alert_owner_id: myUserId } : {})
			});
			const { total, items } = unwrapPaginated<Alert>(res);
			alertsState = { total, items, loading: false, error: null };
		} catch (e) {
			alertsState = { ...alertsState, loading: false, error: (e as Error).message };
		}
	};

	// Pending tasks assigned to the current user. The v2 endpoint
	// /dashboard/tasks/list already filters out done/canceled and returns
	// CaseTaskSchema-shaped rows.
	const loadTasks = async () => {
		tasksState.loading = true;
		tasksState.error = null;
		try {
			const res = await ApiService.get<unknown>('/dashboard/tasks/list');
			if (!res.ok || res.error || res.data === null) {
				tasksState = { total: 0, items: [], loading: false, error: null };
				return;
			}
			// v2 endpoints return the data envelope directly; the dashboard
			// task list is `Array<CaseTask>`.
			const rows = (res.data as { data?: unknown[] })?.data ?? (res.data as unknown[]);
			const list = Array.isArray(rows) ? (rows as RawTask[]) : [];
			if (list.length > 0) {
				console.log('[dashboard] tasks sample row →', list[0]);
			}
			const items: UserTask[] = list.map((t) => ({
				task_id: t.task_id,
				task_title: t.task_title,
				task_last_update: t.task_last_update ?? undefined,
				task_case: t.task_case,
				case_id: t.case_id as number,
				status_name: t.status_name
			}));
			tasksState = {
				total: items.length,
				items: items.slice(0, PREVIEW_LIMIT),
				loading: false,
				error: null
			};
		} catch (e) {
			tasksState = { ...tasksState, loading: false, error: (e as Error).message };
		}
	};

	const ACTIVITY_PAGE_SIZE = 20;

	const fetchActivityPage = async (offset: number): Promise<ActivityEntry[]> => {
		const res = await ApiService.get<unknown>(
			`/dashboard/activities/recent?limit=${ACTIVITY_PAGE_SIZE}&offset=${offset}`
		);
		if (!res.ok || res.error || res.data === null) return [];
		const body = res.data as { data?: unknown };
		const rows = Array.isArray(res.data)
			? (res.data as ActivityEntry[])
			: Array.isArray(body?.data)
				? (body.data as ActivityEntry[])
				: [];
		return rows;
	};

	const loadActivity = async () => {
		activityState.loading = true;
		activityState.error = null;
		try {
			const rows = await fetchActivityPage(0);
			activityState = {
				items: rows,
				loading: false,
				loadingMore: false,
				allLoaded: rows.length < ACTIVITY_PAGE_SIZE,
				error: null
			};
		} catch (e) {
			activityState = { ...activityState, loading: false, error: (e as Error).message };
		}
	};

	const loadMoreActivity = async () => {
		if (activityState.loadingMore || activityState.allLoaded || activityState.loading) return;
		activityState.loadingMore = true;
		try {
			const rows = await fetchActivityPage(activityState.items.length);
			activityState = {
				...activityState,
				items: [...activityState.items, ...rows],
				loadingMore: false,
				allLoaded: rows.length < ACTIVITY_PAGE_SIZE
			};
		} catch (e) {
			activityState = { ...activityState, loadingMore: false, error: (e as Error).message };
		}
	};

	// IntersectionObserver target. When the sentinel scrolls into view at
	// the bottom of the activity list we fetch the next page. A small
	// rootMargin pre-loads slightly before the user hits the edge.
	let activitySentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!activitySentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMoreActivity();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(activitySentinel);
		return () => observer.disconnect();
	});

	const refreshAll = () => {
		void loadOpenCases();
		void loadAlerts();
		void loadTasks();
		void loadTrend();
		void loadCasesTrend();
		void loadActivity();
	};

	// Refetch when the resolved user id changes (e.g. whoami resolves after
	// initial render). Snapshotting via `lastUserId` keeps this from firing
	// in a loop when the loaders mutate state the effect would otherwise
	// retrack.
	let lastUserId: number | null | undefined = undefined;
	$effect(() => {
		if (myUserId === lastUserId) return;
		lastUserId = myUserId;
		refreshAll();
	});

	const formatRelative = (iso: string | null | undefined): string => {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		const diff = Math.max(0, Date.now() - d.getTime());
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return d.toLocaleDateString();
	};

	const trendMax = $derived(
		trendState.buckets.reduce((m, b) => (b.count > m ? b.count : m), 0)
	);
	const trendTotal = $derived(
		trendState.buckets.reduce((sum, b) => sum + b.count, 0)
	);

	const casesTrendMax = $derived(
		casesTrendState.buckets.reduce((m, b) => (b.count > m ? b.count : m), 0)
	);
	const casesTrendTotal = $derived(
		casesTrendState.buckets.reduce((sum, b) => sum + b.count, 0)
	);

	const stripCaseIdPrefix = (name: string): string => {
		// Cases are stored as "#42 - Title" — for the dashboard list a clean
		// title reads better; the case id is shown separately as a chip.
		const m = name?.match(/^#\d+\s*-\s*(.+)$/);
		return m ? m[1] : name;
	};
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full w-full min-w-0 flex-1 flex-col gap-5 overflow-auto p-6">
	<!-- Header strip: greeting + compact KPIs -->
	<section
		class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-elevation-1 lg:flex-row lg:items-center lg:gap-4"
	>
		<div class="flex min-w-0 items-baseline gap-2 lg:flex-1">
			<h1 class="truncate text-sm font-semibold leading-none">
				{greeting()}, {firstName}
			</h1>
			<span class="hidden truncate text-xs text-muted-foreground md:inline">
				· Here's where things stand
			</span>
		</div>

		<div class="flex flex-wrap items-center gap-1.5">
			<a
				href={myUserId != null
					? `/cases?case_owner_id=${myUserId}&is_open=true`
					: '/cases?is_open=true'}
				class="group inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-muted/70"
			>
				<LayersIcon size={12} class="text-blue-500" />
				<span class="text-muted-foreground">Open cases</span>
				<span class="font-semibold tabular-nums">
					{openCasesState.loading ? '…' : openCasesState.total}
				</span>
			</a>

			<a
				href={myUserId != null ? `/alerts?alert_owner_id=${myUserId}` : '/alerts'}
				class="group inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-muted/70"
			>
				<BellRingIcon size={12} class="text-red-500" />
				<span class="text-muted-foreground">Open alerts</span>
				<span class="font-semibold tabular-nums">
					{alertsState.loading ? '…' : alertsState.total}
				</span>
			</a>

			<span
				class="group inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-xs"
			>
				<CheckCheckIcon size={12} class="text-emerald-500" />
				<span class="text-muted-foreground">Pending tasks</span>
				<span class="font-semibold tabular-nums">
					{tasksState.loading ? '…' : tasksState.total}
				</span>
			</span>
		</div>

		<div class="hidden h-6 w-px shrink-0 bg-border/60 lg:block" aria-hidden="true"></div>

		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				onclick={refreshAll}
				aria-label="Refresh dashboard"
				title="Refresh"
			>
				<RefreshCwIcon class="h-3.5 w-3.5" />
			</Button>
		</div>
	</section>

	<!--
	  Insights row: alerts-per-day mini chart on the left, severity
	  breakdown on the right. Both derived from a single ~14d alerts pull
	  to keep the request count down. Useful at-a-glance signal for the
	  current workload shape.
	-->
	<div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
		<section
			class="flex flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1 xl:col-span-2"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<BellRingIcon class="h-4 w-4 shrink-0 text-blue-500" />
					<h2 class="text-sm font-semibold">Alerts in the last {TREND_DAYS} days</h2>
					{#if trendTotal > 0}
						<span class="text-xs text-muted-foreground tabular-nums">
							{trendTotal}
						</span>
					{/if}
				</div>
				<span class="text-2xs text-muted-foreground">peak {trendMax}/day</span>
			</header>

			<div class="flex-1 px-4 py-3">
				{#if trendState.loading}
					<Skeleton class="h-24 w-full" />
				{:else if trendState.error}
					<div class="text-center text-xs text-destructive">{trendState.error}</div>
				{:else if trendTotal === 0}
					<div class="flex h-24 items-center justify-center text-xs text-muted-foreground">
						No alerts in this window.
					</div>
				{:else}
					<!--
					  Minimal SVG bar chart — no external charting lib so the
					  bundle stays small. Bars are rendered relative to the
					  per-window peak; a faint baseline + label per bar keep
					  the chart self-describing.
					-->
					<div class="flex h-28 items-end gap-[3px]">
						{#each trendState.buckets as b (b.date)}
							{@const heightPct = trendMax > 0 ? (b.count / trendMax) * 100 : 0}
							<div
								class="group relative flex h-full flex-1 flex-col justify-end"
								title={`${b.label}: ${b.count} alert${b.count === 1 ? '' : 's'}`}
							>
								<div
									class="rounded-sm bg-blue-500/70 transition-all group-hover:bg-blue-500"
									style="height: {Math.max(heightPct, b.count > 0 ? 4 : 0)}%"
								></div>
							</div>
						{/each}
					</div>
					<div class="mt-1 flex justify-between text-[10px] text-muted-foreground">
						<span>{trendState.buckets[0]?.label}</span>
						<span>{trendState.buckets[trendState.buckets.length - 1]?.label}</span>
					</div>
				{/if}
			</div>
		</section>

		<section
			class="flex flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<ShieldAlertIcon class="h-4 w-4 shrink-0 text-amber-500" />
					<h2 class="text-sm font-semibold">By severity</h2>
				</div>
				<span class="text-2xs text-muted-foreground">last {TREND_DAYS}d</span>
			</header>

			<div class="flex flex-col gap-3 px-4 py-3">
				{#if trendState.loading}
					<Skeleton class="h-3 w-full" />
					<Skeleton class="h-16 w-full" />
				{:else if trendState.bySeverity.length === 0}
					<div class="flex h-24 items-center justify-center text-xs text-muted-foreground">
						—
					</div>
				{:else}
					{@const total = trendState.bySeverity.reduce((s, x) => s + x.count, 0)}
					<!-- Stacked horizontal bar -->
					<div class="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
						{#each trendState.bySeverity as s (s.name)}
							<div
								class={s.color}
								style="width: {(s.count / total) * 100}%"
								title={`${s.name}: ${s.count}`}
							></div>
						{/each}
					</div>
					<ul class="flex flex-col gap-1.5 text-xs">
						{#each trendState.bySeverity as s (s.name)}
							<li class="flex items-center gap-2">
								<span class="h-2 w-2 shrink-0 rounded-full {s.color}"></span>
								<span class="flex-1 truncate text-muted-foreground">{s.name}</span>
								<span class="tabular-nums font-medium">{s.count}</span>
								<span class="w-10 text-right tabular-nums text-2xs text-muted-foreground">
									{Math.round((s.count / total) * 100)}%
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>

	<!--
	  Cases trend: monthly volume across the last 6 months. Coarser grain
	  than the alerts chart because case opening cadence is naturally
	  lower; daily buckets would be mostly zero. Pairs visually with the
	  alerts trend above.
	-->
	<section
		class="flex flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1"
	>
		<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
			<div class="flex items-center gap-2 min-w-0">
				<LayersIcon class="h-4 w-4 shrink-0 text-emerald-500" />
				<h2 class="text-sm font-semibold">
					Cases opened in the last {CASES_TREND_MONTHS} months
				</h2>
				{#if casesTrendTotal > 0}
					<span class="text-xs text-muted-foreground tabular-nums">
						{casesTrendTotal}
					</span>
				{/if}
			</div>
			<span class="text-2xs text-muted-foreground">peak {casesTrendMax}/month</span>
		</header>

		<div class="px-4 py-3">
			{#if casesTrendState.loading}
				<Skeleton class="h-24 w-full" />
			{:else if casesTrendState.error}
				<div class="text-center text-xs text-destructive">{casesTrendState.error}</div>
			{:else if casesTrendTotal === 0}
				<div class="flex h-24 items-center justify-center text-xs text-muted-foreground">
					No cases opened in this window.
				</div>
			{:else}
				<div class="flex h-28 items-end gap-2">
					{#each casesTrendState.buckets as b (b.date)}
						{@const heightPct = casesTrendMax > 0 ? (b.count / casesTrendMax) * 100 : 0}
						<div
							class="group relative flex h-full flex-1 flex-col justify-end"
							title={`${b.label}: ${b.count} case${b.count === 1 ? '' : 's'}`}
						>
							<div
								class="rounded-sm bg-emerald-500/70 transition-all group-hover:bg-emerald-500"
								style="height: {Math.max(heightPct, b.count > 0 ? 6 : 0)}%"
							></div>
						</div>
					{/each}
				</div>
				<div class="mt-1 flex justify-between text-[10px] text-muted-foreground">
					{#each casesTrendState.buckets as b (b.date)}
						<span class="flex-1 text-center">{b.label}</span>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Two-column main grid -->
	<div class="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-3">
		<!--
		  Recent open cases. We deliberately limit to ~5 rows so the list
		  fits without scrolling on common viewports. The full list is one
		  click away via the header.
		-->
		<section
			class="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1 xl:col-span-2"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<LayersIcon class="h-4 w-4 shrink-0 text-blue-500" />
					<h2 class="text-sm font-semibold">My open cases</h2>
					{#if openCasesState.total > 0}
						<span class="text-xs text-muted-foreground tabular-nums">
							{openCasesState.total}
						</span>
					{/if}
				</div>

				<a
					href={myUserId != null
						? `/cases?case_owner_id=${myUserId}&is_open=true`
						: '/cases?is_open=true'}
					class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					View all
					<ArrowRightIcon class="h-3 w-3" />
				</a>
			</header>

			<div class="flex-1 overflow-auto">
				{#if openCasesState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if openCasesState.error}
					<div class="p-6 text-center text-xs text-destructive">{openCasesState.error}</div>
				{:else if openCasesState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<BoxesIcon class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">No open cases right now.</p>
						<Button size="sm" variant="outline" onclick={() => goto('/cases')}>
							<PlusIcon class="h-3.5 w-3.5" />
							Start a case
						</Button>
					</div>
				{:else}
					<ul class="divide-y">
						{#each openCasesState.items as c (c.case_id)}
							<li>
								<a
									href={`/case/${c.case_id}`}
									class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
								>
									<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
										#{c.case_id}
									</span>
									<span class="min-w-0 flex-1 truncate text-sm font-medium" title={c.case_name}>
										{stripCaseIdPrefix(c.case_name)}
									</span>
									<div class="hidden items-center gap-1.5 sm:flex">
										{#if c.severity?.severity_name}
											<SeverityBadge severity={c.severity.severity_name as SeverityName} icon_only />
										{/if}
										{#if c.state?.state_name}
											<StatusBadge status={c.state.state_name as CaseStatus} icon_only />
										{/if}
									</div>
									<span class="hidden shrink-0 text-2xs text-muted-foreground tabular-nums md:inline">
										{formatRelative(c.open_date)}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Open alerts assigned to me -->
		<section
			class="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<BellRingIcon class="h-4 w-4 shrink-0 text-red-500" />
					<h2 class="text-sm font-semibold">My open alerts</h2>
					{#if alertsState.total > 0}
						<span class="text-xs text-muted-foreground tabular-nums">
							{alertsState.total}
						</span>
					{/if}
				</div>

				<a
					href={myUserId != null ? `/alerts?alert_owner_id=${myUserId}` : '/alerts'}
					class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					View all
					<ArrowRightIcon class="h-3 w-3" />
				</a>
			</header>

			<div class="flex-1 overflow-auto">
				{#if alertsState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if alertsState.error}
					<div class="p-6 text-center text-xs text-destructive">{alertsState.error}</div>
				{:else if alertsState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<AlertTriangleIcon class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">No alerts. Nice and quiet.</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each alertsState.items as a (a.alert_id)}
							<li>
								<a
									href={`/alerts/${a.alert_id}`}
									class="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-muted/50"
								>
									<div class="flex items-center gap-2">
										<span class="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
											#{a.alert_id}
										</span>
										<span class="min-w-0 flex-1 truncate text-sm font-medium" title={a.alert_title}>
											{a.alert_title}
										</span>
									</div>
									<div class="flex items-center gap-2 text-2xs text-muted-foreground">
										{#if a.alert_source}
											<span class="truncate">{a.alert_source}</span>
											<span class="opacity-40">·</span>
										{/if}
										<span class="tabular-nums">
											{formatRelative(a.alert_creation_time)}
										</span>
									</div>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>

	<!--
	  Tasks + Activity row. Splitting these 50/50 keeps the tasks card
	  from looking sparse and gives the new activity feed a natural home
	  next to the user's own work.
	-->
	<div class="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-2">
		<section
			class="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<CheckCheckIcon class="h-4 w-4 shrink-0 text-emerald-500" />
					<h2 class="text-sm font-semibold">My pending tasks</h2>
					{#if tasksState.total > 0}
						<span class="text-xs text-muted-foreground tabular-nums">
							{tasksState.total}
						</span>
					{/if}
				</div>
			</header>

			<div class="flex-1 overflow-auto">
				{#if tasksState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if tasksState.error}
					<div class="p-6 text-center text-xs text-destructive">{tasksState.error}</div>
				{:else if tasksState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<CheckCheckIcon class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">No pending tasks. You're all caught up.</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each tasksState.items as t, idx (t.task_id ?? `idx-${idx}`)}
							{@const caseTitle = t.task_case ? stripCaseIdPrefix(t.task_case) : ''}
							<li>
								<a
									href={`/case/${t.case_id}/tasks/${t.task_id}`}
									class="flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-muted/50"
								>
									<div class="flex items-center gap-2">
										<span class="min-w-0 flex-1 truncate text-sm font-medium" title={t.task_title}>
											{t.task_title}
										</span>
										{#if t.status_name}
											<span class="hidden shrink-0 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground sm:inline">
												{t.status_name}
											</span>
										{/if}
										<span class="hidden shrink-0 text-2xs text-muted-foreground tabular-nums md:inline">
											{formatRelative(t.task_last_update)}
										</span>
									</div>
									{#if t.case_id}
										<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="shrink-0 font-mono tabular-nums">#{t.case_id}</span>
											{#if caseTitle}
												<span class="opacity-40">·</span>
												<span class="truncate" title={caseTitle}>{caseTitle}</span>
											{/if}
										</div>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Recent platform activity, scoped to cases the current user has
		     access to. Read-only stream — clicking an entry jumps to the
		     case where the activity happened. -->
		<section
			class="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card shadow-elevation-1"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<ActivityIcon class="h-4 w-4 shrink-0 text-violet-500" />
					<h2 class="text-sm font-semibold">Recent activity</h2>
				</div>
			</header>

			<div class="max-h-[420px] overflow-auto">
				{#if activityState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if activityState.error}
					<div class="p-6 text-center text-xs text-destructive">{activityState.error}</div>
				{:else if activityState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<ActivityIcon class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">Quiet around here for now.</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each activityState.items as a, idx (a.id ?? idx)}
							{@const stripped = (a.activity_desc ?? '').replace(/<[^>]+>/g, '')}
							<li>
								{#if a.case_id}
									<a
										href={`/case/${a.case_id}`}
										class="flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-muted/50"
									>
										<div class="flex items-center gap-2 text-sm">
											<span class="min-w-0 flex-1 truncate" title={stripped}>
												{stripped || '—'}
											</span>
											<span class="shrink-0 text-2xs text-muted-foreground tabular-nums">
												{formatRelative(a.activity_date)}
											</span>
										</div>
										<div class="flex items-center gap-2 text-2xs text-muted-foreground">
											{#if a.user_name}<span class="truncate">{a.user_name}</span>{/if}
											{#if a.user_name && a.case_name}<span class="opacity-40">·</span>{/if}
											{#if a.case_name}<span class="truncate">{a.case_name}</span>{/if}
										</div>
									</a>
								{:else}
									<div class="flex flex-col gap-0.5 px-4 py-2">
										<div class="flex items-center gap-2 text-sm">
											<span class="min-w-0 flex-1 truncate text-muted-foreground" title={stripped}>
												{stripped || '—'}
											</span>
											<span class="shrink-0 text-2xs text-muted-foreground tabular-nums">
												{formatRelative(a.activity_date)}
											</span>
										</div>
										{#if a.user_name}
											<div class="text-2xs text-muted-foreground truncate">{a.user_name}</div>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>

					<!-- Infinite-scroll sentinel: when this scrolls into view we
					     fetch the next page. A loading-more spinner sits next
					     to it; once the backend returns a short page the
					     sentinel is hidden so we stop triggering. -->
					{#if !activityState.allLoaded}
						<div bind:this={activitySentinel} class="px-4 py-3 text-center text-2xs text-muted-foreground">
							{activityState.loadingMore ? 'Loading more…' : ''}
						</div>
					{/if}
				{/if}
			</div>
		</section>
	</div>

	<!-- Quick actions -->
	<section class="flex flex-wrap items-center gap-2">
		<span class="text-2xs uppercase tracking-wide text-muted-foreground">Quick actions</span>

		<Button variant="outline" size="sm" class="h-8 gap-x-1" onclick={() => goto('/cases')}>
			<LayersIcon class="h-3.5 w-3.5" />
			Browse cases
		</Button>

		<Button variant="outline" size="sm" class="h-8 gap-x-1" onclick={() => goto('/alerts')}>
			<BellRingIcon class="h-3.5 w-3.5" />
			Triage alerts
		</Button>
	</section>
</div>
