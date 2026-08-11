<script lang="ts">
	import { getContext } from 'svelte';
	import { mode } from 'mode-watcher';
	import DOMPurify from 'dompurify';
	import type { IdType, Options } from 'vis-network';
	import { EyeIcon } from 'lucide-svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import caseSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import caseClosedSvg from 'lucide-static/icons/briefcase-business.svg?raw';
	import { goto } from '$app/navigation';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RelatedAlert } from '$lib/services/alerts.service';
	import VisNetwork, {
		type VisNode,
		type VisEdge,
		svgToDataUrl,
		withStroke,
		applyAssetImageTheme
	} from '$lib/components/common/VisNetwork';
	import Button from '$lib/components/ui/button/button.svelte';
	import { AlertRelationshipsFilters, defaultAlertRelationshipsFilters } from '.';

	type ContextMenuState = {
		open: boolean;
		x: number;
		y: number;
		node?: VisNode;
	};

const createTooltip = (html: string) => {
		if (typeof document === 'undefined') return html;

		const el = document.createElement('div');

		el.className = 'related-alert-tooltip';
		el.innerHTML = DOMPurify.sanitize(html, {
			ALLOWED_TAGS: ['b', 'br', 'i', 'em', 'strong', 'span'],
			ALLOWED_ATTR: []
		});

		return el;
	};

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
	const alertClosedColor = $derived(isDark ? '#fb923c' : '#c2410c');

	const alertIcon = $derived(svgToDataUrl(withStroke(alertSvg, strokeColor)));
	const alertClosedIcon = $derived(svgToDataUrl(withStroke(alertSvg, alertClosedColor)));
	const iocIcon = $derived(svgToDataUrl(withStroke(iocSvg, strokeColor)));
	const caseOpenIcon = $derived(svgToDataUrl(withStroke(caseSvg, caseOpenColor)));
	const caseClosedIcon = $derived(svgToDataUrl(withStroke(caseClosedSvg, caseClosedColor)));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state<RelatedAlert>({ nodes: [], edges: [] });

	let filters = $state(defaultAlertRelationshipsFilters());

	let contextMenu = $state<ContextMenuState>({
		open: false,
		x: 0,
		y: 0
	});

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
		clickToUse: true,
		interaction: {
			zoomView: true,
			hover: true
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

			const title = node.title?.includes('<') ? createTooltip(node.title) : node.title;

			if (node.group === 'alert') {
				const isClosed =
					typeof node.label === 'string' && node.label.startsWith('[Closed]');
				return {
					...node,
					title,
					shape: 'image',
					image: isClosed ? alertClosedIcon : alertIcon,
					font
				};
			}

			if (node.group === 'ioc') {
				return {
					...node,
					title,
					shape: 'image',
					image: iocIcon,
					font
				};
			}

			if (node.group === 'case') {
				return {
					...node,
					title,
					shape: 'image',
					image:
						typeof node.label === 'string' && node.label.startsWith('[Closed]')
							? caseClosedIcon
							: caseOpenIcon,
					font
				};
			}

			if (node.group === 'asset' && typeof node.image === 'string') {
				return {
					...node,
					title,
					image: applyAssetImageTheme(node.image, isDark),
					font
				};
			}

			return {
				...node,
				title,
				font
			};
		}) as VisNode[]
	);

	const edges = $derived(graph.edges as VisEdge[]);

	const closeContextMenu = () => (contextMenu = { open: false, x: 0, y: 0 });

	const openContextMenu = (detail: { x: number; y: number; nodeId?: IdType }) => {
		if (!detail.nodeId) {
			closeContextMenu();
			return;
		}

		const node = nodes.find((n) => n.id === detail.nodeId);

		if (!node) {
			closeContextMenu();
			return;
		}

		contextMenu = {
			...detail,
			open: true,
			node
		};
	};

	const getId = (nodeId: string): string => nodeId.split(/_/)[1];

	const handleNodeAction = () => {
		if (!contextMenu.node) return;

		if (contextMenu.node.group === 'case') {
			goto(`/case/${getId(contextMenu.node.id as string)}`);
		} else if (contextMenu.node.group === 'alert') {
			goto(`/alerts/${getId(contextMenu.node.id as string)}`);
		} else if (contextMenu.node.group === 'asset' || contextMenu.node.group === 'ioc') {
			const id = getId(contextMenu.node.id as string);
			const url = new URL(window.location.href);
			const isAlertsPage = url.pathname === '/alerts' || url.pathname === '/alerts/';

			if (!isAlertsPage) {
				url.pathname = '/alerts/';
				url.search = '';
			}

			url.searchParams.set(contextMenu.node.group === 'asset' ? 'alert_assets' : 'alert_iocs', id);

			goto(`${url.pathname}?${url.searchParams.toString()}`);
		}

		closeContextMenu();
	};
</script>

<div class="mb-4 flex">
	<AlertRelationshipsFilters bind:value={filters} />
</div>

<div class="relative h-[32rem] w-full rounded-md border bg-muted/20">
	{#if graph.nodes.length}
		<VisNetwork
			{nodes}
			{edges}
			{options}
			className="h-full w-full"
			onClick={closeContextMenu}
			onContextMenu={openContextMenu}
		/>
	{/if}

	{#if contextMenu.open && contextMenu.node}
		<div
			class="absolute z-20 rounded-2xl border bg-background px-2 shadow-xl"
			style={`left:${contextMenu.x}px;top:${contextMenu.y}px;transform:translate(8px, 8px);`}
		>
			{#if contextMenu.node.group === 'case' || contextMenu.node.group === 'alert'}
				<Button variant="link" size="xs" onclick={() => handleNodeAction()}>
					<EyeIcon class="size-4" />
					View {contextMenu.node.group}
					#{getId(contextMenu.node.id as string)}
				</Button>
			{:else}
				<Button size="xs" variant="link" onclick={() => handleNodeAction()}>
					<EyeIcon class="size-4" />
					Pivot on {contextMenu.node.group}
					{contextMenu.node.label}
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
