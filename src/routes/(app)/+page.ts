// src/routes/(app)/+page.ts
import { ApiService } from '$lib/services/api.service';
import type { PageLoad } from './$types';
import { ENDPOINTS } from '$lib/constants/endpoints';
import { casesStore, isLoadingStore } from '$lib/stores/cases.store';
import { tasksStore, isLoadingTasksStore } from '$lib/stores/tasks.store';
import { reviewsStore, isLoadingReviewsStore } from '$lib/stores/reviews.store';
import { alertsStore, isLoadingAlertsStore } from '$lib/stores/alerts.store';
import { current_user } from '$lib/stores/auth.store';

export const load: PageLoad = async ({ fetch, depends }) => {

  depends('app:dashboard_main_data');

  isLoadingStore.set(true);
  isLoadingTasksStore.set(true);
  isLoadingReviewsStore.set(true);
  isLoadingAlertsStore.set(true);

  // TODO: Resolve the current user for which we receive the data 
//   let userId: number;
//   current_user.subscribe(user => {
//       if (user) {
//           userId = user.id;
//       }
//   });

  const api_requests = [
      ApiService.get(`${ENDPOINTS.user.cases.list}?cid=1&show_closed=false`, {}, fetch),
      ApiService.get(ENDPOINTS.user.tasks.list, {}, fetch),
      ApiService.get(ENDPOINTS.user.reviews.list, {}, fetch),
      ApiService.get(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["1"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`, {}, fetch)
  ];

  const ret_data = {
    cases: [],
    tasks: [],
    reviews: [],
    alerts: []
  };

  try {
      const results = await Promise.allSettled(api_requests);

      results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
              switch (index) {
                  case 0:
                      ret_data.cases = result.value;
                      break;
                  case 1:
                      ret_data.tasks = result.value;
                      break;
                  case 2:
                      ret_data.reviews = result.value;
                      break;
                  case 3:
                      ret_data.alerts = result.value.alerts;
                      break;
              }
          } else {
              console.error(`Request ${index} failed:`, result.reason);
          }
      });

      isLoadingStore.set(false);
      isLoadingTasksStore.set(false);
      isLoadingReviewsStore.set(false);
      isLoadingAlertsStore.set(false);

      return ret_data;


  } catch (error) {
      console.error('Error loading initial data:', error);
  } finally {
      isLoadingStore.set(false);
      isLoadingTasksStore.set(false);
      isLoadingReviewsStore.set(false);
      isLoadingAlertsStore.set(false);
  }
};