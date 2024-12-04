import { ApiService } from '$lib/services/api.service';
import type { PageServerLoad } from './$types';
import { ENDPOINTS } from '$lib/constants/endpoints';

export const load: PageServerLoad = async () => {
  try {
      const response = await ApiService.get(ENDPOINTS.alerts.filter);
      return {
          alerts: response.data
      };
  } catch (error) {
      console.error('Error fetching alerts:', error);
      return {
          alerts: []
      };
  }
};