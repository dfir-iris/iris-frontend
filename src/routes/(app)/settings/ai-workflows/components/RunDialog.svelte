<!--
  Manual run: the trigger node it starts at (when the workflow has
  several), optional entity (type + id), optional JSON payload and a
  dry-run switch. The run acts as the current user; on success the
  caller usually navigates to the run inspector, or links to it.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { PlayIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import {
		AiWorkflowsService,
		type AiEntityType,
		type AiRunSummary,
		type AiWorkflowTrigger
	} from '$lib/services/ai-workflows.service';
	import JsonField from './JsonField.svelte';
	import {
		describeApiError,
		ENTITY_LABELS,
		ENTITY_TYPES,
		LABEL_CLASS,
		SELECT_CLASS,
		TRIGGER_LABELS,
		triggerDetail
	} from '../helpers/ui';

	type Props = {
		open: boolean;
		workflowId: number;
		workflowName: string;
		/** The workflow's triggers; a manual one's `entity_types` limit the entity (empty = any or none). */
		triggers?: AiWorkflowTrigger[];
		/** The workflow has unsaved changes: the run uses the saved version. */
		dirty?: boolean;
		/** Entity proposed when the trigger explicitly accepts its type. */
		entity?: { type: AiEntityType; id: number } | null;
		/** Initial state of the dry-run switch. */
		defaultDryRun?: boolean;
		/** The "started" toast links to the run inspector. */
		linkToRun?: boolean;
		onStarted?: (run: AiRunSummary) => void;
	};

	let {
		open = $bindable(),
		workflowId,
		workflowName,
		triggers = [],
		dirty = false,
		entity = null,
		defaultDryRun = true,
		linkToRun = false,
		onStarted
	}: Props = $props();

	// Only trigger nodes can be picked (older workflows have none: the backend picks)
	const startable = $derived(triggers.filter((t) => t.node_id));
	const defaultTrigger = () =>
		(startable.find((t) => t.type === 'manual') ?? startable[0])?.node_id ?? '';
	let triggerId = $state('');
	const trigger = $derived(
		startable.find((t) => t.node_id === triggerId) ??
			(startable.length ? undefined : triggers.find((t) => t.type === 'manual'))
	);
	const entityTypes = $derived(
		trigger?.type === 'manual' && Array.isArray(trigger.config.entity_types)
			? (trigger.config.entity_types as AiEntityType[])
			: []
	);
	const types = $derived(entityTypes.length ? entityTypes : ENTITY_TYPES);
	const triggerLabel = (t: AiWorkflowTrigger) =>
		[TRIGGER_LABELS[t.type] ?? t.type, triggerDetail(t.type, t.config), t.node_id]
			.filter(Boolean)
			.join(' · ');

	let entityType = $state<AiEntityType | ''>('');
	let entityId = $state('');
	let dryRun = $state(true);
	let payload = $state<unknown>(null);
	let running = $state(false);

	function resetEntity() {
		if (entity && entityTypes.includes(entity.type)) {
			entityType = entity.type;
			entityId = String(entity.id);
			return;
		}
		entityType = entityTypes.length ? entityTypes[0] : '';
		entityId = '';
	}

	$effect(() => {
		if (open) {
			untrack(() => {
				triggerId = defaultTrigger();
				resetEntity();
				dryRun = defaultDryRun;
				payload = null;
			});
		}
	});

	const idValid = $derived(!entityType || /^\d+$/.test(entityId.trim()));

	async function submit(e: Event) {
		e.preventDefault();
		if (!idValid) return;
		running = true;
		const res = await AiWorkflowsService.run(workflowId, {
			entity_type: entityType || null,
			entity_id: entityType ? Number(entityId) : null,
			dry_run: dryRun,
			payload: (payload as Record<string, unknown> | null) ?? null,
			...(trigger?.node_id ? { trigger_node_id: trigger.node_id } : {})
		});
		running = false;
		if (!res.ok) {
			toast({
				title: 'Run failed to start',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		const run = res.data as AiRunSummary;
		toast({
			title: dryRun ? 'Dry run started' : 'Run started',
			description: workflowName,
			variant: 'success',
			...(linkToRun
				? { link: { href: `/settings/ai-workflows/runs/${run.uuid}`, label: 'Open the run' } }
				: {})
		});
		open = false;
		onStarted?.(run);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<PlayIcon size={14} /> Run “{workflowName}”
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				The run acts as you: tools only reach what you can reach.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-3" onsubmit={submit} data-testid="wf-run-dialog">
			{#if dirty}
				<p class="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs">
					You have unsaved changes: the run uses the last saved version.
				</p>
			{/if}
			{#if startable.length > 1}
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Start at</span>
					<select
						class={SELECT_CLASS}
						value={triggerId}
						onchange={(e) => {
							triggerId = (e.currentTarget as HTMLSelectElement).value;
							resetEntity();
						}}
						data-testid="wf-run-trigger"
					>
						{#each startable as t (t.node_id)}
							<option value={t.node_id}>{triggerLabel(t)}</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
				<label class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Entity type</span>
					<select class={SELECT_CLASS} bind:value={entityType} data-testid="wf-run-entity-type">
						{#if !entityTypes.length}
							<option value="">None</option>
						{/if}
						{#each types as t (t)}
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
						data-testid="wf-run-entity-id"
					/>
				</label>
			</div>
			{#if !idValid}
				<p class="text-2xs text-destructive">The entity id must be a number.</p>
			{/if}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Payload (optional JSON, available as trigger.payload)</span>
				{#key open}
					<JsonField value={null} minLines={3} maxLines={10} onChange={(v) => (payload = v)} />
				{/key}
			</div>
			<label class="flex items-center justify-between gap-2 text-xs">
				<span>
					Dry run
					<span class="block text-2xs text-muted-foreground">
						Writes become “dry run” suggestions; HTTP requests are only previewed.
					</span>
				</span>
				<Switch
					checked={dryRun}
					onCheckedChange={(v: boolean) => (dryRun = v)}
					data-testid="wf-run-dry"
				/>
			</label>
			<Dialog.Footer>
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={running || !idValid || (!!entityType && !entityId.trim())}
					data-testid="wf-run-submit"
				>
					{running ? 'Starting…' : dryRun ? 'Start dry run' : 'Run'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
