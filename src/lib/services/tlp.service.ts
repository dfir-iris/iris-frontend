import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface TlpItem {
	tlp_id: number;
	tlp_name: string;
	tlp_bscolor?: string;
}

type TlpResponse = {
	status: string;
	message: string;
	data: TlpItem[];
};

export class TlpService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<TlpItem[]>> {
		const res = await ApiService.get<TlpResponse>('/manage/tlp/list', options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
