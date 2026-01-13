import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Paginated } from '$lib/services/api.service';
import type { Ioc } from '$lib/types/resources/ioc';
import type { LayoutLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return {
    data: ApiService.get<Paginated<Ioc>>(ENDPOINTS.case.ioc.list(params.case_id, {}), {fetch: fetch})
  };
}) satisfies LayoutLoad;