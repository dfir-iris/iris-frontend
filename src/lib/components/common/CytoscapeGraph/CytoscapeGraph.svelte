<!--
  Generic Cytoscape.js canvas.

  - `elements` is declarative and diffed by id: adding / removing / updating
    data or classes never rebuilds the graph, positions are preserved.
  - Resizing the container calls `cy.resize()` only — never `fit()`.
  - The themed default stylesheet follows the app's dark mode; `stylesheet`
    is appended after it.
  - Cytoscape is imported on mount only (SSR-safe).
  - `onReady(cy)` hands out the instance for imperative work (layouts,
    export, viewport). It is called with `null` on destroy.
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { mode } from 'mode-watcher';
	import type { Core, EventObject, NodeSingular, EdgeSingular, Position } from 'cytoscape';
	import { loadCytoscape } from './loader';
	import { applyDiff, diffElements, snapshotOf, type CySnapshot } from './diff';
	import { cyTheme, defaultStylesheet } from './stylesheet';
	import { runLayout, type CyLayoutName } from './layouts';
	import type {
		CyElementDef,
		CyPointerEvent,
		CyStylesheet,
		CytoscapeGraphHandlers,
		CyViewport
	} from './types';

	type Props = CytoscapeGraphHandlers & {
		elements: CyElementDef[];
		stylesheet?: CyStylesheet;
		/** Force a theme; follows the app (mode-watcher) by default. */
		theme?: 'auto' | 'light' | 'dark';
		/** Run once on first render when no node came with a position. */
		initialLayout?: CyLayoutName | null;
		/** Restore a viewport on first render (wins over the initial fit). */
		initialViewport?: CyViewport | null;
		minZoom?: number;
		maxZoom?: number;
		wheelSensitivity?: number;
		boxSelectionEnabled?: boolean;
		/** Nodes cannot be dragged. */
		readOnly?: boolean;
		/** Classes the component itself toggles and diffing must keep. */
		preserveClasses?: string[];
		class?: string;
		onReady?: (cy: Core | null) => void;
		/** Fired after each diff with the ids of nodes that got an automatic position. */
		onElementsApplied?: (autoPlaced: string[]) => void;
		children?: Snippet;
	};

	let {
		elements,
		stylesheet = [],
		theme = 'auto',
		initialLayout = 'fcose',
		initialViewport = null,
		minZoom = 0.05,
		maxZoom = 4,
		wheelSensitivity = 0.3,
		boxSelectionEnabled = true,
		readOnly = false,
		preserveClasses = [],
		class: className = '',
		onReady,
		onElementsApplied,
		children,
		...handlers
	}: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let cy = $state<Core | null>(null);
	let snapshot = new Map<string, CySnapshot>();
	let firstRender = true;

	const isDark = $derived(theme === 'auto' ? $mode === 'dark' : theme === 'dark');

	const TRANSIENT = ['hover', 'eh-source', 'eh-target', 'eh-hover', 'eh-presumptive-target'];

	const clientPosition = (rendered: Position): Position => {
		const rect = container?.getBoundingClientRect();
		return { x: (rect?.left ?? 0) + rendered.x, y: (rect?.top ?? 0) + rendered.y };
	};

	const pointer = <T,>(evt: EventObject, target: T): CyPointerEvent<T> => {
		const rendered = evt.renderedPosition ?? { x: 0, y: 0 };
		const original = evt.originalEvent as MouseEvent | TouchEvent | undefined;
		const client =
			original && 'clientX' in original
				? { x: original.clientX, y: original.clientY }
				: clientPosition(rendered);
		return {
			target,
			position: evt.position ?? { x: 0, y: 0 },
			renderedPosition: rendered,
			clientPosition: client,
			originalEvent: original
		};
	};

	const sync = (instance: Core, defs: CyElementDef[]) => {
		const diff = diffElements(snapshot, defs);
		const autoPlaced =
			diff.add.length || diff.remove.length || diff.update.length
				? applyDiff(instance, diff, [...TRANSIENT, ...preserveClasses])
				: [];
		const next = new Map<string, CySnapshot>();
		for (const def of defs) {
			if (!next.has(def.data.id) && instance.getElementById(def.data.id).nonempty()) {
				next.set(def.data.id, snapshotOf(def));
			}
		}
		snapshot = next;
		return { autoPlaced, added: diff.add.length };
	};

	onMount(() => {
		let destroyed = false;
		let instance: Core | null = null;
		let observer: ResizeObserver | null = null;
		let viewportTimer: ReturnType<typeof setTimeout> | undefined;
		let selectionQueued = false;

		loadCytoscape().then((cytoscape) => {
			if (destroyed || !container) return;
			instance = cytoscape({
				container,
				elements: [],
				style: [...defaultStylesheet(cyTheme(isDark)), ...stylesheet],
				minZoom,
				maxZoom,
				wheelSensitivity,
				boxSelectionEnabled,
				selectionType: 'additive',
				autoungrabify: readOnly
			});
			const c = instance;

			c.on('tap', (evt) => {
				if (evt.target === c) handlers.onTapCanvas?.(pointer(evt, c));
				else if (evt.target.isNode?.()) handlers.onTapNode?.(pointer(evt, evt.target));
				else if (evt.target.isEdge?.()) handlers.onTapEdge?.(pointer(evt, evt.target));
			});
			c.on('dbltap', (evt) => {
				if (evt.target === c) return;
				if (evt.target.isNode?.()) handlers.onDblTapNode?.(pointer(evt, evt.target));
				else if (evt.target.isEdge?.()) handlers.onDblTapEdge?.(pointer(evt, evt.target));
			});
			c.on('cxttap', (evt) => {
				if (evt.target === c) handlers.onCxtTapCanvas?.(pointer(evt, c));
				else if (evt.target.isNode?.()) handlers.onCxtTapNode?.(pointer(evt, evt.target));
				else if (evt.target.isEdge?.()) handlers.onCxtTapEdge?.(pointer(evt, evt.target));
			});
			c.on('mouseover', 'node', (evt) => {
				const n = evt.target as NodeSingular;
				n.addClass('hover');
				handlers.onHoverNode?.(n, pointer(evt, n));
			});
			c.on('mouseout', 'node', (evt) => {
				(evt.target as NodeSingular).removeClass('hover');
				handlers.onHoverNode?.(null);
			});
			c.on('mouseover', 'edge', (evt) => {
				const e = evt.target as EdgeSingular;
				e.addClass('hover');
				handlers.onHoverEdge?.(e, pointer(evt, e));
			});
			c.on('mouseout', 'edge', (evt) => {
				(evt.target as EdgeSingular).removeClass('hover');
				handlers.onHoverEdge?.(null);
			});
			c.on('boxend', () => {
				setTimeout(() => handlers.onBoxSelect?.(c.$(':selected').map((e) => e.id())), 0);
			});
			c.on('select unselect', () => {
				if (selectionQueued) return;
				selectionQueued = true;
				queueMicrotask(() => {
					selectionQueued = false;
					if (!destroyed) handlers.onSelectionChange?.(c.$(':selected').map((e) => e.id()));
				});
			});
			c.on('dragfree', 'node', (evt) => {
				const moved: Record<string, Position> = {};
				// A drag moves the grabbed node plus every selected node with it.
				const nodes = (evt.target as NodeSingular).selected()
					? c.nodes(':selected')
					: (evt.target as NodeSingular);
				nodes.forEach((n: NodeSingular) => {
					moved[n.id()] = { ...n.position() };
				});
				handlers.onDragFree?.(moved);
			});
			c.on('viewport', () => {
				clearTimeout(viewportTimer);
				viewportTimer = setTimeout(
					() => handlers.onViewportChange?.({ zoom: c.zoom(), pan: { ...c.pan() } }),
					250
				);
			});

			const { autoPlaced } = sync(c, elements);
			const nodeCount = c.nodes().length;
			if (initialViewport) {
				c.viewport({ zoom: initialViewport.zoom, pan: initialViewport.pan });
			} else if (nodeCount && initialLayout && autoPlaced.length === nodeCount) {
				void runLayout(c, initialLayout, { animate: false });
			} else if (nodeCount) {
				c.fit(undefined, 40);
			}
			firstRender = nodeCount === 0;

			observer = new ResizeObserver(() => c.resize());
			observer.observe(container);

			cy = c;
			onReady?.(c);
			onElementsApplied?.(autoPlaced);
		});

		return () => {
			destroyed = true;
			clearTimeout(viewportTimer);
			observer?.disconnect();
			instance?.destroy();
			cy = null;
			snapshot = new Map();
			onReady?.(null);
		};
	});

	// Incremental element diffing.
	$effect(() => {
		const defs = elements;
		if (!cy) return;
		const c = cy;
		const { autoPlaced, added } = sync(c, defs);
		if (firstRender && c.nodes().length) {
			// The graph arrived after mount: lay it out / frame it once.
			firstRender = false;
			if (initialViewport) c.viewport({ zoom: initialViewport.zoom, pan: initialViewport.pan });
			else if (initialLayout && autoPlaced.length === c.nodes().length) {
				void runLayout(c, initialLayout, { animate: false });
			} else c.fit(undefined, 40);
		}
		if (added || autoPlaced.length) onElementsApplied?.(autoPlaced);
	});

	// Theme / stylesheet changes restyle in place.
	$effect(() => {
		const style = [...defaultStylesheet(cyTheme(isDark)), ...stylesheet];
		if (!cy) return;
		cy.style(style);
	});

	$effect(() => {
		cy?.autoungrabify(readOnly);
	});

	$effect(() => {
		cy?.boxSelectionEnabled(boxSelectionEnabled);
	});
</script>

<div class="relative h-full w-full {className}">
	<div
		bind:this={container}
		class="absolute inset-0"
		role="application"
		aria-label="Graph canvas"
		oncontextmenu={(e) => e.preventDefault()}
	></div>
	{@render children?.()}
</div>
