<script lang="ts">
	import { getContext } from 'svelte';
	import { mode } from 'mode-watcher';
	import type { NodeSingular } from 'cytoscape';
	import { EyeIcon, ExternalLinkIcon } from 'lucide-svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import caseSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import { goto } from '$app/navigation';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RelatedAlert, RelatedAlertNode } from '$lib/services/alerts.service';
	import {
		CytoscapeGraph,
		applyAssetImageTheme,
		cyTheme,
		lucideIcon,
		type CyElementDef,
		type CyNodeEvent,
		type CyStylesheet
	} from '$lib/components/common/CytoscapeGraph';
	import Button from '$lib/components/ui/button/button.svelte';
	import { openAlertPivot } from '$lib/utils/alert-pivot';
	import {
		alertGraphEdges,
		graphNodeRawId,
		isHtmlTitle,
		sanitizeGraphTitle
	} from '$lib/utils/alert-graph';
	import { AlertRelationshipsFilters, defaultAlertRelationshipsFilters } from '.';

	type ContextMenuState = {
		open: boolean;
		x: number;
		y: number;
		node?: RelatedAlertNode;
	};

	let {
		alertId,
		fill = false
	}: {
		alertId: number;
		/** Stretch the canvas to the parent's height instead of a fixed 32rem. */
		fill?: boolean;
	} = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');
	const caseOpenColor = $derived(isDark ? '#4ade80' : '#16a34a');
	const closedColor = $derived(isDark ? '#fb923c' : '#c2410c');

	const alertIcon = $derived(lucideIcon(alertSvg, strokeColor));
	const alertClosedIcon = $derived(lucideIcon(alertSvg, closedColor));
	const iocIcon = $derived(lucideIcon(iocSvg, strokeColor));
	const caseOpenIcon = $derived(lucideIcon(caseSvg, caseOpenColor));
	const caseClosedIcon = $derived(lucideIcon(caseSvg, closedColor));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state.raw<RelatedAlert>({ nodes: [], edges: [] });

	let filters = $state(defaultAlertRelationshipsFilters());

	let contextMenu = $state<ContextMenuState>({
		open: false,
		x: 0,
		y: 0
	});

	const load = async () => {
		if (!alertId) return;

		loading = true;
		error = null;
		contextMenu = { open: false, x: 0, y: 0 };

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

		// Every new data set remounts the canvas (`{#key graph}`) for a fresh
		// layout; a theme switch only restyles the nodes in place.
		graph = data;
		loading = false;
	};

	$effect(() => {
		if (!alertId) return;

		load();
	});

	const isClosed = (node: RelatedAlertNode) =>
		typeof node.label === 'string' && node.label.startsWith('[Closed]');

	/** Icon-only nodes (alerts, IOCs, cases, typed assets), as before. */
	const iconOf = (node: RelatedAlertNode): string | undefined => {
		if (node.group === 'alert') return isClosed(node) ? alertClosedIcon : alertIcon;
		if (node.group === 'ioc') return iocIcon;
		if (node.group === 'case') return isClosed(node) ? caseClosedIcon : caseOpenIcon;
		if (node.group === 'asset' && typeof node.image === 'string') {
			return applyAssetImageTheme(node.image, isDark);
		}
		return undefined;
	};

	const elements = $derived.by<CyElementDef[]>(() => [
		...graph.nodes.map((node): CyElementDef => {
			const image = iconOf(node);
			return {
				group: 'nodes',
				data: {
					id: node.id,
					label: node.label ?? '',
					group: node.group,
					...(image ? { image, iconScale: 1, size: 34 } : {})
				},
				classes: image ? ['icon-only'] : []
			};
		}),
		...alertGraphEdges(graph.edges)
	]);

	const stylesheet = $derived.by<CyStylesheet>(() => {
		const t = cyTheme(isDark);
		return [
			{
				selector: 'node.icon-only',
				style: {
					'background-opacity': 0,
					'border-width': 0,
					'outline-width': 0,
					'underlay-shape': 'ellipse',
					'underlay-padding': 6,
					'underlay-opacity': 0
				}
			},
			{
				selector: 'node.icon-only.hover',
				style: { 'underlay-color': t.hover, 'underlay-opacity': 0.15 }
			},
			{
				selector: 'node.icon-only:selected',
				style: { 'underlay-color': t.selection, 'underlay-opacity': 0.25, 'font-weight': 'bold' }
			}
		];
	});

	const nodeById = $derived(new Map(graph.nodes.map((n) => [n.id, n])));

	const closeContextMenu = () => (contextMenu = { open: false, x: 0, y: 0 });

	const openContextMenu = (e: CyNodeEvent) => {
		const node = nodeById.get(e.target.id());

		if (!node) {
			closeContextMenu();
			return;
		}

		contextMenu = {
			x: e.renderedPosition.x,
			y: e.renderedPosition.y,
			open: true,
			node
		};
	};

	const handleNodeAction = () => {
		if (!contextMenu.node) return;

		if (contextMenu.node.group === 'case') {
			goto(`/case/${graphNodeRawId(contextMenu.node.id)}`);
		} else if (contextMenu.node.group === 'alert') {
			goto(`/alerts/${graphNodeRawId(contextMenu.node.id)}`);
		} else if (contextMenu.node.group === 'asset' || contextMenu.node.group === 'ioc') {
			// The pivot has to carry the IOC/asset *value* — that is what the alerts
			// list matches on server-side. This graph's ids do embed the value
			// (`ioc_<ioc_value>`, `asset_<asset_name>`), but `graphNodeRawId` splits
			// on the first underscore, so `evil_domain.com` pivoted as `evil` and
			// matched nothing. The label is the same value, whole.
			//
			// New tab, unlike the case/alert branches above: the pivot is a lookup
			// made *while* reading the graph, so keep the graph where it is. A
			// labelless node is a no-op rather than an early `return` — the menu
			// below still has to close either way.
			openAlertPivot(contextMenu.node.group, contextMenu.node.label, window.location.href);
		}

		closeContextMenu();
	};
