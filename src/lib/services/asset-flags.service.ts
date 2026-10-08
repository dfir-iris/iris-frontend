/**
 * Asset flags — the org-wide set of status facts an asset can carry
 * (Isolated, Credentials reset, Patched, Can't be patched…). An asset
 * holds any combination of them, in no order; every change writes an
 * event on the case "Asset status" timeline. Listing is open to every
 * user; taxonomy changes are server-administrator only.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

/** `status` is a plain fact, `done` closes the asset, `exception` is an accepted gap. */
export type AssetFlagKind = 'status' | 'done' | 'exception';

export const ASSET_FLAG_KINDS: AssetFlagKind[] = ['status', 'done', 'exception'];

export const ASSET_FLAG_COLORS = [
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

export type AssetFlagColor = (typeof ASSET_FLAG_COLORS)[number];

export type AssetFlagPreset = 'incident' | 'vulnerability';

/** Name of the case timeline the flag events are written to. */
export const ASSET_STATUS_TIMELINE_NAME = 'Asset status';

export interface AssetFlag {
	id: number;
	name: string;
	description: string | null;
	color: AssetFlagColor | string;
	icon: string | null;
	kind: AssetFlagKind;
	sort_order: number;
	requires_reason: boolean;
	requires_decision: boolean;
	/** Only present on the /manage listing. */
	in_use_count?: number;
}

export interface AssetFlagInput {
	name?: string;
	description?: string | null;
	color?: string;
	icon?: string | null;
	kind?: AssetFlagKind;
	requires_reason?: boolean;
	requires_decision?: boolean;
}

/** A flag set on a case asset (`asset.flags[]`). */
export interface CaseAssetFlag {
	asset_id: number;
	flag_id: number;
	case_id?: number;
	reason: string | null;
	decision_id: number | null;
	/** Event of the "Asset status" timeline; null once deleted there. */
	event_id?: number | null;
	set_at: string | null;
	set_by_id?: number | null;
	flag?: AssetFlag | null;
}

export type AssetFlagAction = 'set' | 'updated' | 'cleared';

export interface AssetFlagHistoryEntry {
	id: number;
	asset_id: number;
	case_id: number;
	flag_id: number | null;
	/** Snapshot of the name at the time of the change. */
	flag_name: string;
	action: AssetFlagAction;
	reason: string | null;
	decision_id: number | null;
	decision_number: number | null;
	war_room_id: number | null;
	war_room_name: string | null;
	event_id: number | null;
	changed_by_id: number | null;
	changed_by_name: string | null;
	changed_at: string | null;
}

export interface AssetFlagChange {
	reason?: string | null;
	decision_id?: number | null;
	/** ISO 8601 date of the timeline event; now when left out. */
	date?: string | null;
}

// Tailwind only ships classes it can see as literals, so the palette is
// spelled out instead of interpolated.
const CHIP_CLASSES: Record<AssetFlagColor, string> = {
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

const DOT_CLASSES: Record<AssetFlagColor, string> = {
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

function isFlagColor(color: string | null | undefined): color is AssetFlagColor {
	return typeof color === 'string' && Object.hasOwn(CHIP_CLASSES, color);
}

export function assetFlagChipClass(color: string | null | undefined): string {
	return isFlagColor(color) ? CHIP_CLASSES[color] : CHIP_CLASSES.slate;
}

export function assetFlagDotClass(color: string | null | undefined): string {
	return isFlagColor(color) ? DOT_CLASSES[color] : DOT_CLASSES.slate;
}

/** Flags in display order (sort_order, then id). */
export function sortAssetFlags(flags: AssetFlag[]): AssetFlag[] {
	return [...flags].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export class AssetFlagsService {
	static list(options: ApiOptions = {}): Promise<RequestResponse<AssetFlag[]>> {
		return ApiService.get('/manage/asset-flags', options);
	}

	static create(
		body: AssetFlagInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetFlag>> {
		return ApiService.post('/manage/asset-flags', body, options);
	}

	static update(
		flagId: number,
		body: AssetFlagInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetFlag>> {
		return ApiService.put(`/manage/asset-flags/${flagId}`, body, options);
	}

	static remove(flagId: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete(`/manage/asset-flags/${flagId}`, options);
	}

	static reorder(ids: number[], options: ApiOptions = {}): Promise<RequestResponse<AssetFlag[]>> {
		return ApiService.post('/manage/asset-flags/reorder', { ids }, options);
	}

	static applyPreset(
		preset: AssetFlagPreset,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetFlag[]>> {
		return ApiService.post(`/manage/asset-flags/presets/${preset}`, {}, options);
	}

	/** Set a flag on a case asset, or update its reason / decision / event date. */
	static setAssetFlag<TAsset = unknown>(
		caseId: number,
		assetId: number,
		flagId: number,
		body: AssetFlagChange = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<TAsset>> {
		return ApiService.put(`/cases/${caseId}/assets/${assetId}/flags/${flagId}`, body, options);
	}

	/** Remove a flag from a case asset; this writes a "removed" event. */
	static clearAssetFlag<TAsset = unknown>(
		caseId: number,
		assetId: number,
		flagId: number,
		body: Pick<AssetFlagChange, 'reason' | 'date'> = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<TAsset>> {
		return ApiService.delete(`/cases/${caseId}/assets/${assetId}/flags/${flagId}`, options, body);
	}

	static history(
		caseId: number,
		assetId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetFlagHistoryEntry[]>> {
		return ApiService.get(`/cases/${caseId}/assets/${assetId}/flag-history`, options);
	}
}
