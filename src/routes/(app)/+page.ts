import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Paginated, RequestResponse } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { PageLoad } from './$types';
import { auth } from '$lib/stores/auth.store';

export const load = (async ({ fetch }) => {

  const user = await auth.loadAuth(fetch, true);

  return {
    cases: ApiService.get<Paginated<Case>>(`${ENDPOINTS.case.list}?case_owner_id=${user?.id}&is_open=true`, { fetch: fetch }),
    tasks: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.tasks.list, { fetch: fetch }),
    reviews: ApiService.get<RequestResponse<[object]>>(ENDPOINTS.dashboard.reviews.list, { fetch: fetch }),
    alerts: ApiService.get<Paginated<object>>(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["${user?.id}"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`, { fetch })
  };
}) satisfies PageLoad;