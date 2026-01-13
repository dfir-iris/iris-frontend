import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Ioc } from '$lib/types/resources/ioc';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return {
    ioc_id: params.ioc_id,
    ioc: ApiService.get<Ioc>(
      ENDPOINTS.case.ioc.getById(
        params.case_id, 
        params.ioc_id
      ), 
      {fetch: fetch}
    )
  };
}) satisfies PageLoad;