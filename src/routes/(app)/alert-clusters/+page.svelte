<!--
  AlertClusters overview. Same visual language as the cases-list page:
  white workspace, `h1` heading, filter row inline with search on the
  right, a bordered table below with column headers and hover rows.
  Rich per-row metadata (severity chip, status pill, id/title, alert
  count, customer, owner avatar, source rule, creation time) so
  analysts spot "what to open next" without drilling in.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ShieldAlertIcon } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Loading } from '$lib/components/ui/loading';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import AlertsPagination from '../alerts/components/alerts-pagination.svelte';
	import { AlertClustersService, type PaginatedAlertClusters } from '$lib/services/alert-clusters.service';
	import {
		AlertClusterStatusService,
		type AlertClusterStatus
	} from '$lib/services/alert-cluster-status.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import type { AlertCluster } from '$lib/types/resources/alert-cluster';
	import { DEFAULT_DEBOUNCE, DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	let clusters = $state<AlertCluster[]>([]);
	let total = $state(0);
	let pageNum = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);
	let titleFilter = $state('');
	let statusFilter = $state<string>('');
	let severityFilter = $state<string>('');
	let customerFilter = $state<string>('');
	let loading = $state(false);
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	let statuses = $state<AlertClusterStatus[]>([]);
	let severities = $state<Severity[]>([]);
	let customers = $state<Customer[]>([]);

	const perPageOptions = [10, 25, 50, 100].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	const severityChip = (name: string) => {
		switch (name.toLowerCase()) {
			case 'critical':
				return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
			case 'high':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
			case 'medium':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
			case 'low':
			case 'informational':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};

	const statusChip = (name: string) => {
		switch (name.toLowerCase()) {
			case 'open':
				return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300';
			case 'investigating':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			case 'dismissed':
				return 'bg-muted text-muted-foreground';
			case 'escalated':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};

	const severityLabel = (id?: number | null) => {
		if (!id) return 'Unspecified';
		return severities.find((s) => s.severity_id === id)?.severity_name ?? 'Unspecified';
	};

	const load = async () => {
		loading = true;
		try {
			const res = await AlertClustersService.list({
				page: pageNum,
				per_page: perPage,
				title: titleFilter || undefined,
				status_id: statusFilter ? Number(statusFilter) : undefined,
				customer_id: customerFilter ? Number(customerFilter) : undefined,
				sort: 'cluster_creation_time desc'
			});
			const payload =
				res.data && typeof res.data === 'object' ? (res.data as PaginatedAlertClusters) : null;
			let list = payload?.data ?? [];
			// Severity is client-side filtered: the backend search API
			// doesn't expose severity as a query param yet. Cheap for
			// realistic page sizes; upgrade to server-side if the list
			// grows unwieldy.
			if (severityFilter) {
				const target = Number(severityFilter);
				list = list.filter((i) => i.cluster_severity_id === target);
			}
			clusters = list;
			total = payload?.total ?? 0;
		} finally {
			loading = false;
		}
	};

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	// Debounced text search — mirrors the cases-list behaviour so the
	// analyst types freely without every keystroke hitting the API.
	let didInitSearch = false;
	$effect(() => {
		const s = titleFilter;
		if (!didInitSearch) {
			didInitSearch = true;
			return;
		}
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			pageNum = 1;
			void load();
		}, DEFAULT_DEBOUNCE);
	});

	const clearFilters = () => {
		titleFilter = '';
		statusFilter = '';
		severityFilter = '';
		customerFilter = '';
		pageNum = 1;
		void load();
	};

	const hasActiveFilters = $derived(
		!!(titleFilter || statusFilter || severityFilter || customerFilter)
	);

	onMount(async () => {
		void AlertClusterStatusService.list().then((r) => {
			if (r.data && typeof r.data === 'object') {
				statuses = (r.data as { data?: AlertClusterStatus[] }).data ?? [];
			}
		});
		void SeveritiesService.list().then((r) => {
			if (r.data && typeof r.data === 'object') {
				severities = (r.data as { data?: Severity[] }).data ?? [];
			}
		});
		void CustomersService.list().then((r) => {
			if (r.ok) customers = r.data;
		});
		await load();
	});
</script>

<svelte:head>
	<title>Alert Clusters</title>
</svelte:head>

<!--
  Outer wrapper on the app's muted background; the actual workspace
  is a white `bg-card` panel matching the case detail chrome. Only
  the table region scrolls; header + filter strip + pagination stay
  pinned.
