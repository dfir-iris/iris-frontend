<!-- "Source —relation→ Target" line of a suggestion, proposal or relation. -->
<script lang="ts">
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import NodeKindIcon from '../../components/NodeKindIcon.svelte';

	interface Props {
		graph: CaseGraphState;
		source: string;
		target: string;
		relation: string;
		directed: boolean;
	}

	let { graph, source, target, relation, directed }: Props = $props();

	const end = (key: string) => {
		const n = graph.node(key);
		return { kind: n?.kind ?? key.split(':')[0], color: n?.color ?? null, label: n?.label ?? key };
	};

	const from = $derived(end(source));
	const to = $derived(end(target));
</script>

<div class="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
	<span class="inline-flex min-w-0 max-w-full items-center gap-1 font-medium">
		<NodeKindIcon kind={from.kind} color={from.color} class="h-3.5 w-3.5 shrink-0" />
		<span class="truncate" title={from.label}>{from.label}</span>
	</span>
	<span class="shrink-0 text-muted-foreground">
		—<span class="mx-0.5 italic">{relation}</span>{directed ? '→' : '—'}
	</span>
	<span class="inline-flex min-w-0 max-w-full items-center gap-1 font-medium">
		<NodeKindIcon kind={to.kind} color={to.color} class="h-3.5 w-3.5 shrink-0" />
		<span class="truncate" title={to.label}>{to.label}</span>
	</span>
</div>
