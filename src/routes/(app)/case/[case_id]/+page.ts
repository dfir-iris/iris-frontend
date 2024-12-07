import { ApiService } from '$lib/services/api.service';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return {
    // case: ApiService.get(`/cases/${params.case_id}`, {}, fetch)
  };
}) satisfies PageLoad;