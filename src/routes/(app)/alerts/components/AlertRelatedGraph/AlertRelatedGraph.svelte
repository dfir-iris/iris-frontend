<script lang="ts">
	import { getContext } from 'svelte';
	import { mode } from 'mode-watcher';
	import type { Options } from 'vis-network';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import caseSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import caseClosedSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RelatedAlert } from '$lib/services/alerts.service';
	import VisNetwork from '$lib/components/common/VisNetwork.svelte';
	import { AlertRelationshipsFilters, defaultAlertRelationshipsFilters } from '.';

	type VisNode = Record<string, unknown>;
	type VisEdge = Record<string, unknown>;

	const svgToDataUrl = (svg: string) =>
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

	const withStroke = (svg: string, color: string) =>
		svg
			.replace(/stroke="currentColor"/g, `stroke="${color}"`)
			.replace(/<svg /, '<svg fill="none" ');

	let {
		alertId
	}: {
		alertId: number;
	} = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');
	const caseOpenColor = $derived(isDark ? '#4ade80' : '#16a34a');
	const caseClosedColor = $derived(isDark ? '#fb923c' : '#c2410c');

	const alertIcon = $derived(svgToDataUrl(withStroke(alertSvg, strokeColor)));
	const iocIcon = $derived(svgToDataUrl(withStroke(iocSvg, strokeColor)));
	const caseOpenIcon = $derived(svgToDataUrl(withStroke(caseSvg, caseOpenColor)));
	const caseClosedIcon = $derived(svgToDataUrl(withStroke(caseClosedSvg, caseClosedColor)));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state<RelatedAlert>({ nodes: [], edges: [] });

	let filters = $state(defaultAlertRelationshipsFilters());

	const options = $derived({
		autoResize: true,
		layout: {
			improvedLayout: true,
			randomSeed: alertId
		},
		nodes: {
			font: {
				color: strokeColor
			}
		},
		physics: {
			enabled: true,
			solver: 'forceAtlas2Based',
			forceAtlas2Based: {
				avoidOverlap: 1
			},
			stabilization: {
				enabled: true,
				fit: true
			}
		}
	} satisfies Options);

	const load = async () => {
		if (!alertId) return;

		loading = true;
		error = null;

		const data = await alerts.getRelatedAlerts(alertId, {
			open_alerts: filters.openAlerts,
			closed_alerts: filters.closedAlerts,
			open_cases: filters.openCases,
			closed_cases: filters.closedCases,
			number_of_nodes: filters.numberOfNodes,
			days_back: filters.daysBack
		});

		if (!data) {
			graph = { nodes: [], edges: [] };
			error = 'Failed to load relationships';
			loading = false;
			return;
		}

		graph = data;
		loading = false;
	};

	$effect(() => {
		if (!alertId) return;

		load();
	});

	const nodes = $derived(
		graph.nodes.map((node) => {
			const font = {
				color: strokeColor
			};

			if (node.group === 'alert') {
				return {
					...node,
					shape: 'image',
					image: alertIcon,
					font
				};
			}

			if (node.group === 'ioc') {
				return {
					...node,
					shape: 'image',
					image: iocIcon,
					font
				};
			}

			if (node.group === 'case') {
				return {
					...node,
					shape: 'image',
					image:
						typeof node.label === 'string' && node.label.startsWith('[Closed]')
							? caseClosedIcon
							: caseOpenIcon,
					font
				};
			}

			if (node.group === 'asset' && typeof node.image === 'string') {
				const theme = isDark ? 'dark' : 'light';
				const separator = node.image.includes('?') ? '&' : '?';

				return {
					...node,
					image: `${node.image}${separator}theme=${theme}`,
					font
				};
			}

			return {
				...node,
				font
			};
		}) as VisNode[]
	);

	const edges = $derived(graph.edges as VisEdge[]);
</script>

<div class="mb-4 flex">
	<AlertRelationshipsFilters bind:value={filters} />
</div>

{#if loading}
	<div class="text-sm opacity-70">Loading relationships...</div>
{:else if error}
	<div class="text-sm text-red-500">{error}</div>
{:else if !graph.nodes.length}
	<div class="text-sm opacity-70">No related entities found.</div>
{:else}
	<VisNetwork {nodes} {edges} {options} className="h-96 w-full rounded-md border bg-muted/20" />
{/if}
