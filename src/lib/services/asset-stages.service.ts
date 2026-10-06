/**
 * Asset stages — the org-wide taxonomy an asset moves through during an
 * incident (Identified → Isolated → … → Restored, plus exceptions such as
 * Unpatched / Blocked). Listing is open to every user; changes are
 * server-administrator only.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AssetStageKind = 'progress' | 'done' | 'exception';

export const ASSET_STAGE_KINDS: AssetStageKind[] = ['progress', 'done', 'exception'];

export const ASSET_STAGE_COLORS = [
	'slate',
	'gray',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose'
] as const;

export type AssetStageColor = (typeof ASSET_STAGE_COLORS)[number];

export type AssetStagePreset = 'incident' | 'compromise-simple';

export interface AssetStage {
	id: number;
	name: string;
	description: string | null;
	color: AssetStageColor | string;
	icon: string | null;
	kind: AssetStageKind;
	sort_order: number;
	requires_reason: boolean;
	requires_decision: boolean;
	/** Progress stage an asset may skip on its way to done. */
	is_optional: boolean;
	/** Only present on the /manage listing. */
	in_use_count?: number;
}

export interface AssetStageInput {
	name?: string;
	description?: string | null;
	color?: string;
	icon?: string | null;
	kind?: AssetStageKind;
	requires_reason?: boolean;
	requires_decision?: boolean;
	is_optional?: boolean;
}

export interface AssetStageHistoryEntry {
	id: number;
	asset_id: number;
	case_id: number;
	from_stage_id: number | null;
	from_stage_name: string | null;
	to_stage_id: number | null;
	to_stage_name: string | null;
	reason: string | null;
	decision_id: number | null;
	decision_number: number | null;
	war_room_id: number | null;
	war_room_name: string | null;
	changed_by_id: number | null;
	changed_by_name: string | null;
	changed_at: string | null;
}

export interface AssetStageUpdate {
	stage_id: number | null;
	reason?: string | null;
	decision_id?: number | null;
}

// Tailwind only ships classes it can see as literals, so the palette is
// spelled out instead of interpolated.
const CHIP_CLASSES: Record<AssetStageColor, string> = {
	slate: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
	gray: 'border-gray-500/30 bg-gray-500/10 text-gray-700 dark:text-gray-300',
	red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
	orange: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
	amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
	yellow: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
	lime: 'border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300',
	green: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
	emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
	teal: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
	cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
	sky: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
	blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
	indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
	violet: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
	purple: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
	fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
	pink: 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
	rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
};

const DOT_CLASSES: Record<AssetStageColor, string> = {
	slate: 'bg-slate-500',
	gray: 'bg-gray-500',
	red: 'bg-red-500',
	orange: 'bg-orange-500',
	amber: 'bg-amber-500',
	yellow: 'bg-yellow-500',
	lime: 'bg-lime-500',
	green: 'bg-green-500',
	emerald: 'bg-emerald-500',
	teal: 'bg-teal-500',
	cyan: 'bg-cyan-500',
	sky: 'bg-sky-500',
	blue: 'bg-blue-500',
	indigo: 'bg-indigo-500',
	violet: 'bg-violet-500',
	purple: 'bg-purple-500',
	fuchsia: 'bg-fuchsia-500',
	pink: 'bg-pink-500',
	rose: 'bg-rose-500'
};

function isStageColor(color: string | null | undefined): color is AssetStageColor {
	return typeof color === 'string' && Object.hasOwn(CHIP_CLASSES, color);
}

export function assetStageChipClass(color: string | null | undefined): string {
	return isStageColor(color) ? CHIP_CLASSES[color] : CHIP_CLASSES.slate;
}

export function assetStageDotClass(color: string | null | undefined): string {
	return isStageColor(color) ? DOT_CLASSES[color] : DOT_CLASSES.slate;
}

/** Stages in display order (sort_order, then id). */
export function sortAssetStages(stages: AssetStage[]): AssetStage[] {
	return [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export class AssetStagesService {
	static list(options: ApiOptions = {}): Promise<RequestResponse<AssetStage[]>> {
		return ApiService.get('/manage/asset-stages', options);
	}

	static create(
		body: AssetStageInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetStage>> {
		return ApiService.post('/manage/asset-stages', body, options);
	}

	static update(
		stageId: number,
		body: AssetStageInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetStage>> {
		return ApiService.put(`/manage/asset-stages/${stageId}`, body, options);
	}

	static remove(stageId: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete(`/manage/asset-stages/${stageId}`, options);
	}

	static reorder(ids: number[], options: ApiOptions = {}): Promise<RequestResponse<AssetStage[]>> {
		return ApiService.post('/manage/asset-stages/reorder', { ids }, options);
	}

	static applyPreset(
		preset: AssetStagePreset,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetStage[]>> {
		return ApiService.post(`/manage/asset-stages/presets/${preset}`, {}, options);
	}

	/** Set (or clear, with `stage_id: null`) the stage of a case asset. */
	static setAssetStage<TAsset = unknown>(
		caseId: number,
		assetId: number,
		body: AssetStageUpdate,
		options: ApiOptions = {}
	): Promise<RequestResponse<TAsset>> {
		return ApiService.put(`/cases/${caseId}/assets/${assetId}/stage`, body, options);
	}

	static history(
		caseId: number,
		assetId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetStageHistoryEntry[]>> {
		return ApiService.get(`/cases/${caseId}/assets/${assetId}/stage-history`, options);
	}
}
