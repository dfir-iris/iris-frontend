<!--
  Manage ▸ Vulnerabilities — the instance-wide catalogue.

  One entry per CVE / advisory / private `IRIS-VULN-…` finding type; the
  per-asset findings live in the cases and on the registry and point
  here. Reading needs `vulnerabilities_read`; without it the page shows
  a permission notice and fetches nothing. The exposure counts on each row
  only cover the cases and registry assets the viewer can see, never the
  true totals.

  Structure, URL state and look follow `/manage/assets` on purpose.
-->
<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { page as pageStore } from '$app/state';
	import { goto } from '$app/navigation';
	import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import {
		VULNERABILITY_KINDS,
		VULNERABILITY_SEVERITIES,
		VulnerabilitiesService,
		type Vulnerability,
		type VulnerabilityInput,
		type VulnerabilityKind,
		type VulnerabilityPage,
		type VulnerabilitySeverity
	} from '$lib/services/vulnerabilities.service';
	import {
		canAdministerVulnerabilities,
		canCreateVulnerability,
		canEditVulnerability,
		canReadVulnerabilities
	} from '$lib/components/vulnerabilities/permissions';
	import VulnerabilitiesAccessDenied from '$lib/components/vulnerabilities/VulnerabilitiesAccessDenied.svelte';
	import { cveSyncSummary } from '$lib/components/vulnerabilities/cve-sync';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import VulnerabilitiesFilters from './components/VulnerabilitiesFilters.svelte';
	import VulnerabilitiesTable from './components/VulnerabilitiesTable.svelte';
	import VulnerabilityFormDialog from '$lib/components/vulnerabilities/VulnerabilityFormDialog.svelte';

	const DEFAULT_PER_PAGE = 50;

	const userCtx = getContext<UserCtx>(USER_CTX);

	const canRead = $derived(canReadVulnerabilities(userCtx));
	const canCreate = $derived(canCreateVulnerability(userCtx));
	// Permissions known and read missing: show the notice instead.
	const denied = $derived(userCtx.ready && !canRead);
	const isAdmin = $derived(canAdministerVulnerabilities(userCtx));
	const canEdit = (v: Vulnerability) => canEditVulnerability(userCtx, v);

	type SortDir = 'asc' | 'desc';

	let search = $state('');
	let severity = $state<VulnerabilitySeverity[]>([]);
	let kind = $state<VulnerabilityKind[]>([]);
	let kev = $state<boolean | null>(null);
	let isPrivate = $state<boolean | null>(null);
	let affected = $state(false);
	let orderBy = $state<string | null>(null);
	let sortDir = $state<SortDir>('desc');

	let page = $state(1);
	let perPage = $state(DEFAULT_PER_PAGE);

	let loading = $state(false);
	let envelope = $state<VulnerabilityPage | null>(null);

	const rows = $derived(envelope?.data ?? []);

	let formOpen = $state(false);
	let formEntry = $state<Vulnerability | null>(null);
	let saving = $state(false);

	let syncingId = $state<number | null>(null);

	let confirmOpen = $state(false);
	let pendingDelete = $state<Vulnerability | null>(null);

	type QuerySnapshot = {
		search: string;
		severity: VulnerabilitySeverity[];
		kind: VulnerabilityKind[];
		kev: boolean | null;
		isPrivate: boolean | null;
		affected: boolean;
		orderBy: string | null;
		sortDir: SortDir;
	};
	let lastQuery = $state<QuerySnapshot | null>(null);

	const snapshot = (): QuerySnapshot => ({
		search: search.trim(),
		severity: [...severity],
		kind: [...kind],
		kev,
		isPrivate,
		affected,
		orderBy,
		sortDir
	});

	const buildUrl = (q: QuerySnapshot, p: number, pp: number) => {
		const params = new URLSearchParams();
		if (q.search) params.set('q', q.search);
		if (q.severity.length) params.set('severity', q.severity.join(','));
		if (q.kind.length) params.set('kind', q.kind.join(','));
		if (q.kev !== null) params.set('kev', q.kev ? '1' : '0');
		if (q.isPrivate !== null) params.set('private', q.isPrivate ? '1' : '0');
		if (q.affected) params.set('affected', '1');
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
		if (!canRead) return;
		loading = true;
		try {
			const res = await VulnerabilitiesService.search({
				page: p,
				per_page: perPage,
				order_by: q.orderBy ?? undefined,
				sort_dir: q.orderBy ? q.sortDir : undefined,
				search: q.search || undefined,
				severity: q.severity,
				kind: q.kind,
				kev: q.kev ?? undefined,
				private: q.isPrivate ?? undefined,
				affected: q.affected
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				envelope = res.data;
			} else {
				envelope = null;
				toast({
					title: 'Failed to load vulnerabilities',
					description: apiErrorMessage(res, 'Unknown error'),
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
		severity = [];
		kind = [];
		kev = null;
		isPrivate = null;
		affected = false;
		orderBy = null;
		sortDir = 'desc';
		void submit();
	};

	// unsorted (server default: last updated first) → desc → asc → unsorted
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
			severity.length > 0 ||
			kind.length > 0 ||
			kev !== null ||
			isPrivate !== null ||
			affected ||
			orderBy !== null
	);

	// ---------------------------------------------------------------
	// Mutations
	// ---------------------------------------------------------------

	const openCreate = () => {
		formEntry = null;
		formOpen = true;
	};

	const openEdit = (v: Vulnerability) => {
		formEntry = v;
		formOpen = true;
	};

	const save = async (payload: VulnerabilityInput) => {
		saving = true;
		try {
			const editing = formEntry;
			const res = editing
				? await VulnerabilitiesService.update(editing.vulnerability_id, payload)
				: await VulnerabilitiesService.create(payload);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const saved = res.data;
				formOpen = false;
				if (editing) {
					toast({ title: `${saved.identifier} updated`, variant: 'success' });
					await refreshInPlace();
				} else {
					toast({ title: `Created ${saved.identifier}`, variant: 'success' });
					await goto(`/manage/vulnerabilities/${saved.vulnerability_id}`);
				}
			} else if (res.status !== 403) {
				toast({
					title: editing
						? 'Failed to update the vulnerability'
						: 'Failed to create the vulnerability',
					description: apiErrorMessage(res, 'Unknown error'),
					variant: 'destructive'
				});
			}
		} finally {
			saving = false;
		}
	};

	/** Non-forced cve.org sync; the row is replaced in place. */
	const syncRow = async (v: Vulnerability) => {
		if (syncingId !== null || !canCreate) return;
		syncingId = v.vulnerability_id;
		try {
			const res = await VulnerabilitiesService.sync(v.vulnerability_id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const { sync: report, ...entry } = res.data;
				if (envelope) {
					envelope = {
						...envelope,
						data: envelope.data.map((row) =>
							row.vulnerability_id === entry.vulnerability_id
								? { ...entry, counts: entry.counts ?? row.counts }
								: row
						)
					};
				}
				toast({
					title: `${entry.identifier} synced from cve.org`,
					description: cveSyncSummary(report),
					variant: 'success'
				});
			} else if (res.status !== 403) {
				toast({
					title: `Sync of ${v.identifier} failed`,
					description: apiErrorMessage(res, 'Unknown error'),
					variant: 'destructive'
				});
			}
		} finally {
			syncingId = null;
		}
	};

	const askDelete = (v: Vulnerability) => {
		pendingDelete = v;
		confirmOpen = true;
	};

	const confirmDelete = async () => {
		const v = pendingDelete;
		pendingDelete = null;
		if (!v) return;
		const res = await VulnerabilitiesService.remove(v.vulnerability_id);
		if (res.ok) {
			toast({ title: `Deleted ${v.identifier}`, variant: 'success' });
			await refreshInPlace();
		} else if (res.status !== 403) {
			// DELETE bodies are not parsed by ApiService; a 400 here is the
			// backend refusing because findings still use the entry.
			toast({
				title: `Cannot delete ${v.identifier}`,
				description: apiErrorMessage(
					res,
					res.status === 400
						? 'It is still used by findings: merge it into another entry instead.'
						: 'Unknown error'
				),
				variant: 'destructive'
			});
		}
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

	const readList = <T extends string>(
		params: URLSearchParams,
		key: string,
		allowed: readonly T[]
	): T[] =>
		(params.get(key) ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter((value): value is T => (allowed as readonly string[]).includes(value));

	// First load waits for the permissions: a direct hit on the page
	// mounts before `/me/context` settles.
	let urlRead = $state(false);
	let initialLoaded = false;
	$effect(() => {
		if (!urlRead || initialLoaded || !userCtx.ready || !canRead || !lastQuery) return;
		initialLoaded = true;
		void runQuery(lastQuery, page);
	});

	onMount(() => {
		const params = pageStore.url.searchParams;
		search = params.get('q') ?? '';
		severity = readList(params, 'severity', VULNERABILITY_SEVERITIES);
		kind = readList(params, 'kind', VULNERABILITY_KINDS);
		kev = readBool(params, 'kev');
		isPrivate = readBool(params, 'private');
		affected = params.get('affected') === '1';
		orderBy = params.get('order_by') || null;
		sortDir = (params.get('sort_dir') ?? '').toLowerCase() === 'asc' ? 'asc' : 'desc';

		const p = Number(params.get('page')) || 1;
		const pp = Number(params.get('per_page')) || DEFAULT_PER_PAGE;
		if (pp > 0) perPage = pp;
		if (p > 0) page = p;

		lastQuery = snapshot();
		urlRead = true;
	});
</script>

<svelte:head>
	<title>Vulnerabilities</title>
</svelte:head>

<div class="flex grow flex-col bg-card">
	<div class="shrink-0 border-b border-border/60 bg-muted/30 px-5 py-2">
		<div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-baseline gap-2">
				<h1 class="text-sm font-semibold tracking-tight">Vulnerabilities</h1>
				<span class="truncate text-xs text-muted-foreground">
					CVEs, advisories and private findings tracked across your cases and assets.
				</span>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" onclick={refresh} disabled={loading || !canRead}>
					<RefreshCwIcon size={14} class={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
					Refresh
				</Button>
				{#if canCreate}
					<Button size="sm" onclick={openCreate} data-tour="vuln-new">
						<PlusIcon size={14} class="mr-1.5" /> New vulnerability
					</Button>
				{/if}
			</div>
		</div>
	</div>

	{#if denied}
		<VulnerabilitiesAccessDenied />
	{:else}
		<div class="mx-auto flex w-full max-w-6xl flex-col px-5 py-4">
			<div class="flex flex-col">
				<div class="border-b border-border/60 p-0 pb-4">
					<VulnerabilitiesFilters
						bind:search
						bind:severity
						bind:kind
						bind:kev
						bind:isPrivate
						bind:affected
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
						<Card.Title>Catalogue</Card.Title>
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
						<VulnerabilitiesTable
							vulnerabilities={rows}
							{orderBy}
							{sortDir}
							{canEdit}
							canDelete={isAdmin}
							onToggleSort={toggleSort}
							onEdit={openEdit}
							onDelete={askDelete}
							onSync={runtimeConfig.cveSyncEnabled && canCreate ? syncRow : undefined}
							{syncingId}
						/>
					{:else if envelope}
						<p class="py-8 text-center text-sm text-muted-foreground">
							{hasActiveFilters
								? 'No vulnerabilities match the current filters.'
								: 'The catalogue is empty.'}
						</p>
					{:else}
						<p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<VulnerabilityFormDialog bind:open={formOpen} vulnerability={formEntry} {saving} onSubmit={save} />

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete vulnerability"
	message={`Delete ${pendingDelete?.identifier ?? 'this entry'} from the catalogue? Entries still used by findings cannot be deleted — merge them into another entry instead.`}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={() => void confirmDelete()}
	onCancel={() => (pendingDelete = null)}
/>
