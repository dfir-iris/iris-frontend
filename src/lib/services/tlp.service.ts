import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface TlpItem {
	tlp_id: number;
	tlp_name: string;
	tlp_bscolor?: string;
}

/**
 * Backend response wrapper. v2 returns a paginated envelope
 * (`{total, data, last_page, ...}`); the legacy endpoint returned
 * `{status, message, data}`. Both have `data: TlpItem[]` so a single
 * unwrap suffices.
 */
type TlpResponse = {
	data: TlpItem[];
};

export class TlpService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<TlpItem[]>> {
		const res = await ApiService.get<TlpResponse>('/manage/tlp', options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
