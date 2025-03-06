import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Paginated } from '$lib/services/api.service';
import type { Asset } from '$lib/types/resources/asset';
import type { LayoutLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return {
    data: ApiService.get<Paginated<Asset>>(ENDPOINTS.case.assets.list(params.case_id, {}), {fetch: fetch})
  };
}) satisfies LayoutLoad;