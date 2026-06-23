<!--
  User activities — Svelte port of the legacy /activities page.

  Legacy parity:
    • table-style listing of UserActivity rows (date, user, case, manual,
      from-API, description);
    • a checkbox to include non-case-related rows (login events, global
      tasks). The checkbox only does anything for users with the
      `all_activities_read` permission, since the case-scoped view in the
      backend already excludes non-case rows for everyone else.

  Improvements over the legacy DataTables setup:
    • server-side pagination (no more "max 10k entries" cap);
    • free-text search on activity description (server-side ILIKE);
    • clickable case names linking back to /case/<id>;
    • shareable URL state (page, search term, scope toggle).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		CheckIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		FileTextIcon,
		RefreshCwIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import CaseScopePicker from '$lib/components/common/selects/CaseScopePicker.svelte';
	import UserPicker from '$lib/components/common/selects/UserPicker.svelte';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	// We deliberately render a raw <table> rather than going through
	// `$lib/components/ui/table` — that "Table" root is actually an
	// ag-grid wrapper hard-coded to a demo dataset, so it's not suitable
	// as a generic table primitive. The TableBody / TableHead / TableRow
	// children are usable but adding the root would compile-error on
	// missing `class` and `children` props. Direct semantic markup keeps
	// the page simple and avoids the dependency.
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import { ActivitiesService, type ActivityRow } from '$lib/services/activities.service';
	import type { Paginated } from '$lib/services/api.service';

	const DEFAULT_PER_PAGE = 50;

	// Live form state. We snapshot it into `lastQuery` when we actually
	// fire a request so paginating doesn't re-read fields the user might
	// be editing mid-flight.
	let searchValue = $state('');
	let includeNonCase = $state(false);
	let page = $state(1);
	let perPage = $state(DEFAULT_PER_PAGE);

	// Multi-select scopes. We keep them as stringified ids so they
	// round-trip through the URL querystring without coercion.
	let selectedCaseIds = $state<string[]>([]);
	let selectedUserIds = $state<string[]>([]);

	// Label caches for the pickers' trigger summaries. Keyed by
	// stringified id so the picker can read directly off the selection.
	let caseLabelsById = $state<Record<string, string>>({});
	let userLabelsById = $state<Record<string, string>>({});

	// Source-of-event filter. `null` = "any", `true`/`false` = explicit.
	let isFromApi = $state<boolean | null>(null);
	let isManual = $state<boolean | null>(null);

	// Date window — empty string ⇒ no bound. Both inputs are `type=date`
	// so the value is already a YYYY-MM-DD string. We send them as-is;
	// the server's `datetime.fromisoformat` handles dateless ISO too.
	let dateFrom = $state('');
	let dateTo = $state('');

	let loading = $state(false);
	let envelope = $state<Paginated<ActivityRow> | null>(null);
	type QuerySnapshot = {
		search: string;
		includeNonCase: boolean;
		caseIds: number[];
		userIds: number[];
		isFromApi: boolean | null;
		isManual: boolean | null;
		dateFrom: string;
		dateTo: string;
	};
	let lastQuery = $state<QuerySnapshot | null>(null);

	const formatCaseLabel = (c: Case) => `#${c.case_id} · ${c.case_name}`;

	const resolveCaseLabel = async (id: number) => {
		const key = String(id);
		if (caseLabelsById[key]) return;
		const res = await CaseService.get(id);
		if (res.ok && res.data && typeof res.data !== 'string') {
			caseLabelsById = { ...caseLabelsById, [key]: formatCaseLabel(res.data as Case) };
		} else {
			caseLabelsById = { ...caseLabelsById, [key]: `#${id}` };
		}
	};

	const onCaseScopeChange = (ids: string[], labels: Record<string, string>) => {
		selectedCaseIds = ids;
		caseLabelsById = { ...caseLabelsById, ...labels };
		void submit();
	};

	const onUserScopeChange = (ids: string[], labels: Record<string, string>) => {
		selectedUserIds = ids;
		userLabelsById = { ...userLabelsById, ...labels };
		void submit();
	};

	// URL state: every filter is preserved so refresh / link-sharing
	// reconstructs the same view. We only emit params that diverge from
	// their default so a fresh "/" URL stays clean.
	const buildUrl = (q: QuerySnapshot, p: number, pp: number) => {
		const params = new URLSearchParams();
		if (q.search) params.set('q', q.search);
		if (q.includeNonCase) params.set('include_non_case', 'true');
		if (q.caseIds.length > 0) params.set('case_ids', q.caseIds.join(','));
		if (q.userIds.length > 0) params.set('user_ids', q.userIds.join(','));
		if (q.isFromApi !== null) params.set('is_from_api', String(q.isFromApi));
		if (q.isManual !== null) params.set('is_manual', String(q.isManual));
		if (q.dateFrom) params.set('date_from', q.dateFrom);
		if (q.dateTo) params.set('date_to', q.dateTo);
		if (p > 1) params.set('page', String(p));
		if (pp !== DEFAULT_PER_PAGE) params.set('per_page', String(pp));
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	};

	const writeUrl = (q: QuerySnapshot, p: number, pp: number) => {
		if (!browser) return;
		void goto(buildUrl(q, p, pp), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	};

	const snapshot = (): QuerySnapshot => ({
		search: searchValue.trim(),
		includeNonCase,
		caseIds: selectedCaseIds.map(Number).filter((n) => Number.isFinite(n)),
		userIds: selectedUserIds.map(Number).filter((n) => Number.isFinite(n)),
		isFromApi,
		isManual,
		dateFrom,
		dateTo
	});

	const runQuery = async (q: QuerySnapshot, p: number) => {
		loading = true;
		try {
			const res = await ActivitiesService.list({
				page: p,
				per_page: perPage,
				search: q.search,
				include_non_case: q.includeNonCase,
				case_ids: q.caseIds.length > 0 ? q.caseIds : undefined,
				user_ids: q.userIds.length > 0 ? q.userIds : undefined,
				is_from_api: q.isFromApi ?? undefined,
				is_manual: q.isManual ?? undefined,
				date_from: q.dateFrom || undefined,
				date_to: q.dateTo || undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				envelope = res.data as Paginated<ActivityRow>;
			} else {
				envelope = null;
				toast({
					title: 'Failed to load activities',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			loading = false;
		}
	};

	const submit = async () => {
		page = 1;
		lastQuery = snapshot();
		writeUrl(lastQuery, 1, perPage);
		await runQuery(lastQuery, 1);
	};

	const goToPage = async (target: number) => {
		if (!lastQuery || !envelope) return;
		const totalPages = envelope.last_page ?? 1;
		const clamped = Math.min(Math.max(1, target), totalPages || 1);
		if (clamped === page) return;
		page = clamped;
		writeUrl(lastQuery, clamped, perPage);
		await runQuery(lastQuery, clamped);
	};

	const refresh = async () => {
		if (!lastQuery) {
			await submit();
			return;
		}
		await runQuery(lastQuery, page);
		toast({ title: 'Refreshed', variant: 'success' });
	};

	const handleSearchKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			void submit();
		}
	};

	// React to the scope-toggle by re-querying immediately — same UX as
	// the legacy checkbox which fired off a new request on `change`.
	const onIncludeChange = (checked: boolean) => {
		includeNonCase = checked;
		void submit();
	};

	const clearAllFilters = () => {
		searchValue = '';
		includeNonCase = false;
		selectedCaseIds = [];
		selectedUserIds = [];
		isFromApi = null;
		isManual = null;
		dateFrom = '';
		dateTo = '';
		void submit();
	};

	// Tri-state helper used by the API/Manual chip groups. The button is
	// "active" when the current filter equals the chip's value. Clicking
	// an active chip clears the filter; clicking an inactive chip sets
	// it. Each click re-submits.
	const setApiFilter = (next: boolean | null) => {
		isFromApi = next;
		void submit();
	};
	const setManualFilter = (next: boolean | null) => {
		isManual = next;
		void submit();
	};

	const onDateChange = () => {
		void submit();
	};

	// Quick visual indicator: any non-default filter applied?
	const hasActiveFilters = $derived(
		!!searchValue ||
			includeNonCase ||
			selectedCaseIds.length > 0 ||
			selectedUserIds.length > 0 ||
			isFromApi !== null ||
			isManual !== null ||
			!!dateFrom ||
			!!dateTo
	);

	// Tri-state chip groups — derive the active/inactive flags up-front
	// so the template doesn't need `{@const}` at the wrong scope (those
	// only work inside control-flow blocks, not raw element children).
	const apiActive = $derived(isFromApi === true);
	const uiActive = $derived(isFromApi === false);
	const manualActive = $derived(isManual === true);
	const autoActive = $derived(isManual === false);

	onMount(() => {
		const params = pageStore.url.searchParams;
		searchValue = params.get('q') ?? '';
		includeNonCase = (params.get('include_non_case') ?? '').toLowerCase() === 'true';
		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || DEFAULT_PER_PAGE;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;

		const caseIdsRaw = params.get('case_ids') ?? '';
		const userIdsRaw = params.get('user_ids') ?? '';
		selectedCaseIds = caseIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
		selectedUserIds = userIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);

		// Fire-and-forget label resolution so trigger summaries stop
		// saying "Case #42" / "User #7" the moment the lookups land.
		for (const cid of selectedCaseIds) void resolveCaseLabel(Number(cid));

		const apiRaw = (params.get('is_from_api') ?? '').toLowerCase();
		isFromApi = apiRaw === 'true' ? true : apiRaw === 'false' ? false : null;
		const manualRaw = (params.get('is_manual') ?? '').toLowerCase();
		isManual = manualRaw === 'true' ? true : manualRaw === 'false' ? false : null;

		dateFrom = params.get('date_from') ?? '';
		dateTo = params.get('date_to') ?? '';

		lastQuery = snapshot();
		void runQuery(lastQuery, page);
	});

	const formatDate = (iso: string | null) => {
		if (!iso) return '—';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : mediumDateTimeFormatter(d);
	};

	const range = $derived.by(() => {
		if (!envelope || envelope.total === 0) return null;
		const start = (envelope.current_page - 1) * perPage + 1;
		const end = Math.min(envelope.current_page * perPage, envelope.total);
		return { start, end, total: envelope.total };
	});
</script>

<svelte:head>
	<title>Activities | DFIR-IRIS</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-8">
	<header class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<FileTextIcon size={28} class="!stroke-2" />
			<div>
				<h1 class="text-xl font-semibold">User activities</h1>
				<p class="text-xs text-muted-foreground">
					Recent activity across the cases you have access to.
				</p>
			</div>
		</div>

		<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
			<RefreshCwIcon size={14} class={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
	</header>

	<!--
	  Sticky filter card. The page-level scroll lives on the (app)
	  layout's overflow-auto wrapper, so `sticky top-0` here pins
	  against that scroll container's viewport — same anchor the
	  topbar uses, so the card slides up under the topbar's z-10 and
	  stops at y=0 of the scroll viewport.

	  `z-20` keeps the card above the results card below; the page
	  header doesn't need to be sticky — once the user starts filtering,
	  what matters is keeping the controls reachable, not the title.

	  `backdrop-blur` + a semi-transparent background lets the rows
	  scrolling underneath show through subtly, so it reads as "floating
	  filter bar" rather than "another opaque card eating the viewport".
	-->
	<Card.Root class="sticky top-0 z-20 bg-card/95 shadow-elevation-1 backdrop-blur supports-[backdrop-filter]:bg-card/85">
		<Card.Content class="flex flex-col gap-4 pt-6">
			<!--
			  Row 1: free-text search + the two scope pickers + Search.
			  Pickers fire their own submit() on change so the user
			  doesn't have to re-click Search to apply a multi-select.
			-->
			<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
				<Input
					bind:value={searchValue}
					onkeydown={handleSearchKey}
					placeholder="Search in activity description…"
					class="flex-1"
					aria-label="Search activities"
				/>
				<div class="lg:w-72">
					<CaseScopePicker
						values={selectedCaseIds}
						labels={caseLabelsById}
						onChange={onCaseScopeChange}
					/>
				</div>
				<div class="lg:w-64">
					<UserPicker
						values={selectedUserIds}
						labels={userLabelsById}
						onChange={onUserScopeChange}
					/>
				</div>
				<Button onclick={submit} disabled={loading}>
					{loading ? 'Searching…' : 'Search'}
				</Button>
			</div>

			<!--
			  Row 2: date window + source-of-event chip groups. Date
			  inputs use the native picker; both ends are optional so
			  users can give an open-ended bound (e.g. "since 2024-01").
			-->
			<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
				<div class="flex items-center gap-2 text-xs">
					<label class="text-muted-foreground" for="activities-date-from">From</label>
					<input
						id="activities-date-from"
						type="date"
						bind:value={dateFrom}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
				</div>
				<div class="flex items-center gap-2 text-xs">
					<label class="text-muted-foreground" for="activities-date-to">To</label>
					<input
						id="activities-date-to"
						type="date"
						bind:value={dateTo}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
				</div>

				<!-- Source chips: API / Manual / Any. Each chip group is
				     tri-state; clicking the active chip clears its filter. -->
				<div class="flex items-center gap-1.5 text-xs">
					<span class="text-muted-foreground">Source:</span>
					<button
						type="button"
						aria-pressed={apiActive}
						onclick={() => setApiFilter(apiActive ? null : true)}
						class="rounded-md border px-2 py-1 transition-colors {apiActive
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						From API
					</button>
					<button
						type="button"
						aria-pressed={uiActive}
						onclick={() => setApiFilter(uiActive ? null : false)}
						class="rounded-md border px-2 py-1 transition-colors {uiActive
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						From UI
					</button>
				</div>

				<div class="flex items-center gap-1.5 text-xs">
					<span class="text-muted-foreground">Input:</span>
					<button
						type="button"
						aria-pressed={manualActive}
						onclick={() => setManualFilter(manualActive ? null : true)}
						class="rounded-md border px-2 py-1 transition-colors {manualActive
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						Manual
					</button>
					<button
						type="button"
						aria-pressed={autoActive}
						onclick={() => setManualFilter(autoActive ? null : false)}
						class="rounded-md border px-2 py-1 transition-colors {autoActive
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						Automated
					</button>
				</div>

				<label class="inline-flex items-center gap-2 text-xs text-muted-foreground">
					<Checkbox
						checked={includeNonCase}
						onCheckedChange={(v) => onIncludeChange(v === true)}
					/>
					Include non-case-related (login, global tasks…)
				</label>

				{#if hasActiveFilters}
					<button
						type="button"
						class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						onclick={clearAllFilters}
					>
						Clear all filters
					</button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Card.Title>Activity feed</Card.Title>
				{#if range}
					<span class="text-xs text-muted-foreground tabular-nums">
						{range.start}–{range.end} of {range.total}
					</span>
				{:else if envelope && envelope.total === 0}
					<span class="text-xs text-muted-foreground">No results</span>
				{/if}
			</div>

			{#if envelope && (envelope.last_page ?? 0) > 1}
				<div class="flex items-center gap-2 text-xs">
					<Button
						variant="outline"
						size="sm"
						class="h-7 px-2"
						disabled={loading || page <= 1}
						onclick={() => goToPage(page - 1)}
						aria-label="Previous page"
					>
						<ChevronLeftIcon size={14} />
					</Button>
					<span class="tabular-nums text-muted-foreground">
						Page {envelope.current_page} / {envelope.last_page}
					</span>
					<Button
						variant="outline"
						size="sm"
						class="h-7 px-2"
						disabled={loading || page >= (envelope.last_page ?? 1)}
						onclick={() => goToPage(page + 1)}
						aria-label="Next page"
					>
						<ChevronRightIcon size={14} />
					</Button>
				</div>
			{/if}
		</Card.Header>

		<Card.Content>
			{#if loading && !envelope}
				<div class="space-y-2">
					{#each Array(8) as _}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else if envelope && envelope.data.length > 0}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<tr>
								<th class="w-44 px-3 py-2 font-medium">Date</th>
								<th class="w-40 px-3 py-2 font-medium">User</th>
								<th class="w-56 px-3 py-2 font-medium">Case</th>
								<th class="w-20 px-3 py-2 text-center font-medium">Manual</th>
								<th class="w-20 px-3 py-2 text-center font-medium">API</th>
								<th class="px-3 py-2 font-medium">Activity</th>
							</tr>
						</thead>
						<tbody>
							{#each envelope.data as row (row.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground tabular-nums">
										{formatDate(row.activity_date)}
									</td>
									<td class="whitespace-nowrap px-3 py-2 text-xs">
										{row.user_name ?? '—'}
									</td>
									<td class="px-3 py-2 text-xs">
										{#if row.case_id !== null && row.case_name}
											<a
												href={`/case/${row.case_id}`}
												class="truncate text-primary hover:underline"
												title={row.case_name}
											>
												#{row.case_id} · {row.case_name}
											</a>
										{:else if row.case_id !== null}
											<a
												href={`/case/${row.case_id}`}
												class="text-primary hover:underline"
											>
												#{row.case_id}
											</a>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-center">
										{#if row.user_input}
											<CheckIcon size={14} class="mx-auto text-emerald-500" />
										{:else}
											<XIcon size={14} class="mx-auto text-muted-foreground/60" />
										{/if}
									</td>
									<td class="px-3 py-2 text-center">
										{#if row.is_from_api}
											<CheckIcon size={14} class="mx-auto text-emerald-500" />
										{:else}
											<XIcon size={14} class="mx-auto text-muted-foreground/60" />
										{/if}
									</td>
									<td class="px-3 py-2 text-xs">
										<div class="flex items-start gap-2">
											<span class="line-clamp-2 flex-1" title={row.activity_desc ?? ''}>
												{row.activity_desc ?? '—'}
											</span>
											{#if (row.occurrences ?? 1) > 1}
												<!--
												  Coalesce indicator: the backend collapsed N near-
												  duplicate rows (same user / case / description
												  within a minute) into this one. Render as a small
												  count chip rather than expanding inline so the
												  feed stays scannable.
												-->
												<span
													class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground"
													title={`${row.occurrences} occurrences in the same minute`}
												>
													×{row.occurrences}
												</span>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if envelope}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No activity matches the current filters.
				</p>
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
