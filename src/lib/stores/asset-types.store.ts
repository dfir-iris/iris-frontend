import { writable } from 'svelte/store';
import { ApiService } from '$lib/services/api.service';

export interface AssetType {
  id: number;
  asset_name: string;
  asset_description: string;
}

function createAssetTypesStore() {
  const { subscribe, set, update } = writable<AssetType[]>([]);
  let initialized = false;
  let fetchPromise: Promise<void> | null = null;

  async function fetchAssetTypes() {
    // If already fetching or initialized, don't fetch again
    if (fetchPromise || initialized) {
      return fetchPromise;
    }

    fetchPromise = new Promise(async (resolve) => {
      try {
        const response = await ApiService.get('/manage/asset-types');
        if (response && response.data) {
          set(response.data?.data);
        }
        initialized = true;
      } catch (error) {
        console.error('Error fetching asset types:', error);
      } finally {
        fetchPromise = null;
        resolve();
      }
    });

    return fetchPromise;
  }

  return {
    subscribe,
    fetch: fetchAssetTypes,
    isInitialized: () => initialized
  };
}

export const assetTypes = createAssetTypesStore();