<!--
  Manage ▸ Assets — the customer-bounded asset registry.

  One row per (customer, name, type), deduplicated case-insensitively.
  The same host appearing in ten cases and four alerts is one entry here,
  which is what makes durable metadata (criticality, owner, environment,
  custom attributes) possible at all.

  Two things about scoping are worth knowing when reading this file:

  * Which rows come back is entirely the server's decision — the list is
    intersected with the customers the caller belongs to, so `client_id`
    here is a filter, never a grant.
  * Every sighting-derived number on a row (case / alert counts, first
    and last seen, compromise) is computed over the cases and alerts the
    caller can open, never the true total. `scope.restricted` says the
    filtering applied; there is deliberately no per-asset indicator of
    what was left out. Rendering one would turn this page into an
    enumerable oracle for the existence of investigations the viewer is
    not cleared for.
-->
<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ChevronLeftIcon,
		ChevronRightIcon,
		DownloadIcon,
		HistoryIcon,
		PlusIcon,
		RefreshCwIcon,
		UploadIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import type {
		AssetCriticality,
		AssetEnvironment,
		CreateManagedAssetBody,
		ManagedAsset,
		ManagedAssetDetail,
		ManagedAssetFilters,
		ManagedAssetPage,
		UpdateManagedAssetBody
	} from '$lib/types/resources/managed-asset';
	import AssetsFilters from './components/AssetsFilters.svelte';
	import AssetsTable from './components/AssetsTable.svelte';
	import AssetFormDialog from './components/AssetFormDialog.svelte';
	import AssetDetailModal from './components/AssetDetailModal.svelte';
	import AssetImportDialog from './components/AssetImportDialog.svelte';
	import AssetExportDialog from './components/AssetExportDialog.svelte';
	import AssetAuditLogDialog from './components/AssetAuditLogDialog.svelte';
	import RestrictedScopeBanner from './components/RestrictedScopeBanner.svelte';

	const DEFAULT_PER_PAGE = 50;

	const userCtx = getContext<UserCtx>(USER_CTX);

	// The read gate is explicit rather than implicit in an empty list:
	// ApiService swallows a 403 on GET, so without this check a user
	// lacking the permission would see "no assets match" and reasonably
	// conclude the registry is empty.
	const canRead = $derived(userCtx.can('asset_manager_read'));
	const canWrite = $derived(userCtx.can('asset_manager_write'));

	type SortDir = 'asc' | 'desc';

	let search = $state('');
	let clientId = $state<number | null>(null);
	let assetTypeId = $state<number | null>(null);
	let criticality = $state<AssetCriticality | null>(null);
	let environment = $state<AssetEnvironment | null>(null);
	let tag = $state('');
	let owner = $state('');
	let isActive = $state<boolean | null>(null);
	let hasSightings = $state<boolean | null>(null);
	let compromised = $state<boolean | null>(null);
	let orderBy = $state<string | null>(null);
	let sortDir = $state<SortDir>('desc');

	let page = $state(1);
	let perPage = $state(DEFAULT_PER_PAGE);

	let customers = $state<Customer[]>([]);
	let assetTypes = $state<AssetType[]>([]);

	let loading = $state(false);
	let envelope = $state<ManagedAssetPage<ManagedAsset> | null>(null);

	/**
	 * The table keys its rows on `managed_asset_id`, and a repeated id makes
	 * Svelte throw `each_key_duplicate` — which takes the whole registry page
	 * down, not just the offending row. A page of results should never contain
	 * the same asset twice, so if it does the fault is upstream (a join against
	 * sightings that lost its DISTINCT, most likely). Drop the repeats so the
	 * page still renders, and say so in the console rather than swallowing it:
	 * duplicate rows also mean the pagination totals are wrong.
	 */
	const rows = $derived.by<ManagedAsset[]>(() => {
		const source = envelope?.data ?? [];
		const seen = new Set<number>();
		const unique = source.filter((asset) => {
			if (seen.has(asset.managed_asset_id)) return false;
			seen.add(asset.managed_asset_id);
			return true;
		});

		if (unique.length !== source.length) {
			console.warn(
				`[assets] API returned ${source.length - unique.length} duplicate asset id(s) on page ${page}; totals are unreliable`
			);
		}

		return unique;
	});

	// Dialog / panel state.
	let formOpen = $state(false);
	let formAsset = $state<ManagedAssetDetail | null>(null);
	let saving = $state(false);
	let importOpen = $state(false);
	let exportOpen = $state(false);
	let auditLogOpen = $state(false);
	let detailOpen = $state(false);
	let detailAsset = $state<ManagedAssetDetail | null>(null);
	let detailLoading = $state(false);
	// Asset the detail modal should return to once the edit form closes.
	// Null whenever the form was opened from the table instead.
	let detailResumeId = $state<number | null>(null);

	let dialogOpen = $state(false);
	let dialogTitle = $state('');
	let dialogMessage = $state('');
	let dialogConfirmText = $state('Confirm');
	let dialogConfirmVariant = $state<'destructive' | 'default'>('default');
	let pendingAction: (() => Promise<void>) | null = null;

	type QuerySnapshot = {
		search: string;
		clientId: number | null;
		assetTypeId: number | null;
		criticality: AssetCriticality | null;
		environment: AssetEnvironment | null;
		tag: string;
		owner: string;
		isActive: boolean | null;
		hasSightings: boolean | null;
		compromised: boolean | null;
		orderBy: string | null;
		sortDir: SortDir;
	};
	let lastQuery = $state<QuerySnapshot | null>(null);

	const snapshot = (): QuerySnapshot => ({
		search: search.trim(),
		clientId,
		assetTypeId,
		criticality,
		environment,
		tag: tag.trim(),
		owner: owner.trim(),
		isActive,
		hasSightings,
		compromised,
		orderBy,
		sortDir
	});

	/**
	 * The filter half of a snapshot, in the shape the API takes.
	 *
	 * Repeatable parameters are arrays even though the UI offers one
	 * value each — the backend reads them with `getlist`, and keeping the
	 * wire shape plural means adding multi-select later is a UI change
	 * only. This is also what the export dialog sends, so the file and
	 * the screen always agree on the row set.
	 */
	const filtersOf = (q: QuerySnapshot): ManagedAssetFilters => {
		const filters: ManagedAssetFilters = {};
		if (q.search) filters.search = q.search;
		if (q.clientId !== null) filters.client_id = [q.clientId];
		if (q.assetTypeId !== null) filters.asset_type_id = [q.assetTypeId];
		if (q.criticality !== null) filters.criticality = [q.criticality];
		if (q.environment !== null) filters.environment = [q.environment];
		if (q.tag) filters.tag = [q.tag];
		if (q.owner) filters.owner = q.owner;
		if (q.isActive !== null) filters.is_active = q.isActive;
		if (q.hasSightings !== null) filters.has_sightings = q.hasSightings;
		if (q.compromised !== null) filters.compromised = q.compromised;
		return filters;
	};

	const buildUrl = (q: QuerySnapshot, p: number, pp: number) => {
		const params = new URLSearchParams();
		if (q.search) params.set('q', q.search);
		if (q.clientId !== null) params.set('client_id', String(q.clientId));
		if (q.assetTypeId !== null) params.set('asset_type_id', String(q.assetTypeId));
		if (q.criticality) params.set('criticality', q.criticality);
		if (q.environment) params.set('environment', q.environment);
		if (q.tag) params.set('tag', q.tag);
		if (q.owner) params.set('owner', q.owner);
		if (q.isActive !== null) params.set('is_active', q.isActive ? '1' : '0');
		if (q.hasSightings !== null) params.set('has_sightings', q.hasSightings ? '1' : '0');
		if (q.compromised !== null) params.set('compromised', q.compromised ? '1' : '0');
		if (q.orderBy) params.set('order_by', q.orderBy);
		if (q.orderBy && q.sortDir !== 'desc') params.set('sort_dir', q.sortDir);
		if (p > 1) params.set('page', String(p));
		if (pp !== DEFAULT_PER_PAGE) params.set('per_page', String(pp));
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	};

	const writeUrl = (q: QuerySnapshot, p: number, pp: number) => {
		if (!browser) return;
		void goto(buildUrl(q, p, pp), { replaceState: true, keepFocus: true, noScroll: true });
	};

	const runQuery = async (q: QuerySnapshot, p: number) => {
		loading = true;
		try {
			const res = await ManagedAssetsService.list({
				...filtersOf(q),
				page: p,
				per_page: perPage,
				order_by: q.orderBy ?? undefined,
				sort_dir: q.orderBy ? q.sortDir : undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				envelope = res.data;
			} else {
				envelope = null;
				toast({
					title: 'Failed to load assets',
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

	/** Re-run the current query without losing the operator's place. */
	const refreshInPlace = async () => {
		if (lastQuery) await runQuery(lastQuery, page);
	};

	const refresh = async () => {
		if (!lastQuery) {
			await submit();
			return;
		}
		await refreshInPlace();
		toast({ title: 'Refreshed', variant: 'success' });
	};

	const clearAllFilters = () => {
		search = '';
		clientId = null;
		assetTypeId = null;
		criticality = null;
		environment = null;
		tag = '';
		owner = '';
		isActive = null;
		hasSightings = null;
		compromised = null;
		orderBy = null;
		sortDir = 'desc';
		void submit();
	};

	// Same three-state cycle as /manage/cases: unsorted → desc → asc →
	// unsorted. Only registry columns are offered; see AssetsTable.
	const toggleSort = (key: string) => {
		if (orderBy !== key) {
			orderBy = key;
			sortDir = 'desc';
		} else if (sortDir === 'desc') {
			sortDir = 'asc';
		} else {
			orderBy = null;
			sortDir = 'desc';
		}
		void submit();
	};

	const hasActiveFilters = $derived(
		!!search ||
			clientId !== null ||
			assetTypeId !== null ||
			criticality !== null ||
			environment !== null ||
			!!tag ||
			!!owner ||
			isActive !== null ||
			hasSightings !== null ||
			compromised !== null ||
			orderBy !== null
	);

	const activeFilters = $derived(lastQuery ? filtersOf(lastQuery) : null);

	// ---------------------------------------------------------------
	// Detail panel
	// ---------------------------------------------------------------

	const showDetail = async (id: number) => {
		detailOpen = true;
		detailAsset = null;
		detailLoading = true;
		try {
			const res = await ManagedAssetsService.get(id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				detailAsset = res.data;
			} else {
				detailOpen = false;
				toast({
					title: 'Failed to load the asset',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			detailLoading = false;
		}
	};

	const openDetail = (asset: ManagedAsset) => showDetail(asset.managed_asset_id);

	const closeDetail = () => {
		detailOpen = false;
		detailAsset = null;
		detailResumeId = null;
	};

	/**
	 * Re-read the open panel after a write.
	 *
	 * The PUT response is an echo of the row, not a read: it carries
	 * neither the `scope` flag nor `timeline_event_count`, both of which
	 * only the detail endpoint computes. Re-reading keeps the panel
	 * honest instead of quietly dropping the restricted-scope banner the
	 * moment somebody edits a field.
	 */
	const reloadDetail = async (id: number) => {
		if (detailAsset?.managed_asset_id !== id) return;
		const res = await ManagedAssetsService.get(id);
		if (res.ok && res.data && typeof res.data !== 'string') detailAsset = res.data;
	};

	// ---------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------

	const openCreate = () => {
		formAsset = null;
		formOpen = true;
	};

	const openEdit = (asset: ManagedAsset | ManagedAssetDetail) => {
		formAsset = asset as ManagedAssetDetail;
		formOpen = true;
	};

	/**
	 * Edit from inside the detail modal.
	 *
	 * The form is a dialog too, so we hand off rather than stack: two open
	 * dialogs share one focus trap and both claim Escape, which leaves the
	 * operator unable to dismiss the inner one predictably. Closing the
	 * detail first and restoring it once the form is done keeps the
	 * back-and-forth the operator expects without that fight.
	 */
	const editFromDetail = (asset: ManagedAssetDetail) => {
		detailResumeId = asset.managed_asset_id;
		detailOpen = false;
		// Drop the loaded row so the post-save `reloadDetail` no-ops: the
		// modal is coming back through `showDetail`, which re-reads anyway,
		// and fetching in both places would double up every save.
		detailAsset = null;
		openEdit(asset);
	};

	// Restore the detail modal once the form closes — on save *and* on
	// cancel, since both leave the operator where they started.
	$effect(() => {
		if (formOpen || detailResumeId === null) return;
		const id = detailResumeId;
		detailResumeId = null;
		void showDetail(id);
	});

	const createAsset = async (body: CreateManagedAssetBody) => {
		saving = true;
		try {
			const res = await ManagedAssetsService.create(body);
			if (res.ok) {
				toast({ title: `Created "${body.name}"`, variant: 'success' });
				formOpen = false;
				await submit();
			} else {
				toast({
					title: 'Failed to create the asset',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			saving = false;
		}
	};

	const updateAsset = async (id: number, body: UpdateManagedAssetBody) => {
		saving = true;
		try {
			const res = await ManagedAssetsService.update(id, body);
			if (res.ok) {
				toast({ title: 'Asset updated', variant: 'success' });
				formOpen = false;
				await reloadDetail(id);
				await refreshInPlace();
			} else {
				toast({
					title: 'Failed to update the asset',
					description: res.error?.message ?? 'Unknown error',
					variant: 'destructive'
				});
			}
		} finally {
			saving = false;
		}
	};

	// Custom attributes round-trip through the same PUT as everything
	// else, so they are audited like any other field change.
	const saveAttributes = async (id: number, values: Record<string, Record<string, unknown>>) => {
		const res = await ManagedAssetsService.update(id, { custom_attributes: values });
		if (!res.ok) {
			throw new Error(res.error?.message ?? 'Failed to save the attributes');
		}
		await reloadDetail(id);
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

	const deleteAsset = (asset: ManagedAsset) =>
		confirmThen(
			'Delete asset',
			`Delete "${asset.name}" from the registry? Its metadata and custom attributes are lost. ` +
				`The cases and alerts it appears in are not touched, and its change log is kept — ` +
				`but an asset still present in a case will be registered again automatically.`,
			'Delete asset',
			'destructive',
			async () => {
				const res = await ManagedAssetsService.remove(asset.managed_asset_id);
				if (res.ok) {
					toast({ title: `Deleted "${asset.name}"`, variant: 'success' });
					if (detailAsset?.managed_asset_id === asset.managed_asset_id) closeDetail();
					await refreshInPlace();
				} else {
					toast({
						title: 'Failed to delete the asset',
						description: res.error?.message ?? 'Unknown error',
						variant: 'destructive'
					});
				}
			}
		);

	const reconcile = () => {
		if (clientId === null) {
			toast({
				title: 'Pick a customer first',
				description: 'Reconcile scans one customer at a time.',
				variant: 'warning'
			});
			return;
		}
		const target = clientId;
		const name =
			customers.find((customer) => customer.customer_id === target)?.customer_name ??
			`customer #${target}`;

		confirmThen(
			'Scan for missing assets',
			`Scan every case and alert of ${name} and register any asset missing from the registry? ` +
				`Nothing is modified or removed.`,
			'Scan',
			'default',
			async () => {
				const res = await ManagedAssetsService.reconcile(target);
				if (res.ok && res.data && typeof res.data !== 'string') {
					const created = res.data.created;
					toast({
						title: created === 0 ? 'Registry already complete' : `Registered ${created} asset(s)`,
						variant: 'success'
					});
					if (created > 0) await refreshInPlace();
				} else {
					toast({
						title: 'Scan failed',
						description: res.error?.message ?? 'Unknown error',
						variant: 'destructive'
					});
				}
			}
		);
	};

	// ---------------------------------------------------------------

	const range = $derived.by(() => {
		if (!envelope || envelope.total === 0) return null;
		const start = (envelope.current_page - 1) * perPage + 1;
		const end = Math.min(envelope.current_page * perPage, envelope.total);
		return { start, end, total: envelope.total };
	});

	const readBool = (params: URLSearchParams, key: string): boolean | null => {
		const raw = params.get(key);
		if (raw === '1') return true;
		if (raw === '0') return false;
		return null;
	};

	const readId = (params: URLSearchParams, key: string): number | null => {
		const value = Number(params.get(key));
		return Number.isFinite(value) && value > 0 ? value : null;
	};

	onMount(() => {
		const params = pageStore.url.searchParams;
		search = params.get('q') ?? '';
		clientId = readId(params, 'client_id');
		assetTypeId = readId(params, 'asset_type_id');
		criticality = (params.get('criticality') as AssetCriticality | null) || null;
		environment = (params.get('environment') as AssetEnvironment | null) || null;
		tag = params.get('tag') ?? '';
		owner = params.get('owner') ?? '';
		isActive = readBool(params, 'is_active');
		hasSightings = readBool(params, 'has_sightings');
		compromised = readBool(params, 'compromised');
		orderBy = params.get('order_by') || null;
		sortDir = (params.get('sort_dir') ?? '').toLowerCase() === 'asc' ? 'asc' : 'desc';

		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || DEFAULT_PER_PAGE;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;

		// The lookup lists are small taxonomies and the filter selects can
		// render id fallbacks until they land, so they don't block the
		// main query.
		void CustomersService.list().then((res) => {
			if (res.ok) {
				customers = res.data.slice().sort((a, b) => a.customer_name.localeCompare(b.customer_name));
			}
		});
		void AssetTypesService.list().then((res) => {
			if (res.ok && Array.isArray(res.data)) {
				assetTypes = (res.data as AssetType[])
					.slice()
					.sort((a, b) => a.asset_name.localeCompare(b.asset_name));
			}
		});

		lastQuery = snapshot();
		void runQuery(lastQuery, page);
	});
</script>

<svelte:head>
	<title>Manage assets</title>
</svelte:head>

<!--
  VISUAL TEST (full-bleed + centred column): the page is one `bg-card`
  surface with no outer padding, matching the case workspace. But unlike a
  case, this list is far narrower than a wide viewport — stretched to the
  full width the eye has to travel across near-empty columns — so the body
  sits in a centred `max-w-6xl` column. The header rule spans the whole
  width; its contents align to the same column as the content below it.
-->
<div class="flex grow flex-col bg-card">
	<div class="shrink-0 border-b border-border/60 bg-muted/30 px-5 py-2">
		<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-baseline gap-2">
				<h1 class="text-sm font-semibold tracking-tight">Asset manager</h1>
				<span class="truncate text-xs text-muted-foreground">
					One entry per asset and customer, fed automatically from your cases and alerts.
				</span>
			</div>

			{#if canRead}
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
						<RefreshCwIcon size={14} class={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
					<Button variant="outline" size="sm" onclick={() => (auditLogOpen = true)}>
						<HistoryIcon size={14} class="mr-1.5" /> Change log
					</Button>
					<Button variant="outline" size="sm" onclick={() => (exportOpen = true)}>
						<DownloadIcon size={14} class="mr-1.5" /> Export
					</Button>
					{#if canWrite}
						<Button variant="outline" size="sm" onclick={() => (importOpen = true)}>
							<UploadIcon size={14} class="mr-1.5" /> Import
						</Button>
						<Button variant="outline" size="sm" onclick={reconcile}>Scan cases</Button>
						<Button size="sm" onclick={openCreate}>
							<PlusIcon size={14} class="mr-1.5" /> New asset
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="mx-auto flex w-full max-w-6xl flex-col px-5 py-4">
		{#if !userCtx.ready}
			<Skeleton class="h-64 w-full" />
		{:else if !canRead}
			<!--
		  Explicit, because ApiService turns a 403 on a GET into an empty
		  result. Without this the page would claim the registry is empty
		  rather than that the user may not read it.
		-->
			<div class="flex flex-col">
				<div class="px-0 py-16 text-center">
					<p class="text-sm font-medium">You don't have access to the asset manager.</p>
					<p class="mt-1 text-xs text-muted-foreground">
						Ask an administrator for the “Asset manager — read” permission.
					</p>
				</div>
			</div>
		{:else}
			<RestrictedScopeBanner visible={envelope?.scope?.restricted ?? false} />

			<div class="flex flex-col">
				<div class="border-b border-border/60 p-0 pb-4">
					<AssetsFilters
						bind:search
						bind:clientId
						bind:assetTypeId
						bind:criticality
						bind:environment
						bind:tag
						bind:owner
						bind:isActive
						bind:hasSightings
						bind:compromised
						{customers}
						{assetTypes}
						{loading}
						{hasActiveFilters}
						onSubmit={submit}
						onClear={clearAllFilters}
					/>
				</div>
			</div>

			<div class="flex flex-col">
				<div
					class="sticky top-0 z-20 flex flex-row items-center justify-between gap-2 rounded-none bg-card px-0 py-2"
				>
					<div class="flex items-center gap-2">
						<Card.Title>Assets</Card.Title>
						{#if range}
							<span class="text-xs tabular-nums text-muted-foreground">
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
				</div>

				<div class="px-0 pb-0">
					{#if loading && !envelope}
						<div class="space-y-2">
							{#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}
								<Skeleton class="h-10 w-full" />
							{/each}
						</div>
					{:else if envelope && rows.length > 0}
						<AssetsTable
							assets={rows}
							{orderBy}
							{sortDir}
							{canWrite}
							onToggleSort={toggleSort}
							onOpen={openDetail}
							onEdit={openEdit}
							onDelete={deleteAsset}
						/>
					{:else if envelope}
						<p class="py-8 text-center text-sm text-muted-foreground">
							No assets match the current filters.
						</p>
					{:else}
						<p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<AssetDetailModal
	open={detailOpen}
	asset={detailAsset}
	loading={detailLoading}
	{canWrite}
	onClose={closeDetail}
	onEdit={editFromDetail}
	onSaveAttributes={saveAttributes}
/>

<AssetFormDialog
	bind:open={formOpen}
	asset={formAsset}
	{customers}
	{assetTypes}
	{saving}
	onCreate={createAsset}
	onUpdate={updateAsset}
/>

<AssetImportDialog bind:open={importOpen} {customers} onImported={submit} />

<AssetExportDialog bind:open={exportOpen} filters={activeFilters} />

<AssetAuditLogDialog bind:open={auditLogOpen} {clientId} />

<ConfirmationDialog
	bind:open={dialogOpen}
	title={dialogTitle}
	message={dialogMessage}
	confirmText={dialogConfirmText}
	confirmButtonVariant={dialogConfirmVariant}
	onConfirm={runPendingAction}
	onCancel={() => (pendingAction = null)}
/>
