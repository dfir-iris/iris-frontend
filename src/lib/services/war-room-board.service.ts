/**
 * War-room board: one aggregated read of every attached case's asset
 * stages, open decisions and tasks, plus a computed "needs attention"
 * list. Cases the caller cannot read only appear as
 * `{case_id, accessible: false}`.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { AssetStage, AssetStageKind } from './asset-stages.service';

export interface WarRoomBoardKpis {
	cases: number;
	cases_accessible: number;
	assets: number;
	compromised: number;
	staged: number;
	done: number;
	exceptions: number;
	unstaged: number;
	decisions_open: number;
	decisions_overdue: number;
	decisions_due_24h: number;
	tasks_open: number;
	// The vulnerability KPIs are omitted for callers without
	// `vulnerabilities_read` (and by older backends).
	/** Open vulnerability findings over the readable cases. */
	vulnerabilities_open?: number;
	/** Open findings whose exploitation status is `exploited`. */
	vulnerabilities_exploited_open?: number;
	/** Open findings past their remediation due date. */
	vulnerabilities_overdue?: number;
	/** Open findings of a CISA KEV-listed vulnerability. */
	vulnerabilities_kev_open?: number;
	/** Assets with at least one open finding. */
	vulnerable_assets?: number;
}

export interface WarRoomBoardVulnerabilityKpis {
	open: number;
	exploitedOpen: number;
	overdue: number;
	kevOpen: number;
	vulnerableAssets: number;
}

export interface WarRoomBoardCase {
	case_id: number;
	accessible: boolean;
	case_name?: string | null;
	customer_id?: number | null;
	customer_name?: string | null;
	state_id?: number | null;
	state_name?: string | null;
	owner_id?: number | null;
	owner_name?: string | null;
	severity_name?: string | null;
	assets_total?: number;
	assets_compromised?: number;
	/** Keyed by stage id (as a string) or `"none"` for unstaged assets. */
	by_stage?: Record<string, number>;
	by_kind?: Record<AssetStageKind | 'none', number>;
	tasks_open?: number;
}

export type WarRoomBoardAttentionType =
	| 'compromised_unstaged'
	| 'exception_without_decision'
	| 'decision_overdue'
	| 'decision_due_soon'
	| 'decision_pending_vote'
	| 'decision_pending_approval'
	| 'decision_pending_implementation'
	| 'vulnerability_exploited_open'
	| 'vulnerability_overdue';

export type WarRoomBoardSeverity = 'high' | 'medium' | 'low';

export interface WarRoomBoardAttention {
	type: WarRoomBoardAttentionType | string;
	severity: WarRoomBoardSeverity;
	label: string;
	case_id?: number | null;
	asset_id?: number | null;
	decision_id?: number | null;
	task_id?: number | null;
	/** Vulnerability items: the case finding concerned. */
	finding_id?: number | null;
}

/** An open (proposed or approved, not implemented) decision of the room. */
export interface WarRoomBoardDecision {
	decision_id: number;
	number: number;
	/** `D-<number>` */
	ref: string;
	title: string;
	status: 'proposed' | 'approved' | string;
	/** Naive UTC ISO date-time, or null when no target is set. */
	target_at: string | null;
	overdue: boolean;
	due_soon: boolean;
	pending_approvers: number;
}

export interface WarRoomBoard {
	generated_at: string | null;
	kpis: WarRoomBoardKpis;
	stages: AssetStage[];
	cases: WarRoomBoardCase[];
	attention: WarRoomBoardAttention[];
	/** Absent on servers that predate the field. */
	decisions?: WarRoomBoardDecision[];
}

export interface StageSegment {
	key: string;
	label: string;
	color: string | null;
	count: number;
	/** Percentage of the bar width, 0-100. */
	pct: number;
}

/**
 * Turn a `by_stage` map into ordered bar segments: the configured stages
 * in board order, then the unstaged bucket. Zero-count buckets are
 * dropped; unknown stage ids (deleted since) are folded into "Other".
 */
export const boardStageSegments = (
	byStage: Record<string, number> | null | undefined,
	stages: AssetStage[]
): StageSegment[] => {
	if (!byStage) return [];
	const total = Object.values(byStage).reduce((acc, n) => acc + (Number(n) || 0), 0);
	if (total <= 0) return [];
	const segments: StageSegment[] = [];
	const known = new Set<string>();
	for (const stage of stages) {
		const key = String(stage.id);
		known.add(key);
		const count = Number(byStage[key]) || 0;
		if (count > 0) {
			segments.push({
				key,
				label: stage.name,
				color: stage.color,
				count,
				pct: (count / total) * 100
			});
		}
	}
	let other = 0;
	for (const [key, value] of Object.entries(byStage)) {
		if (key !== 'none' && !known.has(key)) other += Number(value) || 0;
	}
	if (other > 0) {
		segments.push({
			key: 'other',
			label: 'Other',
			color: 'gray',
			count: other,
			pct: (other / total) * 100
		});
	}
	const none = Number(byStage.none) || 0;
	if (none > 0) {
		segments.push({
			key: 'none',
			label: 'No stage',
			color: null,
			count: none,
			pct: (none / total) * 100
		});
	}
	return segments;
};

const VULNERABILITY_ATTENTION_TYPES: ReadonlySet<string> = new Set([
	'vulnerability_exploited_open',
	'vulnerability_overdue'
]);

/**
 * Where a vulnerability attention item leads: the Vulnerabilities tab of
 * the case asset, focused on the finding when known (the case assets list
 * when the asset is unknown). `null` for any other item.
 */
export const boardVulnerabilityHref = (
	a: Pick<WarRoomBoardAttention, 'type' | 'case_id' | 'asset_id' | 'finding_id'>
): string | null => {
	if (!VULNERABILITY_ATTENTION_TYPES.has(a.type) || a.case_id == null) return null;
	if (a.asset_id == null) return `/case/${a.case_id}/assets`;
	const base = `/case/${a.case_id}/assets/${a.asset_id}?tab=vulnerabilities`;
	return a.finding_id != null ? `${base}&finding=${a.finding_id}` : base;
};

/**
 * The vulnerability KPI row, or `null` when it must not show: the viewer
 * lacks `vulnerabilities_read`, or the backend omitted the fields.
 */
export const boardVulnerabilityKpis = (
	kpis: WarRoomBoardKpis | null | undefined,
	canRead: boolean
): WarRoomBoardVulnerabilityKpis | null => {
	if (!canRead || !kpis || kpis.vulnerabilities_open === undefined) return null;
	return {
		open: kpis.vulnerabilities_open,
		exploitedOpen: kpis.vulnerabilities_exploited_open ?? 0,
		overdue: kpis.vulnerabilities_overdue ?? 0,
		kevOpen: kpis.vulnerabilities_kev_open ?? 0,
		vulnerableAssets: kpis.vulnerable_assets ?? 0
	};
};

/**
 * Where an attention item leads for vulnerability items, honouring the
 * viewer's access: without `vulnerabilities_read` the item (should the
 * backend still send one) gets no vulnerability link.
 */
export const boardVulnerabilityHrefFor = (
	a: Pick<WarRoomBoardAttention, 'type' | 'case_id' | 'asset_id' | 'finding_id'>,
	canRead: boolean
): string | null => (canRead ? boardVulnerabilityHref(a) : null);

export class WarRoomBoardService {
	static get(warRoomId: number, options: ApiOptions = {}): Promise<RequestResponse<WarRoomBoard>> {
		return ApiService.get<WarRoomBoard>(`/war-rooms/${warRoomId}/board`, options);
	}
}
