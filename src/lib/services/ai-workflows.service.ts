import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// ---- Enumerations (mirror `app/models/ai_workflows.py`) ------------------

export type AiTriggerType = 'event' | 'cron' | 'manual' | 'webhook';
export type AiEntityType = 'alert' | 'alert_cluster' | 'case' | 'war_room';
export type AiRunStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';
export type AiStepStatus = 'running' | 'succeeded' | 'failed' | 'waiting' | 'resumed';
export type AiExecutionMode =
	| 'auto_read'
	| 'allowlisted_write'
	| 'suggested'
	| 'accepted_by_user'
	| 'denied';
export type AiWaitKind = 'callback' | 'user_input' | 'delay';
export type AiWaitStatus = 'pending' | 'resolved' | 'expired' | 'cancelled';
export type AiSuggestionAudience = 'entity' | 'owner';
export type AiSuggestionStatus = 'open' | 'accepted' | 'dismissed' | 'expired' | 'dry_run';
export type AiSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AiToolClassification = 'read' | 'write';
export type AiInboundKind = 'trigger' | 'callback';

export type AiNodeType =
	| 'trigger'
	| 'ai_agent'
	| 'condition'
	| 'http_request'
	| 'ask_analyst'
	| 'find_related'
	| 'find_war_room_tasks'
	| 'suggest'
	| 'action'
	| 'notify'
	| 'delay'
	| 'set_variables'
	| 'python'
	| 'stop';

// ---- Graph -----------------------------------------------------------------

export interface AiGraphNode {
	id: string;
	type: AiNodeType | string;
	label: string;
	position: { x: number; y: number };
	config: Record<string, unknown>;
	/** Editor only: the sides the connectors are drawn on (default left / right). */
	handles?: {
		input?: 'left' | 'top' | 'right' | 'bottom';
		output?: 'left' | 'top' | 'right' | 'bottom';
	};
}

/** `source_port` is xyflow's `sourceHandle`. */
export interface AiGraphEdge {
	id: string;
	source: string;
	target: string;
	source_port: string;
	/** The side the edge leaves / enters on when not the node's default (editor only). */
	source_side?: 'left' | 'top' | 'right' | 'bottom';
	target_side?: 'left' | 'top' | 'right' | 'bottom';
}

export interface AiWorkflowGraph {
	nodes: AiGraphNode[];
	edges: AiGraphEdge[];
}

// ---- Trigger configs ---------------------------------------------------------

export interface AiEventTriggerConfig {
	hooks: string[];
	condition?: string | null;
	dedup_minutes?: number;
}

export type AiCronTarget = 'war_rooms' | 'cases' | 'none';

export interface AiCronTriggerConfig {
	cron: string;
	target: AiCronTarget;
	max_targets?: number;
}

export interface AiManualTriggerConfig {
	/** Entity types the Run button accepts; empty = no entity needed. */
	entity_types: AiEntityType[];
}

export interface AiWebhookTriggerConfig {
	require_signature: boolean;
	entity_type?: AiEntityType | null;
	/** Dotted path into the inbound payload. */
	entity_id_path?: string | null;
}

export type AiTriggerConfig =
	| AiEventTriggerConfig
	| AiCronTriggerConfig
	| AiManualTriggerConfig
	| AiWebhookTriggerConfig;

// ---- Workflows ---------------------------------------------------------------

export interface AiUserRef {
	id: number;
	login: string | null;
	name: string | null;
}

