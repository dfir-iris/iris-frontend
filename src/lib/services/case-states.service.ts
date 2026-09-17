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

/**
 * All routes now point at the v2 case-objects taxonomy surface
 * (`/api/v2/manage/case-objects/case-states/...`). The CRUD verbs
 * mirror the REST conventions used by every other v2 endpoint —
 * POST to the collection, PUT/DELETE on the row — replacing the
 * legacy `/add`, `/update/<id>`, `/delete/<id>` URL verbs.
 */
const BASE = '/manage/case-objects/case-states';

/**
 * Resolve a state name ('Closed', 'Open', …) to its server-side id.
 *
 * State ids are deployment-specific — they're seeded rows, not an enum — so
 * every caller that wants to move a case to a named state has to look the id
 * up first. Kept as a pure function over an already-fetched list rather than
 * a caching service method: the cases context already caches the list for
 * the topbar picker, and a second module-level cache would just be another
 * thing to invalidate.
 */
export function findStateIdByName(states: CaseState[], name: string): number | null {
	const match = states.find((s) => s.state_name === name);
	return match?.state_id ?? null;
}

export class CaseStatesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CaseState[]>> {
		// v2 paginates with default per_page=10; case-states fits on one
		// page today (~5 entries) but the dropdown must surface the full
		// set for any deployment that adds custom states.
		const url = ApiService.withQuery(BASE, { per_page: 10000 });
		return ApiService.get<CaseState[]>(url, options);
	}

	static async get(
		stateId: CaseStateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.get<CaseState>(`${BASE}/${stateId}`, options);
	}

	static async create(
		body: CaseStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.post<CaseState>(BASE, body, options);
	}

	static async update(
		stateId: CaseStateIdentifier,
		body: CaseStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseState>> {
		return ApiService.put<CaseState>(`${BASE}/${stateId}`, body, options);
	}

	static async remove(
		stateId: CaseStateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${stateId}`, options);
	}
}
