import { writable, get } from 'svelte/store';
import type { Asset } from '$lib/types/resources/asset';

function createAssetsStore() {
  const { subscribe, set, update } = writable<Record<string, Asset>>({});

  return {
    subscribe,
    
    // Set multiple assets at once (typically from API response)
    setAssets: (assets: Asset[]) => {
      update(store => {
        const newStore = { ...store };
        assets.forEach(asset => {
          const assetId = asset.asset_id.toString();
          // If the asset already exists in the store, merge it with the new data
          if (newStore[assetId]) {
            newStore[assetId] = { ...newStore[assetId], ...asset };
          } else {
            newStore[assetId] = { ...asset };
          }
        });
        return newStore;
      });
    },
    
    // Update a single asset
    updateAsset: (assetId: string | number, updatedAsset: Asset) => {
      update(store => {
        // If the asset already exists in the store, merge it with the new data
        const existingAsset = store[assetId];
        const mergedAsset = existingAsset 
          ? { ...existingAsset, ...updatedAsset }
          : { ...updatedAsset };
        
          console.log('mergedAsset', mergedAsset);
        return {
          ...store,
          [assetId]: mergedAsset
        };
      });
    },
    
    // Get an asset by ID
    getAsset: (assetId: string) => {
      const store = get({ subscribe });
      return store[assetId] ? { ...store[assetId] } : undefined;
    },
    
    // Get all assets as an array
    getAssetsList: () => {
      const store = get({ subscribe });
      return Object.values(store).map(asset => ({ ...asset }));
    },
    
    // Clear the store
    clear: () => set({})
  };
}

export const assetsStore = createAssetsStore();
export const isLoadingAssetsStore = writable(true);
