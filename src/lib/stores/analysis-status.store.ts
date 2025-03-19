import { writable } from 'svelte/store';
import { ApiService } from '$lib/services/api.service';

export interface AnalysisStatus {
  id: number;
  name: string;
  description?: string;
}

function createAnalysisStatusStore() {
  const { subscribe, set, update } = writable<AnalysisStatus[]>([]);
  let initialized = false;
  let fetchPromise: Promise<void> | null = null;

  async function fetchAnalysisStatuses() {
    // If already fetching or initialized, don't fetch again
    if (fetchPromise || initialized) {
      return fetchPromise;
    }

    fetchPromise = new Promise(async (resolve) => {
      try {
        const response = await ApiService.get('/manage/analysis-status');
        if (response && response.data) {
          set(response.data?.data);
        }
        initialized = true;
      } catch (error) {
        console.error('Error fetching analysis statuses:', error);
      } finally {
        fetchPromise = null;
        resolve();
      }
    });

    return fetchPromise;
  }

  return {
    subscribe,
    fetch: fetchAnalysisStatuses,
    isInitialized: () => initialized
  };
}

export const analysisStatuses = createAnalysisStatusStore();