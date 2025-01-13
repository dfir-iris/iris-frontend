import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Paginated, RequestResponse } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  return {
<<<<<<< HEAD
    cases: ApiService.get<Paginated<Case>>(`${ENDPOINTS.dashboard.cases.list}?cid=1&show_closed=false`, { fetch }),
    tasks: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.tasks.list, { fetch }),
    reviews: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.reviews.list, { fetch }),
    alerts: ApiService.get<Paginated<object>>(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["1"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`, { fetch })
=======
    cases: ApiService.get<Paginated<Case>>(`${ENDPOINTS.case.list}?case_owner_id=1&is_open=true`, {}, fetch),
    tasks: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.tasks.list, {}, fetch),
    reviews: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.reviews.list, {}, fetch),
    alerts: ApiService.get<Paginated<object>>(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["1"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`, {}, fetch)
>>>>>>> 1185a23 ([FIX] Case table)
  };
}) satisfies PageLoad;