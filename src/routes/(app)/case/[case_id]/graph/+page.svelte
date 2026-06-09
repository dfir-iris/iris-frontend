<script lang="ts">
	import { EyeIcon } from 'lucide-svelte';
	import { mode } from 'mode-watcher';
	import type { IdType, Options } from 'vis-network';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import { Button } from '$lib/components/ui/button';
	import VisNetwork, {
		type VisNode,
		type VisEdge,
		makeIocIcon,
		applyAssetImageTheme
	} from '$lib/components/common/VisNetwork';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';

	type ContextMenuState = { open: boolean; x: number; y: number; node?: VisNode };

	const caseId = $derived(Number(page.params.case_id));
	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');

	let loading = $state(false);
	let error = $state<string | null>(null);
	let events = $state<CaseTimelineEvent[]>([]);
	let assets = $state<Asset[]>([]);
	let iocs = $state<Ioc[]>([]);
	let contextMenu = $state<ContextMenuState>({ open: false, x: 0, y: 0 });

	const options = $derived({
		autoResize: true,
		layout: { improvedLayout: true, randomSeed: caseId },
		nodes: { font: { color: strokeColor } },
		clickToUse: true,
		interaction: { zoomView: true, hover: true },
		physics: {
			enabled: true,
			solver: 'forceAtlas2Based',
			forceAtlas2Based: { avoidOverlap: 1 },
			stabilization: { enabled: true, fit: true }
		}
	} satisfies Options);

	const graphData = $derived.by(() => {
		const graphEvents = events.filter((e) => e.event_in_graph !== false);
		const assetByName = new Map([
			...assets.map((a) => [a.asset_name, a] as [string, typeof a]),
			...assets.map(
				(a) => [`${a.asset_name} (${a.asset_type.asset_name})`, a] as [string, typeof a]
			)
		]);
		const iocByValue = new Map(iocs.map((i) => [i.ioc_value, i]));

		const nodeMap = new Map<string, VisNode>();
		const edgeMap = new Map<string, VisEdge>();

		for (const event of graphEvents) {
			const eventNodeIds: string[] = [];

			for (const ea of event.assets ?? []) {
				const asset = assetByName.get(ea.name);
				const nodeId = asset ? `a${asset.asset_id}` : `a-name-${ea.name}`;
				if (!nodeMap.has(nodeId)) {
					if (asset) {
						const iconFile =
							asset.asset_compromise_status_id === 1
								? asset.asset_type.asset_icon_compromised
								: asset.asset_type.asset_icon_not_compromised;
						const titleParts = [asset.asset_ip, asset.asset_description].filter(Boolean);
						nodeMap.set(nodeId, {
							id: nodeId,
							label: asset.asset_name,
							title: titleParts.length ? titleParts.join(' — ') : undefined,
							shape: 'image',
							image: `/static/assets/img/graph/${iconFile}`,
							group: 'asset'
						});
					} else {
						const titleParts = [ea.ip, ea.description].filter(Boolean);
						nodeMap.set(nodeId, {
							id: nodeId,
							label: ea.name,
							title: titleParts.length ? (titleParts.join(' — ') as string) : undefined,
							shape: 'box',
							group: 'asset'
						});
					}
				}
				eventNodeIds.push(nodeId);
			}

			for (const ei of event.iocs ?? []) {
				const ioc = iocByValue.get(ei.name);
				if (!ioc) continue;

				const nodeId = `b${ioc.ioc_id}`;
				if (!nodeMap.has(nodeId)) {
					nodeMap.set(nodeId, {
						id: nodeId,
						label: ioc.ioc_value,
						title: ioc.ioc_description ?? undefined,
						shape: 'image',
						image: makeIocIcon(strokeColor),
						group: 'ioc'
					});
				}
				eventNodeIds.push(nodeId);
			}

			for (let i = 0; i < eventNodeIds.length; i++) {
				for (let j = i + 1; j < eventNodeIds.length; j++) {
					const from = eventNodeIds[i];
					const to = eventNodeIds[j];
					const fromIsAsset = from.startsWith('a');
					const toIsAsset = to.startsWith('a');
					if (fromIsAsset === toIsAsset) continue;
					const key = [from, to].sort().join('|');
					if (!edgeMap.has(key)) {
						edgeMap.set(key, {
							from,
							to,
							title: `${event.event_date.slice(0, 10)} — ${event.event_title}`,
							dashes: true
						});
					}
				}
			}
		}

		return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
	});

	const visNodes = $derived(
		graphData.nodes.map((node) => ({
			...node,
			image:
				node.group === 'asset' && typeof node.image === 'string'
					? applyAssetImageTheme(node.image, isDark)
					: node.image,
			font: { color: strokeColor }
		})) as VisNode[]
	);

	const visEdges = $derived(graphData.edges as VisEdge[]);

	const closeContextMenu = () => (contextMenu = { open: false, x: 0, y: 0 });

	const openContextMenu = (detail: { x: number; y: number; nodeId?: IdType }) => {
		if (!detail.nodeId) {
			closeContextMenu();
			return;
		}
		const node = visNodes.find((n) => n.id === detail.nodeId);
		if (!node) {
			closeContextMenu();
			return;
		}
		contextMenu = { ...detail, open: true, node };
	};

	const handleNodeAction = () => {
		if (!contextMenu.node) return;
		const rawId = contextMenu.node.id as string;
		if (contextMenu.node.group === 'asset') {
			const numericId = rawId.match(/^a(\d+)$/)?.[1];
			if (!numericId) return;
			goto(`/case/${caseId}/assets/${numericId}`);
		} else if (contextMenu.node.group === 'ioc') {
			goto(`/case/${caseId}/iocs/${rawId.slice(1)}`);
		}
		closeContextMenu();
	};

	const load = async () => {
		loading = true;
		error = null;
		contextMenu = { open: false, x: 0, y: 0 };

		const [eventsRes, assetsRes, iocsRes] = await Promise.all([
			CaseTimelineService.listEvents(caseId, {}, { fetch }),
			CaseAssetsService.list(caseId, { per_page: 500 }, { fetch }),
			CaseIocsService.list(caseId, { per_page: 500 }, { fetch })
		]);

		if (
			!eventsRes.ok ||
			!assetsRes.ok ||
			!iocsRes.ok ||
			typeof eventsRes.data === 'string' ||
			typeof assetsRes.data === 'string' ||
			typeof iocsRes.data === 'string'
		) {
			error = 'Failed to load graph data';
			loading = false;
			return;
		}

		events = eventsRes.data?.timeline ?? eventsRes.data?.tim ?? [];
		assets = assetsRes.data?.data ?? [];
		iocs = iocsRes.data?.data ?? [];
		loading = false;
	};

	$effect(() => {
		load();
	});
