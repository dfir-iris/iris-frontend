<!--
  Run inspector: header (status, workflow version, entity, acting user,
  tokens), the step timeline with each step's tool and LLM calls, waits,
  suggestions, and the trigger payload / context. Cancel, rerun and
  JSON export (admins and the workflow owner). Live while the run is
  running or waiting: each pushed change re-reads it, and it is polled
  as a fallback.
-->
<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ArrowLeftIcon,
		BanIcon,
		DownloadIcon,
		RefreshCwIcon,
		RotateCcwIcon,
		WrenchIcon,
		SparklesIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { notifications } from '$lib/stores/notifications.store';
	import {
		AI_RUN_LIVE_EVENT,
		AI_RUN_UNWATCH,
		AI_RUN_WATCH,
		AiWorkflowsService,
		type AiRunLiveEvent,
		type AiLlmCall,
		type AiRunDetail,
		type AiRunSummary,
		type AiToolCall
	} from '$lib/services/ai-workflows.service';
	import FeatureGate from '../../components/FeatureGate.svelte';
	import JsonBlock from '../../components/JsonBlock.svelte';
	import {
		CLASSIFICATION_TONES,
		describeApiError,
		downloadJson,
		entityHref,
		entityLabel,
		EXEC_MODE_LABELS,
		EXEC_MODE_TONES,
		formatDuration,
		nodeIcon,
		nodeTone,
		runTone,
		stepTone,
		TRIGGER_LABELS,
		userLabel,
		WAIT_STATUS_TONES
	} from '../../helpers/ui';

	const POLL_MS = 3000;

	const userCtx = getContext<UserCtx>(USER_CTX);
	const canWrite = $derived(userCtx?.can('ai_workflows_write') ?? false);

	const uuid = $derived(page.params.uuid ?? '');

	let run = $state<AiRunDetail | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let confirmCancelOpen = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let loadedUuid = '';

	const live = $derived(run?.status === 'running' || run?.status === 'waiting');
	const steps = $derived([...(run?.steps ?? [])].sort((a, b) => a.seq - b.seq));
	const stepIds = $derived(new Set(steps.map((s) => s.id)));
	const toolsByStep = $derived(groupByStep(run?.tool_calls ?? []));
	const llmByStep = $derived(groupByStep(run?.llm_calls ?? []));
	const orphanTools = $derived(
		(run?.tool_calls ?? []).filter((c) => c.step_id === null || !stepIds.has(c.step_id))
	);
	const orphanLlm = $derived(
		(run?.llm_calls ?? []).filter((c) => c.step_id === null || !stepIds.has(c.step_id))
	);
	const entityLink = $derived(run ? entityHref(run.entity_type, run.entity_id) : null);

	function groupByStep<T extends { step_id: number | null }>(list: T[]): Map<number, T[]> {
		const map = new Map<number, T[]>();
		for (const item of list) {
			if (item.step_id === null) continue;
			const bucket = map.get(item.step_id) ?? [];
			bucket.push(item);
			map.set(item.step_id, bucket);
		}
		return map;
	}

	function stopPolling() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	async function load(quiet = false) {
		stopPolling();
		const current = uuid;
		if (!quiet) {
			loading = true;
			loadError = null;
		}
		const res = await AiWorkflowsService.getRun(current);
		if (current !== uuid) return;
		loading = false;
		if (!res.ok) {
			if (!quiet || !run) {
				loadError =
					res.status === 404
						? 'Run not found'
						: describeApiError(res.data, res.error?.message ?? 'Failed to load the run');
			}
			return;
		}
		run = res.data as AiRunDetail;
		if (run.status === 'running' || run.status === 'waiting') {
			timer = setTimeout(() => load(true), POLL_MS);
		}
	}

	$effect(() => {
		const id = uuid;
		if (!runtimeConfig.aiWorkflowsEnabled || !userCtx?.ready || !id) return;
		if (id !== loadedUuid) {
			loadedUuid = id;
			run = null;
			load();
		}
	});

	// Pushes only say something changed: re-read, at most every 300 ms
	const PUSH_DEBOUNCE_MS = 300;
	let pushTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const id = uuid;
		if (!runtimeConfig.aiWorkflowsEnabled || !id) return;
		const offEvent = notifications.onSocketEvent<AiRunLiveEvent>(AI_RUN_LIVE_EVENT, (event) => {
			if (event?.run_uuid !== id || pushTimer) return;
			pushTimer = setTimeout(() => {
				pushTimer = null;
				if (id === uuid) load(true);
			}, PUSH_DEBOUNCE_MS);
		});
		const offRoom = notifications.watchRoom(AI_RUN_WATCH, AI_RUN_UNWATCH, { run_uuid: id });
		return () => {
			offEvent();
			offRoom();
			if (pushTimer) clearTimeout(pushTimer);
			pushTimer = null;
		};
	});

	onDestroy(stopPolling);

	async function cancelRun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.cancelRun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Cancel failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		toast({ title: 'Run cancelled', variant: 'success' });
		load(true);
	}

	async function rerun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.rerun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Rerun failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const created = res.data as AiRunSummary;
		toast({ title: 'Run restarted', variant: 'success' });
		goto(`/settings/ai-workflows/runs/${created.uuid}`);
	}

	async function exportRun() {
		if (!run) return;
		busy = true;
		const res = await AiWorkflowsService.exportRun(run.uuid);
		busy = false;
		if (!res.ok) {
			toast({
				title: 'Export failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		downloadJson(`ai-workflow-run-${run.uuid}.json`, res.data);
	}

	const BADGE = 'rounded px-1.5 py-0.5 text-2xs';
</script>

<svelte:head>
	<title>{run ? `Run · ${run.workflow_name}` : 'Workflow run'}</title>
</svelte:head>

{#snippet toolCall(call: AiToolCall)}
	<div class="rounded-md border bg-background p-2" data-testid={`wf-tool-call-${call.id}`}>
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<WrenchIcon size={12} class="text-muted-foreground" />
			<span class="font-mono font-medium">{call.tool_name}</span>
			<span class={`${BADGE} ${CLASSIFICATION_TONES[call.classification] ?? ''}`}>
				{call.classification}
			</span>
			<span class={`${BADGE} ${EXEC_MODE_TONES[call.execution_mode] ?? 'bg-muted'}`}>
				{EXEC_MODE_LABELS[call.execution_mode] ?? call.execution_mode}
			</span>
			<span class="text-2xs text-muted-foreground">as {userLabel(call.acting_user)}</span>
			{#if call.duration_ms !== null}
				<span class="text-2xs text-muted-foreground">{call.duration_ms} ms</span>
			{/if}
			{#if call.suggestion_id}
				<span class="text-2xs text-muted-foreground">suggestion #{call.suggestion_id}</span>
			{/if}
		</div>
		{#if call.error}
			<p class="mt-1 text-2xs text-destructive">{call.error}</p>
		{/if}
		<div class="mt-1 flex flex-col gap-1">
			<JsonBlock label="Arguments" value={call.arguments} />
			{#if call.result_hidden === true}
				<p
					class="text-2xs italic text-muted-foreground"
					data-testid={`wf-tool-call-hidden-${call.id}`}
				>
					Result withheld: visible only to the analyst who accepted the action.
				</p>
			{:else}
				<JsonBlock label="Result" value={call.result} />
			{/if}
			{#if call.result_truncated === true}
				<span
					class={`${BADGE} w-fit bg-amber-500/15 text-amber-700 dark:text-amber-300`}
					title="The stored result was cut to 16 KB"
					data-testid={`wf-tool-call-truncated-${call.id}`}
				>
					truncated
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet llmCall(call: AiLlmCall)}
	<div class="rounded-md border bg-background p-2" data-testid={`wf-llm-call-${call.id}`}>
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<SparklesIcon size={12} class="text-muted-foreground" />
			<span class="font-medium">{call.provider ?? 'LLM'}</span>
			{#if call.model}<span class="font-mono text-2xs">{call.model}</span>{/if}
			<span class="text-2xs text-muted-foreground">
				{call.prompt_tokens} in · {call.completion_tokens} out · {call.bytes_sent} bytes sent
			</span>
			{#if call.redacted}
				<span class={`${BADGE} bg-amber-500/15 text-amber-700 dark:text-amber-300`}>redacted</span>
			{/if}
			{#if call.restriction_level}
				<span class="text-2xs text-muted-foreground">policy: {call.restriction_level}</span>
			{/if}
		</div>
		{#if call.error}
			<p class="mt-1 text-2xs text-destructive">{call.error}</p>
		{/if}
		{#if call.snapshots_visible}
			<div class="mt-1 flex flex-col gap-1">
				<JsonBlock label="Request" value={call.request_snapshot} />
				<JsonBlock label="Response" value={call.response_snapshot} />
			</div>
		{:else}
			<p class="mt-1 text-2xs text-muted-foreground">
				The request and response are only shown to administrators and the workflow owner.
			</p>
		{/if}
	</div>
{/snippet}

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex min-w-0 items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				href={run?.workflow_id
					? `/settings/ai-workflows/runs?workflow_id=${run.workflow_id}`
					: '/settings/ai-workflows/runs'}
				title="Back to the runs"
			>
				<ArrowLeftIcon size={14} />
			</Button>
			<div class="min-w-0 leading-tight">
				<h1 class="flex items-center gap-2 truncate text-sm font-semibold">
					{run?.workflow_name ?? 'Run'}
					{#if run}
						<span class="font-mono text-2xs font-normal text-muted-foreground">
							v{run.workflow_version}
						</span>
						<span class={`${BADGE} ${runTone(run.status)}`} data-testid="wf-run-status">
							{run.status}
						</span>
						{#if run.is_dry_run}
							<span class={`${BADGE} bg-muted`}>dry run</span>
						{/if}
						{#if live}
							<RefreshCwIcon size={11} class="animate-spin text-muted-foreground" />
						{/if}
					{/if}
				</h1>
				<p class="truncate font-mono text-2xs text-muted-foreground">{uuid}</p>
			</div>
		</div>
		{#if run}
			<div class="flex items-center gap-1.5">
				{#if run.workflow_id}
					<Button
						variant="ghost"
						size="sm"
						class="h-7"
						href={`/settings/ai-workflows/${run.workflow_id}`}
					>
						Open workflow
					</Button>
				{/if}
				{#if live && canWrite}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						disabled={busy}
						onclick={() => (confirmCancelOpen = true)}
						data-testid="wf-run-cancel"
					>
						<BanIcon size={12} class="mr-1" /> Cancel
					</Button>
				{/if}
				{#if !live && canWrite && run.workflow_id}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						disabled={busy}
						onclick={rerun}
						data-testid="wf-run-rerun"
					>
						<RotateCcwIcon size={12} class="mr-1" /> Rerun
					</Button>
				{/if}
				{#if run.can_view_llm_snapshots}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						disabled={busy}
						onclick={exportRun}
						data-testid="wf-run-export"
					>
						<DownloadIcon size={12} class="mr-1" /> Export JSON
					</Button>
				{/if}
				<Button
					variant="outline"
					size="icon"
					class="h-7 w-7"
					disabled={loading}
					onclick={() => load()}
					title="Refresh"
				>
					<RefreshCwIcon size={12} />
				</Button>
			</div>
		{/if}
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto p-5">
		<FeatureGate>
			{#if loadError}
				<ApiError error={loadError} onRetry={() => load()} />
			{:else if !run}
				<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
			{:else}
				<dl
					class="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border p-3 text-xs md:grid-cols-4"
					data-testid="wf-run-header"
				>
					<div>
						<dt class="text-2xs text-muted-foreground">Trigger</dt>
						<dd>{TRIGGER_LABELS[run.trigger_type] ?? run.trigger_type}</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Entity</dt>
						<dd class="truncate">
							{#if run.entity_type}
								{#if entityLink}
									<a class="underline-offset-2 hover:underline" href={entityLink}>
										{entityLabel(run.entity_type)} #{run.entity_id}
									</a>
								{:else}
									{entityLabel(run.entity_type)} #{run.entity_id}
								{/if}
								{#if run.entity_title}
									<span class="text-muted-foreground">· {run.entity_title}</span>
								{/if}
							{:else}
								—
							{/if}
						</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Acting as</dt>
						<dd>{userLabel(run.run_as)}</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Triggered by</dt>
						<dd>{userLabel(run.triggered_by)}</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Started</dt>
						<dd>{run.started_at ? formatDateTime(run.started_at) : '—'}</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Duration</dt>
						<dd>
							{formatDuration(run.started_at, live ? null : (run.finished_at ?? run.updated_at))}
						</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Tokens</dt>
						<dd class="font-mono">{run.tokens_used}</dd>
					</div>
					<div>
						<dt class="text-2xs text-muted-foreground">Steps</dt>
						<dd class="font-mono">
							{run.step_count}
							{#if run.chain_depth}
								<span class="text-muted-foreground">· chain depth {run.chain_depth}</span>
							{/if}
						</dd>
					</div>
				</dl>

				{#if run.error}
					<p
						class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
						data-testid="wf-run-error"
					>
						{run.error}
					</p>
				{/if}

				<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
					<section class="min-w-0">
						<h2 class="mb-2 text-xs font-semibold">Steps</h2>
						{#if run.tool_calls_omitted}
							<p
								class="mb-2 text-2xs text-amber-700 dark:text-amber-300"
								data-testid="wf-run-tool-calls-omitted"
							>
								{run.tool_calls_omitted} tool call(s) not shown: only the first 200 of each step are
								listed.
							</p>
						{/if}
						<ol class="flex flex-col gap-2" data-testid="wf-run-steps">
							{#each steps as step (step.id)}
								{@const Icon = nodeIcon(step.node_type)}
								{@const tools = toolsByStep.get(step.id) ?? []}
								{@const llms = llmByStep.get(step.id) ?? []}
								<li class="rounded-md border p-2.5">
									<div class="flex flex-wrap items-center gap-1.5 text-xs">
										<span class="w-6 font-mono text-2xs text-muted-foreground">#{step.seq}</span>
										<span
											class={`flex h-5 w-5 items-center justify-center rounded ${nodeTone(step.node_type)}`}
										>
											<Icon size={11} />
										</span>
										<span class="font-medium">{step.node_label || step.node_id}</span>
										<span class="font-mono text-2xs text-muted-foreground">
											{step.node_type} · {step.node_id}
										</span>
										<span class={`${BADGE} ${stepTone(step.status)}`}>{step.status}</span>
										{#if step.port}
											<span class="text-2xs text-muted-foreground">→ {step.port}</span>
										{/if}
										<span class="ml-auto text-2xs text-muted-foreground">
											{formatDuration(step.started_at, step.ended_at)}
											{#if step.tokens_used}· {step.tokens_used} tokens{/if}
										</span>
									</div>
									{#if step.error}
										<p class="mt-1 text-2xs text-destructive">{step.error}</p>
									{/if}
									<div class="mt-1.5 flex flex-col gap-1">
										<JsonBlock label="Input" value={step.input} />
										<JsonBlock label="Output" value={step.output} />
									</div>
									{#if tools.length || llms.length}
										<div class="mt-2 flex flex-col gap-1.5 border-l-2 pl-2">
											{#each llms as call (call.id)}
												{@render llmCall(call)}
											{/each}
											{#each tools as call (call.id)}
												{@render toolCall(call)}
											{/each}
										</div>
									{/if}
								</li>
							{:else}
								<li class="text-xs text-muted-foreground">No step has run yet.</li>
							{/each}
						</ol>

						{#if orphanTools.length || orphanLlm.length}
							<h2 class="mb-2 mt-4 text-xs font-semibold">Other calls</h2>
							<div class="flex flex-col gap-1.5">
								{#each orphanLlm as call (call.id)}
									{@render llmCall(call)}
								{/each}
								{#each orphanTools as call (call.id)}
									{@render toolCall(call)}
								{/each}
							</div>
						{/if}
					</section>

					<aside class="flex min-w-0 flex-col gap-4">
						<section>
							<h2 class="mb-2 text-xs font-semibold">Waits</h2>
							<ul class="flex flex-col gap-1.5" data-testid="wf-run-waits">
								{#each run.waits as wait (wait.id)}
									<li class="rounded-md border p-2 text-xs">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="font-medium">{wait.kind}</span>
											<span class="font-mono text-2xs text-muted-foreground">{wait.node_id}</span>
											<span class={`${BADGE} ${WAIT_STATUS_TONES[wait.status] ?? 'bg-muted'}`}>
												{wait.status}
											</span>
										</div>
										<div class="mt-0.5 text-2xs text-muted-foreground">
											{#if wait.status === 'pending' && wait.expires_at}
												Expires {formatDateTime(wait.expires_at)}
											{:else if wait.resolved_at}
												Resolved {formatDateTime(wait.resolved_at)}
												{#if wait.resolved_by}· by {wait.resolved_by.name ||
														wait.resolved_by.login}{:else if wait.resolved_by_id}· by user #{wait.resolved_by_id}{/if}
												{#if wait.source_ip}· from {wait.source_ip}{/if}
											{/if}
										</div>
										{#if wait.resolved_payload_hidden === true}
											<p class="mt-1 text-2xs italic text-muted-foreground">
												Answer withheld: visible only to the analyst who gave it.
											</p>
										{:else if wait.resolved_payload !== undefined && wait.resolved_payload !== null}
											<div class="mt-1">
												<JsonBlock label="Payload" value={wait.resolved_payload} />
											</div>
										{/if}
									</li>
								{:else}
									<li class="text-xs text-muted-foreground">None.</li>
								{/each}
							</ul>
						</section>

						<section>
							<h2 class="mb-2 text-xs font-semibold">Suggestions</h2>
							<ul class="flex flex-col gap-1.5" data-testid="wf-run-suggestions">
								{#each run.suggestions as s (s.id)}
									<li class="rounded-md border p-2 text-xs">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="font-medium">{s.title}</span>
											<span class={`${BADGE} bg-muted`}>{s.status}</span>
											{#if s.severity}
												<span class="text-2xs text-muted-foreground">{s.severity}</span>
											{/if}
										</div>
										{#if s.body}
											<p
												class="mt-0.5 line-clamp-3 whitespace-pre-wrap text-2xs text-muted-foreground"
											>
												{s.body}
											</p>
										{/if}
										{#if s.proposed_action}
											<div class="mt-1">
												<JsonBlock
													label={`Proposed: ${s.proposed_action.tool}`}
													value={s.proposed_action.arguments}
												/>
											</div>
										{/if}
										{#if s.resolved_at}
											<p class="mt-0.5 text-2xs text-muted-foreground">
												{s.status}
												{formatDateTime(s.resolved_at)} by {userLabel(s.resolved_by)}
												{#if s.resolution_note}· {s.resolution_note}{/if}
											</p>
										{/if}
									</li>
								{:else}
									<li class="text-xs text-muted-foreground">None.</li>
								{/each}
							</ul>
						</section>

						<section class="flex flex-col gap-1.5">
							<h2 class="text-xs font-semibold">Data</h2>
							<JsonBlock label="Trigger payload" value={run.trigger_payload} />
							<JsonBlock label="Context" value={run.context} />
							<JsonBlock label="Definition (as run)" value={run.definition_snapshot} />
						</section>
					</aside>
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmCancelOpen}
	title="Cancel this run?"
	message="Pending waits are closed and no further step runs. Actions already taken are not undone."
	confirmText="Cancel the run"
	onConfirm={cancelRun}
/>
