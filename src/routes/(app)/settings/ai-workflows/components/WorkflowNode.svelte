<!--
  Canvas node for every workflow node type: type icon, label, an error
  badge from the last validation, the number of events it processed,
  and its connectors. The input (none for the trigger) and one handle
  per output port sit on the node's default sides (`handles`: input on
  the left and outputs on the right unless changed); the same connectors
  also exist on the other sides, shown on hover (outputs) or while a
  link is being drawn (inputs), so a link can leave or enter on any side.
  Handle ids: the port / `in` on the default side, `<port>@<side>` /
  `in@<side>` elsewhere (see ai-workflow-graph).
  While a run goes through it, a halo and a chip show its live state.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Handle,
		Position,
		useConnection,
		useNodeConnections,
		useUpdateNodeInternals,
		type NodeProps
	} from '@xyflow/svelte';
	import { CircleAlertIcon } from 'lucide-svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		DEFAULT_HANDLES,
		HANDLE_SIDES,
		INPUT_HANDLE,
		handleId,
		labelFor,
		portsFor,
		type FlowNode,
		type HandleSide
	} from '$lib/utils/ai-workflow-graph';
	import { WORKFLOW_EDITOR_CTX, nodeIcon, nodeTone } from '../helpers/ui';
	import type { WorkflowEditorCtx } from '../helpers/editor';
	import type { AiLiveNodeState } from '../helpers/live';

	let { id, data, selected }: NodeProps<FlowNode> = $props();

	const editor = getContext<WorkflowEditorCtx>(WORKFLOW_EDITOR_CTX);

	const type = $derived(data.nodeType);
	const ports = $derived(portsFor(type, editor?.catalogue?.node_types));
	const typeLabel = $derived(labelFor(type, editor?.catalogue?.node_types));
	const label = $derived(editor?.meta[id]?.label || typeLabel);
	const errors = $derived(editor?.errors[id] ?? []);
	const stats = $derived(editor?.stats[id]);
	const failed = $derived(stats?.counts.failed ?? 0);
	const statsTitle = $derived(
		stats
			? [
					`${stats.total} event${stats.total === 1 ? '' : 's'} processed`,
					...Object.entries(stats.counts).map(([status, n]) => `${status}: ${n}`),
					stats.last_at ? `last: ${formatDateTime(stats.last_at)}` : ''
				]
					.filter(Boolean)
					.join('\n')
			: ''
	);
	const Icon = $derived(nodeIcon(type));

	const liveState = $derived(editor?.live[id]);
	const LIVE_HALOS: Record<AiLiveNodeState, string> = {
		running: 'animate-pulse ring-blue-500',
		waiting: 'animate-pulse ring-amber-500',
		succeeded: 'ring-emerald-500/80',
		failed: 'ring-destructive'
	};
	const LIVE_CHIPS: Record<AiLiveNodeState, string> = {
		running: 'bg-blue-500 text-white',
		waiting: 'bg-amber-500 text-white',
		succeeded: 'bg-emerald-600 text-white',
		failed: 'bg-destructive text-destructive-foreground'
	};

	const POSITIONS: Record<HandleSide, Position> = {
		left: Position.Left,
		top: Position.Top,
		right: Position.Right,
		bottom: Position.Bottom
	};
	const handles = $derived(editor?.meta[id]?.handles ?? DEFAULT_HANDLES);
	const outputSide = $derived(handles.output);
	const hasInput = $derived(type !== 'trigger');
	// Room for every port label along a side (outputs may show on the left / right).
	const minHeight = $derived(Math.max(56, ports.length * 20 + 16));

	// Handles carrying an edge stay visible on every side.
	const connections = useNodeConnections();
	const used = $derived(
		new Set(
			connections.current.map((c) => (c.source === id ? c.sourceHandle : c.targetHandle) ?? '')
		)
	);
	// While a link is drawn: the inputs of every other node show, extra outputs hide.
	const connection = useConnection();
	const linking = $derived(connection.current.inProgress);
	const linkingFromHere = $derived(linking && connection.current.fromNode?.id === id);
	const PADDING: Record<HandleSide, string> = {
		left: 'pl-14',
		top: 'pt-5',
		right: 'pr-14',
		bottom: 'pb-5'
	};
	const LABEL_SIDE: Record<HandleSide, string> = {
		left: 'left-2.5 -translate-y-1/2',
		top: 'top-1 -translate-x-1/2',
		right: 'right-2.5 -translate-y-1/2',
		bottom: 'bottom-1 -translate-x-1/2'
	};
	const vertical = (side: HandleSide) => side === 'top' || side === 'bottom';
	const at = (side: HandleSide, percent: number) =>
		`${vertical(side) ? 'left' : 'top'}: ${percent}%`;
	// Ports spread along a side. An odd count would put the middle one on the
	// input (always centred on its default side): there they shift half a step.
	const step = $derived(100 / (ports.length + 1));
	const portAt = (side: HandleSide, index: number) =>
		(index + 1) * step + (hasInput && side === handles.input && ports.length % 2 ? step / 2 : 0);
	// An extra input on the output side moves off a centred port the same way.
	const inputAt = (side: HandleSide) =>
		50 + (side === outputSide && ports.length % 2 ? step / 2 : 0);

	const hidden = 'pointer-events-none opacity-0';
	function inputClass(side: HandleSide): string {
		if (side === handles.input || used.has(handleId(INPUT_HANDLE, side, handles.input))) return '';
		return linking && !linkingFromHere ? 'opacity-60' : hidden;
	}
	function portClass(side: HandleSide, port: string): string {
		if (side === outputSide || used.has(handleId(port, side, outputSide))) return '';
		return linking ? hidden : 'opacity-0 group-hover:opacity-100';
	}
	const portTone = (port: string) =>
		port === 'error' || port === 'timeout' || port === 'false' ? '!bg-destructive' : '!bg-primary';

	// xyflow measures the handles once: tell it when they move
	const updateNodeInternals = useUpdateNodeInternals();
	$effect(() => {
		void handles.input;
		void handles.output;
		void ports.length;
		void hasInput;
		updateNodeInternals(id);
	});
