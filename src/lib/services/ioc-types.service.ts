import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface IocType {
	type_id: number;
	type_name: string;
	type_description?: string;
	type_taxonomy?: string;
}

type IocTypesResponse = {
	data: IocType[];
};

export class IocTypesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<IocType[]>> {
		// v2 paginated envelope shares `data: T[]` with the legacy
		// `{status, message, data}` envelope — the unwrap below
		// covers both shapes.
		const res = await ApiService.get<IocTypesResponse>('/manage/case-objects/ioc-types', options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
