import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { LayoutLoad } from './$types';

export const load = (async ({ params, fetch }) => {
  const caseId = parseInt(params.case_id)
  return {
    caseId: caseId,
    case: ApiService.get<Case>(ENDPOINTS.case.getById(caseId), {}, fetch)
  };
}) satisfies LayoutLoad;