-->
<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-elevation-2"
	>
	<!-- ==================== Header ==================== -->
	<div class="flex shrink-0 flex-row items-center gap-4">
		<h1 class="text-xl font-semibold tracking-tight">Alert Clusters</h1>
		<span class="text-xs text-muted-foreground">
			{total} total — alert clusters awaiting triage
		</span>
	</div>

	<!-- ==================== Filters row ==================== -->
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex h-10">
				<Select
					value={statusFilter}
					onValueChange={(v) => {
						statusFilter = v;
						pageNum = 1;
						void load();
					}}
					type="single"
				>
					<SelectTrigger>
						{statusFilter
							? (statuses.find((s) => String(s.status_id) === statusFilter)?.status_name ??
								'Any status')
							: 'Any status'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Any status</SelectItem>
						{#each statuses as s (s.status_id)}
							<SelectItem value={String(s.status_id)}>{s.status_name}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			<div class="flex h-10">
				<Select
					value={severityFilter}
					onValueChange={(v) => {
						severityFilter = v;
						pageNum = 1;
						void load();
					}}
					type="single"
				>
					<SelectTrigger>
						{severityFilter
							? (severities.find((s) => String(s.severity_id) === severityFilter)?.severity_name ??
								'Any severity')
							: 'Any severity'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Any severity</SelectItem>
						{#each severities as s (s.severity_id)}
							<SelectItem value={String(s.severity_id)}>{s.severity_name}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			<div class="flex h-10">
				<Select
					value={customerFilter}
					onValueChange={(v) => {
						customerFilter = v;
						pageNum = 1;
						void load();
					}}
					type="single"
				>
					<SelectTrigger>
						{customerFilter
							? (customers.find((c) => String(c.customer_id) === customerFilter)?.customer_name ??
								'Any customer')
							: 'Any customer'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="">Any customer</SelectItem>
						{#each customers as c (c.customer_id)}
							<SelectItem value={String(c.customer_id)}>{c.customer_name}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			{#if hasActiveFilters}
				<Button variant="outline" size="sm" onclick={clearFilters}>Clear</Button>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<div class="flex min-w-56">
				<Searchbar placeholder="Search by title" bind:value={titleFilter} />
			</div>

			<div class="flex h-10">
				<Select
					value={String(perPage)}
					onValueChange={(value) => {
						perPage = Number(value);
						pageNum = 1;
						void load();
					}}
					type="single"
				>
					<SelectTrigger>{perPage} entries per page</SelectTrigger>
					<SelectContent>
						{#each perPageOptions as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		</div>
	</div>

	<!-- ==================== Table ==================== -->
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
		<div class="flex-1 overflow-y-auto">
			<table class="w-full text-sm">
				<thead
					class="sticky top-0 z-10 bg-muted/50 text-left text-2xs uppercase tracking-wide text-muted-foreground backdrop-blur"
				>
					<tr>
						<th class="px-4 py-2.5 font-medium">Alert Cluster</th>
						<th class="px-4 py-2.5 font-medium">Severity</th>
						<th class="px-4 py-2.5 font-medium">Status</th>
						<th class="px-4 py-2.5 text-center font-medium">Alerts</th>
						<th class="px-4 py-2.5 font-medium">Customer</th>
						<th class="px-4 py-2.5 font-medium">Owner</th>
						<th class="px-4 py-2.5 font-medium">Source rule</th>
						<th class="px-4 py-2.5 font-medium">Opened</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr>
							<td colspan="8" class="py-16">
								<div class="flex justify-center"><Loading /></div>
							</td>
						</tr>
					{:else if clusters.length === 0}
						<tr>
							<td colspan="8" class="px-4 py-16">
								<div class="flex flex-col items-center gap-2 text-center">
									<ShieldAlertIcon class="h-8 w-8 text-muted-foreground/50" />
									<p class="text-sm font-medium">No alert clusters match</p>
									<p class="text-xs text-muted-foreground">
										{hasActiveFilters
											? 'Try widening your filters.'
											: 'AlertClusters will appear here as rules fire.'}
									</p>
								</div>
							</td>
						</tr>
					{:else}
						{#each clusters as inc (inc.cluster_id)}
							<tr
								class="cursor-pointer border-t transition-colors hover:bg-muted/30"
								onclick={() => goto(`/alert-clusters/${inc.cluster_id}`)}
							>
								<td class="max-w-md px-4 py-3">
									<div class="flex min-w-0 items-center gap-2">
										<span class="truncate font-medium">
											<span class="text-muted-foreground">#{inc.cluster_id}</span>
											— {inc.cluster_title}
										</span>
										{#if inc.cluster_case_id}
											<span
												class="rounded-full bg-green-500/10 px-1.5 py-0.5 text-2xs font-medium text-green-700"
												title="Escalated to case"
											>
												→ case #{inc.cluster_case_id}
											</span>
										{/if}
									</div>
								</td>

								<td class="px-4 py-3">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium {severityChip(
											severityLabel(inc.cluster_severity_id)
										)}"
									>
										{severityLabel(inc.cluster_severity_id)}
									</span>
								</td>

								<td class="px-4 py-3">
									<span
										class="rounded-full px-2 py-0.5 text-2xs font-medium {statusChip(
											inc.status?.status_name ?? ''
										)}"
									>
										{inc.status?.status_name ?? 'Unknown'}
									</span>
								</td>

								<td class="px-4 py-3 text-center font-medium">
									{(inc.alert_ids ?? []).length}
								</td>

								<td class="px-4 py-3 text-xs text-muted-foreground">
									{inc.customer?.customer_name ?? '—'}
								</td>

								<td class="px-4 py-3">
									{#if inc.owner}
										<div class="flex items-center gap-2">
											<UserAvatar
												userId={inc.owner.id}
												name={inc.owner.user_name}
												size="size-6"
											/>
											<span class="text-xs">{inc.owner.user_name}</span>
										</div>
									{:else}
										<span class="text-xs italic text-muted-foreground">Unassigned</span>
									{/if}
								</td>

								<td class="px-4 py-3 text-xs">
									{#if inc.source_rule}
										<span class="text-muted-foreground">{inc.source_rule.rule_name}</span>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>

								<td class="px-4 py-3 text-xs text-muted-foreground">
									{mediumDateTimeFormatter(new Date(inc.cluster_creation_time))}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- ==================== Pagination ==================== -->
	{#if total > 0 && totalPages > 1}
		<div class="flex shrink-0 items-center justify-between">
			<p class="text-2xs text-muted-foreground">
				Page {pageNum} of {totalPages} — {total} alert cluster{total === 1 ? '' : 's'}
			</p>
			<AlertsPagination
				page={pageNum}
				pages={totalPages}
				onPageChange={(p) => {
					pageNum = p;
					void load();
				}}
			/>
		</div>
	{/if}
	</div>
</div>
