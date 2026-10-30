<!-- Toolbar: the other analysts on this graph, and what each of them has selected. -->
<script lang="ts">
	import { tick } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { initials, peerColor, peerName, type GraphPeer } from '../../lib/realtime';
	import { getGraphFeatures } from '../context';

	let { graph }: { graph: CaseGraphState } = $props();

	const { live } = getGraphFeatures();

	let open = $state(false);

	const MAX_FACES = 4;

	const targetOf = (p: GraphPeer) => {
		if (!p.selectedKey) return null;
		const node = graph.node(p.selectedKey);
		if (node) return { label: node.label, kind: 'node' as const };
		const edge = graph.edge(p.selectedKey);
		if (edge) {
			const from = graph.node(edge.source)?.label ?? edge.source;
			const to = graph.node(edge.target)?.label ?? edge.target;
			return { label: `${from} ${edge.directed ? '→' : '—'} ${to}`, kind: 'edge' as const };
		}
		return null;
	};

	const drawnId = (key: string) =>
		graph.canvasIdOf(key) ?? (graph.cy?.getElementById(key).nonempty() ? key : null);

	const goTo = async (p: GraphPeer) => {
		const key = p.selectedKey;
		const id = key ? drawnId(key) : null;
		if (!key || !id) return;
		open = false;
		graph.viewMode = 'canvas';
		await tick();
		graph.select([id], { center: true });
		graph.rail = graph.node(key) ? { type: 'node', key } : { type: 'edge', key };
	};
</script>

{#if live.list.length}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="flex items-center -space-x-1.5 rounded-full px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`${live.list.length} other analyst${live.list.length > 1 ? 's' : ''} on this graph`}
					title={live.list.map((p) => peerName(p.user)).join(', ')}
				>
					{#each live.list.slice(0, MAX_FACES) as p (p.user.id)}
						<span
							class="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
							style:background-color={peerColor(p.user.id)}
						>
							{initials(peerName(p.user))}
						</span>
					{/each}
					{#if live.list.length > MAX_FACES}
						<span
							class="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background"
						>
							+{live.list.length - MAX_FACES}
						</span>
					{/if}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="end" class="w-72 p-0">
			<div class="border-b px-3 py-2 text-xs font-medium">Also on this graph</div>
			<ul class="max-h-72 overflow-y-auto py-1">
				{#each live.list as p (p.user.id)}
					{@const target = targetOf(p)}
					{@const drawn = p.selectedKey ? !!drawnId(p.selectedKey) : false}
					<li class="flex items-center gap-2 px-3 py-1.5">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
							style:background-color={peerColor(p.user.id)}
							aria-hidden="true"
						>
							{initials(peerName(p.user))}
						</span>
						<div class="min-w-0 flex-1">
							<div class="truncate text-xs">{peerName(p.user)}</div>
							{#if target}
								<button
									type="button"
									class="block max-w-full truncate text-left text-[11px] text-muted-foreground underline-offset-2 enabled:hover:text-foreground enabled:hover:underline disabled:cursor-default"
									disabled={!drawn}
									title={drawn ? 'Show it on the canvas' : 'Not drawn on your canvas'}
									onclick={() => goTo(p)}
								>
									{target.kind === 'node' ? 'On' : 'On the relation'}
									{target.label}{drawn ? '' : ' (not drawn)'}
								</button>
							{:else}
								<div class="text-[11px] text-muted-foreground">
									{p.selectedKey ? 'On an object you do not see' : 'Nothing selected'}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</Popover.Content>
	</Popover.Root>
{/if}
