import type { Position } from 'cytoscape';
import type { GraphEdge, GraphNodeKey } from '$lib/types/resources/case-graph';
import type { BulkAction } from '../components/BulkActionDialog.svelte';

/**
 * Page-level actions that need a dialog, a confirmation or a toast. The rail,
 * the menus and the toolbar call these instead of talking to the dialogs.
 */
export interface GraphActions {
	/** Run an operation, toasting its error (and `success` when given). */
	run: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
	/** Pick the other end, then the relation. */
	connectFrom: (key: GraphNodeKey) => void;
	/** Relation picker between two known nodes (drag-to-connect). */
	connect: (source: GraphNodeKey, target: GraphNodeKey) => void;
	addExisting: (at?: Position | null) => void;
	createObject: (kind: 'asset' | 'ioc', at?: Position | null) => void;
	createFreeNode: (at?: Position | null) => void;
	editFreeNode: (key: GraphNodeKey) => void;
	promote: (key: GraphNodeKey) => void;
	deleteFreeNode: (key: GraphNodeKey) => void;
	paste: (opts?: { linkTo?: GraphNodeKey | null; at?: Position | null }) => void;
	deleteEdges: (edges: GraphEdge[]) => void;
	bulk: (action: BulkAction, keys: GraphNodeKey[]) => void;
	expand: (key: GraphNodeKey) => void;
	collapse: (key: GraphNodeKey) => void;
	/** Open the path finder with `key` as source (or target when a source is set). */
	pathFrom: (key: GraphNodeKey) => void;
}
