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
		ListIcon,
		PlusIcon,
		RefreshCwIcon,
		Star
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
	import { ActivitiesService, type ActivityRow } from '$lib/services/activities.service';
	import { DashboardService, type DashboardKpis } from '$lib/services/dashboard.service';
	import { FollowedCasesService } from '$lib/services/followed-cases.service';

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

	type MajorCaseActivityEntry = {
		id?: number;
		case_id?: number | null;
		case_name?: string | null;
		owner_name?: string | null;
		opened_by_name?: string | null;
		customer_name?: string | null;
		activity_date?: string | null;
		activity_desc?: string | null;
	};

	const PREVIEW_LIMIT = 5;

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
	let followedCasesState = $state<DashState<Case>>({
		total: 0,
		items: [],
		loading: true,
		error: null
	});
	let alertsState = $state<DashState<Alert>>({ total: 0, items: [], loading: true, error: null });
	let tasksState = $state<DashState<UserTask>>({
		total: 0,
		items: [],
		loading: true,
		error: null
	});

	// Compact KPI block sourced from /api/v2/dashboard/kpis. Adds throughput
	// info (cases closed in the last 30 days) and a precise filter predicate
	// for the assigned-alerts deep-link, so the count and the linked page
	// agree exactly on which status ids count as "open".
	let kpiState = $state<{ data: DashboardKpis | null; loading: boolean }>({
		data: null,
		loading: true
	});
	let activityState = $state<{
		items: MajorCaseActivityEntry[];
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

	// "Case activities details" — the full per-case UserActivity feed
	// (notes touched, IoCs added, comments, etc.). Same infinite-scroll
	// + auto-refresh shape as `activityState` above; we keep the two
	// states separate because they hit different endpoints and tick
	// independently.
	let caseActivityState = $state<{
		items: ActivityRow[];
		page: number;
		loading: boolean;
		loadingMore: boolean;
		allLoaded: boolean;
		error: string | null;
	}>({
		items: [],
		page: 0,
		loading: true,
		loadingMore: false,
		allLoaded: false,
		error: null
	});

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

	// Cases the user has explicitly followed. The endpoint already filters
	// out entries the user has lost access to, so the dashboard never
	// renders a row that 404s on click.
	const loadFollowedCases = async () => {
		followedCasesState.loading = true;
		followedCasesState.error = null;
		try {
			const res = await FollowedCasesService.listMine();
			if (!res.ok || res.error || !Array.isArray(res.data)) {
				followedCasesState = {
					total: 0,
					items: [],
					loading: false,
					error: res.error?.message ?? null
				};
				return;
			}
			const items = res.data as unknown as Case[];
			followedCasesState = {
				total: items.length,
				items: items.slice(0, PREVIEW_LIMIT),
				loading: false,
				error: null
			};
		} catch (e) {
			followedCasesState = { ...followedCasesState, loading: false, error: (e as Error).message };
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

	const fetchActivityPage = async (offset: number): Promise<MajorCaseActivityEntry[]> => {
		const res = await ApiService.get<unknown>(
			`/dashboard/activities/cases/major?limit=${ACTIVITY_PAGE_SIZE}&offset=${offset}`
		);
		if (!res.ok || res.error || res.data === null) return [];
		const body = res.data as { data?: unknown };
		const rows = Array.isArray(res.data)
			? (res.data as MajorCaseActivityEntry[])
			: Array.isArray(body?.data)
				? (body.data as MajorCaseActivityEntry[])
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

	// Live polling: every 5s, fetch the head of the list and prepend any
	// entries whose id we haven't seen yet. We compare on `id` rather than
	// timestamps so equal-timestamp rows don't merge or duplicate. The
	// poll pauses when the tab is hidden to avoid wasting requests, and
	// stops while the initial load or a load-more is in flight to keep
	// the prepend simple.
	const ACTIVITY_POLL_MS = 10_000;
	const pollActivity = async () => {
		if (activityState.loading || activityState.loadingMore) return;
		if (typeof document !== 'undefined' && document.hidden) return;
		const rows = await fetchActivityPage(0);
		if (rows.length === 0) return;
		const known = new Set(activityState.items.map((a) => a.id).filter((id): id is number => id != null));
		const fresh = rows.filter((r) => r.id != null && !known.has(r.id));
		if (fresh.length === 0) return;
		activityState = {
			...activityState,
			items: [...fresh, ...activityState.items]
		};
	};

	$effect(() => {
		if (typeof window === 'undefined') return;
		const id = window.setInterval(() => void pollActivity(), ACTIVITY_POLL_MS);
		return () => window.clearInterval(id);
	});

	// --- Case activities details ----------------------------------------
	// Same infinite-scroll + auto-refresh wiring as the major activities
	// feed, but talks to /api/v2/activities (the full per-case event log).
	// We use page-based pagination because that's what ActivitiesService
	// exposes; the items list grows as the user scrolls.
	const CASE_ACTIVITY_PAGE_SIZE = 20;

	const fetchCaseActivityPage = async (page: number): Promise<ActivityRow[]> => {
		const res = await ActivitiesService.list({
			page,
			per_page: CASE_ACTIVITY_PAGE_SIZE,
			include_non_case: false
		});
		if (!res.ok || res.error || res.data === null) return [];
		const body = res.data;
		if (body && typeof body !== 'string' && Array.isArray(body.data)) {
			return body.data as ActivityRow[];
		}
		return [];
	};

	const loadCaseActivity = async () => {
		caseActivityState.loading = true;
		caseActivityState.error = null;
		try {
			const rows = await fetchCaseActivityPage(1);
			caseActivityState = {
				items: rows,
				page: 1,
				loading: false,
				loadingMore: false,
				allLoaded: rows.length < CASE_ACTIVITY_PAGE_SIZE,
				error: null
			};
		} catch (e) {
			caseActivityState = { ...caseActivityState, loading: false, error: (e as Error).message };
		}
	};

	const loadMoreCaseActivity = async () => {
		if (
			caseActivityState.loadingMore ||
			caseActivityState.allLoaded ||
			caseActivityState.loading
		)
			return;
		caseActivityState.loadingMore = true;
		try {
			const nextPage = caseActivityState.page + 1;
			const rows = await fetchCaseActivityPage(nextPage);
			caseActivityState = {
				...caseActivityState,
				items: [...caseActivityState.items, ...rows],
				page: nextPage,
				loadingMore: false,
				allLoaded: rows.length < CASE_ACTIVITY_PAGE_SIZE
			};
		} catch (e) {
			caseActivityState = {
				...caseActivityState,
				loadingMore: false,
				error: (e as Error).message
			};
		}
	};

	let caseActivitySentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!caseActivitySentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMoreCaseActivity();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(caseActivitySentinel);
		return () => observer.disconnect();
	});

	// Poll head-of-list every 10s and prepend rows we haven't seen. We
	// dedupe on `id` so equal-timestamp bursts don't merge or duplicate.
	// The same tab-visibility / in-flight guards used by the major
	// activities poll apply here.
	const CASE_ACTIVITY_POLL_MS = 10_000;
	const pollCaseActivity = async () => {
		if (caseActivityState.loading || caseActivityState.loadingMore) return;
		if (typeof document !== 'undefined' && document.hidden) return;
		const rows = await fetchCaseActivityPage(1);
		if (rows.length === 0) return;
		const known = new Set(
			caseActivityState.items.map((a) => a.id).filter((id): id is number => id != null)
		);
		const fresh = rows.filter((r) => r.id != null && !known.has(r.id));
		if (fresh.length === 0) return;
		caseActivityState = {
			...caseActivityState,
			items: [...fresh, ...caseActivityState.items]
		};
	};

	$effect(() => {
		if (typeof window === 'undefined') return;
		const id = window.setInterval(() => void pollCaseActivity(), CASE_ACTIVITY_POLL_MS);
		return () => window.clearInterval(id);
	});

	const loadKpis = async () => {
		kpiState.loading = true;
		try {
			const res = await DashboardService.get();
			if (res.ok && res.data && typeof res.data !== 'string') {
				kpiState.data = res.data;
			}
		} finally {
			kpiState.loading = false;
		}
	};

	const refreshAll = () => {
		void loadOpenCases();
		void loadFollowedCases();
		void loadAlerts();
		void loadTasks();
		void loadActivity();
		void loadCaseActivity();
		void loadKpis();
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

	const stripCaseIdPrefix = (name: string): string => {
		// Cases are stored as "#42 - Title" — for the dashboard list a clean
		// title reads better; the case id is shown separately as a chip.
		const m = name?.match(/^#\d+\s*-\s*(.+)$/);
		return m ? m[1] : name;
	};

	const majorActivityKind = (desc: string | null | undefined): 'created' | 'closed' => {
		const d = (desc ?? '').toLowerCase();
		return d.includes('closed') ? 'closed' : 'created';
	};
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full w-full min-w-0 flex-1 flex-col gap-6 overflow-auto bg-gradient-to-b from-muted/30 via-background to-background p-6">
	<!--
	  Hero band. One single panel: greeting on the left, four big inline
	  metrics on the right (no nested card boxes). Numbers are the visual
	  hierarchy — large tabular figures with a small label underneath; the
	  whole figure is a deep-link where it makes sense. A subtle separator
	  divides each metric. Reads as a magazine masthead rather than the
	  earlier "four little cards in a row" look.
	-->
	<section
		class="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-1"
	>
		<!-- Soft tinted glow tucked behind the greeting so the panel has a
		     mood rather than being a flat white slab. -->
		<div
			class="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl"
			aria-hidden="true"
		></div>
		<div
			class="pointer-events-none absolute -right-32 -bottom-32 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl"
			aria-hidden="true"
		></div>

		<div class="relative flex flex-col gap-6 px-6 py-5 lg:flex-row lg:items-center">
			<!-- Greeting block -->
			<div class="flex min-w-0 items-center gap-3">
				<div class="min-w-0">
					<p class="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						{greeting()}
					</p>
					<h1 class="truncate text-2xl font-semibold leading-tight tracking-tight">
						{firstName}
					</h1>
				</div>

				<Button
					variant="ghost"
					size="icon"
					class="ml-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
					onclick={refreshAll}
					aria-label="Refresh dashboard"
					title="Refresh"
				>
					<RefreshCwIcon class="h-3.5 w-3.5" />
				</Button>
			</div>

			<!-- Inline metric strip. Each metric is value + label stacked,
			     separated by a hairline divider on lg+. The two "owned" rows
			     are clickable; the two derived counters are static. `ml-auto`
			     on lg pushes the strip flush to the right edge of the band
			     while keeping the greeting natural-width on the left —
			     `justify-between` left a big empty gap between them. -->
			<div class="flex flex-wrap items-stretch gap-x-6 gap-y-3 lg:ml-auto lg:gap-x-8">
				<a
					href={myUserId != null
						? `/cases?case_owner_id=${myUserId}&is_open=true`
						: '/cases?is_open=true'}
					class="group flex flex-col gap-0.5 transition-colors"
				>
					<span class="flex items-baseline gap-1.5">
						<span class="text-3xl font-semibold tabular-nums leading-none text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400">
							{openCasesState.loading ? '—' : openCasesState.total}
						</span>
					</span>
					<span class="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						<LayersIcon class="h-3 w-3 text-blue-500" />
						My open cases
					</span>
				</a>

				<div class="hidden w-px self-stretch bg-border/60 lg:block" aria-hidden="true"></div>

				<a
					href={(() => {
						const f = kpiState.data?.assigned_alerts.filter;
						if (f && f.alert_status_id.length > 0) {
							const statuses = f.alert_status_id
								.map((id) => `alert_status_id=${id}`)
								.join('&');
							return `/alerts?alert_owner_id=${f.alert_owner_id}&${statuses}`;
						}
						return myUserId != null
							? `/alerts?alert_owner_id=${myUserId}`
							: '/alerts';
					})()}
					class="group flex flex-col gap-0.5 transition-colors"
				>
					<span class="text-3xl font-semibold tabular-nums leading-none text-foreground group-hover:text-red-600 dark:group-hover:text-red-400">
						{kpiState.loading && kpiState.data == null
							? alertsState.loading
								? '—'
								: alertsState.total
							: kpiState.data?.assigned_alerts.count ?? alertsState.total}
					</span>
					<span class="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						<BellRingIcon class="h-3 w-3 text-red-500" />
						My open alerts
					</span>
				</a>

				<div class="hidden w-px self-stretch bg-border/60 lg:block" aria-hidden="true"></div>

				<div class="flex flex-col gap-0.5">
					<span class="text-3xl font-semibold tabular-nums leading-none">
						{tasksState.loading ? '—' : tasksState.total}
					</span>
					<span class="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						<CheckCheckIcon class="h-3 w-3 text-emerald-500" />
						Pending tasks
					</span>
				</div>

				<div class="hidden w-px self-stretch bg-border/60 lg:block" aria-hidden="true"></div>

				<div class="flex flex-col gap-0.5">
					<span class="text-3xl font-semibold tabular-nums leading-none">
						{kpiState.loading ? '—' : kpiState.data?.cases_closed_last_30d ?? 0}
					</span>
					<span class="flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						<CheckCheckIcon class="h-3 w-3 text-violet-500" />
						Closed (30d)
					</span>
				</div>
			</div>
		</div>
	</section>

	<!--
	  Row A — primary "your work" line: open cases (2/3) + open alerts (1/3).
	  These are the operator's daily entry points; everything else below
	  is reference / signal.
	-->
	<div class="flex flex-col gap-5 lg:flex-row">
		<section
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-2/3"
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
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-1/3"
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
	  Row B — secondary "your work" line: pending tasks (1/3) + followed
	  cases (2/3). Both are user-scoped, kept just below Row A so the
	  whole "your stuff" cluster stays visually together at the top of
	  the dashboard.
	-->
	<div class="flex flex-col gap-5 lg:flex-row">
		<section
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-1/3"
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

		<!--
		  Following: cases the current user has explicitly followed via the
		  case-detail "Follow" toggle. Promoted to the top cluster (next to
		  pending tasks) because it's a high-signal personal queue — the
		  cases this operator wants to keep eyes on. Empty / loading is
		  rendered as a tile (rather than hidden) so the row keeps a
		  consistent shape.
		-->
		<section
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-2/3"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<Star class="h-4 w-4 shrink-0 fill-amber-500 text-amber-500" />
					<h2 class="text-sm font-semibold">Following</h2>
					{#if followedCasesState.total > 0}
						<span class="text-xs text-muted-foreground tabular-nums">
							{followedCasesState.total}
						</span>
					{/if}
				</div>
			</header>

			<div class="flex-1 overflow-auto">
				{#if followedCasesState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if followedCasesState.error}
					<div class="p-6 text-center text-xs text-destructive">{followedCasesState.error}</div>
				{:else if followedCasesState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<Star class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">
							You aren't following any cases yet. Open a case and click ★ Follow to keep it pinned here.
						</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each followedCasesState.items as c (c.case_id)}
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
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</div>

	<!--
	  Activity feeds row: major case lifecycle (created / closed) on the
	  left, per-case event log on the right. Global signal — sits at the
	  bottom of the page.
	-->
	<div class="flex flex-col gap-5 lg:flex-row">
		<!--
		  High-signal case lifecycle feed (created/closed), scoped to cases
		  the current user can access. Infinite-scroll and read-only.
		-->
		<section
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-1/2"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<ActivityIcon class="h-4 w-4 shrink-0 text-violet-500" />
					<h2 class="text-sm font-semibold">Major case activities</h2>
				</div>
			</header>

			<div class="flex-1 overflow-auto">
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
						<p class="text-sm text-muted-foreground">No recent case created/closed activity.</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each activityState.items as a, idx (a.id ?? idx)}
							{@const action = majorActivityKind(a.activity_desc)}
							{@const caseTitle = a.case_name ? stripCaseIdPrefix(a.case_name) : '—'}
							<li>
								{#if a.case_id}
									<a
										href={`/case/${a.case_id}`}
										class="flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-muted/50"
									>
										<div class="flex items-center gap-2 text-sm">
											<span
												class={action === 'closed'
													? 'shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-2xs font-medium text-rose-700 dark:text-rose-300'
													: 'shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300'}
											>
												{action === 'closed' ? 'Case closed' : 'Case created'}
											</span>
											<span class="min-w-0 flex-1 truncate font-medium" title={caseTitle}>
												{caseTitle}
											</span>
											<span class="shrink-0 text-2xs text-muted-foreground tabular-nums">
												{formatRelative(a.activity_date)}
											</span>
										</div>
										<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="truncate">Owner: {a.owner_name ?? '—'}</span>
											<span class="opacity-40">·</span>
											<span class="truncate">Opened by: {a.opened_by_name ?? '—'}</span>
										</div>
										<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="shrink-0 font-mono tabular-nums">#{a.case_id}</span>
											<span class="opacity-40">·</span>
											<span class="truncate">Customer: {a.customer_name ?? '—'}</span>
										</div>
									</a>
								{:else}
									<div class="flex flex-col gap-0.5 px-4 py-2">
										<div class="text-2xs text-muted-foreground truncate">Case reference unavailable</div>
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

		<!--
		  Per-case activity log (notes touched, IoCs added, comments,
		  etc.). Same infinite-scroll + 10s poll as the major-activities
		  card, but talks to /api/v2/activities so it covers the full
		  per-case event stream rather than just create/close.
		-->
		<section
			class="flex min-w-0 h-[22rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-elevation-1 lg:basis-1/2"
		>
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="flex items-center gap-2 min-w-0">
					<ListIcon class="h-4 w-4 shrink-0 text-sky-500" />
					<h2 class="text-sm font-semibold">Case activities</h2>
				</div>
				<a
					href="/activities"
					class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					View all
					<ArrowRightIcon class="h-3 w-3" />
				</a>
			</header>

			<div class="flex-1 overflow-auto">
				{#if caseActivityState.loading}
					<div class="space-y-2 p-4">
						{#each Array(PREVIEW_LIMIT) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if caseActivityState.error}
					<div class="p-6 text-center text-xs text-destructive">{caseActivityState.error}</div>
				{:else if caseActivityState.items.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
						<ListIcon class="h-8 w-8 text-muted-foreground/40" />
						<p class="text-sm text-muted-foreground">No recent case activity.</p>
					</div>
				{:else}
					<ul class="divide-y">
						{#each caseActivityState.items as a, idx (a.id ?? idx)}
							{@const caseTitle = a.case_name ? stripCaseIdPrefix(a.case_name) : null}
							<li>
								{#if a.case_id}
									<a
										href={`/case/${a.case_id}`}
										class="flex flex-col gap-0.5 px-4 py-2 transition-colors hover:bg-muted/50"
									>
										<div class="flex items-center gap-2 text-sm">
											<span class="min-w-0 flex-1 truncate" title={a.activity_desc ?? ''}>
												{a.activity_desc ?? '—'}
											</span>
											<span class="shrink-0 text-2xs text-muted-foreground tabular-nums">
												{formatRelative(a.activity_date)}
											</span>
										</div>
										<div class="flex items-center gap-1.5 text-2xs text-muted-foreground">
											<span class="shrink-0 font-mono tabular-nums">#{a.case_id}</span>
											{#if caseTitle}
												<span class="opacity-40">·</span>
												<span class="truncate" title={caseTitle}>{caseTitle}</span>
											{/if}
											{#if a.user_name}
												<span class="opacity-40">·</span>
												<span class="truncate">{a.user_name}</span>
											{/if}
										</div>
									</a>
								{:else}
									<div class="flex flex-col gap-0.5 px-4 py-2">
										<div class="flex items-center gap-2 text-sm">
											<span class="min-w-0 flex-1 truncate" title={a.activity_desc ?? ''}>
												{a.activity_desc ?? '—'}
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

					{#if !caseActivityState.allLoaded}
						<div
							bind:this={caseActivitySentinel}
							class="px-4 py-3 text-center text-2xs text-muted-foreground"
						>
							{caseActivityState.loadingMore ? 'Loading more…' : ''}
						</div>
					{/if}
				{/if}
			</div>
		</section>
	</div>
</div>
