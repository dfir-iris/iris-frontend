<!--
  Canvas node for every workflow node type: type icon, label, an error
  badge from the last validation, one target handle on the left (none
  for the trigger) and one source handle per output port on the right,
  `id` = port name so the edge's `sourceHandle` is the port.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { CircleAlertIcon } from 'lucide-svelte';
	import { labelFor, portsFor, type FlowNode } from '$lib/utils/ai-workflow-graph';
	import { WORKFLOW_EDITOR_CTX, nodeIcon, nodeTone } from '../helpers/ui';
	import type { WorkflowEditorCtx } from '../helpers/editor';

	let { id, data, selected }: NodeProps<FlowNode> = $props();

	const editor = getContext<WorkflowEditorCtx>(WORKFLOW_EDITOR_CTX);

	const type = $derived(data.nodeType);
	const ports = $derived(portsFor(type, editor?.catalogue?.node_types));
	const typeLabel = $derived(labelFor(type, editor?.catalogue?.node_types));
	const label = $derived(editor?.meta[id]?.label || typeLabel);
	const errors = $derived(editor?.errors[id] ?? []);
	const Icon = $derived(nodeIcon(type));
	// Room for every port label on the right.
	const minHeight = $derived(Math.max(48, ports.length * 20 + 16));
</script>

<div
	class={`relative w-56 rounded-md border bg-card text-card-foreground shadow-sm transition-shadow ${
		selected ? 'ring-2 ring-primary' : ''
	} ${errors.length ? 'border-destructive' : ''}`}
	style={`min-height: ${minHeight}px`}
	data-testid={`wf-node-${id}`}
>
	{#if type !== 'trigger'}
		<Handle type="target" position={Position.Left} class="!h-2.5 !w-2.5 !bg-muted-foreground" />
	{/if}

	<div class="flex items-start gap-2 p-2 pr-14">
		<span class={`flex size-7 shrink-0 items-center justify-center rounded ${nodeTone(type)}`}>
			<Icon size={14} />
		</span>
		<div class="min-w-0 leading-tight">
			<div class="truncate text-xs font-medium" title={label}>{label}</div>
			<div class="truncate text-2xs text-muted-foreground">{typeLabel} · {id}</div>
		</div>
	</div>

	{#if errors.length}
		<span
			class="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground"
			title={errors.join('\n')}
			data-testid={`wf-node-errors-${id}`}
		>
			<CircleAlertIcon size={10} />
			{errors.length}
		</span>
	{/if}

	{#each ports as port, index (port)}
		{@const top = ((index + 1) / (ports.length + 1)) * 100}
		<span
			class="pointer-events-none absolute right-2.5 -translate-y-1/2 text-[9px] uppercase tracking-wide text-muted-foreground"
			style={`top: ${top}%`}
		>
			{port}
		</span>
		<Handle
			type="source"
			position={Position.Right}
			id={port}
			style={`top: ${top}%`}
			class={`!h-2.5 !w-2.5 ${port === 'error' || port === 'timeout' || port === 'false' ? '!bg-destructive' : '!bg-primary'}`}
		/>
	{/each}
</div>
