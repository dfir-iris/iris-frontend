import { ApiService } from '$lib/services/api.service';
import type { RequestResponse } from '$lib/services/api.service'
import type { Case } from '$lib/types/resources/case';
import type { LayoutLoad } from './$types';

export const load = (async ({ params, fetch }) => {
  return {
    case_id: params.case_id,
    case: ApiService.get<RequestResponse<Case>>(`/cases/${params.case_id}`, {}, fetch)
  };
}) satisfies LayoutLoad;