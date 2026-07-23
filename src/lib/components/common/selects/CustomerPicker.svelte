<!--
  Single-select customer picker with server-side search.

  Renders a trigger button that pops a dropdown containing:
    • a typeahead input bound to `search` (server-side ILIKE filter)
    • an infinite-scroll list of customers
    • a checkmark next to the currently selected row

  The dropdown asks the backend for a page at a time (via
  `CustomersService.search`), so it scales past the ~20 rows the
  legacy client-side filter could see. Same request-sequence guard
  and scroll-driven pagination as `CaseScopePicker`.
-->
<script lang="ts">
	import { CheckIcon, SearchIcon, UsersIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import { CustomersService, type Customer } from '$lib/services/customers.service';

	type Props = {
		// Stringified customer id, or '' when nothing is selected.
		value: string;
		// Label to show in the trigger for the currently selected id when
		// that customer isn't in the freshly-loaded page (e.g. edit flow).
		// Optional; if omitted we fall back to "#<id>".
		selectedLabel?: string;
		placeholder?: string;
		disabled?: boolean;
		onChange: (value: string, label: string) => void;
	};

	let {
		value,
		selectedLabel,
		placeholder = 'Select customer',
		disabled = false,
		onChange
	}: Props = $props();

	const PAGE_SIZE = 30;
	const SEARCH_DEBOUNCE_MS = 250;

	let open = $state(false);
	let customers = $state<Customer[]>([]);
	let searchText = $state('');
	let nextPage = $state<number | null>(1);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	let listEl: HTMLDivElement | null = $state(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let requestSeq = 0;

	const triggerLabel = $derived.by(() => {
		if (value === '') return placeholder;
		const inPage = customers.find((c) => String(c.customer_id) === value);
		if (inPage) return inPage.customer_name;
		if (selectedLabel && selectedLabel !== '') return selectedLabel;
		return `#${value}`;
	});

	const appendUnique = (existing: Customer[], incoming: Customer[]) => {
		const seen = new Set(existing.map((c) => c.customer_id));
		const merged = existing.slice();
		for (const c of incoming) {
			if (!seen.has(c.customer_id)) {
				seen.add(c.customer_id);
				merged.push(c);
			}
		}
		return merged;
	};

	const fetchPage = async (
		page: number
	): Promise<{ data: Customer[]; nextPage: number | null }> => {
		const trimmed = searchText.trim();
		const res = await CustomersService.search({
			page,
			per_page: PAGE_SIZE,
			order_by: 'customer_name',
			sort_dir: 'asc',
			...(trimmed === '' ? {} : { search: trimmed })
		});
		if (!res.ok || !res.data || typeof res.data === 'string') {
			throw new Error(res.error?.message ?? 'Failed to load customers');
		}
		return {
			data: res.data.data ?? [],
			nextPage: res.data.next_page ?? null
		};
	};

	const resetState = () => {
		customers = [];
		nextPage = 1;
		error = null;
		if (listEl) listEl.scrollTop = 0;
	};

	const loadInitial = async () => {
		const seq = ++requestSeq;
		loading = true;
		error = null;
		try {
			const { data, nextPage: np } = await fetchPage(1);
			if (seq !== requestSeq) return;
			customers = data;
			nextPage = np;
		} catch (e) {
			if (seq !== requestSeq) return;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	};

	const loadMore = async () => {
		if (loading || loadingMore || nextPage === null) return;
		const seq = ++requestSeq;
		loadingMore = true;
		try {
			const { data, nextPage: np } = await fetchPage(nextPage);
			if (seq !== requestSeq) return;
			customers = appendUnique(customers, data);
			nextPage = np;
		} catch (e) {
			if (seq !== requestSeq) return;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === requestSeq) loadingMore = false;
		}
	};

	const hasMore = $derived(nextPage !== null);

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
			resetState();
			void loadInitial();
		}, SEARCH_DEBOUNCE_MS);
	};

	const choose = (c: Customer) => {
		onChange(String(c.customer_id), c.customer_name);
		open = false;
	};

	// Load once per open. Re-opening after a close resets the query so
	// the user sees a fresh, unfiltered first page.
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
			searchText = '';
			resetState();
			void loadInitial();
		}
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				type="button"
				variant="outline"
				class="h-9 w-full justify-between gap-2 font-normal"
				{disabled}
			>
				<span class="truncate text-left {value === '' ? 'text-muted-foreground' : ''}">
					{triggerLabel}
				</span>
				<UsersIcon size={14} class="shrink-0 opacity-60" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<!--
	  z-[80] keeps the dropdown above stacked dialogs. CaseAddModal
	  itself renders at z-50, so the popover content needs to sit above
	  that or the list gets clipped by the dialog surface.
	-->
	<Popover.Content
		align="start"
		class="z-[80] w-[--bits-popover-anchor-width] min-w-[--bits-popover-anchor-width] max-w-[calc(100vw-3rem)] p-0"
	>
		<div class="flex flex-col">
			<div class="relative min-w-0 border-b p-2">
				<SearchIcon
					size="14"
					class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 opacity-60"
				/>
				<Input
					type="text"
					placeholder="Search customers…"
					value={searchText}
					oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
					class="h-8 w-full pl-7 text-sm"
				/>
			</div>

			<div
				bind:this={listEl}
				onscroll={onScroll}
				class="relative max-h-72 min-h-[160px] w-full min-w-0 overflow-auto"
			>
				{#if loading && customers.length === 0}
					<div class="p-3 text-sm opacity-70">Loading customers…</div>
				{:else if customers.length === 0 && !loading}
					<div class="p-3 text-sm opacity-70">
						{searchText.trim() === '' ? 'No customers available.' : 'No matching customers.'}
					</div>
				{:else}
					<ul class="py-1">
						{#each customers as c (c.customer_id)}
							{@const selected = String(c.customer_id) === value}
							<li>
								<button
									type="button"
									class="flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-3 py-2 text-left text-sm hover:bg-muted/60 {selected
										? 'bg-muted/40'
										: ''}"
									onclick={() => choose(c)}
								>
									<span class="min-w-0 flex-1 truncate">{c.customer_name}</span>
									{#if selected}
										<CheckIcon size={14} class="shrink-0 opacity-70" />
									{/if}
								</button>
							</li>
						{/each}
					</ul>

					{#if loadingMore}
						<div class="p-2 text-center text-xs opacity-70">Loading more…</div>
					{:else if !hasMore && customers.length > 0}
						<div class="p-2 text-center text-xs opacity-50">No more customers</div>
					{/if}
				{/if}

				{#if error}
					<div class="p-2 text-sm text-destructive">{error}</div>
				{/if}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
