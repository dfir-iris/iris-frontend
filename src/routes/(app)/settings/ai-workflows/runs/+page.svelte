<!--
  AI workflow runs: filterable, paginated list (`?workflow_id=` preselects
  a workflow) and the inbound-events log (webhook triggers and callbacks,
  accepted or rejected).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import {
		AiWorkflowsService,
		aiListData,
		type AiEntityType,
		type AiInboundEvent,
		type AiPage,
		type AiRunStatus,
		type AiRunSummary,
		type AiWorkflowSummary
	} from '$lib/services/ai-workflows.service';
	import FeatureGate from '../components/FeatureGate.svelte';
	import {
		describeApiError,
		ENTITY_LABELS,
		ENTITY_TYPES,
		entityHref,
		entityLabel,
		formatDuration,
		RUN_STATUSES,
		runTone,
		SELECT_CLASS,
		TRIGGER_LABELS,
		userLabel
	} from '../helpers/ui';

	const PER_PAGE = 25;

	function numberParam(name: string): number | null {
		const raw = page.url.searchParams.get(name);
		return raw && /^\d+$/.test(raw) ? Number(raw) : null;
	}

	let tab = $state<'runs' | 'inbound'>(
		page.url.searchParams.get('tab') === 'inbound' ? 'inbound' : 'runs'
	);
	let workflowId = $state<number | null>(numberParam('workflow_id'));
	let status = $state<AiRunStatus | ''>(
		(RUN_STATUSES as string[]).includes(page.url.searchParams.get('status') ?? '')
			? (page.url.searchParams.get('status') as AiRunStatus)
			: ''
	);
	let entityType = $state<AiEntityType | ''>('');
	let entityId = $state('');
	let pageNo = $state(1);

	let workflows = $state<AiWorkflowSummary[]>([]);
	let runs = $state<AiRunSummary[]>([]);
	let total = $state(0);
	let lastPage = $state(1);
	let events = $state<AiInboundEvent[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	const workflowNames = $derived(new Map(workflows.map((w) => [w.id, w.name])));

	async function loadWorkflows() {
		const res = await AiWorkflowsService.list();
		if (res.ok) {
			workflows = aiListData<AiWorkflowSummary>(res.data).sort((a, b) =>
				a.name.localeCompare(b.name)
			);
		}
	}

	async function loadRuns() {
		loading = true;
		loadError = null;
		const id = entityId.trim();
		const res = await AiWorkflowsService.runs({
			workflow_id: workflowId,
			status: status || null,
			entity_type: entityType || null,
			entity_id: entityType && /^\d+$/.test(id) ? Number(id) : null,
			page: pageNo,
			per_page: PER_PAGE
		});
		loading = false;
		if (!res.ok) {
			loadError = describeApiError(res.data, res.error?.message ?? 'Failed to load the runs');
			return;
		}
		const body = res.data as AiPage<AiRunSummary>;
		runs = aiListData<AiRunSummary>(body);
		total = body.total ?? runs.length;
		lastPage = Math.max(1, body.last_page ?? Math.ceil(total / PER_PAGE));
	}

	async function loadEvents() {
		loading = true;
		loadError = null;
		const res = await AiWorkflowsService.inboundEvents(workflowId);
		loading = false;
		if (!res.ok) {
			loadError = describeApiError(
				res.data,
				res.error?.message ?? 'Failed to load the inbound events'
			);
			return;
		}
		events = aiListData<AiInboundEvent>(res.data);
	}

	function refresh() {
		if (tab === 'runs') loadRuns();
		else loadEvents();
	}

	function syncUrl() {
		const params = new URLSearchParams();
		if (workflowId) params.set('workflow_id', String(workflowId));
		if (status) params.set('status', status);
		if (tab === 'inbound') params.set('tab', 'inbound');
		const query = params.toString();
		goto(`${page.url.pathname}${query ? `?${query}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function applyFilters() {
		pageNo = 1;
		syncUrl();
		refresh();
	}

	function setTab(next: 'runs' | 'inbound') {
		if (tab === next) return;
		tab = next;
		syncUrl();
		refresh();
	}

	function goToPage(n: number) {
		pageNo = Math.min(Math.max(1, n), lastPage);
		loadRuns();
	}

	onMount(() => {
		if (!runtimeConfig.aiWorkflowsEnabled) return;
		loadWorkflows();
		refresh();
	});

	const TAB_CLASS = 'border-b-2 px-3 py-1.5 text-xs font-medium';
</script>

<svelte:head>
	<title>AI workflow runs</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				href="/settings/ai-workflows"
				title="Back to the workflows"
			>
				<ArrowLeftIcon size={14} />
			</Button>
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">AI workflow runs</h1>
				<p class="text-xs text-muted-foreground">
					What each workflow did, step by step, and what reached the webhook endpoint.
				</p>
			</div>
		</div>
		<Button variant="outline" size="sm" class="h-7" onclick={refresh} disabled={loading}>
			<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
			Refresh
		</Button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto p-5">
		<FeatureGate>
			<div class="mb-3 flex gap-1 border-b" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'runs'}
					class={`${TAB_CLASS} ${tab === 'runs' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}
					onclick={() => setTab('runs')}
					data-testid="wf-runs-tab"
				>
					Runs
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'inbound'}
					class={`${TAB_CLASS} ${tab === 'inbound' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}
					onclick={() => setTab('inbound')}
					data-testid="wf-inbound-tab"
				>
					Inbound events
				</button>
			</div>

			<form
				class="mb-3 flex flex-wrap items-end gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					applyFilters();
				}}
			>
				<label class="flex w-56 flex-col gap-1">
					<span class="text-2xs text-muted-foreground">Workflow</span>
					<select
						class={SELECT_CLASS}
						value={workflowId === null ? '' : String(workflowId)}
						onchange={(e) => {
							const v = (e.currentTarget as HTMLSelectElement).value;
							workflowId = v ? Number(v) : null;
							applyFilters();
						}}
						data-testid="wf-runs-filter-workflow"
					>
						<option value="">All workflows</option>
						{#each workflows as w (w.id)}
							<option value={String(w.id)}>{w.name}</option>
						{/each}
						{#if workflowId !== null && !workflowNames.has(workflowId)}
							<option value={String(workflowId)}>Workflow #{workflowId}</option>
						{/if}
					</select>
				</label>
				{#if tab === 'runs'}
					<label class="flex w-36 flex-col gap-1">
						<span class="text-2xs text-muted-foreground">Status</span>
						<select
							class={SELECT_CLASS}
							bind:value={status}
							onchange={applyFilters}
							data-testid="wf-runs-filter-status"
						>
							<option value="">Any</option>
							{#each RUN_STATUSES as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</label>
					<label class="flex w-36 flex-col gap-1">
						<span class="text-2xs text-muted-foreground">Entity</span>
						<select class={SELECT_CLASS} bind:value={entityType} onchange={applyFilters}>
							<option value="">Any</option>
							{#each ENTITY_TYPES as t (t)}
								<option value={t}>{ENTITY_LABELS[t]}</option>
							{/each}
						</select>
					</label>
					<label class="flex w-28 flex-col gap-1">
						<span class="text-2xs text-muted-foreground">Entity id</span>
						<Input
							class="h-8 text-xs"
							inputmode="numeric"
							disabled={!entityType}
							bind:value={entityId}
						/>
					</label>
					<Button type="submit" size="sm" variant="outline" class="h-8">Apply</Button>
				{/if}
			</form>

			{#if loadError}
				<ApiError error={loadError} onRetry={refresh} />
			{:else if tab === 'runs'}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs" data-testid="wf-runs-table">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-24 px-3 py-2">Status</th>
								<th class="px-3 py-2">Workflow</th>
								<th class="w-24 px-3 py-2">Trigger</th>
								<th class="px-3 py-2">Entity</th>
								<th class="w-36 px-3 py-2">Acting as</th>
								<th class="w-40 px-3 py-2">Started</th>
								<th class="w-20 px-3 py-2">Duration</th>
								<th class="w-20 px-3 py-2 text-right">Tokens</th>
							</tr>
						</thead>
						<tbody>
							{#each runs as run (run.uuid)}
								{@const href = entityHref(run.entity_type, run.entity_id)}
								<tr class="border-t hover:bg-muted/20" data-testid={`wf-run-row-${run.uuid}`}>
									<td class="px-3 py-2">
										<a href={`/settings/ai-workflows/runs/${run.uuid}`}>
											<span class={`rounded px-1.5 py-0.5 text-2xs ${runTone(run.status)}`}>
												{run.status}
											</span>
										</a>
										{#if run.is_dry_run}
											<span class="ml-1 text-2xs text-muted-foreground">dry</span>
										{/if}
									</td>
									<td class="max-w-0 px-3 py-2">
										<a
											class="block truncate font-medium underline-offset-2 hover:underline"
											href={`/settings/ai-workflows/runs/${run.uuid}`}
										>
											{run.workflow_name}
											<span class="font-mono text-2xs text-muted-foreground">
												v{run.workflow_version}
											</span>
										</a>
										{#if run.error}
											<div class="truncate text-2xs text-destructive" title={run.error}>
												{run.error}
											</div>
										{/if}
									</td>
									<td class="px-3 py-2">{TRIGGER_LABELS[run.trigger_type] ?? run.trigger_type}</td>
									<td class="max-w-0 truncate px-3 py-2">
										{#if run.entity_type}
											{#if href}
												<a class="underline-offset-2 hover:underline" {href}>
													{entityLabel(run.entity_type)} #{run.entity_id}
												</a>
											{:else}
												{entityLabel(run.entity_type)} #{run.entity_id}
											{/if}
											{#if run.entity_title}
												<span class="text-muted-foreground">· {run.entity_title}</span>
											{/if}
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
									<td class="truncate px-3 py-2">{userLabel(run.run_as)}</td>
									<td class="px-3 py-2">
										{run.started_at ? formatDateTime(run.started_at) : '—'}
									</td>
									<td class="px-3 py-2">
										{formatDuration(
											run.started_at,
											run.finished_at ?? (run.status === 'running' ? null : run.updated_at)
										)}
									</td>
									<td class="px-3 py-2 text-right font-mono">{run.tokens_used}</td>
								</tr>
							{:else}
								<tr>
									<td colspan="8" class="px-3 py-8 text-center text-muted-foreground">
										{loading ? 'Loading…' : 'No runs match these filters.'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if lastPage > 1}
					<div class="mt-2 flex items-center justify-end gap-2 text-xs">
						<span class="text-muted-foreground">{total} runs · page {pageNo} / {lastPage}</span>
						<Button
							variant="outline"
							size="icon"
							class="h-7 w-7"
							disabled={pageNo <= 1 || loading}
							onclick={() => goToPage(pageNo - 1)}
							aria-label="Previous page"
						>
							<ChevronLeftIcon size={13} />
						</Button>
						<Button
							variant="outline"
							size="icon"
							class="h-7 w-7"
							disabled={pageNo >= lastPage || loading}
							onclick={() => goToPage(pageNo + 1)}
							aria-label="Next page"
						>
							<ChevronRightIcon size={13} />
						</Button>
					</div>
				{/if}
			{:else}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs" data-testid="wf-inbound-table">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="w-40 px-3 py-2">Received</th>
								<th class="w-20 px-3 py-2">Kind</th>
								<th class="px-3 py-2">Workflow</th>
								<th class="w-24 px-3 py-2">Status</th>
								<th class="px-3 py-2">Reason</th>
								<th class="w-32 px-3 py-2">Source IP</th>
								<th class="w-20 px-3 py-2 text-right">Bytes</th>
								<th class="w-24 px-3 py-2">Run</th>
							</tr>
						</thead>
						<tbody>
							{#each events as ev (ev.id)}
								<tr class="border-t">
									<td class="px-3 py-2">{ev.created_at ? formatDateTime(ev.created_at) : '—'}</td>
									<td class="px-3 py-2">{ev.kind}</td>
									<td class="max-w-0 truncate px-3 py-2">
										{ev.workflow_id
											? (workflowNames.get(ev.workflow_id) ?? `#${ev.workflow_id}`)
											: '—'}
									</td>
									<td class="px-3 py-2">
										<span
											class={`rounded px-1.5 py-0.5 text-2xs ${ev.status === 'accepted' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}
										>
											{ev.status}
										</span>
									</td>
									<td class="max-w-0 truncate px-3 py-2" title={ev.reason ?? ''}>
										{ev.reason ?? '—'}
									</td>
									<td class="px-3 py-2 font-mono">{ev.source_ip ?? '—'}</td>
									<td class="px-3 py-2 text-right font-mono">{ev.payload_bytes}</td>
									<td class="px-3 py-2">
										{#if ev.run_uuid}
											<a
												class="underline-offset-2 hover:underline"
												href={`/settings/ai-workflows/runs/${ev.run_uuid}`}
											>
												Open
											</a>
										{:else if ev.run_id}
											<span class="font-mono text-muted-foreground">#{ev.run_id}</span>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="8" class="px-3 py-8 text-center text-muted-foreground">
										{loading ? 'Loading…' : 'No inbound events.'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>
