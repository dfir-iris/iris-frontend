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

// Hits the v2 case-objects taxonomy surface
// (`/api/v2/manage/case-objects/case-classifications/...`). REST verbs
// replace the legacy `/add`, `/update/<id>`, `/delete/<id>` paths.
const BASE = '/manage/case-objects/case-classifications';

export class CaseClassificationsService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CaseClassification[]>> {
		// v2 paginates with default per_page=10; case classifications
		// commonly run to 30+ entries (MITRE-ish taxonomy) so callers
		// would silently truncate without the explicit per_page.
		const url = ApiService.withQuery(BASE, { per_page: 10000 });
		return ApiService.get<CaseClassification[]>(url, options);
	}

	static async get(
		classificationId: CaseClassificationIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.get<CaseClassification>(`${BASE}/${classificationId}`, options);
	}

	static async create(
		body: CreateCaseClassificationBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.post<CaseClassification>(BASE, body, options);
	}

	static async update(
		classificationId: CaseClassificationIdentifier,
		body: UpdateCaseClassificationBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseClassification>> {
		return ApiService.put<CaseClassification>(`${BASE}/${classificationId}`, body, options);
	}

	static async remove(
		classificationId: CaseClassificationIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${classificationId}`, options);
	}
}
