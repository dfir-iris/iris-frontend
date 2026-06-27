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
		// TLP has a tiny fixed set (Red/Amber/Green/Clear) but the v2
		// endpoint still applies the default per_page=10 paginator; pass
		// a large per_page so consumers always get the full list, future-
		// proofed for any custom TLP entries an instance might add.
		const url = ApiService.withQuery('/manage/tlp', { per_page: 10000 });
		const res = await ApiService.get<TlpResponse>(url, options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
