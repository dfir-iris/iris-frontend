import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { Asset } from '$lib/types/resources/asset';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  return {
    assetId: params.asset_id,
    asset: ApiService.get<Asset>(ENDPOINTS.case.assets.getById(params.asset_id))
  };
}) satisfies PageLoad;