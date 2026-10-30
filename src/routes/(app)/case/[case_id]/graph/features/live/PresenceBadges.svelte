<!-- Initials of the other analysts next to the object each of them has selected. -->
<script lang="ts">
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { initials, peerColor, peerName, type GraphPeer } from '../../lib/realtime';
	import { getGraphFeatures } from '../context';

	let { graph }: { graph: CaseGraphState } = $props();

	const { live } = getGraphFeatures();

	/** Bumped (once per frame at most) when the canvas redraws. */
	let frame = $state(0);

	$effect(() => {
		const cy = graph.cy;
		if (!cy || !live.byKey.size) return;
		let raf = 0;
		const onRender = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				frame++;
			});
		};
		cy.on('render', onRender);
		return () => {
			cy.off('render', onRender);
			if (raf) cancelAnimationFrame(raf);
		};
	});

	interface Badge {
		id: string;
		x: number;
		y: number;
		peers: GraphPeer[];
	}

	const badges = $derived.by<Badge[]>(() => {
		void frame;
		const cy = graph.cy;
		if (!cy || graph.viewMode !== 'canvas') return [];
		const byCanvasId = new Map<string, GraphPeer[]>();
		for (const [key, peers] of live.byKey) {
			const id = graph.canvasIdOf(key) ?? (cy.getElementById(key).nonempty() ? key : null);
			if (!id) continue;
			byCanvasId.set(id, [...(byCanvasId.get(id) ?? []), ...peers]);
		}
		const out: Badge[] = [];
		const w = cy.width();
		const h = cy.height();
		for (const [id, peers] of byCanvasId) {
			const el = cy.getElementById(id);
			if (el.empty() || !el.visible()) continue;
			let x: number;
			let y: number;
			if (el.group() === 'edges') {
				const p = el.renderedMidpoint();
				x = p.x;
				y = p.y;
			} else {
				const bb = el.renderedBoundingBox({ includeLabels: false });
				x = bb.x2;
				y = bb.y1;
			}
			if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
			out.push({ id, x, y, peers });
		}
		return out;
	});
</script>

{#each badges as b (b.id)}
	<div
		class="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 -space-x-1"
		style:left={`${b.x}px`}
		style:top={`${b.y}px`}
		title={b.peers.map((p) => peerName(p.user)).join(', ')}
	>
		{#each b.peers.slice(0, 3) as p (p.user.id)}
			<span
				class="flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold leading-none text-white ring-1 ring-background"
				style:background-color={peerColor(p.user.id)}
				aria-label={`Selected by ${peerName(p.user)}`}
			>
				{initials(peerName(p.user))}
			</span>
		{/each}
		{#if b.peers.length > 3}
			<span
				class="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[8px] font-semibold leading-none text-foreground ring-1 ring-background"
			>
				+{b.peers.length - 3}
			</span>
		{/if}
	</div>
{/each}
