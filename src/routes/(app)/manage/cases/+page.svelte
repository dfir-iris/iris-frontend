<!--
  Manage Cases — Svelte port of the legacy /manage/cases page.

  Different in intent from `/cases` (which is the *overview*, focused on
  picking the next case to work on). This page is for case admins: lists
  every case the user can see, with per-row actions to close, reopen, or
  delete a case.

  Access scoping is fully server-side — `GET /api/v2/cases` (and the
  underlying `cases_filter` / `get_filtered_cases`) join against
  `UserCaseEffectiveAccess` and drop deny_all rows. The "Are you sure
  the user can see this?" question is therefore the backend's job, not
  ours: every row the list returns is one we're allowed to render. The
  per-row action endpoints (`/close`, `/reopen`, DELETE) re-check the
  user has full access to the specific case before mutating.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ArrowUpDownIcon,
		ArrowUpIcon,
		ArrowDownIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		ExternalLinkIcon,
		FolderIcon,
		LockIcon,
		LockOpenIcon,
		MoreHorizontalIcon,
		RefreshCwIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import { CaseService } from '$lib/services/case.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';

	const DEFAULT_PER_PAGE = 50;

	// Live form state. Same convention as the activities / dim-tasks
	// pages so the three list views feel consistent.
	let searchValue = $state('');
	// Tri-state: null = all, true = open only, false = closed only. We
	// default to "open only" because that's what an admin almost always
	// wants on this screen.
	let openFilter = $state<boolean | null>(true);
	let page = $state(1);
	let perPage = $state(DEFAULT_PER_PAGE);

	// Customer / owner filters. `null` = "any". We persist these as ids
	// in the URL so a shared link reconstructs the same view; the lookup
	// lists below are fetched once on mount so the `<select>` controls
	// can render friendly labels.
	let customerId = $state<number | null>(null);
	let ownerId = $state<number | null>(null);

	// ISO date strings (YYYY-MM-DD) from the native `<input type=date>`.
	// Each bound is independent — the backend ANDs them with `>=` / `<=`.
	let openFromDate = $state('');
	let openToDate = $state('');
	let closeFromDate = $state('');
	let closeToDate = $state('');

	let customers = $state<Customer[]>([]);
	let users = $state<User[]>([]);

	let loading = $state(false);
	let envelope = $state<Paginated<Case> | null>(null);

	// Sort state — `orderBy` is the server-side sort key (matches what
	// `build_filter_case_query` knows about: direct Cases columns plus
	// the four named handlers `owner` / `opened_by` / `customer_name` /
	// `state`). `null` ⇒ default ordering (the legacy table comes back
	// newest-open first). We persist both bits in the URL so a shared
	// link reconstructs the same view.
	type SortDir = 'asc' | 'desc';
	let orderBy = $state<string | null>(null);
	let sortDir = $state<SortDir>('desc');

	type QuerySnapshot = {
		search: string;
		isOpen: boolean | null;
		customerId: number | null;
		ownerId: number | null;
		openFromDate: string;
		openToDate: string;
		closeFromDate: string;
		closeToDate: string;
		orderBy: string | null;
		sortDir: SortDir;
	};
	let lastQuery = $state<QuerySnapshot | null>(null);

	// Confirmation dialog state. We keep a single dialog instance and
	// drive its title/message/handler dynamically — same pattern as the
	// alerts page elsewhere in the codebase.
	let dialogOpen = $state(false);
	let dialogTitle = $state('');
	let dialogMessage = $state('');
	let dialogConfirmText = $state('Confirm');
	let dialogConfirmVariant = $state<'destructive' | 'default'>('default');
	let pendingAction: (() => Promise<void>) | null = null;

	const snapshot = (): QuerySnapshot => ({
		search: searchValue.trim(),
		isOpen: openFilter,
		customerId,
		ownerId,
		openFromDate,
		openToDate,
		closeFromDate,
		closeToDate,
		orderBy,
		sortDir
	});

	const buildUrl = (q: QuerySnapshot, p: number, pp: number) => {
		const params = new URLSearchParams();
		if (q.search) params.set('q', q.search);
		if (q.isOpen !== null) params.set('open', q.isOpen ? '1' : '0');
		if (q.customerId !== null) params.set('customer_id', String(q.customerId));
		if (q.ownerId !== null) params.set('owner_id', String(q.ownerId));
		if (q.openFromDate) params.set('open_from', q.openFromDate);
		if (q.openToDate) params.set('open_to', q.openToDate);
		if (q.closeFromDate) params.set('close_from', q.closeFromDate);
		if (q.closeToDate) params.set('close_to', q.closeToDate);
		if (q.orderBy) params.set('order_by', q.orderBy);
		// Only emit `sort_dir` when there's actually a sort selected;
		// otherwise it'd be noise in the default URL.
		if (q.orderBy && q.sortDir !== 'desc') params.set('sort_dir', q.sortDir);
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

	const runQuery = async (q: QuerySnapshot, p: number) => {
		loading = true;
		try {
			// We go through /api/v2/cases (CaseService.list) rather than
			// /filter because we don't need the advanced filter shape on
			// this page — a coarse "name ILIKE q" + "is_open" is exactly
			// the legacy DataTables search did.
			const res = await CaseService.list({
				page: p,
				per_page: perPage,
				case_name: q.search || undefined,
				is_open: q.isOpen === null ? undefined : q.isOpen,
				case_customer_id: q.customerId ?? undefined,
				case_owner_id: q.ownerId ?? undefined,
				start_open_date: q.openFromDate || undefined,
				end_open_date: q.openToDate || undefined,
				start_close_date: q.closeFromDate || undefined,
				end_close_date: q.closeToDate || undefined,
				order_by: q.orderBy ?? undefined,
				sort_dir: q.orderBy ? q.sortDir : undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				envelope = res.data as Paginated<Case>;
			} else {
				envelope = null;
				toast({
					title: 'Failed to load cases',
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

	const setOpenFilter = (next: boolean | null) => {
		openFilter = next;
		void submit();
	};

	const clearAllFilters = () => {
		searchValue = '';
		openFilter = true;
		customerId = null;
		ownerId = null;
		openFromDate = '';
		openToDate = '';
		closeFromDate = '';
		closeToDate = '';
		orderBy = null;
		sortDir = 'desc';
		void submit();
	};

	// Column-header click handler. Three-state cycle on the same column:
	//   unsorted → desc → asc → unsorted.
	// Clicking a different column starts that column at `desc` because
	// for dates / counts that's almost always what the user wants first
	// (newest opens, latest closes, biggest SOC tickets, etc.). For text
	// columns it's a defensible default and one extra click flips it.
	const toggleSort = (key: string) => {
		if (orderBy !== key) {
			orderBy = key;
			sortDir = 'desc';
		} else if (sortDir === 'desc') {
			sortDir = 'asc';
		} else {
			// `asc` → back to unsorted
			orderBy = null;
			sortDir = 'desc';
		}
		void submit();
	};

	// Header icon: a neutral up/down arrow when this column isn't the
	// active sort, a directional arrow when it is. Keeping it as a
	// derived function rather than a snippet avoids the need to pass
	// state down through children.
	const sortIcon = (key: string) => {
		if (orderBy !== key) return ArrowUpDownIcon;
		return sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
	};

	const hasActiveFilters = $derived(
		!!searchValue ||
			openFilter !== true ||
			customerId !== null ||
			ownerId !== null ||
			!!openFromDate ||
			!!openToDate ||
			!!closeFromDate ||
			!!closeToDate ||
			orderBy !== null
	);

	// Re-submit immediately whenever a single-select filter changes —
	// matches the activities-page pattern. Date inputs use `onchange`
	// (not `oninput`) so a user typing 2025-... doesn't burn 7 requests
	// before they finish.
	const onCustomerChange = (e: Event) => {
		const v = (e.target as HTMLSelectElement).value;
		customerId = v === '' ? null : Number(v);
		void submit();
	};
	const onOwnerChange = (e: Event) => {
		const v = (e.target as HTMLSelectElement).value;
		ownerId = v === '' ? null : Number(v);
		void submit();
	};
	const onDateChange = () => {
		void submit();
	};

	// Reload the current page after a mutation so the row reflects the
	// new state. We re-run the *same* query rather than dropping back to
	// page 1 — losing the operator's place after closing a case would be
	// annoying when they're working through a backlog.
	const refreshAfterMutation = async () => {
		if (lastQuery) await runQuery(lastQuery, page);
	};

	const confirmThen = (
		title: string,
		message: string,
		confirmText: string,
		variant: 'destructive' | 'default',
		action: () => Promise<void>
	) => {
		dialogTitle = title;
		dialogMessage = message;
		dialogConfirmText = confirmText;
		dialogConfirmVariant = variant;
		pendingAction = action;
		dialogOpen = true;
	};

	const runPendingAction = () => {
		const fn = pendingAction;
		pendingAction = null;
		if (fn) void fn();
	};

	const closeCase = (c: Case) =>
		confirmThen(
			'Close case',
			`Close case #${c.case_id} "${c.case_name}"? Related alerts will be closed too.`,
			'Close case',
			'default',
			async () => {
				const res = await CaseService.close(c.case_id);
				if (res.ok) {
					toast({ title: `Case #${c.case_id} closed`, variant: 'success' });
					await refreshAfterMutation();
				} else {
					toast({
						title: 'Failed to close case',
						description: res.error?.message ?? 'Unknown error',
						variant: 'destructive'
					});
				}
			}
		);

	const reopenCase = (c: Case) =>
		confirmThen(
			'Reopen case',
			`Reopen case #${c.case_id} "${c.case_name}"? Related alerts will be moved back to "Merged".`,
			'Reopen case',
			'default',
			async () => {
				const res = await CaseService.reopen(c.case_id);
				if (res.ok) {
					toast({ title: `Case #${c.case_id} reopened`, variant: 'success' });
					await refreshAfterMutation();
				} else {
					toast({
						title: 'Failed to reopen case',
						description: res.error?.message ?? 'Unknown error',
						variant: 'destructive'
					});
				}
			}
		);

	const deleteCase = (c: Case) =>
		confirmThen(
			'Delete case',
			`Permanently delete case #${c.case_id} "${c.case_name}"? This cannot be undone and removes every note, IoC, asset, evidence, task and timeline event belonging to it.`,
			'Delete case',
			'destructive',
			async () => {
				const res = await CaseService.remove(c.case_id);
				// HTTP 204 → res.ok with no body. The api-service helper
				// surfaces that uniformly so we don't need to special-case
				// "deleted" here.
				if (res.ok) {
					toast({ title: `Case #${c.case_id} deleted`, variant: 'success' });
					await refreshAfterMutation();
				} else {
					toast({
						title: 'Failed to delete case',
						description: res.error?.message ?? 'Unknown error',
						variant: 'destructive'
					});
				}
			}
		);

	onMount(() => {
		const params = pageStore.url.searchParams;
		searchValue = params.get('q') ?? '';
		const o = params.get('open');
		openFilter = o === '1' ? true : o === '0' ? false : o === '' ? true : openFilter;
		// `null` (key missing) keeps the default. We use the literal "all"
		// to signal "all states" explicitly so the URL is round-trippable.
		if (params.get('open') === 'all') openFilter = null;

		const cid = Number(params.get('customer_id'));
		customerId = Number.isFinite(cid) && cid > 0 ? cid : null;
		const oid = Number(params.get('owner_id'));
		ownerId = Number.isFinite(oid) && oid > 0 ? oid : null;

		openFromDate = params.get('open_from') ?? '';
		openToDate = params.get('open_to') ?? '';
		closeFromDate = params.get('close_from') ?? '';
		closeToDate = params.get('close_to') ?? '';

		orderBy = params.get('order_by') || null;
		const sd = (params.get('sort_dir') ?? '').toLowerCase();
		sortDir = sd === 'asc' ? 'asc' : 'desc';

		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || DEFAULT_PER_PAGE;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;

		// Kick off lookup-list fetches independently from the main query.
		// We don't await them — the `<select>` controls render with bare
		// id fallbacks until the labels land, which is fine because the
		// hydrated id is already correct.
		void CustomersService.list().then((res) => {
			if (res.ok && Array.isArray(res.data)) {
				customers = (res.data as Customer[])
					.slice()
					.sort((a, b) => a.customer_name.localeCompare(b.customer_name));
			}
		});
		void UsersService.list().then((res) => {
			// `/manage/users/list` returns the legacy wrapper
			// `{ status, message, data: User[] }` — same shape the
			// UserPicker handles. Reproduce that unwrap here so a future
			// migration of the endpoint doesn't silently break the
			// owner filter.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const inner = (res?.data as any)?.data;
			const list = Array.isArray(inner)
				? (inner as User[])
				: Array.isArray(res?.data)
					? (res.data as User[])
					: [];
			users = list.slice().sort((a, b) => a.user_name.localeCompare(b.user_name));
		});

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

	// Cases have a hard "Closed" state semantically meaningful for the
	// action menu: closed cases can be reopened, open ones can be
	// closed. We key off the state name rather than `close_date` because
	// the legacy convention is that state is authoritative.
	const isClosed = (c: Case) =>
		(c.state?.state_name ?? '').toLowerCase() === 'closed';

	const stateStyle = (name: string | null | undefined) => {
		const s = (name ?? '').toLowerCase();
		if (s === 'open')
			return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		if (s === 'closed') return 'border-border bg-muted text-muted-foreground';
		if (s === 'containment' || s === 'investigation' || s === 'eradication')
			return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		if (s === 'recovery')
			return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		return 'border-border bg-muted text-muted-foreground';
	};
</script>

<svelte:head>
	<title>Manage cases | DFIR-IRIS</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-8">
	<header class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<FolderIcon size={28} class="!stroke-2" />
			<div>
				<h1 class="text-xl font-semibold">Cases management</h1>
				<p class="text-xs text-muted-foreground">
					Every case you have access to — close, reopen or delete from here.
				</p>
			</div>
		</div>

		<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
			<RefreshCwIcon size={14} class={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
	</header>

	<Card.Root class="shadow-elevation-1">
		<Card.Content class="flex flex-col gap-4 pt-6">
			<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
				<Input
					bind:value={searchValue}
					onkeydown={handleSearchKey}
					placeholder="Search by case name…"
					class="flex-1"
					aria-label="Search cases"
				/>
				<Button onclick={submit} disabled={loading}>
					{loading ? 'Searching…' : 'Search'}
				</Button>
			</div>

			<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
				<div class="flex items-center gap-1.5 text-xs">
					<span class="text-muted-foreground">State:</span>
					{#each [{ label: 'Open', value: true }, { label: 'Closed', value: false }, { label: 'All', value: null }] as choice (String(choice.value))}
						{@const active = openFilter === choice.value}
						<button
							type="button"
							aria-pressed={active}
							onclick={() => setOpenFilter(choice.value)}
							class="rounded-md border px-2 py-1 transition-colors {active
								? 'border-primary/40 bg-primary/10 text-foreground'
								: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
						>
							{choice.label}
						</button>
					{/each}
				</div>

				<!--
				  Single-value pickers for customer + owner. We stick with a
				  native `<select>` here rather than a popover combobox: the
				  legacy /manage/cases UI used a plain dropdown, the lookup
				  lists are small enough to render in one go, and we get
				  keyboard search for free.
				-->
				<div class="flex items-center gap-2 text-xs">
					<label class="text-muted-foreground" for="cases-customer">Customer</label>
					<select
						id="cases-customer"
						value={customerId === null ? '' : String(customerId)}
						onchange={onCustomerChange}
						class="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
					>
						<option value="">Any</option>
						{#each customers as c (c.customer_id)}
							<option value={String(c.customer_id)}>{c.customer_name}</option>
						{/each}
					</select>
				</div>

				<div class="flex items-center gap-2 text-xs">
					<label class="text-muted-foreground" for="cases-owner">Owner</label>
					<select
						id="cases-owner"
						value={ownerId === null ? '' : String(ownerId)}
						onchange={onOwnerChange}
						class="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
					>
						<option value="">Any</option>
						{#each users as u (u.user_id)}
							<option value={String(u.user_id)}>{u.user_name}</option>
						{/each}
					</select>
				</div>

				<!--
				  Date ranges. Two `<input type=date>` per side; each bound
				  is independent on the server (no need to pick both).
				-->
				<div class="flex items-center gap-1 text-xs">
					<span class="text-muted-foreground">Opened</span>
					<input
						type="date"
						aria-label="Opened from"
						bind:value={openFromDate}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
					<span class="text-muted-foreground">→</span>
					<input
						type="date"
						aria-label="Opened to"
						bind:value={openToDate}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
				</div>

				<div class="flex items-center gap-1 text-xs">
					<span class="text-muted-foreground">Closed</span>
					<input
						type="date"
						aria-label="Closed from"
						bind:value={closeFromDate}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
					<span class="text-muted-foreground">→</span>
					<input
						type="date"
						aria-label="Closed to"
						bind:value={closeToDate}
						onchange={onDateChange}
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					/>
				</div>

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
		<!--
		  Card.Header (title + pagination) stays visible during page
		  scroll. `top-0` anchors to the layout's page-scroll viewport
		  the same way the sticky `<thead>` below does — keeping the
		  prev/next buttons reachable without forcing the user back to
		  the top. `z-20` parks it above the sticky `<thead>` (z-10)
		  so column headers slide *under* it cleanly. `bg-card` is
		  opaque so rows don't bleed through during scroll.
		-->
		<Card.Header class="sticky top-0 z-20 flex flex-row items-center justify-between gap-2 rounded-t-xl bg-card">
			<div class="flex items-center gap-2">
				<Card.Title>Cases</Card.Title>
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
				<!--
				  Don't wrap the table in an inner `overflow-x-auto`. An
				  intermediate overflow ancestor becomes the scroll
				  container for any `sticky` descendant, so wrapping here
				  would anchor the sticky `<thead>` to a wrapper that
				  doesn't actually scroll vertically — and the header
				  wouldn't freeze when the user scrolls the page.
				-->
				<div class="rounded-md border">
					<table class="w-full text-sm">
						<!--
						  Sticky table header anchored to the layout's
						  page-scroll viewport. `top-[3.75rem]` parks it
						  below the sticky Card.Header above (which is
						  ~60px tall thanks to its `p-6` padding), so the
						  two strips stack cleanly instead of fighting
						  for y=0. An opaque background keeps rows from
						  bleeding through during scroll.
						-->
						<thead class="sticky top-[3.75rem] z-10 border-b bg-muted text-left text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/90">
							<tr>
								<!--
								  Sortable column headers. Each header is a button so
								  it inherits keyboard focus + Enter/Space activation;
								  `aria-sort` mirrors the active sort state so screen
								  readers announce it. The sort key strings match the
								  server-side handlers in `build_filter_case_query`
								  (direct Cases columns plus the four named handlers
								  `owner` / `opened_by` / `customer_name` / `state`).
								  Keep them in sync with that switch statement.
								-->
								{#each [
									{ key: 'case_id', label: 'ID', cls: 'w-16' },
									{ key: 'name', label: 'Name', cls: '' },
									{ key: 'customer_name', label: 'Customer', cls: 'w-44' },
									{ key: 'state', label: 'State', cls: 'w-28' },
									{ key: 'open_date', label: 'Open date', cls: 'w-40' },
									{ key: 'close_date', label: 'Close date', cls: 'w-40' },
									{ key: 'soc_id', label: 'SOC ticket', cls: 'w-28' },
									{ key: 'owner', label: 'Owner', cls: 'w-40' }
								] as col (col.key)}
									{@const SortIco = sortIcon(col.key)}
									{@const active = orderBy === col.key}
									<th
										aria-sort={active
											? sortDir === 'asc'
												? 'ascending'
												: 'descending'
											: 'none'}
										class="px-3 py-2 font-medium {col.cls}"
									>
										<button
											type="button"
											onclick={() => toggleSort(col.key)}
											class="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted {active
												? 'text-foreground'
												: ''}"
										>
											<span>{col.label}</span>
											<SortIco
												size={12}
												class={active ? 'opacity-100' : 'opacity-40'}
											/>
										</button>
									</th>
								{/each}
								<th class="w-10 px-3 py-2 text-right font-medium"></th>
							</tr>
						</thead>
						<tbody>
							{#each envelope.data as c (c.case_id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-3 py-2 text-xs tabular-nums text-muted-foreground">
										#{c.case_id}
									</td>
									<td class="px-3 py-2 text-xs">
										<a
											href={`/case/${c.case_id}`}
											class="text-primary hover:underline"
											title={c.case_name}
										>
											{c.case_name}
										</a>
									</td>
									<td class="px-3 py-2 text-xs">
										<span title={c.case_customer?.customer_name ?? ''}>
											{c.case_customer?.customer_name ?? '—'}
										</span>
									</td>
									<td class="px-3 py-2">
										<span
											class="inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide {stateStyle(
												c.state?.state_name
											)}"
										>
											{c.state?.state_name ?? '—'}
										</span>
									</td>
									<td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground tabular-nums">
										{formatDate(c.open_date)}
									</td>
									<td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground tabular-nums">
										{formatDate(c.close_date)}
									</td>
									<td class="px-3 py-2 text-xs">{c.case_soc_id || '—'}</td>
									<td class="px-3 py-2 text-xs">
										{c.owner?.user_name ?? c.owner?.user_login ?? '—'}
									</td>
									<td class="px-3 py-2 text-right">
										<!--
										  Per-row action menu. We deliberately keep "Open"
										  as a separate explicit link (top item) so the
										  most-common action is a single click; close /
										  reopen / delete sit under it for everything that
										  needs confirmation.
										-->
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												<Button
													variant="ghost"
													size="sm"
													class="h-7 w-7 p-0"
													aria-label={`Actions for case #${c.case_id}`}
												>
													<MoreHorizontalIcon size={14} />
												</Button>
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="w-48">
												<DropdownMenu.Item>
													{#snippet child({ props })}
														<a {...props} href={`/case/${c.case_id}`} class="flex items-center gap-2">
															<ExternalLinkIcon size={14} /> Open case
														</a>
													{/snippet}
												</DropdownMenu.Item>
												<DropdownMenu.Separator />
												{#if isClosed(c)}
													<DropdownMenu.Item onSelect={() => reopenCase(c)}>
														<LockOpenIcon size={14} class="mr-2" /> Reopen
													</DropdownMenu.Item>
												{:else}
													<DropdownMenu.Item onSelect={() => closeCase(c)}>
														<LockIcon size={14} class="mr-2" /> Close
													</DropdownMenu.Item>
												{/if}
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													onSelect={() => deleteCase(c)}
													class="text-destructive focus:bg-destructive/10 focus:text-destructive"
												>
													<Trash2Icon size={14} class="mr-2" /> Delete
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if envelope}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No cases match the current filters.
				</p>
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<ConfirmationDialog
	bind:open={dialogOpen}
	title={dialogTitle}
	message={dialogMessage}
	confirmText={dialogConfirmText}
	confirmButtonVariant={dialogConfirmVariant}
	onConfirm={runPendingAction}
	onCancel={() => (pendingAction = null)}
/>
