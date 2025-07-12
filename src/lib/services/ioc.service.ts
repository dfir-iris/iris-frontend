import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Ioc, IocCreate, IocUpdate } from '$lib/types/resources/ioc'; // Assuming these types exist or will be created
import { ApiService } from './api.service';

export class IocService {

	public static async getIocsByCaseId(caseId: string | number, parameters: object = {}, fetchInstance?: typeof fetch): Promise<{ data: Ioc[] }> {
		const endpoint = ENDPOINTS.case.ioc.list(caseId, parameters);
		return ApiService.get<{ data: Ioc[] }>(endpoint, { fetch: fetchInstance });
	}

	public static async getIocById(caseId: string | number, iocId: string | number, fetchInstance?: typeof fetch): Promise<Ioc> {
		const endpoint = ENDPOINTS.case.ioc.getById(caseId, iocId);
		const response = await ApiService.get<Ioc>(endpoint, { fetch: fetchInstance });
		return response.data;
	}

	public static async addIoc(caseId: string | number, iocData: IocCreate, fetchInstance?: typeof fetch): Promise<Ioc> {
		const endpoint = ENDPOINTS.case.ioc.add(caseId);
		const response = await ApiService.post<Ioc>(endpoint, iocData, { fetch: fetchInstance });
		return response.data;
	}

	public static async updateIoc(caseId: string | number, iocId: string | number, iocData: IocUpdate, fetchInstance?: typeof fetch): Promise<Ioc> {
		const endpoint = ENDPOINTS.case.ioc.update(caseId, iocId);
		const response = await ApiService.put<Ioc>(endpoint, iocData, { fetch: fetchInstance });
		return response.data;
	}

	public static async deleteIoc(caseId: string | number, iocId: string | number, fetchInstance?: typeof fetch): Promise<void> {
		const endpoint = ENDPOINTS.case.ioc.delete(caseId, iocId);
		const response = await ApiService.delete<void>(endpoint, { fetch: fetchInstance });
		return response.data;
	}
}
