<!--
  AI suggestions inbox: every suggestion the user can see, across
  alerts, clusters, cases, war rooms and those about no entity, with
  Accept / Dismiss / Answer on each. Dry-run suggestions show here only,
  for review, and are part of the default "To review" list. `?id=`
  (the link of a suggestion notification) brings one suggestion
  forward, expanded, even when the filters would hide it. New and
  updated suggestions arrive live.

  The list is split into what needs a decision, what dry runs produced
  (clearable one by one or all at once) and what is resolved.
-->
<script lang="ts">
	import { getContext, onDestroy, onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { CheckCheckIcon, LightbulbIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import { cn } from '$lib/utils';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import AiSuggestionCard from '$lib/components/ai-suggestions/AiSuggestionCard.svelte';
	import { AI_SUGGESTION_STATUS_LABELS } from '$lib/components/ai-suggestions/ai-suggestion-format';
	import {
		AI_SUGGESTION_INBOX_DEFAULTS,
		AI_SUGGESTION_INBOX_STATUS_LABELS,
		AI_SUGGESTION_INBOX_STATUSES,
		AI_SUGGESTION_SEVERITIES,
		aiSuggestionInboxApply,
		aiSuggestionInboxFiltered,
		aiSuggestionInboxSections,
		aiSuggestionInboxStatusParam,
		aiSuggestionInboxWorkflows,
		type AiSuggestionInboxFilters
	} from '$lib/components/ai-suggestions/ai-suggestion-inbox';
	import {
		AiSuggestionsService,
		aiSuggestionsUnwrapList,
		type AiSuggestion,
		type AiSuggestionEntityType,
		type AiSuggestionSocketEvent
	} from '$lib/services/ai-suggestions.service';
	import { AiWorkflowsService, aiListData } from '$lib/services/ai-workflows.service';
	import {
		AI_SUGGESTION_ENTITY_LABELS,
		aiSuggestionsEnabled,
		aiSuggestionsIsSafeId
	} from '$lib/stores/ai-suggestions.store.svelte';
	import { notifications } from '$lib/stores/notifications.store';

	const SELECT_CLASS = 'h-7 rounded-md border bg-background px-2 text-xs';
	const STATUS_LABELS: Record<string, string> = {
		...AI_SUGGESTION_STATUS_LABELS,
		...AI_SUGGESTION_INBOX_STATUS_LABELS,
		dry_run: 'Dry runs'
	};
	const ENTITY_TYPES = Object.keys(AI_SUGGESTION_ENTITY_LABELS) as AiSuggestionEntityType[];

	const userCtx = getContext<UserCtx>(USER_CTX);
	const isAdmin = $derived(!!userCtx?.can('server_administrator'));
	const enabled = $derived(aiSuggestionsEnabled());

	let filters = $state<AiSuggestionInboxFilters>({ ...AI_SUGGESTION_INBOX_DEFAULTS });
	let items = $state<AiSuggestion[]>([]);
	let knownWorkflows = $state<Array<{ id: number; name: string }>>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	const focusId = $derived.by(() => {
		const raw = page.url.searchParams.get('id');
		const id = raw && /^\d+$/.test(raw) ? Number(raw) : null;
		return aiSuggestionsIsSafeId(id) ? id : null;
	});
	const workflows = $derived(aiSuggestionInboxWorkflows(items, knownWorkflows));

	// Names for the workflow filter; needs `ai_workflows_read`, the
	// suggestions loaded fill in the others.
	async function loadWorkflows() {
		const res = await AiWorkflowsService.list();
		if (res.ok) {
			knownWorkflows = aiListData<{ id: number; name: string }>(res.data).map((w) => ({
				id: w.id,
				name: w.name
			}));
		}
	}

	let seq = 0;
	async function load() {
		const mine = ++seq;
		loading = true;
		loadError = null;
		const res = await AiSuggestionsService.list({
			status: aiSuggestionInboxStatusParam(filters.status),
			workflow_id: filters.workflowId,
			entity_type: filters.entityType || null,
			severity: filters.severity || null,
			mine: filters.mine
		});
		if (mine !== seq) return;
		loading = false;
		if (!res.ok) {
			loadError = res.error?.message ?? 'Could not load the suggestions';
			return;
		}
		let list = aiSuggestionsUnwrapList(res.data);
		const id = focusId;
		if (id !== null && !list.some((s) => s.id === id)) {
			const one = await AiSuggestionsService.get(id);
			if (mine !== seq) return;
			if (one.ok && one.data && typeof one.data === 'object') list = [one.data, ...list];
		}
		items = list;
		if (id !== null) {
			await tick();
			document
				.querySelector(`[data-suggestion-id="${id}"]`)
				?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}
	}

	function onChanged(updated: AiSuggestion | null) {
		if (!updated) {
			load();
			return;
		}
		items = items.map((s) => (s.id === updated.id ? updated : s));
	}

	let offSocket: (() => void) | null = null;

	onMount(() => {
		if (!aiSuggestionsEnabled()) return;
		loadWorkflows();
		load();
		offSocket = notifications.onSocketEvent<AiSuggestionSocketEvent>('ai_suggestion', (event) => {
			items = aiSuggestionInboxApply(items, event, filters);
		});
	});

	onDestroy(() => offSocket?.());

	// A notification clicked while already on the page only changes `?id=`
	let lastFocus = untrack(() => focusId);
	$effect(() => {
		const id = focusId;
		if (id === lastFocus) return;
		lastFocus = id;
		if (id !== null && untrack(() => enabled)) load();
	});

	const openCount = $derived(items.filter((s) => s.status === 'open').length);
	const dryRunCount = $derived(items.filter((s) => s.status === 'dry_run').length);
	const sections = $derived(aiSuggestionInboxSections(items));
	const filtered = $derived(aiSuggestionInboxFiltered(filters));

	function setStatus(status: AiSuggestionInboxFilters['status']) {
		if (filters.status === status) return;
		filters.status = status;
		load();
	}

	function resetFilters() {
		filters = { ...AI_SUGGESTION_INBOX_DEFAULTS };
		load();
	}

	// Dry-run suggestions never become open: clear them all at once
	let clearOpen = $state(false);
	let clearing = $state(false);
	async function clearDryRuns() {
		clearing = true;
		let failed = 0;
		try {
			for (const s of items.filter((o) => o.status === 'dry_run')) {
				const res = await AiSuggestionsService.dismiss(s.id);
				if (res.ok && res.data && typeof res.data === 'object' && 'id' in res.data) {
					const updated = res.data as AiSuggestion;
					items = items.map((o) => (o.id === updated.id ? updated : o));
				} else {
					failed++;
				}
			}
		} finally {
			clearing = false;
			clearOpen = false;
		}
		if (failed) {
			toast({
				title: `${failed} dry-run suggestion${failed === 1 ? '' : 's'} could not be cleared`,
				variant: 'destructive'
			});
		} else {
			toast({ title: 'Dry-run suggestions cleared', variant: 'success' });
		}
		// Cleared ones leave the review list
		load();
	}
</script>

<svelte:head>
	<title>Suggestions</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400"
			>
				<LightbulbIcon size={16} />
			</span>
			<div class="min-w-0 leading-tight">
				<h1 class="text-sm font-semibold">Suggestions</h1>
				<p class="truncate text-xs text-muted-foreground">
					What the workflows propose, ask or flagged, across alerts, cases and war rooms.
				</p>
			</div>
		</div>
		{#if enabled}
			<Button variant="outline" size="sm" class="h-7" onclick={load} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
		{/if}
	</header>

	{#if !enabled}
		<div
			class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
			data-testid="ai-suggestions-inbox-disabled"
		>
			<LightbulbIcon size={32} class="opacity-40" />
			<p class="text-sm">Workflows are disabled on this instance.</p>
		</div>
	{:else}
		<div
			class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/20 px-5 py-2"
			data-testid="ai-suggestions-inbox-filters"
		>
			<div
				class="flex items-center rounded-md border bg-background p-0.5"
				role="tablist"
				aria-label="Status"
			>
				{#each AI_SUGGESTION_INBOX_STATUSES as s (s)}
					<button
						type="button"
						role="tab"
						aria-selected={filters.status === s}
						class={cn(
							'rounded px-2.5 py-1 text-xs transition-colors',
							filters.status === s
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
						onclick={() => setStatus(s)}
						data-testid={`ai-suggestions-status-${s}`}
					>
						{STATUS_LABELS[s] ?? s}
					</button>
				{/each}
			</div>

			<select
				class={cn(SELECT_CLASS, 'w-48')}
				aria-label="Workflow"
				value={filters.workflowId === null ? '' : String(filters.workflowId)}
				onchange={(e) => {
					const v = (e.currentTarget as HTMLSelectElement).value;
					filters.workflowId = v ? Number(v) : null;
					load();
				}}
			>
				<option value="">All workflows</option>
				{#each workflows as w (w.id)}
					<option value={String(w.id)}>{w.name}</option>
				{/each}
			</select>
			<select
				class={cn(SELECT_CLASS, 'w-36')}
				aria-label="About"
				bind:value={filters.entityType}
				onchange={load}
			>
				<option value="">About anything</option>
				{#each ENTITY_TYPES as t (t)}
					<option value={t}>{AI_SUGGESTION_ENTITY_LABELS[t]}</option>
				{/each}
				<option value="none">No specific entity</option>
			</select>
			<select
				class={cn(SELECT_CLASS, 'w-32')}
				aria-label="Severity"
				bind:value={filters.severity}
				onchange={load}
			>
				<option value="">Any severity</option>
				{#each AI_SUGGESTION_SEVERITIES as s (s)}
					<option value={s} class="capitalize">{s}</option>
				{/each}
			</select>
			{#if isAdmin}
				<label class="flex items-center gap-1.5 text-xs">
					<input type="checkbox" bind:checked={filters.mine} onchange={load} />
					Addressed to me
				</label>
			{/if}
			{#if filtered}
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={resetFilters}
					data-testid="ai-suggestions-reset"
				>
					<XIcon size={12} class="mr-1" />
					Reset
				</Button>
			{/if}

			<span class="ml-auto text-2xs tabular-nums text-muted-foreground">
				{items.length} shown{openCount ? ` · ${openCount} open` : ''}{dryRunCount
					? ` · ${dryRunCount} from dry runs`
					: ''}
			</span>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
			{#if loadError}
				<ApiError error={loadError} onRetry={load} />
			{:else if items.length === 0}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="ai-suggestions-inbox-empty"
				>
					{#if loading}
						<RefreshCwIcon size={24} class="animate-spin opacity-40" />
						<p class="text-sm">Loading…</p>
					{:else if filters.status === 'review' && !filtered}
						<CheckCheckIcon size={32} class="opacity-40" />
						<p class="text-sm font-medium text-foreground">All caught up</p>
						<p class="text-xs">Nothing left to review. New suggestions appear here live.</p>
					{:else}
						<LightbulbIcon size={32} class="opacity-40" />
						<p class="text-sm">No suggestions match these filters.</p>
						{#if filtered}
							<Button variant="outline" size="sm" class="mt-1 h-7" onclick={resetFilters}>
								Reset the filters
							</Button>
						{/if}
					{/if}
				</div>
			{:else}
				<div class="flex flex-col gap-5" data-testid="ai-suggestions-inbox-list">
					{#each sections as section (section.key)}
						<section
							class="flex flex-col gap-1"
							data-testid={`ai-suggestions-section-${section.key}`}
						>
							{#if sections.length > 1 || section.key !== 'open'}
								<div class="mb-1 flex items-baseline gap-2 px-1">
									<h2 class="text-xs font-semibold">{section.title}</h2>
									<span class="text-2xs tabular-nums text-muted-foreground"
										>{section.items.length}</span
									>
									{#if section.hint}
										<span class="hidden truncate text-2xs text-muted-foreground sm:inline"
											>· {section.hint}</span
										>
									{/if}
									{#if section.key === 'dry_run'}
										<Button
											variant="ghost"
											size="sm"
											class="ml-auto h-6 px-2 text-2xs"
											onclick={() => (clearOpen = true)}
											disabled={clearing}
											data-testid="ai-suggestions-clear-dry-runs"
										>
											Clear all
										</Button>
									{/if}
								</div>
							{/if}
							{#each section.items as s (s.id)}
								<AiSuggestionCard
									suggestion={s}
									{onChanged}
									showEntity
									highlight={s.id === focusId}
								/>
							{/each}
						</section>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={clearOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Clear the dry-run suggestions?</Dialog.Title>
			<Dialog.Description>
				The {dryRunCount} suggestion{dryRunCount === 1 ? '' : 's'} produced by dry runs in this list
				will be marked dismissed. Nothing is run.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (clearOpen = false)} disabled={clearing}
				>Cancel</Button
			>
			<Button onclick={clearDryRuns} disabled={clearing}>
				{clearing ? 'Clearing…' : 'Clear all'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
