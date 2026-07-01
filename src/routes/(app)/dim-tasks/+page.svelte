<!--
  Dim Tasks — Svelte port of the legacy /dim/tasks page.

  Legacy parity:
    • a paginated table of Celery (DFIR-IRIS module) tasks, newest first;
    • per-row drill-in showing the task's full AsyncResult metadata (logs,
      traceback, module + hook names, originating user / case).

  Improvements over the legacy DataTables setup:
    • server-side pagination instead of "fetch the last N";
    • free-text search across task name + Celery task id;
    • status quick-filter chips (Success / Failure / Pending / Started);
    • shareable URL state (page, query, status);
    • clickable case-id linking back to /case/<id>;
    • inline detail panel (Sheet) — no full-page modal reload like
      `/dim/tasks/status/<id>` used to do.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ChevronLeftIcon,
		ChevronRightIcon,
		FileStackIcon,
		RefreshCwIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Sheet from '$lib/components/ui/sheet';
	import { toast } from '$lib/components/ui/toast';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import {
		DimTasksService,
		type DimTaskRow,
		type DimTaskDetailEnvelope
	} from '$lib/services/dim-tasks.service';
	import type { Paginated } from '$lib/services/api.service';

	const DEFAULT_PER_PAGE = 50;

	// Live form state. Mirrors the activities page so the two list views
	// behave the same — Search submits, chips submit on click, URL state
	// is reconstructed on mount.
	let searchValue = $state('');
	let statusFilter = $state<string | null>(null);
	let page = $state(1);
	let perPage = $state(DEFAULT_PER_PAGE);

	let loading = $state(false);
	let envelope = $state<Paginated<DimTaskRow> | null>(null);

	type QuerySnapshot = { search: string; status: string | null };
	let lastQuery = $state<QuerySnapshot | null>(null);

	// Detail panel state. `detailTaskId` doubles as the "is panel open"
	// flag — set it to a task id to open, `null` to close. We keep the
	// payload separate so we can show a spinner while it loads.
	let detailTaskId = $state<string | null>(null);
	let detailLoading = $state(false);
	let detailEnvelope = $state<DimTaskDetailEnvelope | null>(null);

	const snapshot = (): QuerySnapshot => ({
		search: searchValue.trim(),
		status: statusFilter
	});

	const buildUrl = (q: QuerySnapshot, p: number, pp: number) => {
		const params = new URLSearchParams();
		if (q.search) params.set('q', q.search);
		if (q.status) params.set('status', q.status);
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
			const res = await DimTasksService.list({
				page: p,
				per_page: perPage,
				search: q.search,
				status: q.status ?? undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				envelope = res.data as Paginated<DimTaskRow>;
			} else {
				envelope = null;
				toast({
					title: 'Failed to load tasks',
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
		// If a detail panel is open, refresh its contents too so the
		// "Refresh" button isn't half-useful for somebody who's drilled in
		// on a still-running task.
		if (detailTaskId) await loadDetail(detailTaskId);
		toast({ title: 'Refreshed', variant: 'success' });
	};

	const handleSearchKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			void submit();
		}
	};

	const setStatus = (next: string | null) => {
		// Clicking the active chip clears the filter — same tri-state
		// pattern the activities page uses.
		statusFilter = statusFilter === next ? null : next;
		void submit();
	};

	const clearAllFilters = () => {
		searchValue = '';
		statusFilter = null;
		void submit();
	};

	const loadDetail = async (taskId: string) => {
		detailLoading = true;
		try {
			const res = await DimTasksService.get(taskId);
			if (res.ok && res.data && typeof res.data !== 'string') {
				detailEnvelope = res.data as DimTaskDetailEnvelope;
			} else {
				detailEnvelope = null;
				toast({
					title: 'Failed to load task',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			detailLoading = false;
		}
	};

	const openDetail = (taskId: string) => {
		detailTaskId = taskId;
		detailEnvelope = null;
		void loadDetail(taskId);
	};

	const closeDetail = () => {
		detailTaskId = null;
		detailEnvelope = null;
	};

	const hasActiveFilters = $derived(!!searchValue || statusFilter !== null);

	onMount(() => {
		const params = pageStore.url.searchParams;
		searchValue = params.get('q') ?? '';
		statusFilter = params.get('status') || null;
		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || DEFAULT_PER_PAGE;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;
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

	// Status → chip styling. Lower-cased compare so we don't get tripped
	// up by Celery sometimes emitting "SUCCESS" and the projection layer
	// sometimes emitting "success".
	const stateStyle = (state: string | null | undefined) => {
		const s = (state ?? '').toLowerCase();
		if (s === 'success')
			return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		if (s === 'failure' || s === 'failed' || s === 'error')
			return 'border-destructive/40 bg-destructive/10 text-destructive';
		if (s === 'pending')
			return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		if (s === 'started' || s === 'running')
			return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		if (s === 'retry')
			return 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300';
		return 'border-border bg-muted text-muted-foreground';
	};

	// Status chip buttons in the filter card. Keep them lowercase here
	// even though we send uppercase to the API — Celery itself stores
	// them uppercase (SUCCESS / FAILURE / …) so that's what the server's
	// exact-match needs.
	const STATUS_CHOICES: Array<{ label: string; value: string }> = [
		{ label: 'Success', value: 'SUCCESS' },
		{ label: 'Failure', value: 'FAILURE' },
		{ label: 'Pending', value: 'PENDING' },
		{ label: 'Started', value: 'STARTED' },
		{ label: 'Retry', value: 'RETRY' }
	];

	// Entries to show in the detail panel's key/value block. We split
	// "Logs" + "Traceback" out so they get their own visually distinct
	// sections — the legacy modal does the same thing.
	const detailEntries = $derived.by(() => {
		if (!detailEnvelope?.details) return [] as Array<[string, unknown]>;
		return Object.entries(detailEnvelope.details).filter(
			([k, v]) => k !== 'Logs' && k !== 'Traceback' && v !== null && v !== undefined
		);
	});

	const detailLogs = $derived.by(() => {
		const raw = detailEnvelope?.details?.Logs;
		return Array.isArray(raw) ? (raw as unknown[]) : null;
	});

	const detailTraceback = $derived.by(() => {
		const raw = detailEnvelope?.details?.Traceback;
		return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
	});
</script>

<svelte:head>
	<title>Dim Tasks</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-8">
	<header class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<FileStackIcon size={28} class="!stroke-2" />
			<div>
				<h1 class="text-xl font-semibold">DFIR-IRIS modules tasks</h1>
				<p class="text-xs text-muted-foreground">
					Background jobs dispatched by IRIS modules — newest first.
				</p>
			</div>
		</div>

		<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
			<RefreshCwIcon size={14} class={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
	</header>

	<!--
	  Sticky filter card. Same anchor + z-index strategy as the activities
	  page so the two list views feel consistent under scroll.
	-->
	<!--
	  Filter card scrolls naturally with the page. The sticky slot is
	  owned by the results Card.Header below so the pager + "N-M of X"
	  stays visible on long scrolls; two sticky tops anchored to the
	  same scroll container fight for y=0 and visually collide.
	-->
	<Card.Root class="shadow-elevation-1">
		<Card.Content class="flex flex-col gap-4 pt-6">
			<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
				<Input
					bind:value={searchValue}
					onkeydown={handleSearchKey}
					placeholder="Search by task name or task id…"
					class="flex-1"
					aria-label="Search dim tasks"
				/>
				<Button onclick={submit} disabled={loading}>
					{loading ? 'Searching…' : 'Search'}
				</Button>
			</div>

			<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
				<div class="flex flex-wrap items-center gap-1.5 text-xs">
					<span class="text-muted-foreground">Status:</span>
					{#each STATUS_CHOICES as choice (choice.value)}
						{@const active = statusFilter === choice.value}
						<button
							type="button"
							aria-pressed={active}
							onclick={() => setStatus(choice.value)}
							class="rounded-md border px-2 py-1 transition-colors {active
								? 'border-primary/40 bg-primary/10 text-foreground'
								: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
						>
							{choice.label}
						</button>
					{/each}
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
		  Card.Header (title + pagination) is sticky at `top-0` of the
		  page scroll viewport so the pager stays reachable mid-scroll.
		  Same convention as Manage Cases / Activities. `z-20` parks it
		  above the sticky `<thead>` (z-10) below.
		-->
		<Card.Header class="sticky top-0 z-20 flex flex-row items-center justify-between gap-2 rounded-t-xl bg-card">
			<div class="flex items-center gap-2">
				<Card.Title>Tasks</Card.Title>
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
				  No inner `overflow-x-auto`: that ancestor would
				  intercept the sticky `<thead>` and anchor it to a
				  wrapper that doesn't scroll vertically.
				-->
				<div class="rounded-md border">
					<table class="w-full text-sm">
						<!--
						  Sticky table header parked below the sticky
						  Card.Header above (~60px from its `p-6`).
						-->
						<thead class="sticky top-[3.75rem] z-10 border-b bg-muted text-left text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/90">
							<tr>
								<th class="w-32 px-3 py-2 font-medium">State</th>
								<th class="w-44 px-3 py-2 font-medium">Date ended</th>
								<th class="w-40 px-3 py-2 font-medium">Case</th>
								<th class="px-3 py-2 font-medium">Module · hook</th>
								<th class="w-40 px-3 py-2 font-medium">Initiated by</th>
								<th class="w-56 px-3 py-2 font-medium">Task ID</th>
							</tr>
						</thead>
						<tbody>
							{#each envelope.data as row (row.task_id)}
								<tr
									class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
									onclick={() => openDetail(row.task_id)}
								>
									<td class="px-3 py-2">
										<span
											class="inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide {stateStyle(
												row.state
											)}"
										>
											{row.state ?? '—'}
										</span>
									</td>
									<td class="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground tabular-nums">
										{formatDate(row.date_done)}
									</td>
									<td class="px-3 py-2 text-xs">
										{#if row.case_id !== null}
											<!-- Stop propagation so clicking the link
											     opens the case, not the side panel. -->
											<a
												href={`/case/${row.case_id}`}
												class="text-primary hover:underline"
												onclick={(e) => e.stopPropagation()}
											>
												#{row.case_id}
											</a>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
									<td class="px-3 py-2 text-xs">
										<span class="line-clamp-2" title={row.module ?? ''}>
											{row.module ?? '—'}
										</span>
									</td>
									<td class="whitespace-nowrap px-3 py-2 text-xs">{row.user}</td>
									<td class="whitespace-nowrap px-3 py-2 font-mono text-2xs text-muted-foreground">
										{row.task_id}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if envelope}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No tasks match the current filters.
				</p>
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<!--
  Detail side panel. `open` is driven by `detailTaskId` — bits-ui calls
  `onOpenChange(false)` on backdrop click / Esc, which `closeDetail`
  hooks to clear both the id and the payload (so we don't briefly flash
  stale content the next time the panel opens for a different task).
-->
<Sheet.Root
	open={detailTaskId !== null}
	onOpenChange={(o) => {
		if (!o) closeDetail();
	}}
>
	<Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-xl">
		<Sheet.Header>
			<Sheet.Title>Task details</Sheet.Title>
			<Sheet.Description>
				{#if detailTaskId}
					<span class="font-mono text-2xs">{detailTaskId}</span>
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		{#if detailLoading && !detailEnvelope}
			<div class="mt-4 space-y-2">
				{#each Array(6) as _}
					<Skeleton class="h-6 w-full" />
				{/each}
			</div>
		{:else if detailEnvelope}
			<div class="mt-4 flex flex-col gap-5 text-xs">
				<!-- Row-style summary (the same fields the table shows) -->
				<section class="rounded-md border bg-muted/30 p-3">
					<div class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
						<span class="text-muted-foreground">State</span>
						<span>
							<span
								class="inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide {stateStyle(
									detailEnvelope.row.state
								)}"
							>
								{detailEnvelope.row.state ?? '—'}
							</span>
						</span>
						<span class="text-muted-foreground">Date ended</span>
						<span class="tabular-nums">{formatDate(detailEnvelope.row.date_done)}</span>
						<span class="text-muted-foreground">Case</span>
						<span>
							{#if detailEnvelope.row.case_id !== null}
								<a
									href={`/case/${detailEnvelope.row.case_id}`}
									class="text-primary hover:underline"
								>
									#{detailEnvelope.row.case_id}
								</a>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</span>
						<span class="text-muted-foreground">Module · hook</span>
						<span class="break-all">{detailEnvelope.row.module ?? '—'}</span>
						<span class="text-muted-foreground">Initiated by</span>
						<span>{detailEnvelope.row.user}</span>
					</div>
				</section>

				<!-- Free-form key/value block from `dim_tasks_get` -->
				{#if detailEntries.length > 0}
					<section>
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							AsyncResult
						</h3>
						<div class="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 rounded-md border p-3">
							{#each detailEntries as [k, v] (k)}
								<span class="text-muted-foreground">{k}</span>
								<span class="break-all">{String(v)}</span>
							{/each}
						</div>
					</section>
				{/if}

				{#if detailLogs && detailLogs.length > 0}
					<section>
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Logs
						</h3>
						<ul class="space-y-1 rounded-md border bg-muted/20 p-3 font-mono text-2xs">
							{#each detailLogs as line, i (i)}
								<li class="whitespace-pre-wrap break-words">{String(line)}</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if detailTraceback}
					<section>
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
							Traceback
						</h3>
						<pre
							class="overflow-x-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-2xs">{detailTraceback}</pre>
					</section>
				{/if}
			</div>
		{:else}
			<p class="mt-4 text-sm text-muted-foreground">No data.</p>
		{/if}
	</Sheet.Content>
</Sheet.Root>
