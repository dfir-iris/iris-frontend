<script lang="ts">
	import { getContext } from 'svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import caseSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import caseClosedSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RelatedAlert } from '$lib/services/alerts.service';
	import VisNetwork from '$lib/components/common/VisNetwork.svelte';

	type VisNode = Record<string, unknown>;
	type VisEdge = Record<string, unknown>;

	const svgToDataUrl = (svg: string) =>
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

	const withStroke = (svg: string, color: string) =>
		svg
			.replace(/stroke="currentColor"/g, `stroke="${color}"`)
			.replace(/<svg /, '<svg fill="none" ');

	const alertIcon = svgToDataUrl(withStroke(alertSvg, '#111827'));
	const iocIcon = svgToDataUrl(withStroke(iocSvg, '#111827'));
	const caseOpenIcon = svgToDataUrl(withStroke(caseSvg, '#16a34a'));
	const caseClosedIcon = svgToDataUrl(withStroke(caseClosedSvg, '#c2410c'));

	let {
		alertId
	}: {
		alertId: number;
	} = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state<RelatedAlert>({ nodes: [], edges: [] });

	let lastLoadedAlertId = $state<number | null>(null);

	const load = async () => {
		if (!alertId) return;

		loading = true;
		error = null;

		const currentAlertId = alertId;
		const data = await alerts.getRelatedAlerts(currentAlertId);

		if (!data) {
			graph = { nodes: [], edges: [] };
			error = 'Failed to load relationships';
			loading = false;
			lastLoadedAlertId = currentAlertId;

			return;
		}

		graph = data;
		loading = false;
		lastLoadedAlertId = currentAlertId;
	};

	$effect(() => {
		if (alertId && alertId !== lastLoadedAlertId) {
			load();
		}
	});

	const nodes = $derived(
		graph.nodes.map((node) => {
			if (node.group === 'alert') {
				return {
					...node,
					shape: 'image',
					image: alertIcon
				};
			}

			if (node.group === 'ioc') {
				return {
					...node,
					shape: 'image',
					image: iocIcon
				};
			}

			if (node.group === 'case') {
				return {
					...node,
					shape: 'image',
					image:
						typeof node.label === 'string' && node.label.startsWith('[Closed]')
							? caseClosedIcon
							: caseOpenIcon
				};
			}

			return node;
		}) as VisNode[]
	);

	const edges = $derived(graph.edges as VisEdge[]);
</script>

{#if loading}
	<div class="text-sm opacity-70">Loading relationships...</div>
{:else if error}
	<div class="text-sm text-red-500">{error}</div>
{:else if !graph.nodes.length}
	<div class="text-sm opacity-70">No related entities found.</div>
{:else}
	<VisNetwork {nodes} {edges} className="h-96 w-full rounded-md border bg-muted/20" />
{/if}
