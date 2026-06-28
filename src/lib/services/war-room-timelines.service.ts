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
	id: number;
	timeline_id: number;
	case_id: number | null;
	event_id: number | null;
	title: string | null;
	content: string | null;
	event_date: string | null;
	event_tz: string | null;
	color: string | null;
	category: string | null;
	created_at: string | null;
	created_by_id: number | null;
}

export interface UpdateWarRoomTimelineEventBody {
	title?: string | null;
	content?: string | null;
	event_date?: string | null;
	event_tz?: string | null;
	color?: string | null;
	category?: string | null;
	timeline_id?: number;
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
		return ApiService.patch(
			`/war-rooms/${warRoomId}/timelines/${timelineId}`,
			body,
			options
		);
	}

	static remove(
		warRoomId: number,
		timelineId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/timelines/${timelineId}`,
			options
		);
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
		body: {
			title?: string | null;
			content?: string | null;
			event_date?: string | null;
			event_tz?: string | null;
			color?: string | null;
			category?: string | null;
			case_id?: number | null;
			event_id?: number | null;
		},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/timelines/${timelineId}/events`,
			body,
			options
		);
	}

	static updateEvent(
		warRoomId: number,
		eventId: number,
		body: UpdateWarRoomTimelineEventBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTimelineEvent>> {
		return ApiService.patch(
			`/war-rooms/${warRoomId}/timelines/events/${eventId}`,
			body,
			options
		);
	}

	static removeEvent(
		warRoomId: number,
		eventId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/timelines/events/${eventId}`,
			options
		);
	}
}
