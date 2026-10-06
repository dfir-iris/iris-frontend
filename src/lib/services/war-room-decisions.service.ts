/**
 * War-room decision register (D-n).
 *
 * Wraps `/api/v2/war-rooms/{id}/decisions`. A decision carries a target
 * date & time (naive UTC on the wire), an owner, a list of approvers
 * with their verdicts, and the attached cases / assets it applies to.
 * Cases and assets the caller cannot read come back as
 * `{..., accessible: false}` without names.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { parseServerDate } from '$lib/utils/time-formatter';

export type WarRoomDecisionStatus = 'proposed' | 'approved' | 'rejected' | 'superseded';
export type WarRoomDecisionVerdict = 'approved' | 'rejected';

export const WAR_ROOM_DECISION_STATUSES: WarRoomDecisionStatus[] = [
	'proposed',
	'approved',
	'rejected',
	'superseded'
];

export interface WarRoomDecisionApprover {
	user_id: number;
	user_name: string | null;
	verdict: WarRoomDecisionVerdict | null;
	comment: string | null;
	responded_at: string | null;
}

export interface WarRoomDecisionCase {
	case_id: number;
	case_name?: string | null;
	accessible: boolean;
}

export interface WarRoomDecisionAsset {
	asset_id: number;
	asset_name?: string | null;
	case_id?: number | null;
	accessible?: boolean;
}

export interface WarRoomDecision {
	decision_id: number;
	war_room_id: number;
	number: number;
	ref: string;
	title: string;
	rationale: string | null;
	status: WarRoomDecisionStatus;
	target_at: string | null;
	is_overdue: boolean;
	owner_id: number | null;
	owner_name: string | null;
	supersedes_id: number | null;
	supersedes_ref: string | null;
	superseded_by_id: number | null;
	chat_message_id: number | null;
	decided_at: string | null;
	decided_by_id: number | null;
	decided_by_name: string | null;
	implemented_at: string | null;
	implemented_by_id: number | null;
	created_at: string | null;
	created_by_id: number | null;
	created_by_name: string | null;
	updated_at: string | null;
	approvers: WarRoomDecisionApprover[];
	case_ids: number[];
	cases: WarRoomDecisionCase[];
	asset_ids: number[];
	assets: WarRoomDecisionAsset[];
}

export interface CreateWarRoomDecisionBody {
	title: string;
	rationale?: string | null;
	status?: 'proposed' | 'approved';
	target_at?: string | null;
	owner_id?: number | null;
	approver_ids?: number[];
	case_ids?: number[];
	asset_ids?: number[];
	supersedes_id?: number | null;
	chat_message_id?: number | null;
}

export interface UpdateWarRoomDecisionBody {
	title?: string;
	rationale?: string | null;
	status?: WarRoomDecisionStatus;
	target_at?: string | null;
	owner_id?: number | null;
	approver_ids?: number[];
	case_ids?: number[];
	asset_ids?: number[];
}

export interface WarRoomDecisionVoteBody {
	verdict: WarRoomDecisionVerdict;
	comment?: string | null;
}

export interface ListWarRoomDecisionsParams {
	status?: WarRoomDecisionStatus;
	q?: string;
	case_id?: number;
}

export interface WarRoomDecisionChatCandidate {
	message_id: number;
	body: string;
	author_name: string | null;
	created_at: string | null;
}

/** Minimal slice of the scope asset listing used by the decision asset picker. */
export interface WarRoomDecisionAssetCandidate {
	asset_id: number;
	asset_name: string;
	asset_type_name?: string | null;
	case_id: number;
	case_name?: string | null;
}

export interface WarRoomDecisionAssetCandidates {
	data: WarRoomDecisionAssetCandidate[];
	truncated: boolean;
	limit: number;
}

export const decisionsBasePath = (warRoomId: number): string => `/war-rooms/${warRoomId}/decisions`;

