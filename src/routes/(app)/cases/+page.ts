import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService, type Paginated } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, url }) => {
  const page = parseInt(url.searchParams.get('page') || '') || 1
  return {
    cases: ApiService.get<Paginated<Case>>(ENDPOINTS.case.list({
      page
    }), { fetch }),
  };
}) satisfies PageLoad;