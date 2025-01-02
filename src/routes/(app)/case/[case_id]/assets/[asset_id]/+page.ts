import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  return {
    asset: ApiService.get(ENDPOINTS.case.assets.getById(params.asset_id))
  };
}) satisfies PageLoad;