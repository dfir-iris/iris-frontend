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
		//
		// IOC types is a small taxonomy populated from the catalogue
		// (~50 entries in a default deployment, single hundreds at the
		// outside) and the consumers — IOC add/edit dropdowns, CSV
		// import resolution — need the FULL list to function. The v2
		// backend defaults to per_page=10, which silently truncated
		// the dropdown to the first ten types. We pass a per_page
		// large enough to cover any realistic deployment in one shot;
		// this mirrors how the backend's own `clear_database` test
		// helper requests the full set.
		const url = ApiService.withQuery('/manage/case-objects/ioc-types', { per_page: 10000 });
		const res = await ApiService.get<IocTypesResponse>(url, options);
		const data = typeof res.data === 'object' && res.data !== null ? res.data.data : [];

		return {
			...res,
			data
		};
	}
}
