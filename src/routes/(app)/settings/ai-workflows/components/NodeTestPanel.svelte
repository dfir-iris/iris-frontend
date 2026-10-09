<!--
  Tests the selected node on its own, with its definition as it stands in
  the editor (saved or not): on the context an earlier event of the node
  saw, or on an entity plus upstream outputs / variables typed in. The
  test is a run of that node alone (recorded, acting as the workflow
  owner, not counted as an event); its step is polled until it settles.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ExternalLinkIcon, FlaskConicalIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		AiWorkflowsService,
		type AiEntityType,
		type AiNodeEvent,
		type AiRunDetail,
		type AiRunSummary,
		type AiTestNodeBody
	} from '$lib/services/ai-workflows.service';
	import JsonBlock from './JsonBlock.svelte';
	import JsonField from './JsonField.svelte';
	import {
		describeApiError,
		entityLabel,
		ENTITY_LABELS,
		ENTITY_TYPES,
		LABEL_CLASS,
		runTone,
		SELECT_CLASS,
		stepTone
	} from '../helpers/ui';

	type Props = {
		workflowId: number;
		/** The node as the editor holds it now. */
		node: () => AiTestNodeBody['node'];
		/** Why the node cannot be tested on its own, if it cannot. */
		blocked?: string | null;
	};

	let { workflowId, node, blocked = null }: Props = $props();

	const POLL_MS = 1000;
	const POLL_LIMIT = 300;
	const SETTLED = ['succeeded', 'failed', 'cancelled', 'skipped'];
	const nodeId = $derived(node().id);

	let source = $state<'event' | 'manual'>('manual');
	let events = $state<AiNodeEvent[]>([]);
	let eventId = $state<number | null>(null);
	let entityType = $state<AiEntityType | ''>('');
	let entityId = $state('');
	let extra = $state<unknown>({ nodes: {}, vars: {}, payload: null });
	let dryRun = $state(false);
	let starting = $state(false);
	let run = $state<AiRunSummary | null>(null);
	let detail = $state<AiRunDetail | null>(null);
	let polling = $state(false);
	let pollToken = 0;

	const idValid = $derived(!entityType || /^\d+$/.test(entityId.trim()));
	const step = $derived(detail?.steps.find((s) => s.node_id === nodeId) ?? null);
	const settled = $derived(!!detail && SETTLED.includes(detail.status));

	$effect(() => {
		const id = nodeId;
		AiWorkflowsService.nodeEvents(workflowId, id, { page: 1, per_page: 20 }).then((res) => {
			if (id !== nodeId || !res.ok || !res.data || typeof res.data !== 'object') return;
			events = res.data.data;
			if (events.length) {
				source = 'event';
				eventId = events[0].id;
			}
		});
	});

	onDestroy(() => {
		pollToken++;
	});

	function extraPart(name: 'nodes' | 'vars' | 'payload'): unknown {
		if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return undefined;
		const value = (extra as Record<string, unknown>)[name];
		return value === null ? undefined : value;
	}

	async function poll(uuid: string) {
		const token = ++pollToken;
		polling = true;
		for (let i = 0; i < POLL_LIMIT && token === pollToken; i++) {
			const res = await AiWorkflowsService.getRun(uuid);
			if (token !== pollToken) return;
			if (res.ok && typeof res.data === 'object') {
				detail = res.data as AiRunDetail;
				if (SETTLED.includes(detail.status)) break;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_MS));
		}
		if (token === pollToken) polling = false;
	}

	async function test() {
		if (source === 'manual' && !idValid) return;
		const body: AiTestNodeBody = { node: node(), dry_run: dryRun };
		if (source === 'event' && eventId !== null) {
			body.step_id = eventId;
		} else {
			body.entity_type = entityType || null;
			body.entity_id = entityType ? Number(entityId) : null;
			body.nodes = extraPart('nodes') as Record<string, unknown> | undefined;
			body.vars = extraPart('vars') as Record<string, unknown> | undefined;
			body.payload = extraPart('payload');
		}
		starting = true;
		detail = null;
		const res = await AiWorkflowsService.testNode(workflowId, body);
		starting = false;
		if (!res.ok) {
			run = null;
			toast({
				title: 'The test did not start',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		run = res.data as AiRunSummary;
		await poll(run.uuid);
	}

	const when = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : '—');
	const eventTitle = (e: AiNodeEvent) =>
		`${e.status} · ${
			e.run?.entity_title ??
			(e.run?.entity_type ? `${entityLabel(e.run.entity_type)} #${e.run.entity_id}` : 'no entity')
		} · ${when(e.started_at)}`;
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="wf-node-test">
	{#if blocked}
		<p class="text-2xs text-muted-foreground">{blocked}</p>
	{:else}
		<p class="text-2xs text-muted-foreground">
			Runs this node alone, with its configuration as it is in the editor (saved or not), then
			stops. The test is recorded as a run acting as the workflow owner; it does not count as an
			event of the node.
		</p>

		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Context</span>
			<select class={SELECT_CLASS} bind:value={source} data-testid="wf-test-source">
				<option value="event" disabled={!events.length}>
					An earlier event of this node{events.length ? '' : ' (none yet)'}
				</option>
				<option value="manual">An entity and values I supply</option>
			</select>
		</label>

		{#if source === 'event'}
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Event</span>
				<select class={SELECT_CLASS} bind:value={eventId} data-testid="wf-test-event">
					{#each events as e (e.id)}
						<option value={e.id}>{eventTitle(e)}</option>
					{/each}
				</select>
				<span class="text-2xs text-muted-foreground">
					The node sees what it saw then: trigger, entity, upstream outputs and variables.
				</span>
			</label>
		{:else}
			<div class="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Entity type</span>
					<select class={SELECT_CLASS} bind:value={entityType} data-testid="wf-test-entity-type">
						<option value="">None</option>
						{#each ENTITY_TYPES as t (t)}
							<option value={t}>{ENTITY_LABELS[t]}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Entity id</span>
					<Input
						class="h-8 text-xs"
						inputmode="numeric"
						disabled={!entityType}
						bind:value={entityId}
						placeholder={entityType ? '42' : '—'}
						data-testid="wf-test-entity-id"
					/>
				</label>
			</div>
			{#if !idValid}
				<p class="text-2xs text-destructive">The entity id must be a number.</p>
			{/if}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Upstream outputs, variables and trigger payload</span>
				<JsonField
					value={extra}
					minLines={6}
					maxLines={16}
					objectOnly
					onChange={(v) => (extra = v)}
				/>
				<span class="text-2xs text-muted-foreground">
					<code>nodes</code> is <code>{'{"node_id": {"output": …, "port": "success"}}'}</code>, read
					as
					<code>nodes.node_id.output</code>; <code>vars</code> as <code>vars.name</code>;
					<code>payload</code> as <code>trigger.payload</code>.
				</span>
			</div>
		{/if}

		<label class="flex items-center justify-between gap-2 text-xs">
			<span>
				Dry run
				<span class="block text-2xs text-muted-foreground">
					Off: the node really executes (HTTP requests are sent, allowlisted writes happen). On:
					writes become suggestions and HTTP requests are only previewed.
				</span>
			</span>
			<Switch
				checked={dryRun}
				onCheckedChange={(v: boolean) => (dryRun = v)}
				data-testid="wf-test-dry-run"
			/>
		</label>

		<Button
			size="sm"
			class="h-7 self-start"
			disabled={starting ||
				polling ||
				(source === 'manual' && (!idValid || (!!entityType && !entityId.trim())))}
			onclick={test}
			data-testid="wf-test-run"
		>
			<FlaskConicalIcon size={12} class="mr-1" />
			{starting ? 'Starting…' : polling ? 'Running…' : 'Test this node'}
		</Button>

		{#if run}
			<div class="flex flex-col gap-2 border-t pt-3" data-testid="wf-test-result">
				<div class="flex items-center gap-2 text-2xs">
					<span class={`rounded px-1 ${runTone(detail?.status ?? run.status)}`}>
						{detail?.status ?? run.status}
					</span>
					{#if step}
						<span class={`rounded px-1 ${stepTone(step.status)}`}>{step.status}</span>
						{#if step.port}<span class="text-muted-foreground">→ {step.port}</span>{/if}
					{/if}
					{#if run.is_dry_run}
						<span class="rounded bg-muted px-1 text-[9px] uppercase">dry</span>
					{/if}
					<a
						class="ml-auto inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
						href={`/settings/ai-workflows/runs/${run.uuid}`}
						data-testid="wf-test-run-link"
					>
						{run.uuid.slice(0, 8)}
						<ExternalLinkIcon size={10} />
					</a>
				</div>
				{#if !settled && polling}
					<p class="text-2xs text-muted-foreground">Waiting for the node to finish…</p>
				{:else if !settled}
					<p class="text-2xs text-muted-foreground">Still running: open the run to follow it.</p>
				{/if}
				{#if step?.error || (settled && detail?.error && !step)}
					<p
						class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-2xs text-destructive"
						data-testid="wf-test-error"
					>
						{step?.error ?? detail?.error}
					</p>
				{/if}
				{#if step}
					<JsonBlock label="Input" value={step.input} />
					<JsonBlock label="Output" value={step.output} open />
				{/if}
			</div>
		{/if}
	{/if}
</div>