export const buildDecisionsListPath = (
	warRoomId: number,
	params: ListWarRoomDecisionsParams = {}
): string => {
	const qs = new URLSearchParams();
	if (params.status) qs.set('status', params.status);
	const q = params.q?.trim();
	if (q) qs.set('q', q);
	if (params.case_id != null) qs.set('case_id', String(params.case_id));
	const tail = qs.toString();
	const base = decisionsBasePath(warRoomId);
	return tail ? `${base}?${tail}` : base;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `45 min`, `3 h`, `2 d` — coarse duration for due-date hints. */
export const formatCoarseDuration = (ms: number): string => {
	const abs = Math.abs(ms);
	if (abs < HOUR) return `${Math.max(1, Math.round(abs / MINUTE))} min`;
	if (abs < DAY) return `${Math.round(abs / HOUR)} h`;
	return `${Math.round(abs / DAY)} d`;
};

/**
 * Relative label for a decision target: `in 3 h` or `overdue by 2 h`.
 * Empty string when there is no (valid) target.
 */
export const formatDecisionTarget = (
	targetAt: string | null | undefined,
	now: number = Date.now()
): string => {
	const target = parseServerDate(targetAt);
	if (!target) return '';
	const delta = target.getTime() - now;
	return delta >= 0
		? `in ${formatCoarseDuration(delta)}`
		: `overdue by ${formatCoarseDuration(delta)}`;
};

/** True when the decision is still open (proposed / approved, not implemented). */
export const isDecisionOpen = (d: Pick<WarRoomDecision, 'status' | 'implemented_at'>): boolean =>
	(d.status === 'proposed' || d.status === 'approved') && !d.implemented_at;

export class WarRoomDecisionsService {
	static list(
		warRoomId: number,
		params: ListWarRoomDecisionsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision[]>> {
		return ApiService.get<WarRoomDecision[]>(buildDecisionsListPath(warRoomId, params), options);
	}

	static get(
		warRoomId: number,
		decisionId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.get<WarRoomDecision>(
			`${decisionsBasePath(warRoomId)}/${decisionId}`,
			options
		);
	}

	static create(
		warRoomId: number,
		body: CreateWarRoomDecisionBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.post<WarRoomDecision>(decisionsBasePath(warRoomId), body, options);
	}

	static update(
		warRoomId: number,
		decisionId: number,
		body: UpdateWarRoomDecisionBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.patch<WarRoomDecision>(
			`${decisionsBasePath(warRoomId)}/${decisionId}`,
			body,
			options
		);
	}

	static vote(
		warRoomId: number,
		decisionId: number,
		body: WarRoomDecisionVoteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.post<WarRoomDecision>(
			`${decisionsBasePath(warRoomId)}/${decisionId}/vote`,
			body,
			options
		);
	}

	static markImplemented(
		warRoomId: number,
		decisionId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.post<WarRoomDecision>(
			`${decisionsBasePath(warRoomId)}/${decisionId}/implemented`,
			{},
			options
		);
	}

	static reopen(
		warRoomId: number,
		decisionId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecision>> {
		return ApiService.post<WarRoomDecision>(
			`${decisionsBasePath(warRoomId)}/${decisionId}/reopen`,
			{},
			options
		);
	}

	static remove(
		warRoomId: number,
		decisionId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${decisionsBasePath(warRoomId)}/${decisionId}`, options);
	}

	static chatCandidates(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecisionChatCandidate[]>> {
		return ApiService.get<WarRoomDecisionChatCandidate[]>(
			`${decisionsBasePath(warRoomId)}/chat-candidates`,
			options
		);
	}

	/**
	 * Assets the caller can link to a decision: the war-room scope
	 * listing (readable attached cases only), filtered server-side by `q`.
	 */
	static assetCandidates(
		warRoomId: number,
		q = '',
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDecisionAssetCandidates>> {
		const term = q.trim();
		const path = term
			? `/war-rooms/${warRoomId}/scope/assets?${new URLSearchParams({ q: term }).toString()}`
			: `/war-rooms/${warRoomId}/scope/assets`;
		return ApiService.get<WarRoomDecisionAssetCandidates>(path, options);
	}
}
