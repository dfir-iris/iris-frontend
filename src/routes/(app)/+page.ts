import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { RequestResponse } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  return {
    cases: ApiService.get<RequestResponse<[Case]>>(`${ENDPOINTS.dashboard.cases.list}?cid=1&show_closed=false`, {}, fetch),
    tasks: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.tasks.list, {}, fetch),
    reviews: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.reviews.list, {}, fetch),
    alerts: ApiService.get<RequestResponse<[object]>>(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["1"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`, {}, fetch)
  };
}) satisfies PageLoad;