<!--
  Workflow edge: xyflow's bezier, routed around the nodes in its way
  (see edge-routing). Registered as the canvas's `default` edge type.
-->
<script lang="ts">
	import { BaseEdge, useNodes, type EdgeProps } from '@xyflow/svelte';
	import { routeEdge, type Box, type Side } from '$lib/utils/edge-routing';

	let {
		id,
		source,
		target,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		label,
		labelStyle,
		markerStart,
		markerEnd,
		interactionWidth,
		style
	}: EdgeProps = $props();

	const nodes = useNodes();

	const boxes = $derived(
		nodes.current.flatMap((n): Box[] => {
			const width = n.measured?.width ?? n.width;
			const height = n.measured?.height ?? n.height;
			return width && height ? [{ id: n.id, x: n.position.x, y: n.position.y, width, height }] : [];
		})
	);

	const route = $derived(
		routeEdge(
			{
				source: { x: sourceX, y: sourceY },
				sourceSide: sourcePosition as Side,
				target: { x: targetX, y: targetY },
				targetSide: targetPosition as Side,
				sourceId: source,
				targetId: target
			},
			boxes
		)
	);
</script>

<BaseEdge
	{id}
	path={route.path}
	labelX={route.labelX}
	labelY={route.labelY}
	{label}
	{labelStyle}
	{markerStart}
	{markerEnd}
	{interactionWidth}
	{style}
/>
