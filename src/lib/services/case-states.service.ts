import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseStateIdentifier = number;

export interface CaseState {
	state_id: number;
	state_name: string;
	state_description: string;
	protected: string;
}

export interface CaseStateBody {
	state_name?: string;
	state_description?: string;
}

export class CaseStatesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CaseState[]>> {
		return ApiService.get<CaseState[]>(`/manage/case-states/list`, options);
	}

	static async get(
		stateId: CaseStateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.get<CaseState>(`/manage/case-states/${stateId}`, options);
	}

	static async create(
		body: CaseStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.post<CaseState>(`/manage/case-states/add`, body, options);
	}

	static async update(
		stateId: CaseStateIdentifier,
		body: CaseStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.post<CaseState>(`/manage/case-states/update/${stateId}`, body, options);
	}

	static async remove(
		stateId: CaseStateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/case-states/delete/${stateId}`, {}, options);
	}
}
