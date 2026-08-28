import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type BannerPurpose = 'info' | 'warning' | 'error';

export interface Banner {
	id: number;
	text: string;
	purpose: BannerPurpose;
	dismissable: boolean;
	/** ISO 8601 UTC. `null` = no lower bound (active immediately). */
	start_at: string | null;
	/** ISO 8601 UTC. `null` = no upper bound (active forever). */
	end_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface BannerBody {
	text?: string;
	purpose?: BannerPurpose;
	dismissable?: boolean;
	start_at?: string | null;
	end_at?: string | null;
}

export class BannersService {
	/**
	 * Currently-active banners. Any authenticated user can read this;
	 * the SPA polls it from the root (app) layout to render the top strip.
	 */
	static async listActive(options: ApiOptions = {}): Promise<RequestResponse<Banner[]>> {
		return ApiService.get<Banner[]>(`/manage/banners/active`, options);
	}

	/**
	 * Admin-only. Full list including scheduled + expired banners for the
	 * Settings → Banners CRUD page.
	 */
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Banner[]>> {
		return ApiService.get<Banner[]>(`/manage/banners`, options);
	}

	static async get(id: number, options: ApiOptions = {}): Promise<RequestResponse<Banner>> {
		return ApiService.get<Banner>(`/manage/banners/${id}`, options);
	}

	static async create(
		body: BannerBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Banner>> {
		return ApiService.post<Banner>(`/manage/banners`, body, options);
	}

	static async update(
		id: number,
		body: BannerBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Banner>> {
		return ApiService.put<Banner>(`/manage/banners/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/banners/${id}`, options);
	}
}
