/**
 * Chatbot admin service — CRUD for `ChatbotPolicy`, customer→policy
 * binding, and the cross-user sessions viewer that the DPO / server
 * admin uses to audit conversation content.
 *
 * All endpoints live under `/manage/case-chat/*` and require
 * `server_administrator`. See
 * `blueprints/rest/v2/manage_routes/case_chat.py`.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { ChatConversation, ChatMessage, ChatUsage } from './chat.service';

export interface ChatbotPolicy {
	id: number;
	name: string;
	description: string;
	restriction_level: number;
	provider: string;
	model: string;
	base_url: string;
	auto_execute_read_tools: boolean;
	auto_approve_write_tools: boolean;
	max_turns_per_conversation: number;
	max_tool_calls_per_turn: number;
	daily_token_budget_per_user: number;
	daily_token_budget_org: number;
	redact_ips: boolean;
	redact_emails: boolean;
	redact_hashes: boolean;
	retention_days: number;
	created_at: string;
	updated_at: string;
	/** Number of customers currently pinned to this policy — attached
	 * server-side to the list response (not to the schema).
	 */
	customer_count?: number;
}

export interface ChatbotPolicyBody {
	name?: string;
	description?: string;
	restriction_level?: number;
	provider?: string;
	model?: string;
	/** Plaintext — encrypted before persist. Send `''` or `null` to
	 * clear the field (falls back to server-settings key). Absent =
	 * unchanged. */
	api_key?: string | null;
	base_url?: string;
	auto_execute_read_tools?: boolean;
	auto_approve_write_tools?: boolean;
	max_turns_per_conversation?: number;
	max_tool_calls_per_turn?: number;
	daily_token_budget_per_user?: number;
	daily_token_budget_org?: number;
	redact_ips?: boolean;
	redact_emails?: boolean;
	redact_hashes?: boolean;
	retention_days?: number;
}

export interface AdminSession extends ChatConversation {
	resolved_policy_id: number | null;
	resolved_restriction_level: number;
}

export interface AdminSessionDetail extends AdminSession {
	messages: ChatMessage[];
	usage?: ChatUsage;
}

/** One tool descriptor exactly as it was serialised to the provider. */
export interface AdminSnapshotTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

/** What left the box on a single LLM turn — conversation history
 * stripped, so only the system prompt, the tools the model was given,
 * and the triggering user message remain. Populated from
 * `case_chat_egress_audit.request_snapshot`; NULL on rows written
 * before the snapshot migration landed. */
export interface AdminRequestSnapshot {
	system: string;
	tools: AdminSnapshotTool[];
	user_message: ChatMessage['content'] | null;
}

export interface AdminSessionTurn {
	id: number;
	conversation_id: number;
	user_id: number;
	provider: string;
	model: string;
	request_bytes: number;
	response_bytes: number;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	redacted: boolean;
	request_snapshot: AdminRequestSnapshot | null;
	created_at: string;
}

export class ChatbotAdminService {
	static async listPolicies(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ policies: ChatbotPolicy[] }>> {
		return ApiService.get('/manage/case-chat/policies', options);
	}

	static async createPolicy(
		body: ChatbotPolicyBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatbotPolicy>> {
		return ApiService.post<ChatbotPolicy>(
			'/manage/case-chat/policies',
			body,
			options
		);
	}

	static async updatePolicy(
		id: number,
		body: ChatbotPolicyBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatbotPolicy>> {
		return ApiService.patch<ChatbotPolicy>(
			`/manage/case-chat/policies/${id}`,
			body,
			options
		);
	}

	static async deletePolicy(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/manage/case-chat/policies/${id}`,
			options
		);
	}

	static async setCustomerPolicy(
		customerId: number,
		policyId: number | null,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ customer_id: number; policy_id: number | null }>> {
		return ApiService.put(
			`/manage/case-chat/customers/${customerId}/policy`,
			{ policy_id: policyId },
			options
		);
	}

	static async listSessions(
		query: {
			limit?: number;
			offset?: number;
			user_id?: number;
			case_id?: number;
			war_room_id?: number;
			include_archived?: boolean;
		} = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: AdminSession[]; limit: number; offset: number }>> {
		const qs = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null) qs.set(k, String(v));
		}
		const path = `/manage/case-chat/sessions${qs.size ? `?${qs.toString()}` : ''}`;
		return ApiService.get(path, options);
	}

	static async readSession(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AdminSessionDetail>> {
		return ApiService.get<AdminSessionDetail>(
			`/manage/case-chat/sessions/${conversationId}`,
			options
		);
	}

	/** Per-turn egress rows with the request snapshot attached — used by
	 * the session viewer's "Sent to model" pane to show exactly which
	 * tools each turn carried. */
	static async readSessionTurns(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversation_id: number; turns: AdminSessionTurn[] }>> {
		return ApiService.get(
			`/manage/case-chat/sessions/${conversationId}/turns`,
			options
		);
	}

	// ---- Stage 3: Retention + DPO ----------------------------------

	static async runRetention(
		options: ApiOptions = {}
	): Promise<
		RequestResponse<{
			conversations_deleted: number;
			messages_deleted: number;
			egress_deleted: number;
		}>
	> {
		return ApiService.post(
			'/manage/case-chat/retention/run',
			{},
			options
		);
	}

	static async dpoExport(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.get(
			`/manage/case-chat/dpo/export?user_id=${userId}`,
			options
		);
	}

	static async dpoErase(
		userId: number,
		options: ApiOptions = {}
	): Promise<
		RequestResponse<{
			conversations_deleted: number;
			messages_deleted: number;
			egress_deleted: number;
		}>
	> {
		return ApiService.post(
			'/manage/case-chat/dpo/erase',
			{ user_id: userId },
			options
		);
	}
}