</script>

<CaseWorkspace>
<div class="flex h-full min-h-0 w-full flex-col">
	<div class="border-b bg-muted/40">
		<div class="flex px-6 py-3">
			<div class="ml-auto flex items-center gap-2">
				<Button variant="secondary" size="sm" onclick={load} disabled={loading}>Refresh</Button>
			</div>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden p-4">
		<div class="relative h-full overflow-hidden rounded-lg border bg-background">
			{#if visNodes.length}
				<VisNetwork
					nodes={visNodes}
					edges={visEdges}
					{options}
					className="h-full w-full"
					onClick={closeContextMenu}
					onContextMenu={openContextMenu}
				/>
			{/if}

			{#if contextMenu.open && contextMenu.node}
				<div
					class="absolute z-20 rounded-2xl border bg-background px-2 shadow-xl"
					style="left:{contextMenu.x}px;top:{contextMenu.y}px;transform:translate(8px,8px)"
				>
					<Button variant="link" size="xs" onclick={handleNodeAction}>
						<EyeIcon class="size-4" />
						View {contextMenu.node.group}
						{contextMenu.node.label}
					</Button>
				</div>
			{/if}

			{#if loading}
				<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
					Loading graph...
				</div>
			{:else if error}
				<div class="absolute inset-0 flex items-center justify-center text-sm text-red-500">
					{error}
				</div>
			{:else if !visNodes.length}
				<div class="absolute inset-0 flex items-center justify-center text-sm opacity-70">
					No graph data. Add assets or IOCs to timeline events and enable "Display in graph".
				</div>
			{/if}
		</div>
	</div>
</div>
</CaseWorkspace>
