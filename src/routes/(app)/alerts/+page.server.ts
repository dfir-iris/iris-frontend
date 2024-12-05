// routes/(app)/alerts/+page.server.ts
import { ApiService } from '$lib/services/api.service';
import type { PageServerLoad } from './$types';
import { ENDPOINTS } from '$lib/constants/endpoints';

export const load: PageServerLoad = async ({ request }) => {
  try {
    // Extract session cookie
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
      throw new Error('No cookies found');
    }

    const sessionCookie = cookieHeader.split('; ').find(row => row.startsWith('session=')).split('=')[1];
    const response = await ApiService.get(`${ENDPOINTS.alerts.filter}?page=1&per_page=10`, { sessionCookie });
    
    return response.data;

  } catch (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }
};
