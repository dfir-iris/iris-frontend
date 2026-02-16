import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseClassificationIdentifier = number;

export interface CaseClassification {
	id: number;
	name: string;
	name_expanded: string;
	description: string;
	creation_date: string;
}

export interface CreateCaseClassificationBody {
	name: string;
	name_expanded: string;
	description: string;
}

export interface UpdateCaseClassificationBody {
	name?: string;
	name_expanded?: string;
	description?: string;
}

export class CaseClassificationsService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CaseClassification[]>> {
		return ApiService.get<CaseClassification[]>(`/manage/case-classifications/list`, options);
	}

	static async get(
		classificationId: CaseClassificationIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.get<CaseClassification>(
			`/manage/case-classifications/${classificationId}`,
			options
		);
	}

	static async create(
		body: CreateCaseClassificationBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.post<CaseClassification>(`/manage/case-classifications/add`, body, options);
	}

	static async update(
		classificationId: CaseClassificationIdentifier,
		body: UpdateCaseClassificationBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.post<CaseClassification>(
			`/manage/case-classifications/update/${classificationId}`,
			body,
			options
		);
	}

	static async remove(
		classificationId: CaseClassificationIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(
			`/manage/case-classifications/delete/${classificationId}`,
			{},
			options
		);
	}
}
