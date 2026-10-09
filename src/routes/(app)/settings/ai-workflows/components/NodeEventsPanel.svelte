<!--
  The events a node processed (its run steps, newest first) and, for the
  selected one, what it received, produced and the context it saw.
  Newer / Older walk them one by one across pages; Replay runs the
  current definition of the workflow from this node with that event.
-->
<script lang="ts">
	import {
		ChevronLeftIcon,
		ChevronRightIcon,
		ExternalLinkIcon,
		RefreshCwIcon,
		RotateCcwIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import { cn } from '$lib/utils';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		AiWorkflowsService,
		type AiEventStatus,
		type AiNodeEvent,
		type AiNodeEventsPage,
		type AiRunSummary
	} from '$lib/services/ai-workflows.service';
	import JsonBlock from './JsonBlock.svelte';
	import {
		describeApiError,
		entityHref,
		entityLabel,
		LABEL_CLASS,
		runTone,
		SELECT_CLASS,
		stepTone
	} from '../helpers/ui';

	type Props = {
		workflowId: number;
		nodeId: string;
		canReplay: boolean;
		/** Unsaved changes: a replay runs the saved definition. */
		dirty?: boolean;
		onReplayed?: (run: AiRunSummary) => void;
	};

	let { workflowId, nodeId, canReplay, dirty = false, onReplayed }: Props = $props();

	const PER_PAGE = 20;

	let status = $state<AiEventStatus | ''>('');
	let page = $state(1);
	let result = $state<AiNodeEventsPage | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let index = $state<number | null>(null);
	let detail = $state<AiNodeEvent | null>(null);
	let detailLoading = $state(false);
	let dryRun = $state(true);
	let replaying = $state(false);
	let lastReplay = $state<AiRunSummary | null>(null);

	const events = $derived(result?.data ?? []);
	const total = $derived(result?.total ?? 0);
	const lastPage = $derived(result?.last_page ?? 1);
	const position = $derived(index === null ? null : (page - 1) * PER_PAGE + index + 1);
	const hasNewer = $derived(position !== null && position > 1);
	const hasOlder = $derived(position !== null && position < total);

	async function loadPage(target: number, select: 'first' | 'last' | null = null) {
		loading = true;
		error = null;
		const res = await AiWorkflowsService.nodeEvents(workflowId, nodeId, {
			status: status || null,
			page: target,
			per_page: PER_PAGE
		});
		loading = false;
		if (!res.ok) {
			error = describeApiError(res.data, res.error?.message ?? 'Failed to load the events');
			return;
		}
		result = res.data as AiNodeEventsPage;
		page = target;
		const count = result.data.length;
		if (select && count) await pick(select === 'first' ? 0 : count - 1);
		else {
			index = null;
			detail = null;
		}
	}

	async function pick(i: number) {
		const event = events[i];
		if (!event) return;
		index = i;
		lastReplay = null;
		dryRun = event.run?.is_dry_run ?? true;
		detailLoading = true;
		const res = await AiWorkflowsService.nodeEvent(workflowId, nodeId, event.id);
		detailLoading = false;
		// Another event picked meanwhile
		if (index !== i || events[i]?.id !== event.id) return;
		detail = res.ok ? (res.data as AiNodeEvent) : event;
		if (!res.ok) {
			toast({
				title: 'Failed to load the event',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
		}
	}

	async function newer() {
		if (index === null) return;
		if (index > 0) await pick(index - 1);
		else if (page > 1) await loadPage(page - 1, 'last');
	}

	async function older() {
		if (index === null) return;
		if (index < events.length - 1) await pick(index + 1);
		else if (page < lastPage) await loadPage(page + 1, 'first');
	}

	async function replay() {
		const event = detail ?? (index !== null ? events[index] : null);
		if (!event) return;
		replaying = true;
		const res = await AiWorkflowsService.replayEvent(workflowId, nodeId, event.id, {
			dry_run: dryRun
		});
		replaying = false;
		if (!res.ok) {
			toast({
				title: 'Replay failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		lastReplay = res.data as AiRunSummary;
		toast({
			title: dryRun ? 'Dry run started' : 'Replay started',
			description: `Run ${lastReplay.uuid.slice(0, 8)} from ${nodeId}`,
			variant: 'success'
		});
		onReplayed?.(lastReplay);
	}

	$effect(() => {
		// Reload when the node or the filter changes
		void nodeId;
		void status;
		loadPage(1, 'first');
	});

	const when = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : '—');
</script>

<div class="flex min-h-0 flex-1 flex-col" data-testid="wf-node-events">
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<select
			class={cn(SELECT_CLASS, 'w-32')}
			bind:value={status}
			aria-label="Status"
			data-testid="wf-events-status"
		>
			<option value="">All statuses</option>
			<option value="succeeded">Succeeded</option>
			<option value="failed">Failed</option>
			<option value="waiting">Waiting</option>
		</select>
		<span class="text-2xs text-muted-foreground" data-testid="wf-events-total">
			{total} event{total === 1 ? '' : 's'}{result?.truncated ? ' (most recent)' : ''}
		</span>
		<Button
			variant="ghost"
			size="icon"
			class="ml-auto h-7 w-7"
			title="Refresh"
			disabled={loading}
			onclick={() => loadPage(page, index === null ? null : 'first')}
		>
			<RefreshCwIcon size={12} class={loading ? 'animate-spin' : ''} />
		</Button>
	</div>

	{#if error}
		<p class="p-3 text-2xs text-destructive">{error}</p>
	{:else if !loading && !events.length}
		<p class="p-3 text-2xs text-muted-foreground">
			This node has not processed any event{status ? ` with that status` : ''} yet.
		</p>
	{:else}
		<ul class="max-h-56 shrink-0 overflow-y-auto border-b" data-testid="wf-events-list">
			{#each events as event, i (event.id)}
				<li>
					<button
						type="button"
						class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-2xs hover:bg-muted/50 ${
							i === index ? 'bg-muted' : ''
						}`}
						onclick={() => pick(i)}
						data-testid="wf-event-row"
					>
						<span class={`rounded px-1 py-0.5 ${stepTone(event.status)}`}>{event.status}</span>
						<span class="truncate">
							{event.run?.entity_title ??
								(event.run?.entity_type
									? `${entityLabel(event.run.entity_type)} #${event.run.entity_id}`
									: 'No entity')}
						</span>
						{#if event.run?.is_dry_run}
							<span class="rounded bg-muted px-1 text-[9px] uppercase">dry</span>
						{/if}
						<span class="ml-auto shrink-0 text-muted-foreground">{when(event.started_at)}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if lastPage > 1}
			<div class="flex items-center justify-between border-b px-3 py-1 text-2xs">
				<Button
					variant="ghost"
					size="sm"
					class="h-6 px-1.5 text-2xs"
					disabled={page <= 1 || loading}
					onclick={() => loadPage(page - 1)}
				>
					Previous page
				</Button>
				<span class="text-muted-foreground">Page {page} / {lastPage}</span>
				<Button
					variant="ghost"
					size="sm"
					class="h-6 px-1.5 text-2xs"
					disabled={page >= lastPage || loading}
					onclick={() => loadPage(page + 1)}
				>
					Next page
				</Button>
			</div>
		{/if}
	{/if}

	{#if index !== null && events[index]}
		{@const event = detail ?? events[index]}
		<div
			class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
			data-testid="wf-event-detail"
		>
			<div class="flex items-center gap-1">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2"
					disabled={!hasNewer || loading}
					onclick={newer}
					data-testid="wf-event-newer"
				>
					<ChevronLeftIcon size={12} class="mr-0.5" /> Newer
				</Button>
				<span class="flex-1 text-center text-2xs text-muted-foreground">
					{position} / {total}
				</span>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2"
					disabled={!hasOlder || loading}
					onclick={older}
					data-testid="wf-event-older"
				>
					Older <ChevronRightIcon size={12} class="ml-0.5" />
				</Button>
			</div>

			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
				<dt class="text-muted-foreground">Run</dt>
				<dd class="flex items-center gap-1">
					<a
						class="font-mono text-primary hover:underline"
						href={`/settings/ai-workflows/runs/${event.run?.uuid}`}
					>
						{event.run?.uuid?.slice(0, 8)}
					</a>
					{#if event.run}
						<span class={`rounded px-1 ${runTone(event.run.status)}`}>{event.run.status}</span>
						<span class="text-muted-foreground">v{event.run.workflow_version}</span>
					{/if}
				</dd>
				{#if event.run?.entity_type}
					{@const href = entityHref(event.run.entity_type, event.run.entity_id)}
					<dt class="text-muted-foreground">Entity</dt>
					<dd>
						{#if href}
							<a class="inline-flex items-center gap-0.5 text-primary hover:underline" {href}>
								{event.run.entity_title ??
									`${entityLabel(event.run.entity_type)} #${event.run.entity_id}`}
								<ExternalLinkIcon size={10} />
							</a>
						{:else}
							{entityLabel(event.run.entity_type)} #{event.run.entity_id}
						{/if}
					</dd>
				{/if}
				<dt class="text-muted-foreground">Status</dt>
				<dd>
					<span class={`rounded px-1 ${stepTone(event.status)}`}>{event.status}</span>
					{#if event.port}<span class="ml-1 text-muted-foreground">→ {event.port}</span>{/if}
				</dd>
				<dt class="text-muted-foreground">At</dt>
				<dd>{when(event.started_at)}</dd>
				{#if event.tokens_used}
					<dt class="text-muted-foreground">Tokens</dt>
					<dd>{event.tokens_used}</dd>
				{/if}
			</dl>

			{#if event.error}
				<p
					class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-2xs text-destructive"
				>
					{event.error}
				</p>
			{/if}

			{#if detailLoading}
				<p class="text-2xs text-muted-foreground">Loading the event…</p>
			{/if}
			<JsonBlock label="Input" value={event.input} open />
			<JsonBlock label="Output" value={event.output} open />
			<JsonBlock label="Context the node saw" value={detail?.context} />

			{#if canReplay}
				<div class="flex flex-col gap-2 rounded-md border p-2">
					<span class={LABEL_CLASS}>Replay this event</span>
					<p class="text-2xs text-muted-foreground">
						Starts a new run of the saved workflow from this node, with the context above. It acts
						as the workflow owner.{dirty ? ' Unsaved changes are not part of it.' : ''}
					</p>
					<label class="flex items-center justify-between gap-2 text-xs">
						<span>Dry run (writes become suggestions, no HTTP calls)</span>
						<Switch
							checked={dryRun}
							onCheckedChange={(v: boolean) => (dryRun = v)}
							data-testid="wf-event-dry-run"
						/>
					</label>
					<Button
						size="sm"
						class="h-7 self-start"
						disabled={replaying}
						onclick={replay}
						data-testid="wf-event-replay"
					>
						<RotateCcwIcon size={12} class="mr-1" />
						{replaying ? 'Replaying…' : 'Replay'}
					</Button>
					{#if lastReplay}
						<a
							class="text-2xs text-primary hover:underline"
							href={`/settings/ai-workflows/runs/${lastReplay.uuid}`}
							data-testid="wf-event-replay-link"
						>
							Open the replayed run {lastReplay.uuid.slice(0, 8)}
						</a>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
