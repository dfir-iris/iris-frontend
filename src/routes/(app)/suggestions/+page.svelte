<!--
  AI suggestions inbox: every suggestion the user can see, across
  alerts, clusters, cases, war rooms and those about no entity, with
  Accept / Dismiss / Answer on each. Dry-run suggestions show here only,
  for review, and are part of the default "To review" list. `?id=`
  (the link of a suggestion notification) brings one suggestion
  forward, expanded, even when the filters would hide it. New and
  updated suggestions arrive live.
-->
<script lang="ts">
	import { getContext, onDestroy, onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { LightbulbIcon, RefreshCwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
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

	const SELECT_CLASS = 'h-8 w-full rounded-md border bg-background px-2 text-xs';
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
</script>

<svelte:head>
	<title>AI suggestions</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="leading-tight">
			<h1 class="text-sm font-semibold">AI suggestions</h1>
			<p class="text-xs text-muted-foreground">
				What the AI workflows propose, ask or flagged, across alerts, cases and war rooms.
			</p>
		</div>
		{#if enabled}
			<Button variant="outline" size="sm" class="h-7" onclick={load} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
		{/if}
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto p-5">
		{#if !enabled}
			<div
				class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
				data-testid="ai-suggestions-inbox-disabled"
			>
				<LightbulbIcon size={32} class="opacity-40" />
				<p class="text-sm">AI workflows are disabled on this instance.</p>
			</div>
		{:else}
			<div class="mb-3 flex flex-wrap items-end gap-2" data-testid="ai-suggestions-inbox-filters">
				<label class="flex w-36 flex-col gap-1">
					<span class="text-2xs text-muted-foreground">Status</span>
					<select class={SELECT_CLASS} bind:value={filters.status} onchange={load}>
						{#each AI_SUGGESTION_INBOX_STATUSES as s (s)}
							<option value={s}
								>{AI_SUGGESTION_INBOX_STATUS_LABELS[s] ??
									AI_SUGGESTION_STATUS_LABELS[s] ??
									s}</option
							>
						{/each}
					</select>
				</label>
				<label class="flex w-56 flex-col gap-1">
					<span class="text-2xs text-muted-foreground">Workflow</span>
					<select
						class={SELECT_CLASS}
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
				</label>
				<label class="flex w-40 flex-col gap-1">
					<span class="text-2xs text-muted-foreground">About</span>
					<select class={SELECT_CLASS} bind:value={filters.entityType} onchange={load}>
						<option value="">Anything</option>
						{#each ENTITY_TYPES as t (t)}
							<option value={t}>{AI_SUGGESTION_ENTITY_LABELS[t]}</option>
						{/each}
						<option value="none">No specific entity</option>
					</select>
				</label>
				<label class="flex w-32 flex-col gap-1">
					<span class="text-2xs text-muted-foreground">Severity</span>
					<select class={SELECT_CLASS} bind:value={filters.severity} onchange={load}>
						<option value="">Any</option>
						{#each AI_SUGGESTION_SEVERITIES as s (s)}
							<option value={s} class="capitalize">{s}</option>
						{/each}
					</select>
				</label>
				{#if isAdmin}
					<label class="flex h-8 items-center gap-1.5 text-xs">
						<input type="checkbox" bind:checked={filters.mine} onchange={load} />
						Only those addressed to me
					</label>
				{/if}
				<span class="ml-auto text-2xs text-muted-foreground">
					{items.length} shown{openCount ? ` · ${openCount} open` : ''}{dryRunCount
						? ` · ${dryRunCount} from dry runs`
						: ''}
				</span>
			</div>

			{#if loadError}
				<ApiError error={loadError} onRetry={load} />
			{:else if items.length === 0}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="ai-suggestions-inbox-empty"
				>
					<LightbulbIcon size={32} class="opacity-40" />
					<p class="text-sm">{loading ? 'Loading…' : 'No suggestions match these filters.'}</p>
				</div>
			{:else}
				<div class="flex max-w-5xl flex-col gap-1" data-testid="ai-suggestions-inbox-list">
					{#each items as s (s.id)}
						<AiSuggestionCard suggestion={s} {onChanged} showEntity highlight={s.id === focusId} />
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
