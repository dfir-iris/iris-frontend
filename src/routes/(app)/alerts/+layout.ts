import { ENDPOINTS } from '$lib/constants/endpoints';
import { ApiService } from '$lib/services/api.service';
import type { LayoutLoad } from './$types';

export const load = (async () => {
  return {
    alerts: ApiService.get(ENDPOINTS.alerts.filter)
  };
}) satisfies LayoutLoad;