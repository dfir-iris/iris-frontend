import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type {
	CaseGraph,
	CaseGraphQuery,
	CreateFreeNodeBody,
	CreateGraphEdgeBody,
	CreateGraphViewBody,
	GraphAcceptSuggestionsResult,
	GraphAiSuggestionsResult,
	GraphDismissSuggestionsResult,
	GraphEdge,
	GraphExplainBody,
	GraphExplainResult,
	GraphExportFormat,
	GraphExportResult,
	GraphGap,
	GraphImportBody,
	GraphImportResult,
	GraphInclude,
	GraphNode,
	GraphNodeKey,
	GraphPasteBody,
	GraphPasteResult,
	GraphPathsQuery,
	GraphPathsResult,
	GraphRelationType,
	GraphRelationTypeInput,
	GraphReviewDecision,
	GraphSubset,
	GraphSuggestion,
	GraphView,
	GraphViewSummary,
	PromoteFreeNodeBody,
	PromoteFreeNodeResult,
	UpdateFreeNodeBody,
	UpdateGraphEdgeBody,
	UpdateGraphViewBody,
	WarRoomGraph
} from '$lib/types/resources/case-graph';

const graphPath = (caseId: number) => `/api/v2/cases/${caseId}/graph`;

const RELATION_TYPES_PATH = '/api/v2/manage/graph-relation-types';

/** `include` and other comma lists travel as a single `a,b,c` parameter. */
const toGraphQuery = (query: CaseGraphQuery = {}): Record<string, unknown> => ({
	include: query.include?.length ? query.include.join(',') : undefined,
	review_state: query.review_state
});

/**
 * Investigation graph of a case — one function per route of the contract
 * (`docs/investigation-graph.md` §4).
 */
