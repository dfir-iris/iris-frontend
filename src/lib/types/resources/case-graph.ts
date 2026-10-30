/**
 * Investigation graph — types of the REST contract
 * (`docs/investigation-graph.md` in iris-web, §4).
 *
 * Every node is addressed by a string key `"<kind>:<id>"` (`asset:12`,
 * `ioc:5`, `node:3`, `case:42`). War-room graphs prefix it with the case:
 * `c<case_id>/asset:12`.
 */

export type GraphNodeKind =
	| 'asset'
	| 'ioc'
	| 'event'
	| 'evidence'
	| 'task'
	| 'note'
	| 'alert'
	| 'node'
	| 'case';

/** Kinds a stored edge may reference (every kind but `case`). */
export type GraphEdgeEndpointKind = Exclude<GraphNodeKind, 'case'>;

export type GraphNodeKey = string;

export const GRAPH_INCLUDES = [
	'events',
	'evidences',
	'tasks',
	'notes',
	'alerts',
	'cross_case',
	'suggestions'
] as const;

export type GraphInclude = (typeof GRAPH_INCLUDES)[number];

export type GraphReviewStateFilter = 'accepted' | 'all';

export type GraphLineStyle = 'solid' | 'dashed' | 'dotted';

export type GraphFlagKind = 'status' | 'done' | 'exception';

export interface GraphNodeFlag {
	id: number;
	name: string;
	color: string;
	kind: GraphFlagKind | string;
}

export interface GraphNodeEnrichment {
	score?: number | null;
	[key: string]: unknown;
}

export interface GraphNode {
	key: GraphNodeKey;
	kind: GraphNodeKind;
	id: number;
	label: string;
	/** Asset IP, IOC type, event date… */
	subtitle?: string | null;
	/** Asset type / IOC type name / free node_type. */
	type?: string | null;
	/** Asset type icon URL (compromised variant when compromised), or a lucide icon name for free nodes. */
	icon?: string | null;
	/** Assets only, null otherwise. */
	compromised?: boolean | null;
	/** Assets only. */
	analysis_status?: string | null;
	flags?: GraphNodeFlag[] | null;
	tags?: string[] | null;
	tlp?: string | null;
	/** From the linked managed asset, null otherwise. */
	criticality?: string | null;
	description?: string | null;
	first_seen?: string | null;
	last_seen?: string | null;
	event_count?: number | null;
	/** Other cases where the same IOC value / managed asset appears. */
	cross_case_count?: number | null;
	enrichment?: GraphNodeEnrichment | null;
	/** Frontend route, null for free nodes. */
	url?: string | null;
	/** Free nodes: palette colour name. */
	color?: string | null;
	/** War-room graph: case the node belongs to. */
	case_id?: number | null;
	/** War-room graph: false for cases the caller cannot read. */
	accessible?: boolean | null;
	custom_attributes?: Record<string, unknown> | null;
}

export interface GraphRelationRef {
	id: number | null;
	name: string;
	label: string;
	color: string;
	line_style: GraphLineStyle;
}

export type GraphStoredEdgeOrigin = 'manual' | 'ai' | 'module' | 'import' | 'suggestion';
export type GraphDerivedEdgeOrigin = 'event' | 'ioc_asset_link' | 'parent_event';
export type GraphEdgeOrigin = GraphStoredEdgeOrigin | GraphDerivedEdgeOrigin;

export type GraphReviewState = 'accepted' | 'pending' | 'rejected';

export interface GraphEdge {
	/** Stored: `e:<edge_id>`; derived: `d:<hash>`. */
	key: string;
	/** Stored edge id, null when derived. */
	id: number | null;
	source: GraphNodeKey;
	target: GraphNodeKey;
	relation: GraphRelationRef;
	directed: boolean;
	label: string | null;
	description: string | null;
	confidence: number | null;
	tlp: string | null;
	origin: GraphEdgeOrigin;
	review_state: GraphReviewState;
	first_seen: string | null;
	last_seen: string | null;
	event_ids: number[];
	/** Number of supporting events (min 1). */
	count: number;
	/** False for derived edges. */
	editable: boolean;
	custom_attributes?: Record<string, unknown> | null;
}

export interface GraphEvent {
	event_id: number;
	title: string;
	date: string | null;
	category: string | null;
	color: string | null;
	keys: GraphNodeKey[];
}

/** Row of `case_graph_relation_type` (§3.1). */
export interface GraphRelationType {
	id: number;
	name: string;
	label: string;
	description: string | null;
	directed: boolean;
	color: string;
	line_style: GraphLineStyle;
	stix_relationship: string | null;
	is_system: boolean;
	sort_order: number;
	created_at?: string | null;
}

export type GraphSuggestionKind =
	| 'text_mention'
	| 'ip_match'
	| 'alert_link'
	| 'enrichment_resolution'
	| string;

export interface GraphSuggestion {
	key: string;
	kind: GraphSuggestionKind;
	source: GraphNodeKey;
	target: GraphNodeKey;
	/** Relation name. */
	relation: string;
	directed: boolean;
	reason: string;
	event_ids: number[];
	score: number;
}

export interface GraphMeta {
	node_count: number;
	edge_count: number;
	generated_at: string;
	/** Set when the graph exceeds IRIS_CASE_GRAPH_MAX_NODES. */
	warning?: string | null;
}

/** `GET /graph` (§4.1). */
export interface CaseGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
	events: GraphEvent[];
	relation_types: GraphRelationType[];
	suggestions?: GraphSuggestion[];
	meta: GraphMeta;
}

