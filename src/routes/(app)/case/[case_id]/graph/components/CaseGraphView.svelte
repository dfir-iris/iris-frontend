<!--
  Investigation graph of one case: Cytoscape canvas, toolbar, palette, detail
  rail, context menus and the authoring dialogs. All state lives in
  `CaseGraphState` (shared through `setCaseGraphContext` for extensions).
-->
<script lang="ts">
	import { getContext, onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { mode } from 'mode-watcher';
	import type { NodeSingular, Position } from 'cytoscape';
	import {
		ArrowLeftRightIcon,
		CheckIcon,
		CircleDotIcon,
		ClipboardPasteIcon,
		CrosshairIcon,
		EyeIcon,
		EyeOffIcon,
		FlagIcon,
		FoldVerticalIcon,
		ListTodoIcon,
		LoaderCircleIcon,
		LockIcon,
		MaximizeIcon,
		PencilIcon,
		PinIcon,
		PinOffIcon,
		PlusIcon,
		RouteIcon,
		ShapesIcon,
		SplineIcon,
		SquareArrowOutUpRightIcon,
		TagIcon,
		Trash2Icon,
		TriangleAlertIcon,
		UnfoldVerticalIcon,
		WandSparklesIcon,
		XIcon
	} from 'lucide-svelte';
	import {
		CytoscapeGraph,
		CytoscapeMinimap,
		type CyCanvasEvent,
		type CyEdgeEvent,
		type CyNodeEvent
	} from '$lib/components/common/CytoscapeGraph';
	import { Button } from '$lib/components/ui/button';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import type {
		CreateGraphEdgeBody,
		GraphEdge,
		GraphNode,
		GraphNodeKey
	} from '$lib/types/resources/case-graph';
	import { CaseGraphState, setCaseGraphContext } from '../lib/graph-state.svelte';
	import { GraphReferenceData } from '../lib/reference-data.svelte';
	import type { GraphActions } from '../lib/actions';
	import { caseGraphStylesheet, fanIdOf, isBundleId, isFanId } from '../lib/elements';
	import { isLinkable, isStoredEdge, KIND_LABEL, truncate } from '../lib/model';
	import { decodeDragKeys, GRAPH_DRAG_MIME, placeNear, renderedToModel } from '../lib/canvas';
	import { shortcutAction } from '../lib/shortcuts';
	import FloatingMenu, { type MenuEntry } from './FloatingMenu.svelte';
	import GraphToolbar from './GraphToolbar.svelte';
	import GraphRail from './GraphRail.svelte';
	import GraphLegend from './GraphLegend.svelte';
	import ObjectPalette from './ObjectPalette.svelte';
	import ConnectHandle from './ConnectHandle.svelte';
	import ObjectPickerDialog from './ObjectPickerDialog.svelte';
	import NewRelationDialog from './NewRelationDialog.svelte';
	import type { RelationFormValues } from './RelationForm.svelte';
	import FreeNodeDialog from './FreeNodeDialog.svelte';
	import PromoteDialog from './PromoteDialog.svelte';
	import PasteDialog from './PasteDialog.svelte';
	import BulkActionDialog, { type BulkAction } from './BulkActionDialog.svelte';
	import { installGraphFeatures } from '../features/install.svelte';

	interface Props {
		caseId: number;
	}

	let { caseId }: Props = $props();

	// The parent re-creates this component when the case changes.
	const graph = untrack(() => new CaseGraphState(caseId));
	setCaseGraphContext(graph);
	const refs = new GraphReferenceData();
	const access = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const canEdit = $derived(access?.canEdit() ?? false);

	if (browser) {
		graph.restoreLocal();
		void graph.load();
	}
	const initialViewport = graph.viewport;

	$effect(() => {
		graph.isDark = $mode === 'dark';
	});

	onDestroy(() => graph.dispose());

	const stylesheet = $derived(caseGraphStylesheet(graph.isDark));

	// -----------------------------------------------------------------------
	// UI state
	// -----------------------------------------------------------------------

	let showPalette = $state(false);
	let showLegend = $state(false);
	let showHelp = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);
	let canvasEl = $state<HTMLDivElement | null>(null);
	let dropActive = $state(false);
	let menu = $state<{ x: number; y: number; title?: string; items: MenuEntry[] } | null>(null);
	let laidOut = false;

	type PickerMode =
		| { type: 'add'; at: Position | null; tab: 'existing' | 'asset' | 'ioc' }
		| { type: 'connect'; source: GraphNodeKey };
	let pickerOpen = $state(false);
	let picker = $state<PickerMode>({ type: 'add', at: null, tab: 'existing' });

	let relationOpen = $state(false);
	let relationPair = $state<{ source: GraphNodeKey; target: GraphNodeKey } | null>(null);

	let freeNodeOpen = $state(false);
	let freeNodeEdit = $state<GraphNode | null>(null);
	let freeNodeAt = $state<Position | null>(null);

	let promoteOpen = $state(false);
	let promoteNode = $state<GraphNode | null>(null);

	let pasteOpen = $state(false);
	let pasteLinkTo = $state<GraphNodeKey | null>(null);
	let pasteAt = $state<Position | null>(null);

	let bulkOpen = $state(false);
	let bulkAction = $state<BulkAction>('task');
	let bulkNodes = $state<GraphNode[]>([]);

	let confirmOpen = $state(false);
	let confirmation = $state<{
		title: string;
		message: string;
		confirmText: string;
		onConfirm: () => void;
	}>({ title: '', message: '', confirmText: 'Delete', onConfirm: () => {} });

	const ask = (c: typeof confirmation) => {
		confirmation = c;
		confirmOpen = true;
	};

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	const nodeLabel = (key: string | null | undefined) => {
		const n = graph.node(key);
		return n ? truncate(n.label, 48) : (key ?? '');
	};

	/** Model coordinates of the centre of the visible canvas. */
	const viewCentre = (): Position | null => {
		const cy = graph.cy;
		if (!cy) return null;
		const e = cy.extent();
		return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
	};

	const positionOf = (id: string): Position | null => {
		const n = graph.cy?.getElementById(id);
		return n && n.nonempty() ? { ...(n as NodeSingular).position() } : null;
	};

	/** Selected canvas ids split into node keys / canvas node ids / edge keys. */
	const selectedNodeIds = () => graph.selection.filter((id) => graph.node(id) || isFanId(id));
	const selectedNodeKeys = () => {
		const keys: string[] = [];
		for (const id of graph.selection) {
			if (graph.node(id)) keys.push(id);
			else if (isFanId(id)) keys.push(...(graph.output.fanouts.get(id)?.iocs ?? []));
		}
		return [...new Set(keys)];
	};
	const selectedEdges = () => {
		const out: GraphEdge[] = [];
		for (const id of graph.selection) {
			const keys = isBundleId(id) ? (graph.output.bundles.get(id) ?? []) : [id];
			for (const k of keys) {
				const e = graph.edge(k);
				if (e) out.push(e);
			}
		}
		return out;
	};

	const linkableId = (id: string) => isLinkable(graph.node(id));

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	const errorMessage = (e: unknown) =>
		e instanceof Error ? e.message : typeof e === 'string' ? e : 'The operation failed.';

	const actions: GraphActions = {
		run: async (fn, success) => {
			try {
				await fn();
				if (success) toast({ title: success, variant: 'success' });
			} catch (e) {
				toast({ title: 'Graph', description: errorMessage(e), variant: 'destructive' });
			}
		},
		connectFrom: (key) => {
			picker = { type: 'connect', source: key };
			pickerOpen = true;
		},
		connect: (source, target) => {
			if (source === target) return;
			relationPair = { source, target };
			relationOpen = true;
		},
		addExisting: (at) => {
			picker = { type: 'add', at: at ?? null, tab: 'existing' };
			pickerOpen = true;
		},
		createObject: (kind, at) => {
			picker = { type: 'add', at: at ?? null, tab: kind };
			pickerOpen = true;
		},
		createFreeNode: (at) => {
			freeNodeEdit = null;
			freeNodeAt = at ?? viewCentre();
			freeNodeOpen = true;
		},
		editFreeNode: (key) => {
			const n = graph.node(key);
			if (!n || n.kind !== 'node') return;
			freeNodeEdit = n;
			freeNodeOpen = true;
		},
		promote: (key) => {
			const n = graph.node(key);
			if (!n || n.kind !== 'node') return;
			promoteNode = n;
			promoteOpen = true;
		},
		deleteFreeNode: (key) => {
			const n = graph.node(key);
			if (!n || n.kind !== 'node') return;
			ask({
				title: 'Delete node',
				message: `Delete “${n.label}” and its relations? This can be undone.`,
				confirmText: 'Delete',
				onConfirm: () => void actions.run(() => graph.deleteFreeNode(n), 'Node deleted')
			});
		},
		paste: (opts) => {
			pasteLinkTo = opts?.linkTo ?? null;
			pasteAt = opts?.at ?? null;
			pasteOpen = true;
		},
		deleteEdges: (edges) => {
			const stored = edges.filter(isStoredEdge);
			if (!stored.length) {
				toast({
					title: 'Nothing to delete',
					description: 'Relations derived from the timeline are removed from the timeline itself.',
					variant: 'warning'
				});
				return;
			}
			ask({
				title: stored.length > 1 ? `Delete ${stored.length} relations` : 'Delete relation',
				message:
					stored.length > 1
						? `Delete the ${stored.length} selected stored relations? This can be undone.`
						: `Delete the relation between “${nodeLabel(stored[0].source)}” and “${nodeLabel(stored[0].target)}”? This can be undone.`,
				confirmText: 'Delete',
				onConfirm: () =>
					void actions.run(
						() => graph.deleteEdges(stored),
						stored.length > 1 ? 'Relations deleted' : 'Relation deleted'
					)
			});
		},
		bulk: (action, keys) => {
			bulkNodes = keys.map((k) => graph.node(k)).filter((n): n is GraphNode => !!n);
			if (!bulkNodes.length) return;
			bulkAction = action;
			bulkOpen = true;
		},
		expand: (key) =>
			void actions.run(async () => {
				const before = graph.visibility.nodes.size;
				await graph.expand(key);
				const added = graph.visibility.nodes.size - before;
				toast({
					title: added > 0 ? `${added} neighbour${added > 1 ? 's' : ''} added` : 'No new neighbour',
					variant: 'default'
				});
			}),
		collapse: (key) => {
			const n = graph.collapse(key);
			toast({ title: n ? `${n} neighbour${n > 1 ? 's' : ''} hidden` : 'Nothing to collapse' });
		},
		pathFrom: (key) => {
			if (graph.path.source && graph.path.source !== key && !graph.path.target) {
				graph.path.target = key;
			} else {
				graph.path.source = key;
				if (graph.path.target === key) graph.path.target = null;
			}
			graph.clearPath();
			graph.rail = { type: 'paths' };
			if (graph.path.source && graph.path.target) void graph.findPaths();
		}
	};

	const uninstallFeatures = untrack(() =>
		installGraphFeatures(graph, { caseId, canEdit: () => canEdit, actions })
	);
	onDestroy(uninstallFeatures);

	const undo = () =>
		void actions.run(async () => {
			const entry = await graph.undo();
			if (entry) toast({ title: `Undone: ${entry.label}` });
		});

	const redo = () =>
		void actions.run(async () => {
			const entry = await graph.redo();
			if (entry) toast({ title: `Redone: ${entry.label}` });
		});

	// -----------------------------------------------------------------------
	// Dialog callbacks
	// -----------------------------------------------------------------------

	const pickerNodes = $derived.by<GraphNode[]>(() => {
		if (picker.type === 'connect') {
			const source = picker.source;
			return graph.nodes.filter((n) => n.key !== source && isLinkable(n));
		}
		return graph.nodes.filter((n) => n.kind === 'asset' || n.kind === 'ioc');
	});

	const onPicked = async (key: string, created: boolean) => {
		const mode = picker;
		if (mode.type === 'connect') {
			if (created) {
				const anchor = positionOf(mode.source);
				await graph.trackCreatedObject(
					key,
					anchor ? { x: anchor.x + 140, y: anchor.y + 40 } : viewCentre()
				);
			} else if (!graph.isVisible(key)) {
				graph.addToCanvas([key]);
			}
			actions.connect(mode.source, key);
			return;
		}
		const at = mode.at ?? viewCentre();
		if (created) {
			await graph.trackCreatedObject(key, at);
			toast({ title: `${nodeLabel(key)} created`, variant: 'success' });
		} else if (graph.isVisible(key)) {
			graph.select([key], { center: true });
		} else {
			graph.addToCanvas([key], at);
		}
	};

	const onRelation = async (v: RelationFormValues) => {
		const pair = relationPair;
		if (!pair) return;
		const [source, target] = v.swapped ? [pair.target, pair.source] : [pair.source, pair.target];
		const body: CreateGraphEdgeBody = {
			source,
			target,
			directed: v.directed,
			label: v.label.trim() || null,
			description: v.description.trim() || null,
			confidence: v.confidence
		};
		if (v.relationTypeId !== null) body.relation_type_id = v.relationTypeId;
		else body.relation = v.relationName;
		// Errors propagate to the form, which keeps the dialog open.
		const edge = await graph.createEdge(body);
		graph.rail = { type: 'edge', key: edge.key };
		toast({ title: 'Relation created', variant: 'success' });
	};

	// -----------------------------------------------------------------------
	// Canvas events
	// -----------------------------------------------------------------------

	const openMenu = (e: { clientPosition: Position }, items: MenuEntry[], title?: string) => {
		menu = { x: e.clientPosition.x, y: e.clientPosition.y, items, title };
	};

	const canvasMenu = (e: CyCanvasEvent) => {
		const at = e.position;
		const items: MenuEntry[] = [];
		if (canEdit) {
			items.push(
				{ label: 'Add an asset or IOC…', icon: PlusIcon, onSelect: () => actions.addExisting(at) },
				{
					label: 'New asset…',
					icon: ShapesIcon,
					onSelect: () => actions.createObject('asset', at)
				},
				{
					label: 'New IOC…',
					icon: CrosshairIcon,
					onSelect: () => actions.createObject('ioc', at)
				},
				{
					label: 'New free node…',
					icon: CircleDotIcon,
					onSelect: () => actions.createFreeNode(at)
				},
				{
					label: 'Paste indicators…',
					icon: ClipboardPasteIcon,
					onSelect: () => actions.paste({ at })
				},
				{ type: 'separator' }
			);
		} else {
			items.push({
				label: 'Show an asset or IOC…',
				icon: PlusIcon,
				onSelect: () => actions.addExisting(at)
			});
		}
		items.push(
			{ label: 'Fit to screen', icon: MaximizeIcon, shortcut: 'F', onSelect: () => graph.fit() },
			{
				label: 'Re-run the layout',
				icon: WandSparklesIcon,
				disabled: graph.locked,
				hint: graph.locked ? 'The layout is locked' : undefined,
				onSelect: () => void graph.applyLayout()
			},
			{
				label: graph.locked ? 'Unlock the layout' : 'Lock the layout',
				icon: LockIcon,
				onSelect: () => graph.setLocked(!graph.locked)
			}
		);
		if (graph.hidden.size) {
			items.push({
				label: `Show the ${graph.hidden.size} hidden`,
				icon: EyeIcon,
				onSelect: () => graph.unhideAll()
			});
		}
		if (graph.focus) {
			items.push({ label: 'Exit focus', icon: XIcon, onSelect: () => graph.setFocus(null) });
		}
		openMenu(e, items);
	};

	const nodeMenuItems = (n: GraphNode): MenuEntry[] => {
		const key = n.key;
		const items: MenuEntry[] = [];
		const multi = graph.selection.length > 1 && graph.selection.includes(key);
		if (multi) {
			const keys = selectedNodeKeys();
			items.push({ type: 'label', label: `${keys.length} selected` });
			items.push(
				{
					label: 'Hide the selection',
					icon: EyeOffIcon,
					shortcut: 'H',
					onSelect: () => graph.hide(selectedNodeIds())
				},
				{
					label: 'Pin / unpin the selection',
					icon: PinIcon,
					shortcut: 'P',
					onSelect: () => graph.togglePin(selectedNodeIds())
				},
				{
					label: 'Zoom to the selection',
					icon: MaximizeIcon,
					onSelect: () => graph.fit(graph.selection)
				}
			);
			if (canEdit) {
				items.push(
					{
						label: 'Create a task…',
						icon: ListTodoIcon,
						onSelect: () => actions.bulk('task', keys)
					},
					{ label: 'Add tags…', icon: TagIcon, onSelect: () => actions.bulk('tag', keys) },
					{
						label: 'Flag the assets…',
						icon: FlagIcon,
						disabled: !keys.some((k) => graph.node(k)?.kind === 'asset'),
						onSelect: () => actions.bulk('flag', keys)
					}
				);
			}
			items.push({ type: 'separator' });
			items.push({ type: 'label', label: truncate(n.label, 40) });
		}
		if (canEdit && isLinkable(n)) {
			items.push({
				label: 'Connect to…',
				icon: SplineIcon,
				onSelect: () => actions.connectFrom(key)
			});
		}
		items.push({
			label: 'Expand neighbours',
			icon: UnfoldVerticalIcon,
			shortcut: 'E',
			onSelect: () => actions.expand(key)
		});
		if ((graph.index.adjacency.get(key)?.size ?? 0) > 0) {
			items.push({
				label: 'Collapse neighbours',
				icon: FoldVerticalIcon,
				onSelect: () => actions.collapse(key)
			});
		}
		if (n.kind === 'asset') {
			const leaves = graph.leafIocCount(key);
			const folded = graph.output.fanouts.has(fanIdOf(key));
			if (folded || leaves > 1) {
				items.push({
					label: folded ? 'Unfold its IOCs' : `Fold its ${leaves} IOCs`,
					icon: folded ? UnfoldVerticalIcon : FoldVerticalIcon,
					onSelect: () => graph.toggleFanout(key)
				});
			}
		}
		items.push(
			graph.focus?.key === key
				? { label: 'Exit focus', icon: XIcon, onSelect: () => graph.setFocus(null) }
				: { label: 'Focus here', icon: CrosshairIcon, onSelect: () => graph.setFocus(key) },
			{
				label:
					graph.path.source && graph.path.source !== key && !graph.path.target
						? 'Find paths to here'
						: 'Find paths from here',
				icon: RouteIcon,
				onSelect: () => actions.pathFrom(key)
			},
			{
				label: graph.pinned.has(key) ? 'Unpin' : 'Pin',
				icon: graph.pinned.has(key) ? PinOffIcon : PinIcon,
				shortcut: 'P',
				onSelect: () => graph.togglePin([key])
			},
			{ label: 'Hide', icon: EyeOffIcon, shortcut: 'H', onSelect: () => graph.hide([key]) }
		);
		if (n.url) {
			const url = n.url;
			items.push({
				label: `Open the ${KIND_LABEL[n.kind].toLowerCase()}`,
				icon: SquareArrowOutUpRightIcon,
				onSelect: () => void goto(url)
			});
		}
		if (canEdit && isLinkable(n) && (n.kind === 'asset' || n.kind === 'ioc' || n.kind === 'node')) {
			items.push({
				label: 'Paste indicators linked here…',
				icon: ClipboardPasteIcon,
				onSelect: () => actions.paste({ linkTo: key })
			});
		}
		if (canEdit && n.kind === 'node') {
			items.push(
				{ type: 'separator' },
				{ label: 'Edit…', icon: PencilIcon, onSelect: () => actions.editFreeNode(key) },
				{
					label: 'Promote to asset / IOC…',
					icon: WandSparklesIcon,
					onSelect: () => actions.promote(key)
				},
				{
					label: 'Delete',
					icon: Trash2Icon,
					danger: true,
					onSelect: () => actions.deleteFreeNode(key)
				}
			);
		}
		return items;
	};

	const onCxtTapNode = (e: CyNodeEvent) => {
		const id = e.target.id();
		if (isFanId(id)) {
			const fan = graph.output.fanouts.get(id);
			if (!fan) return;
			openMenu(
				e,
				[
					{
						label: `Unfold the ${fan.iocs.length} IOCs`,
						icon: UnfoldVerticalIcon,
						onSelect: () => graph.toggleFanout(fan.asset)
					},
					{
						label: 'List them',
						icon: EyeIcon,
						onSelect: () => (graph.rail = { type: 'fanout', id })
					},
					{ label: 'Hide them', icon: EyeOffIcon, onSelect: () => graph.hide([id]) }
				],
				`${fan.iocs.length} IOCs of ${nodeLabel(fan.asset)}`
			);
			return;
		}
		const n = graph.node(id);
		if (!n) return;
		if (!graph.selection.includes(id)) graph.select([id]);
		openMenu(e, nodeMenuItems(n), graph.selection.length > 1 ? undefined : truncate(n.label, 40));
	};

	const edgeMenuItems = (edge: GraphEdge): MenuEntry[] => {
		const items: MenuEntry[] = [
			{
				label: 'Details',
				icon: EyeIcon,
				onSelect: () => (graph.rail = { type: 'edge', key: edge.key })
			}
		];
		if (!canEdit) return items;
		if (isStoredEdge(edge)) {
			if (edge.review_state !== 'accepted') {
				items.push(
					{
						label: 'Accept',
						icon: CheckIcon,
						onSelect: () =>
							void actions.run(() => graph.reviewEdge(edge, 'accept'), 'Relation accepted')
					},
					{
						label: 'Reject',
						icon: XIcon,
						onSelect: () =>
							void actions.run(() => graph.reviewEdge(edge, 'reject'), 'Relation rejected')
					}
				);
			}
			items.push(
				{
					label: 'Edit…',
					icon: PencilIcon,
					onSelect: () => (graph.rail = { type: 'edge', key: edge.key })
				},
				{
					label: 'Reverse the direction',
					icon: ArrowLeftRightIcon,
					onSelect: () => void actions.run(() => graph.reverseEdge(edge), 'Relation reversed')
				},
				{ type: 'separator' },
				{
					label: 'Delete',
					icon: Trash2Icon,
					danger: true,
					shortcut: 'Del',
					onSelect: () => actions.deleteEdges([edge])
				}
			);
		} else {
			items.push({
				label: 'Materialise as stored edge',
				icon: SplineIcon,
				hint: 'Keep this timeline-derived relation even if the events change',
				onSelect: () =>
					void actions.run(async () => {
						const created = await graph.materialiseEdge(edge);
						graph.rail = { type: 'edge', key: created.key };
					}, 'Relation stored')
			});
		}
		return items;
	};

	const onCxtTapEdge = (e: CyEdgeEvent) => {
		const id = e.target.id();
		if (isBundleId(id)) {
			const members = graph.output.bundles.get(id) ?? [];
			const edges = members.map((k) => graph.edge(k)).filter((x): x is GraphEdge => !!x);
			const items: MenuEntry[] = [
				{ label: 'Unfold', icon: UnfoldVerticalIcon, onSelect: () => graph.toggleBundle(id) },
				{ label: 'List them', icon: EyeIcon, onSelect: () => (graph.rail = { type: 'bundle', id }) }
			];
			if (canEdit && edges.some(isStoredEdge)) {
				items.push(
					{ type: 'separator' },
					{
						label: 'Delete the stored ones',
						icon: Trash2Icon,
						danger: true,
						onSelect: () => actions.deleteEdges(edges)
					}
				);
			}
			openMenu(e, items, `${members.length} relations`);
			return;
		}
		const edge = graph.edge(id);
		if (!edge) return;
		openMenu(e, edgeMenuItems(edge), truncate(edge.label || edge.relation.label, 40));
	};

	const onTapNode = (e: CyNodeEvent) => {
		menu = null;
		const id = e.target.id();
		const multi =
			e.originalEvent &&
			(e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
		if (multi) return;
		graph.rail = isFanId(id) ? { type: 'fanout', id } : { type: 'node', key: id };
	};

	const onTapEdge = (e: CyEdgeEvent) => {
		menu = null;
		const id = e.target.id();
		graph.rail = isBundleId(id) ? { type: 'bundle', id } : { type: 'edge', key: id };
	};

	const onTapCanvas = () => {
		menu = null;
		const r = graph.rail;
		if (r && r.type !== 'paths' && r.type !== 'panel') graph.rail = null;
	};

	const onSelectionChange = (ids: string[]) => {
		graph.selection = ids;
		if (ids.length > 1) graph.rail = { type: 'selection' };
	};

	const onElementsApplied = (autoPlaced: string[]) => {
		const cy = graph.cy;
		if (!cy || !autoPlaced.length) return;
		const total = cy.nodes().length;
		if (!laidOut && autoPlaced.length === total) {
			laidOut = true;
			if (graph.locked) {
				graph.recordPositions(
					Object.fromEntries(autoPlaced.map((id) => [id, positionOf(id) ?? { x: 0, y: 0 }]))
				);
			} else {
				void graph.applyLayout();
			}
			return;
		}
		laidOut = true;
		const placed = new Set(autoPlaced);
		const neighbours = (id: string): string[] => {
			const fan = graph.output.fanouts.get(id);
			if (fan) return [fan.asset];
			const out: string[] = [];
			for (const k of graph.index.adjacency.get(id) ?? []) {
				const cid = graph.canvasIdOf(k);
				if (cid) out.push(cid);
			}
			return out;
		};
		const positions = placeNear(
			autoPlaced,
			neighbours,
			(id) => (placed.has(id) ? null : positionOf(id)),
			viewCentre() ?? { x: 0, y: 0 }
		);
		cy.batch(() => {
			for (const [id, p] of Object.entries(positions)) cy.getElementById(id).position(p);
		});
		graph.recordPositions(positions);
	};

	// -----------------------------------------------------------------------
	// Palette drop
	// -----------------------------------------------------------------------

	const onDragOver = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes(GRAPH_DRAG_MIME)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		dropActive = true;
	};

	const onDrop = (e: DragEvent) => {
		dropActive = false;
		const keys = decodeDragKeys(e.dataTransfer?.getData(GRAPH_DRAG_MIME));
		const cy = graph.cy;
		if (!keys.length || !cy || !canvasEl) return;
		e.preventDefault();
		const rect = canvasEl.getBoundingClientRect();
		const at = renderedToModel(
			{ x: e.clientX - rect.left, y: e.clientY - rect.top },
			{ zoom: cy.zoom(), pan: cy.pan() }
		);
		graph.addToCanvas(keys, at);
	};

	const addFromPalette = (keys: string[]) => {
		const centre = viewCentre();
		const cols = Math.min(6, keys.length);
		graph.addToCanvas(
			keys,
			centre ? { x: centre.x - ((cols - 1) * 70) / 2, y: centre.y - 35 } : null
		);
	};

	// -----------------------------------------------------------------------
	// Keyboard
	// -----------------------------------------------------------------------

	const anyDialogOpen = () =>
		pickerOpen ||
		relationOpen ||
		freeNodeOpen ||
		promoteOpen ||
		pasteOpen ||
		bulkOpen ||
		confirmOpen;

	const onKeydown = (e: KeyboardEvent) => {
		if (e.defaultPrevented || anyDialogOpen()) return;
		const target = e.target as Element | null;
		if (target?.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return;
		const action = shortcutAction(e);
		if (!action) return;
		switch (action) {
			case 'fit':
				graph.fit();
				break;
			case 'search':
				e.preventDefault();
				searchInput?.focus();
				searchInput?.select();
				break;
			case 'delete': {
				if (!canEdit) return;
				const edges = selectedEdges();
				const free = graph.selection.map((id) => graph.node(id)).filter((n) => n?.kind === 'node');
				if (edges.some(isStoredEdge)) actions.deleteEdges(edges);
				else if (free.length === 1 && free[0]) actions.deleteFreeNode(free[0].key);
				else if (free.length > 1) {
					toast({ title: 'Delete free nodes one at a time', variant: 'warning' });
				} else return;
				e.preventDefault();
				break;
			}
			case 'clear':
				if (menu) menu = null;
				else if (showHelp) showHelp = false;
				else if (graph.selection.length) graph.select([]);
				else if (graph.path.result) graph.clearPath();
				else if (graph.focus) graph.setFocus(null);
				else if (graph.query) graph.setQuery('');
				else graph.rail = null;
				break;
			case 'hide': {
				const ids = selectedNodeIds();
				if (ids.length) graph.hide(ids);
				break;
			}
			case 'pin': {
				const ids = selectedNodeIds();
				if (ids.length) graph.togglePin(ids);
				break;
			}
			case 'expand':
				for (const id of selectedNodeIds()) {
					if (isFanId(id)) {
						const fan = graph.output.fanouts.get(id);
						if (fan) graph.toggleFanout(fan.asset);
					} else actions.expand(id);
				}
				break;
			case 'undo':
				e.preventDefault();
				if (graph.canUndo) undo();
				break;
			case 'redo':
				e.preventDefault();
				if (graph.canRedo) redo();
				break;
			case 'select-all':
				e.preventDefault();
				graph.cy?.nodes(':visible').select();
				break;
			case 'help':
				showHelp = !showHelp;
				break;
		}
	};

	// -----------------------------------------------------------------------
	// Derived view
	// -----------------------------------------------------------------------

	const visibleCount = $derived(graph.visibility.nodes.size);
	const edgeCount = $derived(graph.visibility.edges.size);
	const isEmpty = $derived(!!graph.graph && graph.nodes.length === 0);
	const allHidden = $derived(!!graph.graph && graph.nodes.length > 0 && visibleCount === 0);
	const overlays = $derived([...graph.canvasOverlays.values()]);
	const focusNode = $derived(graph.focus ? graph.node(graph.focus.key) : undefined);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full min-h-0 w-full flex-col">
	<GraphToolbar
		{graph}
		{canEdit}
		{actions}
		bind:showPalette
		bind:showLegend
		bind:showHelp
		bind:searchInput
		onUndo={undo}
		onRedo={redo}
	/>

	{#if graph.graph?.meta?.warning}
		<div
			class="flex items-center gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
			role="status"
		>
			<TriangleAlertIcon class="h-3.5 w-3.5 shrink-0" />
			{graph.graph.meta.warning}
		</div>
	{/if}
	{#if graph.error && graph.graph}
		<div
			class="flex items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
			role="alert"
		>
			<TriangleAlertIcon class="h-3.5 w-3.5 shrink-0" />
			<span class="flex-1">{graph.error}</span>
			<Button size="xs" variant="ghost" onclick={() => graph.refresh()}>Retry</Button>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1">
		{#if showPalette}
			<ObjectPalette {graph} onAdd={addFromPalette} onClose={() => (showPalette = false)} />
		{/if}

		<div
			bind:this={canvasEl}
			class="relative min-w-0 flex-1 bg-background {dropActive
				? 'ring-2 ring-inset ring-primary/60'
				: ''}"
			role="region"
			aria-label="Investigation graph"
			ondragover={onDragOver}
			ondragleave={() => (dropActive = false)}
			ondrop={onDrop}
		>
			{#if graph.graph}
				<CytoscapeGraph
					elements={graph.output.elements}
					{stylesheet}
					initialLayout={null}
					{initialViewport}
					readOnly={graph.locked}
					preserveClasses={['eh-added']}
					onReady={(cy) => {
						graph.cy = cy;
						cy?.autolock(graph.locked);
					}}
					{onElementsApplied}
					{onTapNode}
					{onTapEdge}
					{onTapCanvas}
					onDblTapNode={(e) => {
						const id = e.target.id();
						if (isFanId(id)) {
							const fan = graph.output.fanouts.get(id);
							if (fan) graph.toggleFanout(fan.asset);
						} else actions.expand(id);
					}}
					onDblTapEdge={(e) => {
						const id = e.target.id();
						if (isBundleId(id)) graph.toggleBundle(id);
					}}
					onCxtTapCanvas={canvasMenu}
					{onCxtTapNode}
					{onCxtTapEdge}
					onBoxSelect={onSelectionChange}
					{onSelectionChange}
					onDragFree={(p) => graph.recordPositions(p)}
					onViewportChange={() => graph.markDirty()}
				>
					<ConnectHandle
						cy={graph.cy}
						enabled={canEdit && !graph.layoutRunning}
						canStart={linkableId}
						canConnect={(s, t) => linkableId(s) && linkableId(t)}
						onConnect={(s, t) => actions.connect(s, t)}
					/>
				</CytoscapeGraph>
			{/if}

			{#each overlays as o (o.id)}
				<o.component {graph} />
			{/each}

			{#if graph.loading && !graph.graph}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
					role="status"
				>
					<LoaderCircleIcon class="h-6 w-6 animate-spin" />
					Loading the investigation graph…
				</div>
			{:else if graph.error && !graph.graph}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
					role="alert"
				>
					<TriangleAlertIcon class="h-8 w-8 text-destructive" />
					<div class="text-sm font-medium">The graph could not be loaded.</div>
					<div class="max-w-md text-xs text-muted-foreground">{graph.error}</div>
					<Button size="sm" variant="outline" onclick={() => graph.load()}>Retry</Button>
				</div>
			{:else if isEmpty}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
				>
					<SplineIcon class="h-8 w-8 text-muted-foreground" />
					<div class="text-sm font-medium">Nothing to draw yet</div>
					<div class="max-w-md text-xs text-muted-foreground">
						The graph shows the assets and IOCs of the case, the relations between them and those
						derived from the timeline.{canEdit
							? ' Start by placing an object or pasting indicators.'
							: ''}
					</div>
					{#if canEdit}
						<div class="flex flex-wrap justify-center gap-2">
							<Button size="sm" variant="outline" onclick={() => actions.createObject('asset')}>
								<PlusIcon class="mr-1 h-3.5 w-3.5" />New asset
							</Button>
							<Button size="sm" variant="outline" onclick={() => actions.createObject('ioc')}>
								<PlusIcon class="mr-1 h-3.5 w-3.5" />New IOC
							</Button>
							<Button size="sm" variant="outline" onclick={() => actions.createFreeNode()}>
								<CircleDotIcon class="mr-1 h-3.5 w-3.5" />Free node
							</Button>
							<Button size="sm" variant="outline" onclick={() => actions.paste()}>
								<ClipboardPasteIcon class="mr-1 h-3.5 w-3.5" />Paste indicators
							</Button>
						</div>
					{/if}
				</div>
			{:else if allHidden}
				<div
					class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
				>
					<div class="text-sm text-muted-foreground">
						{graph.focus
							? 'Nothing around the focused node.'
							: 'Every object is hidden or filtered out.'}
					</div>
					<div class="pointer-events-auto flex gap-2">
						{#if graph.hidden.size}
							<Button size="xs" variant="outline" onclick={() => graph.unhideAll()}>
								Show the {graph.hidden.size} hidden
							</Button>
						{/if}
						{#if graph.offCanvas.length}
							<Button size="xs" variant="outline" onclick={() => (showPalette = true)}>
								Open the palette
							</Button>
						{/if}
						{#if graph.focus}
							<Button size="xs" variant="outline" onclick={() => graph.setFocus(null)}
								>Exit focus</Button
							>
						{/if}
						<Button size="xs" variant="ghost" onclick={() => graph.resetView()}
							>Reset the view</Button
						>
					</div>
				</div>
			{/if}

			<!-- Status chips, top-left. -->
			<div class="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
				{#if focusNode && graph.focus}
					<div
						class="pointer-events-auto flex items-center gap-2 rounded-md border bg-background/90 px-2 py-1 text-xs shadow-sm backdrop-blur"
					>
						<CrosshairIcon class="h-3.5 w-3.5 text-primary" />
						<span class="max-w-40 truncate">Focus: {focusNode.label}</span>
						<label class="flex items-center gap-1 text-muted-foreground">
							<input
								type="range"
								min="1"
								max="6"
								value={graph.focus.hops}
								class="w-20 accent-primary"
								aria-label="Hops around the focused node"
								oninput={(e) =>
									graph.setFocus(graph.focus?.key ?? null, Number(e.currentTarget.value))}
							/>
							{graph.focus.hops} hop{graph.focus.hops > 1 ? 's' : ''}
						</label>
						<button
							type="button"
							class="rounded p-0.5 hover:bg-accent"
							aria-label="Exit focus"
							onclick={() => graph.setFocus(null)}
						>
							<XIcon class="h-3 w-3" />
						</button>
					</div>
				{/if}
				{#if graph.highlight && graph.path.result}
					<div
						class="pointer-events-auto flex items-center gap-2 rounded-md border bg-background/90 px-2 py-1 text-xs shadow-sm backdrop-blur"
					>
						<RouteIcon class="h-3.5 w-3.5 text-primary" />
						Path {graph.path.active + 1} of {graph.path.result.paths.length}
						<button
							type="button"
							class="rounded p-0.5 hover:bg-accent"
							aria-label="Clear the path"
							onclick={() => graph.clearPath()}
						>
							<XIcon class="h-3 w-3" />
						</button>
					</div>
				{/if}
			</div>

			<!-- Counters, bottom-left; legend above them. -->
			{#if graph.graph}
				<div class="absolute bottom-2 left-2 flex flex-col items-start gap-2">
					{#if showLegend}
						<GraphLegend {graph} onClose={() => (showLegend = false)} />
					{/if}
					<div
						class="flex items-center gap-2 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
					>
						<span class="tabular-nums">{visibleCount} objects · {edgeCount} relations</span>
						{#if graph.hidden.size}
							<button
								type="button"
								class="underline-offset-2 hover:underline"
								onclick={() => graph.unhideAll()}
							>
								{graph.hidden.size} hidden
							</button>
						{/if}
						{#if graph.locked}
							<LockIcon class="h-3 w-3" aria-label="Layout locked" />
						{/if}
						{#if graph.refreshing || graph.layoutRunning}
							<LoaderCircleIcon class="h-3 w-3 animate-spin" aria-label="Working" />
						{/if}
					</div>
				</div>
			{/if}

			{#if graph.showMinimap && graph.cy && visibleCount > 0}
				<div
					class="absolute bottom-2 right-2 overflow-hidden rounded-md border bg-background/90 shadow-sm"
				>
					<CytoscapeMinimap cy={graph.cy} />
				</div>
			{/if}
		</div>

		{#if graph.rail}
			<GraphRail {graph} {refs} {canEdit} {actions} />
		{/if}
	</div>
</div>

{#if menu}
	<FloatingMenu
		x={menu.x}
		y={menu.y}
		title={menu.title}
		items={menu.items}
		onClose={() => (menu = null)}
	/>
{/if}

<ObjectPickerDialog
	bind:open={pickerOpen}
	{caseId}
	title={picker.type === 'connect'
		? `Connect “${nodeLabel(picker.source)}” to…`
		: 'Add to the graph'}
	description={picker.type === 'connect'
		? 'Pick the other end of the relation, or create it.'
		: 'Place an existing asset or IOC on the canvas, or create one.'}
	nodes={pickerNodes}
	{refs}
	onCanvas={graph.visibility.nodes}
	allowCreate={canEdit}
	initialTab={picker.type === 'add' ? picker.tab : 'existing'}
	confirmLabel={picker.type === 'connect' ? 'Choose' : 'Add'}
	onPick={(key, created) => actions.run(() => onPicked(key, created))}
/>

<NewRelationDialog
	bind:open={relationOpen}
	relationTypes={graph.relationTypes}
	sourceLabel={nodeLabel(relationPair?.source)}
	targetLabel={nodeLabel(relationPair?.target)}
	onSubmit={onRelation}
/>

<FreeNodeDialog
	bind:open={freeNodeOpen}
	node={freeNodeEdit}
	onSubmit={async (body) => {
		if (freeNodeEdit) {
			await graph.updateFreeNode(freeNodeEdit, body);
			toast({ title: 'Node updated', variant: 'success' });
		} else {
			const n = await graph.createFreeNode(body, freeNodeAt);
			graph.rail = { type: 'node', key: n.key };
			toast({ title: 'Node created', variant: 'success' });
		}
	}}
/>

<PromoteDialog
	bind:open={promoteOpen}
	node={promoteNode}
	{refs}
	onSubmit={async (body) => {
		if (!promoteNode) return;
		const res = await graph.promoteFreeNode(promoteNode, body);
		toast({
			title: `Promoted to ${body.kind === 'asset' ? 'an asset' : 'an IOC'}`,
			description: res.node?.label,
			variant: 'success'
		});
	}}
/>

<PasteDialog
	bind:open={pasteOpen}
	{refs}
	nodes={graph.nodes.filter(isLinkable)}
	relationTypes={graph.relationTypes}
	linkTo={pasteLinkTo}
	onSubmit={(body) => graph.paste(body, pasteAt ?? viewCentre())}
/>

<BulkActionDialog
	bind:open={bulkOpen}
	action={bulkAction}
	nodes={bulkNodes}
	{graph}
	{refs}
	onDone={(message) => toast({ title: message, variant: 'success' })}
/>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmation.title}
	message={confirmation.message}
	confirmText={confirmation.confirmText}
	onConfirm={() => {
		confirmOpen = false;
		confirmation.onConfirm();
	}}
/>