export class CaseGraphService {
	// §4.1
	static get(
		caseId: number,
		query: CaseGraphQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseGraph>> {
		return ApiService.get<CaseGraph>(
			ApiService.withQuery(graphPath(caseId), toGraphQuery(query)),
			options
		);
	}

	// §4.2
	static neighbours(
		caseId: number,
		node: GraphNodeKey,
		hops = 1,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphSubset>> {
		return ApiService.get<GraphSubset>(
			ApiService.withQuery(`${graphPath(caseId)}/neighbours`, { node, hops }),
			options
		);
	}

	static paths(
		caseId: number,
		query: GraphPathsQuery,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphPathsResult>> {
		return ApiService.get<GraphPathsResult>(
			ApiService.withQuery(`${graphPath(caseId)}/paths`, { ...query }),
			options
		);
	}

	// §4.3
	static createEdge(
		caseId: number,
		body: CreateGraphEdgeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphEdge>> {
		return ApiService.post<GraphEdge>(`${graphPath(caseId)}/edges`, body, options);
	}

	static updateEdge(
		caseId: number,
		edgeId: number,
		body: UpdateGraphEdgeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphEdge>> {
		return ApiService.put<GraphEdge>(`${graphPath(caseId)}/edges/${edgeId}`, body, options);
	}

	static deleteEdge(
		caseId: number,
		edgeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${graphPath(caseId)}/edges/${edgeId}`, options);
	}

	static reviewEdge(
		caseId: number,
		edgeId: number,
		decision: GraphReviewDecision,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphEdge>> {
		return ApiService.post<GraphEdge>(
			`${graphPath(caseId)}/edges/${edgeId}/review`,
			{ decision },
			options
		);
	}

	static reverseEdge(
		caseId: number,
		edgeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphEdge>> {
		return ApiService.post<GraphEdge>(
			`${graphPath(caseId)}/edges/${edgeId}/reverse`,
			undefined,
			options
		);
	}

	// §4.4
	static createNode(
		caseId: number,
		body: CreateFreeNodeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphNode>> {
		return ApiService.post<GraphNode>(`${graphPath(caseId)}/nodes`, body, options);
	}

	static getNode(
		caseId: number,
		nodeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphNode>> {
		return ApiService.get<GraphNode>(`${graphPath(caseId)}/nodes/${nodeId}`, options);
	}

	static updateNode(
		caseId: number,
		nodeId: number,
		body: UpdateFreeNodeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphNode>> {
		return ApiService.put<GraphNode>(`${graphPath(caseId)}/nodes/${nodeId}`, body, options);
	}

	static deleteNode(
		caseId: number,
		nodeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${graphPath(caseId)}/nodes/${nodeId}`, options);
	}

	static promoteNode(
		caseId: number,
		nodeId: number,
		body: PromoteFreeNodeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<PromoteFreeNodeResult>> {
		return ApiService.post<PromoteFreeNodeResult>(
			`${graphPath(caseId)}/nodes/${nodeId}/promote`,
			body,
			options
		);
	}

	// §4.5
	static paste(
		caseId: number,
		body: GraphPasteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphPasteResult>> {
		return ApiService.post<GraphPasteResult>(`${graphPath(caseId)}/paste`, body, options);
	}

	// §4.6
	static listViews(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphViewSummary[]>> {
		return ApiService.get<GraphViewSummary[]>(`${graphPath(caseId)}/views`, options);
	}

	static createView(
		caseId: number,
		body: CreateGraphViewBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphView>> {
		return ApiService.post<GraphView>(`${graphPath(caseId)}/views`, body, options);
	}

	static getView(
		caseId: number,
		viewId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphView>> {
		return ApiService.get<GraphView>(`${graphPath(caseId)}/views/${viewId}`, options);
	}

	static updateView(
		caseId: number,
		viewId: number,
		body: UpdateGraphViewBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphView>> {
		return ApiService.put<GraphView>(`${graphPath(caseId)}/views/${viewId}`, body, options);
	}

	static deleteView(
		caseId: number,
		viewId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${graphPath(caseId)}/views/${viewId}`, options);
	}

	// §4.7 / §9 — envelope `{format, filename, content}`; `content` is an
	// object for json / stix and an XML string for graphml.
	static exportGraph(
		caseId: number,
		format: GraphExportFormat = 'json',
		options: ApiOptions = {},
		include: GraphInclude[] = []
	): Promise<RequestResponse<GraphExportResult>> {
		return ApiService.get<GraphExportResult>(
			ApiService.withQuery(`${graphPath(caseId)}/export`, {
				format,
				include: include.length ? include.join(',') : undefined
			}),
			options
		);
	}

	static importGraph(
		caseId: number,
		body: GraphImportBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphImportResult>> {
		return ApiService.post<GraphImportResult>(`${graphPath(caseId)}/import`, body, options);
	}

	// §4.8
	static listSuggestions(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphSuggestion[]>> {
		return ApiService.get<GraphSuggestion[]>(`${graphPath(caseId)}/suggestions`, options);
	}

	static acceptSuggestions(
		caseId: number,
		keys: string[],
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphAcceptSuggestionsResult>> {
		return ApiService.post<GraphAcceptSuggestionsResult>(
			`${graphPath(caseId)}/suggestions/accept`,
			{ keys },
			options
		);
	}

	static dismissSuggestions(
		caseId: number,
		keys: string[],
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphDismissSuggestionsResult>> {
		return ApiService.post<GraphDismissSuggestionsResult>(
			`${graphPath(caseId)}/suggestions/dismiss`,
			{ keys },
			options
		);
	}

	/** 409 when no LLM is configured. */
	static aiSuggestions(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphAiSuggestionsResult>> {
		return ApiService.post<GraphAiSuggestionsResult>(
			`${graphPath(caseId)}/suggestions/ai`,
			undefined,
			options
		);
	}

	static gaps(caseId: number, options: ApiOptions = {}): Promise<RequestResponse<GraphGap[]>> {
		return ApiService.get<GraphGap[]>(`${graphPath(caseId)}/gaps`, options);
	}

	/** 409 when no LLM is configured. */
	static explain(
		caseId: number,
		body: GraphExplainBody = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphExplainResult>> {
		return ApiService.post<GraphExplainResult>(`${graphPath(caseId)}/explain`, body, options);
	}

	// §4.9 — relation type catalogue
	static listRelationTypes(
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphRelationType[]>> {
		return ApiService.get<GraphRelationType[]>(RELATION_TYPES_PATH, options);
	}

	static createRelationType(
		body: GraphRelationTypeInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphRelationType>> {
		return ApiService.post<GraphRelationType>(RELATION_TYPES_PATH, body, options);
	}

	static updateRelationType(
		relationTypeId: number,
		body: GraphRelationTypeInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphRelationType>> {
		return ApiService.put<GraphRelationType>(
			`${RELATION_TYPES_PATH}/${relationTypeId}`,
			body,
			options
		);
	}

	/** 400 when the type is in use; system types cannot be deleted. */
	static deleteRelationType(
		relationTypeId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${RELATION_TYPES_PATH}/${relationTypeId}`, options);
	}

	static reorderRelationTypes(
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphRelationType[]>> {
		return ApiService.post<GraphRelationType[]>(`${RELATION_TYPES_PATH}/reorder`, { ids }, options);
	}

	// §4.10
	static getWarRoomGraph(
		warRoomId: number,
		query: CaseGraphQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomGraph>> {
		return ApiService.get<WarRoomGraph>(
			ApiService.withQuery(`/api/v2/war-rooms/${warRoomId}/graph`, toGraphQuery(query)),
			options
		);
	}
}
