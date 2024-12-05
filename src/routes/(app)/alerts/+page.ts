import { ApiService } from '$lib/services/api.service';
import type { PageLoad } from './$types';
import { ENDPOINTS } from '$lib/constants/endpoints';

export const load: PageLoad = async ({ fetch, depends }) => {

  depends('app:alert_filter');

  try {
    const response = await ApiService.get(`${ENDPOINTS.alerts.filter}?page=1&per_page=10`, {}, fetch);
    return response.data;
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return {};
  }
};