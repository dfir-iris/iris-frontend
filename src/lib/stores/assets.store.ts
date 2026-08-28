import { writable, get } from 'svelte/store';
import type { Asset } from '$lib/types/resources/asset';

interface AssetsStoreData {
	assets: Record<string, Asset>; // Assets indexed by their ID
	listRefreshNonce: number;
}

function createAssetsStore() {
	const { subscribe, set, update } = writable<AssetsStoreData>({
		assets: {},
		listRefreshNonce: 0
	});

	return {
		subscribe,

		// Set multiple assets at once (typically from API response)
		setAssets: (assets: Asset[]) => {
			update((store) => {
				const newStore = { ...store.assets };
				assets.forEach((asset) => {
					const assetId = asset.asset_id.toString();
					// If the asset already exists in the store, merge it with the new data
					if (newStore[assetId]) {
						newStore[assetId] = { ...newStore[assetId], ...asset };
					} else {
						newStore[assetId] = { ...asset };
					}
				});
				return { ...store, assets: newStore };
			});
		},

		// Update a single asset
		updateAsset: (assetId: string | number, updatedAsset: Asset) => {
			update((store) => {
				// If the asset already exists in the store, merge it with the new data
				const existingAsset = store.assets[assetId];
				const mergedAsset = existingAsset
					? { ...existingAsset, ...updatedAsset }
					: { ...updatedAsset };

				console.log('mergedAsset', mergedAsset);
				return {
					...store,
					assets: {
						...store.assets,
						[assetId]: mergedAsset
					}
				};
			});
		},

		addAsset: (assetData: Asset) => {
			update((store) => {
				const assetId = assetData.asset_id.toString();
				return {
					...store,
					assets: { ...store.assets, [assetId]: { ...assetData } }
				};
			});
		},

		// Remove an asset by ID
		removeAsset: (assetId: string | number) => {
			update((store) => {
				const { [assetId]: _removedAsset, ...newStore } = store.assets;
				return { ...store, assets: newStore };
			});
		},

		// Get an asset by ID
		getAsset: (assetId: string) => {
			let asset: Asset | undefined;
			// Accessing a nested property of the store value
			subscribe((value) => {
				asset = value.assets[assetId];
			})();
			return asset;
		},

		// Get all assets as an array
		getAssetsList: () => {
			const store = get({ subscribe });
			return Object.values(store.assets).map((asset) => ({ ...asset }));
		},

		// Clear the store
		clear: () => set({ assets: {}, listRefreshNonce: 0 }),

		triggerListRefresh: () => {
			update((store) => {
				return { ...store, listRefreshNonce: store.listRefreshNonce + 1 };
			});
		}
	};
}

export const assetsStore = createAssetsStore();
export const isLoadingAssetsStore = writable(true);
