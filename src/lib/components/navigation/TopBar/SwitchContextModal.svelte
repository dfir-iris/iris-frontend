<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { CheckIcon, SearchIcon } from 'lucide-svelte';
	import DialogContent from '$lib/components/ui/dialog/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog/dialog-header.svelte';
	import DialogTitle from '$lib/components/ui/dialog/dialog-title.svelte';
	import DialogFooter from '$lib/components/ui/dialog/dialog-footer.svelte';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import { current_user } from '$lib/stores/auth.store';

	type SwitchContextModalProps = {
		open: boolean;
		title?: string;
		onConfirm: (caseId: number) => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open,
		title = 'Switch Context',
		onConfirm,
		onOpenChange
	}: SwitchContextModalProps = $props();

	const PAGE_SIZE = 30;
	const SEARCH_DEBOUNCE_MS = 250;

	type Mode = 'default' | 'search';

	let cases = $state<Case[]>([]);
	let selectedCaseId = $state<number | null>(null);

	let mode = $state<Mode>('default');
	let searchText = $state('');

	// Pagination cursors. In default mode we paginate two queries in parallel
	// (owner-first, then everyone else); in search mode we paginate one.
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
		return trimmed !== '' ? trimmed : `#${c.case_id}`;
	};

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
		selectedCaseId = null;
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
				// Default mode: owner's cases first, then everyone else.
				// Two parallel requests so the initial paint is single-flight.
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

				// Owner's cases on top, then others, deduped, trimmed to PAGE_SIZE.
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
				// Default mode: drain owner's pages first, then everyone else.
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
		const threshold = 96; // px from bottom
		if (listEl.scrollTop + listEl.clientHeight + threshold >= listEl.scrollHeight) {
			void loadMore();
		}
	};

	const onSearchInput = (value: string) => {
		searchText = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const next: Mode = searchText.trim() === '' ? 'default' : 'search';
			mode = next;
			resetState();
			void loadInitial();
		}, SEARCH_DEBOUNCE_MS);
	};

	const handleConfirm = () => {
		if (selectedCaseId === null) return;
		onConfirm(selectedCaseId);
		onOpenChange(false);
	};

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

<DialogPrimitive.Root bind:open {onOpenChange}>
	<DialogContent class="sm:max-w-[525px]">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
		</DialogHeader>

		<div class="flex min-w-0 flex-col gap-3 py-2">
			<div class="relative min-w-0">
				<SearchIcon
					size="14"
					class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60"
				/>
				<Input
					type="text"
					placeholder="Search cases by name..."
					value={searchText}
					oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
					class="h-9 w-full pl-8 text-sm"
				/>
			</div>

			<div
				bind:this={listEl}
				onscroll={onScroll}
				class="relative max-h-80 min-h-[260px] w-full min-w-0 overflow-auto rounded-md border bg-background"
			>
				{#if loading && cases.length === 0}
					<div class="p-3 text-sm opacity-70">Loading cases...</div>
				{:else if cases.length === 0 && !loading}
					<div class="p-3 text-sm opacity-70">
						{mode === 'search' ? 'No matching cases.' : 'No cases available.'}
					</div>
				{:else}
					<ul class="py-1">
						{#each cases as c, idx (c.case_id)}
							{@const owned = mode === 'default' && isOwnedByCurrentUser(c)}
							{@const isFirstNonOwner =
								mode === 'default' &&
								!owned &&
								idx > 0 &&
								isOwnedByCurrentUser(cases[idx - 1])}
							{#if isFirstNonOwner}
								<li class="border-t my-1"></li>
							{/if}
							<li>
								<button
									type="button"
									class="flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-3 py-2 text-left text-sm hover:bg-muted {selectedCaseId ===
									c.case_id
										? 'bg-muted'
										: ''}"
									onclick={() => (selectedCaseId = c.case_id)}
								>
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
										<span class="min-w-0 truncate text-xs opacity-70">
											#{c.case_id}{#if c.case_customer?.customer_name}
												&nbsp;·&nbsp;{c.case_customer.customer_name}{/if}
										</span>
									</span>
									{#if selectedCaseId === c.case_id}
										<CheckIcon size="14" class="shrink-0" />
									{/if}
								</button>
							</li>
						{/each}
					</ul>

					{#if loadingMore}
						<div class="p-2 text-center text-xs opacity-70">Loading more...</div>
					{:else if !hasMore && cases.length > 0}
						<div class="p-2 text-center text-xs opacity-50">No more cases</div>
					{/if}
				{/if}
			</div>

			{#if error}
				<div class="text-sm text-red-500">{error}</div>
			{/if}
		</div>

		<DialogFooter>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
			<Button onclick={handleConfirm} disabled={selectedCaseId === null || loading}>Switch</Button>
		</DialogFooter>
	</DialogContent>
</DialogPrimitive.Root>
