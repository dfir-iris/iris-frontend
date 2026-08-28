<!--
  Inline multi-select case picker for scope-filtering searches.

  Renders a trigger button that pops a dropdown containing:
    • a typeahead input bound to `quick_search` (server-side filter)
    • an infinite-scroll list of cases (owner-first when no query)
    • per-row checkboxes for multi-select
    • a "Select all / Deselect all" bar that operates on the
      *currently-loaded* result set (i.e. respects the active typeahead
      query and any pages already paginated in).

  Empty selection = "All accessible cases", which is also the default
  state. The mechanics — quick_search debounce, parallel owner+everyone
  fetch, request-sequence guard against stale responses, scroll-driven
  pagination — are the same as `SwitchContextModal`. We just render
  inline (Popover, not Dialog).
-->
<script lang="ts">
	import { FolderIcon, SearchIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import { current_user } from '$lib/stores/auth.store';

	type Props = {
		// Stringified case ids currently in the scope; `[]` ≡ "all".
		values: string[];
		// Optional label cache keyed by stringified case id, so we can
		// summarise the selection in the trigger without re-fetching.
		labels?: Record<string, string>;
		// Fired whenever the selection changes. We hand back both the new
		// id list and any labels we resolved client-side so the parent
		// can keep its summary cache up to date.
		onChange: (ids: string[], labels: Record<string, string>) => void;
		// Tailwind class for the trigger; defaults to a full-width sm
		// button matching the surrounding form rows.
		triggerClass?: string;
	};

	let { values, labels = {}, onChange, triggerClass = '' }: Props = $props();

	const PAGE_SIZE = 30;
	const SEARCH_DEBOUNCE_MS = 250;

	type Mode = 'default' | 'search';

	let open = $state(false);
	let cases = $state<Case[]>([]);
	let mode = $state<Mode>('default');
	let searchText = $state('');

	// Pagination cursors. Default mode walks two parallel queries
	// (owner-first, then everyone), search mode walks one.
	let ownerNextPage = $state<number | null>(1);
	let allNextPage = $state<number | null>(1);
	let searchNextPage = $state<number | null>(1);

	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	let listEl: HTMLDivElement | null = $state(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let requestSeq = 0;

	const currentUserId = $derived($current_user?.id ?? null);

	const caseLabel = (c: Case) => {
		const trimmed = (c.case_name ?? '').trim();
		return trimmed !== '' ? `#${c.case_id} · ${trimmed}` : `#${c.case_id}`;
	};

	// `values` set form for fast lookup in the render loop. Re-derived
	// whenever the parent's array reference changes.
	const valueSet = $derived(new Set(values));

	const isSelected = (c: Case) => valueSet.has(String(c.case_id));

	// Emit a new selection without mutating the parent's array. We also
	// fold any newly-known labels into the parent's cache so the trigger
	// summary stays fresh after a typeahead-picked case is added.
	const emit = (next: string[]) => {
		const newLabels: Record<string, string> = {};
		for (const c of cases) {
			const k = String(c.case_id);
			if (next.includes(k)) newLabels[k] = caseLabel(c);
		}
		onChange(next, newLabels);
	};

	const toggle = (c: Case) => {
		const k = String(c.case_id);
		if (valueSet.has(k)) {
			emit(values.filter((x) => x !== k));
		} else {
			emit([...values, k]);
		}
	};

	const allLoadedIds = $derived(cases.map((c) => String(c.case_id)));

	// "Select all" / "Deselect all" operate over the *currently loaded*
	// page of results — i.e. respect the active typeahead query. If the
	// user has scrolled and fetched more, those are included; pages we
	// haven't fetched are not, because we don't want a bulk action to
	// silently widen the selection beyond what the user can see.
	const allLoadedSelected = $derived(
		allLoadedIds.length > 0 && allLoadedIds.every((id) => valueSet.has(id))
	);

	const selectAllLoaded = () => {
		const merged = Array.from(new Set([...values, ...allLoadedIds]));
		emit(merged);
	};

	const deselectAllLoaded = () => {
		const loaded = new Set(allLoadedIds);
		emit(values.filter((v) => !loaded.has(v)));
	};

	const clearAll = () => emit([]);

	const isOwnedByCurrentUser = (c: Case) => {
		if (currentUserId === null) return false;
		const ownerId = c.owner?.id ?? c.owner?.user_id ?? c.user_id;
		return ownerId === currentUserId;
	};

	const appendUnique = (existing: Case[], incoming: Case[]) => {
		const seen = new Set(existing.map((c) => c.case_id));
		const merged = existing.slice();
		for (const c of incoming) {
			if (!seen.has(c.case_id)) {
				seen.add(c.case_id);
				merged.push(c);
			}
		}
		return merged;
	};

	const fetchPage = async (
		params: Parameters<typeof CaseService.list>[0]
	): Promise<{ data: Case[]; nextPage: number | null }> => {
		const res = await CaseService.list(params);
		if (!res.ok || !res.data) {
			throw new Error(res.error?.message ?? 'Failed to load cases');
		}
		const paginated = res.data as Paginated<Case>;
		return {
			data: paginated.data ?? [],
			nextPage: paginated.next_page ?? null
		};
	};

	const resetState = () => {
		cases = [];
		ownerNextPage = 1;
		allNextPage = 1;
		searchNextPage = 1;
		error = null;
		if (listEl) listEl.scrollTop = 0;
	};

	const loadInitial = async () => {
		const seq = ++requestSeq;
		loading = true;
		error = null;
		try {
			if (mode === 'search') {
				const trimmed = searchText.trim();
				const { data, nextPage } = await fetchPage({
					page: 1,
					per_page: PAGE_SIZE,
					quick_search: trimmed === '' ? undefined : trimmed,
					order_by: 'open_date',
					sort_dir: 'desc'
				});
				if (seq !== requestSeq) return;
				cases = data;
				searchNextPage = nextPage;
			} else {
				const ownerReq =
					currentUserId !== null
						? fetchPage({
								page: 1,
								per_page: PAGE_SIZE,
								case_owner_id: currentUserId,
								order_by: 'open_date',
								sort_dir: 'desc'
							})
						: Promise.resolve({ data: [] as Case[], nextPage: null as number | null });

				const allReq = fetchPage({
					page: 1,
					per_page: PAGE_SIZE,
					order_by: 'open_date',
					sort_dir: 'desc'
				});

				const [ownerRes, allRes] = await Promise.all([ownerReq, allReq]);
				if (seq !== requestSeq) return;

				ownerNextPage = ownerRes.nextPage;
				allNextPage = allRes.nextPage;

				const merged = appendUnique(ownerRes.data, allRes.data);
				cases = merged.slice(0, PAGE_SIZE);
			}
		} catch (e) {
			if (seq !== requestSeq) return;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	};

	const loadMore = async () => {
		if (loading || loadingMore) return;
		const seq = ++requestSeq;
		loadingMore = true;
		try {
			if (mode === 'search') {
				if (searchNextPage === null) return;
				const trimmed = searchText.trim();
				const { data, nextPage } = await fetchPage({
					page: searchNextPage,
					per_page: PAGE_SIZE,
					quick_search: trimmed === '' ? undefined : trimmed,
					order_by: 'open_date',
					sort_dir: 'desc'
				});
				if (seq !== requestSeq) return;
				cases = appendUnique(cases, data);
				searchNextPage = nextPage;
			} else {
				if (ownerNextPage !== null && currentUserId !== null) {
					const { data, nextPage } = await fetchPage({
						page: ownerNextPage,
						per_page: PAGE_SIZE,
						case_owner_id: currentUserId,
						order_by: 'open_date',
						sort_dir: 'desc'
					});
					if (seq !== requestSeq) return;
					cases = appendUnique(cases, data);
					ownerNextPage = nextPage;
				} else if (allNextPage !== null) {
					const { data, nextPage } = await fetchPage({
						page: allNextPage,
						per_page: PAGE_SIZE,
						order_by: 'open_date',
						sort_dir: 'desc'
					});
					if (seq !== requestSeq) return;
					cases = appendUnique(cases, data);
					allNextPage = nextPage;
				}
			}
		} catch (e) {
			if (seq !== requestSeq) return;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === requestSeq) loadingMore = false;
		}
	};

	const hasMore = $derived.by(() => {
		if (mode === 'search') return searchNextPage !== null;
		return ownerNextPage !== null || allNextPage !== null;
	});

	const onScroll = () => {
		if (!listEl || !hasMore || loading || loadingMore) return;
		const threshold = 96;
		if (listEl.scrollTop + listEl.clientHeight + threshold >= listEl.scrollHeight) {
			void loadMore();
		}
	};

	const onSearchInput = (next: string) => {
		searchText = next;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const target: Mode = searchText.trim() === '' ? 'default' : 'search';
			mode = target;
			resetState();
			void loadInitial();
		}, SEARCH_DEBOUNCE_MS);
	};

	// Reload when the popover opens. We deliberately do NOT reload on
	// every open — that would discard the user's typed query if they
	// re-open after closing. So we only initialise once per "open
	// session" using `didLoadForOpen`.
	let didLoadForOpen = false;
	$effect(() => {
		if (!open) {
			didLoadForOpen = false;
			if (searchTimer) {
				clearTimeout(searchTimer);
				searchTimer = null;
			}
			return;
		}
		if (!didLoadForOpen) {
			didLoadForOpen = true;
			mode = 'default';
			searchText = '';
			resetState();
			void loadInitial();
		}
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		<Button
			type="button"
			variant="outline"
			size="sm"
			class={`h-9 w-full justify-between gap-2 font-normal ${triggerClass}`}
		>
			<span class="truncate text-left">
				{#if values.length === 0}
					<span class="text-muted-foreground">All accessible cases</span>
				{:else if values.length === 1}
					{labels[values[0]] ?? `Case #${values[0]}`}
				{:else if values.length === 2}
					{labels[values[0]] ?? `#${values[0]}`},
					{labels[values[1]] ?? `#${values[1]}`}
				{:else}
					{values.length} cases selected
				{/if}
			</span>
			<FolderIcon size={14} class="shrink-0 opacity-60" />
		</Button>
	</Popover.Trigger>

	<!--
	  Popover deliberately wider than the trigger. The trigger stays
	  compact (md:w-72 in the parent layout) so it doesn't dominate the
	  search row, but the dropdown needs room to render full case
	  titles, the Mine badge, and the customer line without truncation.
	  Capped by viewport so it can't escape the visible area.
	-->
	<Popover.Content
		align="end"
		class="w-[28rem] min-w-[28rem] max-w-[calc(100vw-3rem)] p-0 sm:w-[32rem] sm:min-w-[32rem]"
	>
		<div class="flex flex-col">
			<div class="relative min-w-0 border-b p-2">
				<SearchIcon
					size="14"
					class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 opacity-60"
				/>
				<Input
					type="text"
					placeholder="Search cases by name…"
					value={searchText}
					oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
					class="h-8 w-full pl-7 text-sm"
				/>
			</div>

			<!--
			  Bulk-action bar. Hidden until there's something to act on,
			  then offers Select all / Deselect all keyed to the currently
			  loaded list (search-filtered + paginated). A `Clear all`
			  shortcut wipes the whole scope back to "All accessible cases".
			-->
			{#if cases.length > 0}
				<div
					class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 text-2xs text-muted-foreground"
				>
					<span>
						{#if mode === 'search'}
							Matching cases ({cases.length}{hasMore ? '+' : ''})
						{:else}
							Recent cases ({cases.length}{hasMore ? '+' : ''})
						{/if}
					</span>
					<div class="flex items-center gap-2">
						{#if allLoadedSelected}
							<button type="button" class="hover:text-foreground" onclick={deselectAllLoaded}>
								Deselect all
							</button>
						{:else}
							<button type="button" class="hover:text-foreground" onclick={selectAllLoaded}>
								Select all
							</button>
						{/if}
						{#if values.length > 0}
							<span class="opacity-40">·</span>
							<button type="button" class="hover:text-foreground" onclick={clearAll}>
								Clear scope
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<div
				bind:this={listEl}
				onscroll={onScroll}
				class="relative max-h-72 min-h-[200px] w-full min-w-0 overflow-auto"
			>
				{#if loading && cases.length === 0}
					<div class="p-3 text-sm opacity-70">Loading cases…</div>
				{:else if cases.length === 0 && !loading}
					<div class="p-3 text-sm opacity-70">
						{mode === 'search' ? 'No matching cases.' : 'No cases available.'}
					</div>
				{:else}
					<ul class="py-1">
						{#each cases as c, idx (c.case_id)}
							{@const owned = mode === 'default' && isOwnedByCurrentUser(c)}
							{@const isFirstNonOwner =
								mode === 'default' && !owned && idx > 0 && isOwnedByCurrentUser(cases[idx - 1])}
							{#if isFirstNonOwner}
								<li class="my-1 border-t"></li>
							{/if}
							<li>
								<button
									type="button"
									class="flex w-full min-w-0 items-center gap-2 overflow-hidden px-3 py-2 text-left text-sm hover:bg-muted/60 {isSelected(
										c
									)
										? 'bg-muted/40'
										: ''}"
									onclick={() => toggle(c)}
								>
									<Checkbox
										checked={isSelected(c)}
										aria-label={`Toggle case #${c.case_id}`}
										class="pointer-events-none"
									/>
									<span class="flex min-w-0 flex-1 flex-col overflow-hidden">
										<span class="flex min-w-0 items-center gap-2">
											<span class="min-w-0 flex-1 truncate font-medium">{caseLabel(c)}</span>
											{#if owned}
												<span
													class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
												>
													Mine
												</span>
											{/if}
										</span>
										{#if c.case_customer?.customer_name}
											<span class="min-w-0 truncate text-xs opacity-70">
												{c.case_customer.customer_name}
											</span>
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>

					{#if loadingMore}
						<div class="p-2 text-center text-xs opacity-70">Loading more…</div>
					{:else if !hasMore && cases.length > 0}
						<div class="p-2 text-center text-xs opacity-50">No more cases</div>
					{/if}
				{/if}

				{#if error}
					<div class="p-2 text-sm text-destructive">{error}</div>
				{/if}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