export interface AiWorkflowSummary {
	id: number;
	uuid: string;
	name: string;
	description: string | null;
	is_active: boolean;
	trigger_type: AiTriggerType;
	trigger_config: Record<string, unknown>;
	owner_id: number;
	owner: AiUserRef | null;
	version: number;
	customer_scope: number[] | null;
	suggestion_audience: AiSuggestionAudience;
	max_runs_per_hour: number;
	token_budget_per_run: number;
	write_tool_allowlist: string[];
	/** Runs started in the last 24 hours, by status. */
	run_counts_24h?: Partial<Record<AiRunStatus, number>>;
	/** An inbound token has been generated (webhook trigger). */
	has_inbound_token?: boolean;
	/** A signing secret is set: inbound requests must carry `X-IRIS-Signature`. */
	has_signing_secret?: boolean;
	/** Triggers suppressed (rate limit, dedup, chain depth) instead of run. */
	skipped_count?: number;
	last_skip_reason?: string | null;
	last_skipped_at?: string | null;
	/** Webhook trigger only: where the external system POSTs. */
	inbound_url?: string | null;
	created_by_id?: number | null;
	last_fired_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface AiWorkflow extends AiWorkflowSummary {
	graph: AiWorkflowGraph;
}

export interface AiWorkflowBody {
	name: string;
	description: string | null;
	is_active: boolean;
	trigger_type: AiTriggerType;
	trigger_config: Record<string, unknown>;
	customer_scope: number[];
	graph: AiWorkflowGraph;
	write_tool_allowlist: string[];
	max_runs_per_hour: number;
	token_budget_per_run: number;
	suggestion_audience: AiSuggestionAudience;
	/** Admins only. */
	owner_id?: number;
	/** PUT only: note stored with the new version. */
	version_note?: string;
}

export interface AiWorkflowVersionSummary {
	version: number;
	note: string | null;
	created_at: string | null;
	created_by: AiUserRef | string | null;
	created_by_id?: number | null;
}

export interface AiWorkflowVersionDetail extends AiWorkflowVersionSummary {
	snapshot: Record<string, unknown>;
}

// ---- Catalogue ---------------------------------------------------------------

export interface AiNodeTypeInfo {
	type: AiNodeType | string;
	label: string;
	description: string;
	category: string;
	ports: string[];
	config_defaults: Record<string, unknown>;
}

export interface AiToolInfo {
	name: string;
	description: string;
	classification: AiToolClassification;
	input_schema: Record<string, unknown>;
	/** False when the MCP settings currently hide the tool (it would fail at run time). */
	enabled?: boolean;
}

export interface AiHookInfo {
	name: string;
	description: string;
}

export interface AiKeystoreRef {
	name: string;
	is_secret: boolean;
	scope: 'personal' | 'shared';
}

export interface AiWorkflowCatalogue {
	node_types: AiNodeTypeInfo[];
	tools: AiToolInfo[];
	hooks: AiHookInfo[];
	trigger_types?: string[];
	entity_types: string[];
	suggestion_kinds: string[];
	suggestion_audiences?: string[];
	enabled?: boolean;
	keystore: AiKeystoreRef[];
	callback_base_url: string;
	llm: { enabled: boolean; provider: string | null; model: string | null };
}

// ---- Validation --------------------------------------------------------------

export interface AiValidationError {
	node_id: string | null;
	field: string | null;
	message: string;
}

export interface AiValidateBody {
	graph: AiWorkflowGraph;
	trigger_type: AiTriggerType;
	trigger_config: Record<string, unknown>;
	write_tool_allowlist: string[];
}

export interface AiValidateResult {
	valid: boolean;
	errors: AiValidationError[];
}

// ---- Runs ----------------------------------------------------------------------

export interface AiRunSummary {
	id: number;
	uuid: string;
	workflow_id: number | null;
	workflow_name: string;
	workflow_version: number;
	status: AiRunStatus;
	trigger_type: AiTriggerType;
	entity_type: AiEntityType | null;
	entity_id: number | null;
	entity_title: string | null;
	sub_entity: Record<string, unknown> | null;
	run_as: AiUserRef | null;
	triggered_by: AiUserRef | null;
	is_dry_run: boolean;
	tokens_used: number;
	step_count: number;
	error: string | null;
	waiting_node_id: string | null;
	started_at: string | null;
	updated_at: string | null;
	finished_at: string | null;
	chain_depth: number;
	parent_run_id: number | null;
	/** Set on a run that replays an event a node processed (the step id). */
	replayed_from_step_id?: number | null;
	/** Set on a run that tests one node on its own (the node id). */
	tested_node_id?: string | null;
}

export interface AiRunStep {
	id: number;
	seq: number;
	node_id: string;
	node_type: string;
	node_label: string | null;
	status: AiStepStatus;
	input: unknown;
	output: unknown;
	port: string | null;
	error: string | null;
	tokens_used: number;
	started_at: string | null;
	ended_at: string | null;
}

export interface AiToolCall {
	id: number;
	step_id: number | null;
	suggestion_id: number | null;
	tool_name: string;
	arguments: unknown;
	result: unknown;
	/**
	 * Set when the backend cut `result` down (16 KB cap); `result` is then
	 * the first characters of its JSON, as a string.
	 */
	result_truncated?: boolean;
	/** The result of an action another analyst accepted: theirs alone. */
	result_hidden?: boolean;
	error: string | null;
	classification: AiToolClassification;
	execution_mode: AiExecutionMode;
	acting_user: AiUserRef | null;
	duration_ms: number | null;
	created_at: string | null;
}

export interface AiLlmCall {
	id: number;
	step_id: number | null;
	provider: string | null;
	model: string | null;
	policy_id: number | null;
	restriction_level: string | null;
	redacted: boolean;
	user_id?: number | null;
	/** False when the snapshots are withheld (not admin / workflow owner). */
	snapshots_visible?: boolean;
	/** Only for admins and the workflow owner. */
	request_snapshot?: unknown;
	response_snapshot?: unknown;
	prompt_tokens: number;
	completion_tokens: number;
	bytes_sent: number;
	error: string | null;
	created_at: string | null;
}

export interface AiWait {
	id: number;
	uuid: string;
	node_id: string;
	kind: AiWaitKind;
	status: AiWaitStatus;
	expires_at: string | null;
	resolved_at: string | null;
	resolved_by_id: number | null;
	resolved_by?: AiUserRef | null;
	resolved_payload?: unknown;
	/** The answer another analyst gave: theirs alone. */
	resolved_payload_hidden?: boolean;
	source_ip: string | null;
	payload_sha256?: string | null;
	suggestion_id: number | null;
	created_at: string | null;
}

/** Subset of the suggestion serialization the run inspector shows. */
export interface AiRunSuggestion {
	id: number;
	uuid: string;
	kind: string;
	title: string;
	body: string | null;
	status: AiSuggestionStatus;
	severity: AiSeverity | null;
	confidence: number | null;
	proposed_action: { tool: string; arguments: Record<string, unknown> } | null;
	entity_type: AiEntityType | null;
	entity_id: number | null;
	created_at: string | null;
	resolved_at: string | null;
	resolved_by: AiUserRef | null;
	resolution_note: string | null;
	/** Resolved by someone else: their answer / result is withheld. */
	resolution_hidden?: boolean;
}

/**
 * A node tested on its own: from an earlier event of the node
 * (`step_id`), or from an entity, a trigger payload and the upstream
 * outputs (`nodes`: `{node_id: {output, port}}`) / variables supplied.
 */
export interface AiTestNodeBody {
	node: Pick<AiGraphNode, 'id' | 'type' | 'label' | 'config'>;
	dry_run?: boolean;
	step_id?: number;
	entity_type?: AiEntityType | null;
	entity_id?: number | null;
	payload?: unknown;
	nodes?: Record<string, unknown>;
	vars?: Record<string, unknown>;
}

export interface AiRunDetail extends AiRunSummary {
	trigger_payload?: unknown;
	context?: unknown;
	definition_snapshot?: Record<string, unknown> | null;
	customer_id?: number | null;
	can_view_llm_snapshots?: boolean;
	steps: AiRunStep[];
	tool_calls: AiToolCall[];
	/** Tool calls left out (over 200 per step). */
	tool_calls_omitted?: number;
	llm_calls: AiLlmCall[];
	waits: AiWait[];
	suggestions: AiRunSuggestion[];
}

export interface AiRunFilters {
	workflow_id?: number | null;
	status?: AiRunStatus | null;
	entity_type?: AiEntityType | null;
	entity_id?: number | null;
	page?: number;
	per_page?: number;
}

/** v2 list envelope; page fields vary between endpoints, so all optional. */
export interface AiPage<T> {
	data: T[];
	total: number;
	page?: number;
	per_page?: number;
	current_page?: number;
	last_page?: number | null;
	next_page?: number | null;
}

export interface AiRunRequest {
	entity_type?: AiEntityType | null;
	entity_id?: number | null;
	dry_run: boolean;
	payload?: Record<string, unknown> | null;
}

export interface AiInboundToken {
	token: string;
	url: string;
	/**
	 * HMAC-SHA256 key for signing inbound requests; shown once. Absent on
	 * backends that predate request signing.
	 */
	signing_secret?: string | null;
}

export interface AiInboundEvent {
	id: number;
	kind: AiInboundKind;
	workflow_id: number | null;
	wait_id: number | null;
	run_id: number | null;
	run_uuid?: string | null;
	source_ip: string | null;
	status: string;
	reason: string | null;
	payload_sha256: string | null;
	payload_bytes: number;
	created_at: string | null;
}

// ---- Portable documents ---------------------------------------------------------

export interface AiDocumentRequirements {
	/** Keystore entry names the document references with `key("NAME")`. */
	keystore: string[];
	tools: string[];
}

export interface AiWorkflowDocument {
	format: 'iris-ai-workflow';
	format_version: number;
	exported_at: string | null;
	iris_version: string | null;
	workflow: Partial<AiWorkflowBody>;
	requirements: AiDocumentRequirements;
	warnings: AiValidationError[];
}

export interface AiBlockDocument {
	format: 'iris-ai-workflow-block';
	format_version: number;
	exported_at: string | null;
	iris_version: string | null;
	block: {
		name: string;
		description: string | null;
		category: string | null;
		nodes: AiGraphNode[];
		edges: AiGraphEdge[];
	};
	requirements: AiDocumentRequirements;
	warnings: AiValidationError[];
}

export interface AiImportResult<T> {
	warnings: AiValidationError[];
	workflow?: T;
	block?: T;
}

/** A workflow shipped with IRIS, added as a copy (`importWorkflow`). */
export interface AiLibraryEntry {
	/** The file name without its extensions. */
	id: string;
	file: string;
	name: string;
	description: string;
	category: string;
	trigger_type: AiTriggerType;
	trigger_config: Record<string, unknown>;
	uses_ai: boolean;
	requirements: AiDocumentRequirements;
	document: AiWorkflowDocument;
	/** What the caller lacks to run it: keystore entries, disabled tools. */
	warnings: AiValidationError[];
}

export interface AiAuthoringGuide {
	markdown: string;
	examples: { file: string; kind: string; name: string; document: Record<string, unknown> }[];
}

// ---- Saved blocks -------------------------------------------------------------------

export interface AiBlockDefinition {
	nodes: AiGraphNode[];
	edges: AiGraphEdge[];
}

export interface AiBlock {
	id: number;
	uuid: string;
	name: string;
	description: string | null;
	category: string | null;
	is_shared: boolean;
	owner_id: number;
	owner: AiUserRef | null;
	definition: AiBlockDefinition;
	requirements: AiDocumentRequirements;
	can_edit: boolean;
	created_at: string | null;
	updated_at: string | null;
}

export interface AiBlockBody {
	name: string;
	description?: string | null;
	category?: string | null;
	is_shared?: boolean;
	definition: AiBlockDefinition;
}

// ---- Live progress -----------------------------------------------------------------

/**
 * Socket payload of `ai_workflow_run` on `/notifications`: the state of
 * a run, and of the step that just started or settled. Sent to whoever
 * joined the run (`ai_workflow_watch {run_uuid}`) or its workflow
 * (`ai_workflow_watch {workflow_id}`); the details are read over REST.
 */
export interface AiRunLiveEvent {
	run_uuid: string | null;
	workflow_id: number | null;
	status: AiRunStatus;
	waiting_node_id: string | null;
	step: {
		id: number;
		seq: number;
		node_id: string;
		status: AiStepStatus;
		port: string | null;
	} | null;
}

export const AI_RUN_LIVE_EVENT = 'ai_workflow_run';
export const AI_RUN_WATCH = 'ai_workflow_watch';
export const AI_RUN_UNWATCH = 'ai_workflow_unwatch';

// ---- Node events --------------------------------------------------------------------

export type AiEventStatus = 'succeeded' | 'failed' | 'waiting';

export interface AiNodeStats {
	total: number;
	counts: Partial<Record<AiStepStatus, number>>;
	last_at: string | null;
}

/** One execution of a node: its step and the run it belongs to. */
export interface AiNodeEvent extends AiRunStep {
	run: AiRunSummary;
	/** Detail only: the context the node saw (what a replay starts with). */
	context?: unknown;
}

export interface AiNodeEventsPage extends AiPage<AiNodeEvent> {
	node_id: string;
	truncated?: boolean;
}

const BASE = '/ai-workflows';

/** A plain array or a `{data: [...]}` envelope → the array. */
export function aiListData<T>(data: unknown): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
		return (data as { data: T[] }).data;
	}
	return [];
}