export interface CaseGraphQuery {
	include?: GraphInclude[];
	review_state?: GraphReviewStateFilter;
}

/** `GET /graph/neighbours` (§4.2). */
export interface GraphSubset {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface GraphPathsQuery {
	source: GraphNodeKey;
	target: GraphNodeKey;
	directed?: boolean;
	max_paths?: number;
	max_length?: number;
}

export interface GraphPath {
	node_keys: GraphNodeKey[];
	edge_keys: string[];
}

export interface GraphPathsResult {
	paths: GraphPath[];
	shortest_length: number | null;
}

/** `POST /graph/edges` (§4.3). Use `relation_type_id` or `relation` (name). */
export interface CreateGraphEdgeBody {
	source: GraphNodeKey;
	target: GraphNodeKey;
	relation_type_id?: number;
	relation?: string;
	directed?: boolean;
	label?: string | null;
	description?: string | null;
	confidence?: number | null;
	first_seen?: string | null;
	last_seen?: string | null;
	tlp_id?: number | null;
	event_ids?: number[];
	custom_attributes?: Record<string, unknown> | null;
}

export type UpdateGraphEdgeBody = Partial<Omit<CreateGraphEdgeBody, 'source' | 'target'>> & {
	review_state?: GraphReviewState;
};

export type GraphReviewDecision = 'accept' | 'reject';

export const FREE_NODE_TYPES = [
	'actor',
	'account',
	'infrastructure',
	'malware',
	'note',
	'group',
	'other'
] as const;

export type FreeNodeType = (typeof FREE_NODE_TYPES)[number];

/** `POST /graph/nodes` (§4.4). */
export interface CreateFreeNodeBody {
	label: string;
	node_type?: FreeNodeType;
	description?: string | null;
	icon?: string | null;
	color?: string | null;
	tlp_id?: number | null;
	custom_attributes?: Record<string, unknown> | null;
}

export type UpdateFreeNodeBody = Partial<CreateFreeNodeBody>;

/** `POST /graph/nodes/<id>/promote` — kind plus the creation fields of that object. */
export type PromoteFreeNodeBody =
	| ({ kind: 'asset' } & Record<string, unknown>)
	| ({ kind: 'ioc' } & Record<string, unknown>);

export interface PromoteFreeNodeResult {
	key: GraphNodeKey;
	node: GraphNode;
}

/** `POST /graph/paste` (§4.5). */
export interface GraphPasteBody {
	text: string;
	ioc_tlp_id?: number;
	link_to?: GraphNodeKey;
	/** Relation name. */
	relation?: string;
}

export interface GraphPasteResult {
	created: GraphNodeKey[];
	existing: GraphNodeKey[];
	edges: GraphEdge[];
	ignored: string[];
}

/** Opaque to the backend; this is the frontend shape (§4.6). */
export interface GraphViewState {
	layout: string | null;
	positions: Record<GraphNodeKey, { x: number; y: number }>;
	pinned: GraphNodeKey[];
	hidden: GraphNodeKey[];
	collapsed: GraphNodeKey[];
	filters: Record<string, unknown>;
	viewport: { zoom: number; pan: { x: number; y: number } } | null;
	time: { from: string | null; to: string | null } | null;
	include: GraphInclude[];
	/** Client-only: assets/IOCs explicitly put on the canvas. */
	extra_nodes?: GraphNodeKey[];
	[key: string]: unknown;
}

export interface GraphViewSummary {
	view_id: number;
	view_uuid?: string;
	case_id: number;
	name: string;
	description: string | null;
	owner_id: number;
	is_shared: boolean;
	is_report_default: boolean;
	state: GraphViewState;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface GraphView extends GraphViewSummary {
	/** PNG data URL. */
	snapshot?: string | null;
}

export interface CreateGraphViewBody {
	name: string;
	description?: string | null;
	is_shared?: boolean;
	is_report_default?: boolean;
	state: GraphViewState;
	snapshot?: string | null;
}

export type UpdateGraphViewBody = Partial<CreateGraphViewBody>;

/** §4.7 */
export type GraphExportFormat = 'json' | 'stix' | 'graphml';
export type GraphImportFormat = 'json' | 'stix';

export interface GraphImportBody {
	format: GraphImportFormat;
	content: unknown;
}

export interface GraphImportResult {
	nodes_created: number;
	edges_created: number;
	skipped: number | unknown[];
}

/** §4.8 */
export interface GraphSuggestionKeysBody {
	keys: string[];
}

export interface GraphAiSuggestionsResult {
	edges: GraphEdge[];
}

export type GraphGapCode =
	| 'initial_access_unknown'
	| 'isolated_ioc'
	| 'unsupported_edge'
	| 'compromised_without_event'
	| 'unanalysed_compromised';

export interface GraphGap {
	code: GraphGapCode | string;
	severity: 'info' | 'low' | 'medium' | 'high' | string;
	node_keys: GraphNodeKey[];
	edge_keys: string[];
	message: string;
}

export interface GraphExplainBody {
	view_id?: number;
	node_keys?: GraphNodeKey[];
}

export interface GraphExplainResult {
	markdown: string;
}

/** §4.9 — `/api/v2/manage/graph-relation-types`. */
export interface GraphRelationTypeInput {
	name?: string;
	label?: string;
	description?: string | null;
	directed?: boolean;
	color?: string;
	line_style?: GraphLineStyle;
	stix_relationship?: string | null;
	sort_order?: number;
}

/** §4.10 — `GET /api/v2/war-rooms/<id>/graph`. Same shape, keys prefixed with `c<case_id>/`. */
export type WarRoomGraph = CaseGraph;
