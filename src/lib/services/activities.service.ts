import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

// Row shape returned by `GET /api/v2/activities`. The backend projects
// UserActivity columns directly so the field names follow the DB schema.
// `activity_date` arrives as an ISO 8601 string; `case_name`/`case_id`
// are nullable for non-case-linked rows (login events, global tasks).
export interface ActivityRow {
	id: number;
	user_name: string | null;
	user_id: number | null;
	case_name: string | null;
	case_id: number | null;
	activity_date: string | null;
	activity_desc: string | null;
	user_input: boolean;
	is_from_api: boolean;
	// Number of underlying UserActivity rows this row represents — the
	// backend coalesces near-duplicates (same user / case / description
	// within a minute) into a single listing row. `1` means no
	// coalescing happened.
	occurrences?: number;
}

export interface ListActivitiesParams {
	page?: number;
	per_page?: number;
	search?: string;
	include_non_case?: boolean;
	user_id?: number;
	case_id?: number;
	user_ids?: number[];
	case_ids?: number[];
	// ISO 8601 strings (YYYY-MM-DD or full RFC3339). The server accepts
	// either form via `datetime.fromisoformat`.
	date_from?: string;
	date_to?: string;
	is_from_api?: boolean;
	is_manual?: boolean;
}

export class ActivitiesService {
	static async list(
		params: ListActivitiesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<ActivityRow>>> {
		// Strip empty `search` so the server doesn't ILIKE on an empty
		// string (which matches everything but adds overhead). Booleans
		// are serialised explicitly so `false` doesn't drop out via the
		// `v == null` check in `toQueryString`.
		// Tri-state booleans: only serialise when the caller actually set
		// the param. `undefined` ⇒ omit (server treats as "any"), `true` /
		// `false` ⇒ explicit filter.
		const triBool = (v: boolean | undefined): string | undefined =>
			v === undefined ? undefined : v ? 'true' : 'false';

		// Comma-join multi-value params so the URL stays compact even with
		// many ids selected — server accepts both `?ids=1,2,3` and the
		// repeated form via the same parser.
		const csv = (vs: number[] | undefined): string | undefined =>
			vs && vs.length > 0 ? vs.join(',') : undefined;

		const query: Record<string, unknown> = {
			page: params.page,
			per_page: params.per_page,
			search: params.search?.trim() || undefined,
			include_non_case: triBool(params.include_non_case),
			user_id: params.user_id,
			case_id: params.case_id,
			user_ids: csv(params.user_ids),
			case_ids: csv(params.case_ids),
			date_from: params.date_from || undefined,
			date_to: params.date_to || undefined,
			is_from_api: triBool(params.is_from_api),
			is_manual: triBool(params.is_manual)
		};

		const path = ApiService.withQuery('/api/v2/activities', query);
		return ApiService.get<Paginated<ActivityRow>>(path, options);
	}
}
