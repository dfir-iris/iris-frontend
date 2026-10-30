<!--
  Lightweight minimap for a Cytoscape instance: nodes as dots, edges as
  hairlines, the current viewport as a rectangle. Click or drag to pan.
-->
<script lang="ts">
	import type { Core } from 'cytoscape';
	import { mode } from 'mode-watcher';
	import { minimapTransform, type MinimapBox } from './minimap';

	let {
		cy,
		width = 180,
		height = 120,
		class: className = ''
	}: { cy: Core | null; width?: number; height?: number; class?: string } = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let frame = 0;
	let transform: ReturnType<typeof minimapTransform> | null = null;
	let dragging = false;

	const isDark = $derived($mode === 'dark');

	const draw = () => {
		frame = 0;
		if (!cy || !canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		if (canvas.width !== width * dpr) canvas.width = width * dpr;
		if (canvas.height !== height * dpr) canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		const nodes = cy.nodes(':visible');
		const ext = cy.extent();
		const viewBox: MinimapBox = { x1: ext.x1, y1: ext.y1, x2: ext.x2, y2: ext.y2 };
		const graphBox: MinimapBox | null = nodes.nonempty() ? nodes.boundingBox({}) : null;
		transform = minimapTransform(graphBox, viewBox, width, height, 6);
		const t = transform;

		const edges = cy.edges(':visible');
		if (edges.length < 4000) {
			ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)';
			ctx.lineWidth = 0.6;
			ctx.beginPath();
			edges.forEach((e) => {
				const s = t.toMini(e.source().position());
				const d = t.toMini(e.target().position());
				ctx.moveTo(s.x, s.y);
				ctx.lineTo(d.x, d.y);
			});
			ctx.stroke();
		}

		const r = Math.max(1.5, Math.min(4, 30 * t.scale));
		nodes.forEach((n) => {
			const p = t.toMini(n.position());
			const c = n.data('color');
			ctx.fillStyle = typeof c === 'string' && c ? c : isDark ? '#94a3b8' : '#64748b';
			ctx.globalAlpha = n.hasClass('dimmed') ? 0.25 : 1;
			ctx.beginPath();
			ctx.arc(p.x, p.y, n.selected() ? r + 1.5 : r, 0, Math.PI * 2);
			ctx.fill();
		});
		ctx.globalAlpha = 1;

		const a = t.toMini({ x: viewBox.x1, y: viewBox.y1 });
		const b = t.toMini({ x: viewBox.x2, y: viewBox.y2 });
		ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb';
		ctx.fillStyle = isDark ? 'rgba(96,165,250,0.10)' : 'rgba(37,99,235,0.08)';
		ctx.lineWidth = 1.5;
		ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
		ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
	};

	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(draw);
	};

	$effect(() => {
		void isDark;
		const c = cy;
		if (!c) return;
		const events = 'add remove position viewport style select unselect data resize';
		c.on(events, schedule);
		schedule();
		return () => {
			c.off(events, schedule);
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
	});

	const panTo = (evt: PointerEvent) => {
		if (!cy || !canvas || !transform) return;
		const rect = canvas.getBoundingClientRect();
		const model = transform.toModel({ x: evt.clientX - rect.left, y: evt.clientY - rect.top });
		const zoom = cy.zoom();
		cy.pan({ x: cy.width() / 2 - model.x * zoom, y: cy.height() / 2 - model.y * zoom });
	};
</script>

<canvas
	bind:this={canvas}
	style:width={`${width}px`}
	style:height={`${height}px`}
	class="cursor-pointer rounded-md border border-border bg-card/90 shadow-sm backdrop-blur {className}"
	aria-label="Graph minimap"
	onpointerdown={(e) => {
		dragging = true;
		(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
		panTo(e);
	}}
	onpointermove={(e) => dragging && panTo(e)}
	onpointerup={() => (dragging = false)}
	onpointercancel={() => (dragging = false)}
></canvas>
