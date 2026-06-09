import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface IocType {
	type_id: number;
	type_name: string;
	type_description?: string;
	type_taxonomy?: string;
}

type IocTypesResponse = {
	status: string;
	message: string;
	data: IocType[];
};

export class IocTypesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<IocType[]>> {
		const res = await ApiService.get<IocTypesResponse>('/manage/ioc-types/list', options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