</script>

<div
	class={`group relative w-56 rounded-md border bg-card text-card-foreground shadow-sm transition-shadow ${
		selected ? 'ring-2 ring-primary' : ''
	} ${errors.length ? 'border-destructive' : ''}`}
	style={`min-height: ${minHeight}px`}
	data-testid={`wf-node-${id}`}
	data-live={liveState}
>
	{#if liveState}
		<span
			class={`pointer-events-none absolute -inset-1 rounded-lg ring-2 ${LIVE_HALOS[liveState]}`}
			aria-hidden="true"
		></span>
		<span
			class={`pointer-events-none absolute -bottom-2 right-2 flex h-4 items-center rounded-full px-1.5 text-[9px] font-medium uppercase tracking-wide ${LIVE_CHIPS[liveState]}`}
			data-testid={`wf-node-live-${id}`}
		>
			{liveState}
		</span>
	{/if}
	{#if hasInput}
		{#each HANDLE_SIDES as side (side)}
			<Handle
				type="target"
				position={POSITIONS[side]}
				id={handleId(INPUT_HANDLE, side, handles.input)}
				style={at(side, side === handles.input ? 50 : inputAt(side))}
				class={`!h-2.5 !w-2.5 !bg-muted-foreground transition-opacity ${inputClass(side)}`}
			/>
		{/each}
	{/if}

	<div class={`flex items-start gap-2 p-2 ${PADDING[outputSide]}`}>
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

	{#if stats?.total}
		<span
			class={`absolute -top-2 left-2 flex h-4 items-center gap-0.5 rounded-full border bg-card px-1.5 font-mono text-[9px] ${
				failed ? 'border-destructive/60 text-destructive' : 'text-muted-foreground'
			}`}
			title={statsTitle}
			data-testid={`wf-node-events-${id}`}
		>
			{stats.total}{failed ? ` · ${failed} failed` : ''}
		</span>
	{/if}

	{#each HANDLE_SIDES as side (side)}
		{#each ports as port, index (port)}
			{@const visibility = portClass(side, port)}
			{#if side === outputSide || ports.length > 1}
				<span
					class={`pointer-events-none absolute text-[9px] uppercase tracking-wide text-muted-foreground transition-opacity ${LABEL_SIDE[side]} ${visibility}`}
					style={at(side, portAt(side, index))}
				>
					{port}
				</span>
			{/if}
			<Handle
				type="source"
				position={POSITIONS[side]}
				id={handleId(port, side, outputSide)}
				style={at(side, portAt(side, index))}
				class={`!h-2.5 !w-2.5 transition-opacity ${portTone(port)} ${visibility}`}
			/>
		{/each}
	{/each}
</div>
