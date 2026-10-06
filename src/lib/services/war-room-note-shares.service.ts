/** War-room note sharing REST wrapper.
 *
 * A share publishes one war-room note — or every note under a folder —
 * into the cases attached to the room. `mirror` delivery keeps a
 * read-only copy in each case in sync with the war-room source;
 * `copy` delivery drops a one-time, editable copy and never re-syncs. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type NoteShareScope = 'all' | 'cases';
export type NoteShareDelivery = 'mirror' | 'copy';
export type NoteShareTargetStatus = 'synced' | 'pending' | 'copied' | 'error';

export interface NoteShareCustomer {
	customer_id: number;
	customer_name: string;
}

/** One target case of a share. Cases the caller cannot read only
 *  carry `case_id` + `accessible: false` (no name, no customer). */
export interface NoteShareTarget {
	case_id: number;
	case_name?: string | null;
	customer_name?: string | null;
	accessible: boolean;
	status: NoteShareTargetStatus;
	mirror_note_id?: number | null;
}

export interface NoteShare {
	share_id: number;
	war_room_id: number;
	note_id: number | null;
	folder_id: number | null;
	target_title: string | null;
	scope: NoteShareScope;
	include_future: boolean;
	delivery: NoteShareDelivery;
	case_ids: number[];
	created_at: string | null;
	created_by_id: number | null;
	created_by_name: string | null;
	updated_at: string | null;
	targets: NoteShareTarget[];
	customers: NoteShareCustomer[];
}

export interface CreateNoteShareBody {
	note_id?: number;
	folder_id?: number;
	scope: NoteShareScope;
	case_ids?: number[];
	include_future?: boolean;
	delivery: NoteShareDelivery;
}

/** Only mirror shares can be edited after creation. */
export interface UpdateNoteShareBody {
	scope?: NoteShareScope;
	case_ids?: number[];
	include_future?: boolean;
}

export interface NoteShareListFilter {
	note_id?: number;
	folder_id?: number;
}

export interface NoteSharePreviewParams {
	note_id?: number;
	folder_id?: number;
	scope: NoteShareScope;
	case_ids?: number[];
}

export interface NoteSharePreview {
	notes: { note_id: number; title: string }[];
	targets: { case_id: number; case_name: string; customer_name: string | null }[];
	customers: NoteShareCustomer[];
}

/** Per-item badge data for the notes tree. */
export interface NoteShareIndicator {
	/** Number of shares pointing at the item. */
	shares: number;
	/** Distinct target cases across those shares. */
	cases: number;
	/** At least one share targets every attached case. */
	all: boolean;
	/** At least one live-mirror target is waiting to sync or failed. */
	pending: boolean;
}

export interface NoteShareIndex {
	notes: Record<number, NoteShareIndicator>;
	folders: Record<number, NoteShareIndicator>;
}

const addToIndicator = (
	bucket: Record<number, NoteShareIndicator>,
	key: number,
	share: NoteShare,
	caseSets: Map<string, Set<number>>,
	kind: string
) => {
	const setKey = `${kind}:${key}`;
	const cases = caseSets.get(setKey) ?? new Set<number>();
	for (const t of share.targets ?? []) cases.add(t.case_id);
	caseSets.set(setKey, cases);

	const current = bucket[key] ?? { shares: 0, cases: 0, all: false, pending: false };
	bucket[key] = {
		shares: current.shares + 1,
		cases: cases.size,
		all: current.all || share.scope === 'all',
		pending:
			current.pending ||
			(share.delivery === 'mirror' &&
				(share.targets ?? []).some((t) => t.status === 'pending' || t.status === 'error'))
	};
};

/** Fold a flat share list into lookup maps keyed by note / folder id. */
export const buildNoteShareIndex = (shares: NoteShare[]): NoteShareIndex => {
	const index: NoteShareIndex = { notes: {}, folders: {} };
	const caseSets = new Map<string, Set<number>>();

	for (const share of shares) {
		if (share.note_id != null) {
			addToIndicator(index.notes, share.note_id, share, caseSets, 'n');
		} else if (share.folder_id != null) {
			addToIndicator(index.folders, share.folder_id, share, caseSets, 'f');
		}
	}

	return index;
};

/** Short label for the tree badge: `All` or the distinct target count. */
export const noteShareBadgeLabel = (indicator: NoteShareIndicator): string =>
	indicator.all ? 'All' : String(indicator.cases);

export class WarRoomNoteSharesService {
	static list(
		warRoomId: number,
		filter: NoteShareListFilter = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteShare[]>> {
		return ApiService.get<NoteShare[]>(
			ApiService.withQuery(
				`/war-rooms/${warRoomId}/note-shares`,
				filter as Record<string, unknown>
			),
			options
		);
	}

	static create(
		warRoomId: number,
		body: CreateNoteShareBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteShare>> {
		return ApiService.post<NoteShare, CreateNoteShareBody>(
			`/war-rooms/${warRoomId}/note-shares`,
			body,
			options
		);
	}

	static update(
		warRoomId: number,
		shareId: number,
		body: UpdateNoteShareBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteShare>> {
		return ApiService.patch<NoteShare, UpdateNoteShareBody>(
			`/war-rooms/${warRoomId}/note-shares/${shareId}`,
			body,
			options
		);
	}

	static remove(
		warRoomId: number,
		shareId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/note-shares/${shareId}`, options);
	}

	static resync(
		warRoomId: number,
		shareId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteShare>> {
		return ApiService.post<NoteShare>(
			`/war-rooms/${warRoomId}/note-shares/${shareId}/resync`,
			{},
			options
		);
	}

	/** `case_ids` travels as one comma-separated value. */
	static preview(
		warRoomId: number,
		params: NoteSharePreviewParams,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteSharePreview>> {
		const { case_ids, ...rest } = params;
		const query: Record<string, unknown> = { ...rest };
		if (case_ids && case_ids.length > 0) query.case_ids = case_ids.join(',');

		return ApiService.get<NoteSharePreview>(
			ApiService.withQuery(`/war-rooms/${warRoomId}/note-shares/preview`, query),
			options
		);
	}
}