</script>

<div class={fill ? 'flex h-full min-h-0 flex-col' : 'contents'}>
	<div class="mb-4 flex">
		<AlertRelationshipsFilters bind:value={filters} />
	</div>

	<div
		class={[
			'relative w-full rounded-md border bg-muted/20',
			fill ? 'min-h-[24rem] flex-1' : 'h-[32rem]'
		]}
		data-testid="alert-related-graph"
	>
		{#if graph.nodes.length}
			{#key graph}
				<!--
				  Embedded in a scrollable page: wheel zoom only after a click
				  into the canvas, released when the pointer leaves.
				-->
				<CytoscapeGraph
					{elements}
					{stylesheet}
					class="rounded-md"
					initialLayout="fcose"
					boxSelectionEnabled={false}
					selectionType="single"
					clickToUse
					onTapNode={closeContextMenu}
					onTapEdge={closeContextMenu}
					onTapCanvas={closeContextMenu}
					onCxtTapNode={openContextMenu}
					onCxtTapEdge={closeContextMenu}
					onCxtTapCanvas={closeContextMenu}
					nodeTooltip={tooltip}
					nodeTooltipEnabled={(n) => !!nodeById.get(n.id())?.title}
				/>
			{/key}
		{/if}

		{#if contextMenu.open && contextMenu.node}
			<div
				class="absolute z-20 rounded-2xl border bg-background px-2 shadow-xl"
				style={`left:${contextMenu.x}px;top:${contextMenu.y}px;transform:translate(8px, 8px);`}
				data-testid="graph-context-menu"
			>
				<!--
			  The icon says where the click lands: the eye for viewing a case or
			  alert in this tab, the external-link glyph for the pivot, which
			  opens a new tab (see `handleNodeAction`).
			-->
				{#if contextMenu.node.group === 'case' || contextMenu.node.group === 'alert'}
					<Button variant="link" size="xs" onclick={() => handleNodeAction()}>
						<EyeIcon class="size-4" />
						View {contextMenu.node.group}
						#{graphNodeRawId(contextMenu.node.id)}
					</Button>
				{:else}
					<Button
						size="xs"
						variant="link"
						title="Opens the filtered alert list in a new tab"
						onclick={() => handleNodeAction()}
					>
						<ExternalLinkIcon class="size-4" />
						Pivot on {contextMenu.node.group}
						{contextMenu.node.label}
						<span class="sr-only">(opens in a new tab)</span>
					</Button>
				{/if}
			</div>
		{/if}

		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
				Loading relationships...
			</div>
		{:else if error}
			<div class="absolute inset-0 flex items-center justify-center text-sm text-red-500">
				{error}
			</div>
		{:else if !graph.nodes.length}
			<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
				No related entities found.
			</div>
		{/if}
	</div>
</div>

{#snippet tooltip(node: NodeSingular)}
	{@const title = nodeById.get(node.id())?.title}
	{#if isHtmlTitle(title)}
		<div class="[&_b]:font-semibold">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html sanitizeGraphTitle(title)}
		</div>
	{:else if title}
		<div class="line-clamp-[12] whitespace-pre-line break-words">{title}</div>
	{/if}
{/snippet}
