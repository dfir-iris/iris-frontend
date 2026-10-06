/** War-room SitReps REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomSitRep {
	sitrep_id: number;
	war_room_id: number;
	version: number;
	title: string;
	body_md?: string;
	authored_by_id: number | null;
	authored_at: string | null;
	published: boolean;
	snapshot_json: Record<string, unknown> | null;
}

export interface WarRoomSitRepAutoDraft {
	title: string;
	body_md: string;
	since: string | null;
	generated_at: string | null;
	sections: {
		changes: unknown[];
		cases: unknown[];
		decisions: unknown[];
		exceptions: unknown[];
		next_actions: unknown[];
	};
}

export interface WarRoomSitRepCadence {
	cadence_minutes: number | null;
	reminder_minutes: number | null;
	last_published_at: string | null;
	next_due_at: string | null;
	is_overdue: boolean;
}

export interface WarRoomSitRepCadenceBody {
	/** 15..10080, or null to switch the cadence off. */
	cadence_minutes: number | null;
	/** 0..cadence_minutes, or null for no reminder. */
	reminder_minutes?: number | null;
}

export interface WarRoomSitRepPublishBody {
	/** Copy the published SitRep into these cases, or every attached case. */
	share_to_case_ids?: number[] | 'all';
}

export interface WarRoomSitRepShareResult {
	case_id: number;
	/** 'copied' on success ('created' accepted too); 'denied' when the caller lacks full access. */
	status: 'copied' | 'created' | 'denied' | 'error' | string;
	note_id?: number;
	message?: string;
}

/** True when a share result means the case received its copy. */
export function isSitRepShareSuccess(r: Pick<WarRoomSitRepShareResult, 'status'>): boolean {
	return r.status === 'copied' || r.status === 'created';
}

export type WarRoomSitRepPublished = WarRoomSitRep & { shared?: WarRoomSitRepShareResult[] };

function isPublishBody(v: WarRoomSitRepPublishBody | ApiOptions | undefined): boolean {
	return !!v && typeof v === 'object' && 'share_to_case_ids' in v;
}

export class WarRoomSitRepsService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRep[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/sitreps`, options);
	}

	static get(
		warRoomId: number,
		sitrepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRep>> {
		return ApiService.get(`/war-rooms/${warRoomId}/sitreps/${sitrepId}`, options);
	}

	static create(
		warRoomId: number,
		body: { title: string; body_md?: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRep>> {
		return ApiService.post(`/war-rooms/${warRoomId}/sitreps`, body, options);
	}

	static update(
		warRoomId: number,
		sitrepId: number,
		body: { title?: string; body_md?: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRep>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/sitreps/${sitrepId}`, body, options);
	}

	/**
	 * Publish a draft. The third argument is either the optional publish
	 * body (`{share_to_case_ids}`) or, for older callers, the ApiOptions.
	 */
	static publish(
		warRoomId: number,
		sitrepId: number,
		bodyOrOptions?: WarRoomSitRepPublishBody | ApiOptions,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRepPublished>> {
		let body: WarRoomSitRepPublishBody = {};
		let opts: ApiOptions = options;
		if (isPublishBody(bodyOrOptions)) {
			const share = (bodyOrOptions as WarRoomSitRepPublishBody).share_to_case_ids;
			if (share !== undefined) body = { share_to_case_ids: share };
		} else if (bodyOrOptions) {
			opts = bodyOrOptions as ApiOptions;
		}
		return ApiService.post(`/war-rooms/${warRoomId}/sitreps/${sitrepId}/publish`, body, opts);
	}

	/** Draft body generated from the live war-room state (readable cases only). */
	static autoDraft(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRepAutoDraft>> {
		return ApiService.get(`/war-rooms/${warRoomId}/sitreps/auto-draft`, options);
	}

	static getCadence(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRepCadence>> {
		return ApiService.get(`/war-rooms/${warRoomId}/sitreps/cadence`, options);
	}

	static setCadence(
		warRoomId: number,
		body: WarRoomSitRepCadenceBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRepCadence>> {
		return ApiService.put(`/war-rooms/${warRoomId}/sitreps/cadence`, body, options);
	}

	static remove(
		warRoomId: number,
		sitrepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/sitreps/${sitrepId}`, options);
	}

	static exportUrl(warRoomId: number, sitrepId: number, format: 'md' | 'html' | 'pdf'): string {
		return `/api/v2/war-rooms/${warRoomId}/sitreps/${sitrepId}/export.${format}`;
	}
}