export class AiWorkflowsService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AiWorkflowSummary[]>> {
		return ApiService.get<AiWorkflowSummary[]>(BASE, options);
	}

	static async get(id: number, options: ApiOptions = {}): Promise<RequestResponse<AiWorkflow>> {
		return ApiService.get<AiWorkflow>(`${BASE}/${id}`, options);
	}

	static async create(
		body: AiWorkflowBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiWorkflow>> {
		return ApiService.post<AiWorkflow>(BASE, body, options);
	}

	static async update(
		id: number,
		body: Partial<AiWorkflowBody>,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiWorkflow>> {
		return ApiService.put<AiWorkflow>(`${BASE}/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${id}`, options);
	}

	static async catalogue(options: ApiOptions = {}): Promise<RequestResponse<AiWorkflowCatalogue>> {
		return ApiService.get<AiWorkflowCatalogue>(`${BASE}/catalogue`, options);
	}

	static async validate(
		body: AiValidateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiValidateResult>> {
		return ApiService.post<AiValidateResult>(`${BASE}/validate`, body, options);
	}

	static async versions(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiWorkflowVersionSummary[]>> {
		return ApiService.get<AiWorkflowVersionSummary[]>(`${BASE}/${id}/versions`, options);
	}

	static async version(
		id: number,
		version: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiWorkflowVersionDetail>> {
		return ApiService.get<AiWorkflowVersionDetail>(`${BASE}/${id}/versions/${version}`, options);
	}

	static async run(
		id: number,
		body: AiRunRequest,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunSummary>> {
		return ApiService.post<AiRunSummary>(`${BASE}/${id}/run`, body, options);
	}

	/** New inbound token for a webhook-triggered workflow; shown once. */
	static async rotateInboundToken(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiInboundToken>> {
		return ApiService.post<AiInboundToken>(`${BASE}/${id}/inbound-token`, {}, options);
	}

	/** New signing secret for inbound requests; shown once. */
	static async rotateSigningSecret(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ signing_secret: string }>> {
		return ApiService.post<{ signing_secret: string }>(`${BASE}/${id}/signing-secret`, {}, options);
	}

	static async runs(
		filters: AiRunFilters = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<AiPage<AiRunSummary>>> {
		const params: Record<string, unknown> = {
			page: filters.page ?? 1,
			per_page: filters.per_page ?? 25
		};
		if (filters.workflow_id) params.workflow_id = filters.workflow_id;
		if (filters.status) params.status = filters.status;
		if (filters.entity_type) params.entity_type = filters.entity_type;
		if (filters.entity_id) params.entity_id = filters.entity_id;
		return ApiService.get<AiPage<AiRunSummary>>(
			ApiService.withQuery(`${BASE}/runs`, params),
			options
		);
	}

	static async getRun(
		uuid: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunDetail>> {
		return ApiService.get<AiRunDetail>(`${BASE}/runs/${encodeURIComponent(uuid)}`, options);
	}

	static async cancelRun(
		uuid: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunSummary>> {
		return ApiService.post<AiRunSummary>(
			`${BASE}/runs/${encodeURIComponent(uuid)}/cancel`,
			{},
			options
		);
	}

	static async rerun(
		uuid: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunSummary>> {
		return ApiService.post<AiRunSummary>(
			`${BASE}/runs/${encodeURIComponent(uuid)}/rerun`,
			{},
			options
		);
	}

	static async exportRun(
		uuid: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<Record<string, unknown>>> {
		return ApiService.get<Record<string, unknown>>(
			`${BASE}/runs/${encodeURIComponent(uuid)}/export`,
			options
		);
	}

	static async inboundEvents(
		workflowId: number | null = null,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiInboundEvent[] | AiPage<AiInboundEvent>>> {
		const params: Record<string, unknown> = {};
		if (workflowId) params.workflow_id = workflowId;
		return ApiService.get<AiInboundEvent[] | AiPage<AiInboundEvent>>(
			ApiService.withQuery(`${BASE}/inbound-events`, params),
			options
		);
	}

	// ---- Export / import

	static async exportWorkflow(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiWorkflowDocument>> {
		return ApiService.get<AiWorkflowDocument>(`${BASE}/${id}/export`, options);
	}

	static async importWorkflow(
		document: unknown,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiImportResult<AiWorkflow>>> {
		return ApiService.post<AiImportResult<AiWorkflow>>(`${BASE}/import`, document, options);
	}

	static async authoringGuide(
		options: ApiOptions = {}
	): Promise<RequestResponse<AiAuthoringGuide>> {
		return ApiService.get<AiAuthoringGuide>(`${BASE}/authoring-guide`, options);
	}

	static async library(options: ApiOptions = {}): Promise<RequestResponse<AiLibraryEntry[]>> {
		return ApiService.get<AiLibraryEntry[]>(`${BASE}/library`, options);
	}

	// ---- Saved blocks

	static async blocks(options: ApiOptions = {}): Promise<RequestResponse<AiBlock[]>> {
		return ApiService.get<AiBlock[]>(`${BASE}/blocks`, options);
	}

	static async createBlock(
		body: AiBlockBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiBlock>> {
		return ApiService.post<AiBlock>(`${BASE}/blocks`, body, options);
	}

	static async updateBlock(
		id: number,
		body: Partial<AiBlockBody>,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiBlock>> {
		return ApiService.put<AiBlock>(`${BASE}/blocks/${id}`, body, options);
	}

	static async removeBlock(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/blocks/${id}`, options);
	}

	static async exportBlock(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiBlockDocument>> {
		return ApiService.get<AiBlockDocument>(`${BASE}/blocks/${id}/export`, options);
	}

	static async importBlock(
		document: unknown,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiImportResult<AiBlock>>> {
		return ApiService.post<AiImportResult<AiBlock>>(`${BASE}/blocks/import`, document, options);
	}

	// ---- Node events

	static async nodeStats(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ nodes: Record<string, AiNodeStats> }>> {
		return ApiService.get<{ nodes: Record<string, AiNodeStats> }>(
			`${BASE}/${id}/node-stats`,
			options
		);
	}

	static async nodeEvents(
		id: number,
		nodeId: string,
		filters: { status?: AiEventStatus | null; page?: number; per_page?: number } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<AiNodeEventsPage>> {
		const params: Record<string, unknown> = {
			page: filters.page ?? 1,
			per_page: filters.per_page ?? 25
		};
		if (filters.status) params.status = filters.status;
		return ApiService.get<AiNodeEventsPage>(
			ApiService.withQuery(`${BASE}/${id}/nodes/${encodeURIComponent(nodeId)}/events`, params),
			options
		);
	}

	static async nodeEvent(
		id: number,
		nodeId: string,
		stepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiNodeEvent>> {
		return ApiService.get<AiNodeEvent>(
			`${BASE}/${id}/nodes/${encodeURIComponent(nodeId)}/events/${stepId}`,
			options
		);
	}

	static async replayEvent(
		id: number,
		nodeId: string,
		stepId: number,
		body: { dry_run?: boolean } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunSummary>> {
		return ApiService.post<AiRunSummary>(
			`${BASE}/${id}/nodes/${encodeURIComponent(nodeId)}/events/${stepId}/replay`,
			body,
			options
		);
	}

	static async testNode(
		id: number,
		body: AiTestNodeBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiRunSummary>> {
		return ApiService.post<AiRunSummary>(`${BASE}/${id}/test-node`, body, options);
	}
}
