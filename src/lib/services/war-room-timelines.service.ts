/** War-room named-timeline REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomTimeline {
	timeline_id: number;
	war_room_id: number;
	name: string;
	description: string | null;
	color: string | null;
	is_default: boolean;
	created_at: string | null;
	created_by_id: number | null;
}

export interface WarRoomTimelineEvent {
	/** Native events come back as numeric ids from the DB; projected
	 *  case events use a synthetic `case:<case_id>:<event_id>` string
	 *  so they never collide with native ids across the merged list. */
	id: number | string;
	/** Public identifier for share links. Stable across renames. */
	uuid: string;
	/** For native events this is the war-room timeline id. For projected
	 *  case events it's the *case* timeline id — the frontend treats it
	 *  as an opaque source key when rendering. */
	timeline_id: number;
	/** Self-ref for parent/child tree rendering. Null for root events. */
	parent_id: number | null;
	case_id: number | null;
	event_id: number | null;
	title: string | null;
	content: string | null;
	/** Machine-original payload for evidence trail. */
	raw: string | null;
	/** Free-text source label (e.g. "Suricata", "Firewall"). */
	source: string | null;
	/** Comma-separated tags — split by client for rendering as `#foo`. */
	tags: string | null;
	is_flagged: boolean;
	event_date: string | null;
	event_tz: string | null;
	color: string | null;
	category: string | null;
	/** JSONB audit trail written by `add_obj_history_entry`. */
	modification_history: Record<string, unknown> | null;
	/** Ids of attached assets — hydrated by the backend. */
	assets: number[];
	/** Ids of attached IOCs — hydrated by the backend. */
	iocs: number[];
	children_count: number;
	created_at: string | null;
	created_by_id: number | null;
	/** Discriminator. Absent on native war-room events, `'case'` when
	 *  the row was projected from a linked case's timeline. The frontend
	 *  uses this to disable drag-drop and to render the "Case #N" badge. */
	war_room_source?: 'case';
}

export interface LinkedCaseTimeline {
	timeline_id: number;
	name: string;
	color: string | null;
	is_default: boolean;
}

export interface LinkedCase {
	case_id: number;
	case_name: string;
	timelines: LinkedCaseTimeline[];
}

export interface CreateWarRoomTimelineEventBody {
	title?: string | null;
	content?: string | null;
	event_date?: string | null;
	event_tz?: string | null;
	color?: string | null;
	category?: string | null;
	case_id?: number | null;
	event_id?: number | null;
	source?: string | null;
	raw?: string | null;
	tags?: string | null;
	is_flagged?: boolean;
	parent_id?: number | null;
	asset_ids?: number[];
	ioc_ids?: number[];
}

/**
 * Every field is optional; only present keys are touched by the
 * backend. Explicit `null` clears the field; omitting the key leaves
 * it as-is. `asset_ids` / `ioc_ids` fully replace the association set
 * when passed (empty array = detach all).
 */
export interface UpdateWarRoomTimelineEventBody {
	title?: string | null;
	content?: string | null;
	event_date?: string | null;
	event_tz?: string | null;
	color?: string | null;
	category?: string | null;
	timeline_id?: number;
	source?: string | null;
	raw?: string | null;
	tags?: string | null;
	is_flagged?: boolean;
	parent_id?: number | null;
	asset_ids?: number[];
	ioc_ids?: number[];
}

export class WarRoomTimelinesService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimeline[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/timelines`, options);
	}

	static create(
		warRoomId: number,
		body: { name: string; description?: string | null; color?: string | null },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimeline>> {
		return ApiService.post(`/war-rooms/${warRoomId}/timelines`, body, options);
	}

	static update(
		warRoomId: number,
		timelineId: number,
		body: { name?: string; description?: string | null; color?: string | null },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimeline>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/timelines/${timelineId}`, body, options);
	}

	static remove(
		warRoomId: number,
		timelineId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/timelines/${timelineId}`, options);
	}

	static listEvents(
		warRoomId: number,
		params: { timelineIds?: number[] } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent[]>> {
		const qs = new URLSearchParams();
		if (params.timelineIds && params.timelineIds.length) {
			qs.set('timeline_ids', params.timelineIds.join(','));
		}
		const tail = qs.toString();
		const path = tail
			? `/war-rooms/${warRoomId}/timelines/events?${tail}`
			: `/war-rooms/${warRoomId}/timelines/events`;
		return ApiService.get(path, options);
	}

	static addEvent(
		warRoomId: number,
		timelineId: number,
		body: CreateWarRoomTimelineEventBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.post(`/war-rooms/${warRoomId}/timelines/${timelineId}/events`, body, options);
	}

	static updateEvent(
		warRoomId: number,
		eventId: number,
		body: UpdateWarRoomTimelineEventBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/timelines/events/${eventId}`, body, options);
	}

	static removeEvent(
		warRoomId: number,
		eventId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/timelines/events/${eventId}`, options);
	}

	/** Toggle the triage flag. Server flips + returns the fresh row. */
	static toggleEventFlag(
		warRoomId: number,
		eventId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.post(`/war-rooms/${warRoomId}/timelines/events/${eventId}/flag`, {}, options);
	}

	/** Shallow-copy an event onto the same timeline. Server-side helper
	 *  keeps the "duplicate" affordance a one-click op — the copy
	 *  starts detached from any comments but preserves asset/IOC links. */
	static duplicateEvent(
		warRoomId: number,
		eventId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/timelines/events/${eventId}/duplicate`,
			{},
			options
		);
	}

	/** Replace the event's asset associations. `[]` detaches everything. */
	static setEventAssets(
		warRoomId: number,
		eventId: number,
		assetIds: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<{ asset_ids: number[] }>> {
		return ApiService.put(
			`/war-rooms/${warRoomId}/timelines/events/${eventId}/assets`,
			{ asset_ids: assetIds },
			options
		);
	}

	/** Replace the event's IOC associations. `[]` detaches everything. */
	static setEventIocs(
		warRoomId: number,
		eventId: number,
		iocIds: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<{ ioc_ids: number[] }>> {
		return ApiService.put(
			`/war-rooms/${warRoomId}/timelines/events/${eventId}/iocs`,
			{ ioc_ids: iocIds },
			options
		);
	}

	// ---- Linked case timelines (read-only projection) ----------------

	/**
	 * Tree of `case -> timelines` available as toggleable sources on
	 * the sidebar. Backend filters by the caller's case-level access
	 * so cases they can't read don't appear here — no client-side
	 * hiding needed.
	 */
	static listLinkedCaseTimelines(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<LinkedCase[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/linked-case-timelines`, options);
	}

	/**
	 * Case events for the selected case timelines, shaped like native
	 * `WarRoomTimelineEvent` rows (with `war_room_source: 'case'` set)
	 * so the frontend can concat + sort against the native list.
	 * Empty / missing `caseTimelineIds` → returns `[]`.
	 */
	static listLinkedCaseEvents(
		warRoomId: number,
		params: { caseTimelineIds?: number[] } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent[]>> {
		const qs = new URLSearchParams();
		if (params.caseTimelineIds && params.caseTimelineIds.length) {
			qs.set('case_timeline_ids', params.caseTimelineIds.join(','));
		}
		const tail = qs.toString();
		const path = tail
			? `/war-rooms/${warRoomId}/linked-case-timelines/events?${tail}`
			: `/war-rooms/${warRoomId}/linked-case-timelines/events`;
		return ApiService.get(path, options);
	}
}
