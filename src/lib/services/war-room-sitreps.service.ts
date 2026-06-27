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
		return ApiService.patch(
			`/war-rooms/${warRoomId}/sitreps/${sitrepId}`,
			body,
			options
		);
	}

	static publish(
		warRoomId: number,
		sitrepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomSitRep>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/sitreps/${sitrepId}/publish`,
			{},
			options
		);
	}

	static remove(
		warRoomId: number,
		sitrepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/sitreps/${sitrepId}`,
			options
		);
	}

	static exportUrl(
		warRoomId: number,
		sitrepId: number,
		format: 'md' | 'html' | 'pdf'
	): string {
		return `/api/v2/war-rooms/${warRoomId}/sitreps/${sitrepId}/export.${format}`;
	}
}
