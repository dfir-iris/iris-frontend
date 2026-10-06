/**
 * Asset-stage taxonomy cache — loaded once per session.
 *
 * The stage list is org-wide and admin-authored, so case views share
 * one lazily fetched copy instead of each asset row asking the API.
 * `assetStages.items` is reactive; `loadAssetStages()` is memoised and
 * safe to call from every component that needs the list. The Settings
 * page pushes its fresh list back through `setAssetStages()` after
 * each change so open case views pick it up without a reload.
 */
import { AssetStagesService, sortAssetStages } from '$lib/services/asset-stages.service';
import type { AssetStage } from '$lib/services/asset-stages.service';

export const assetStages = $state<{ items: AssetStage[]; loaded: boolean }>({
	items: [],
	loaded: false
});

let pending: Promise<AssetStage[]> | null = null;

export const setAssetStages = (items: AssetStage[]): void => {
	assetStages.items = sortAssetStages(items);
	assetStages.loaded = true;
};

export const loadAssetStages = (force = false): Promise<AssetStage[]> => {
	if (!force && assetStages.loaded) return Promise.resolve(assetStages.items);
	if (!force && pending) return pending;

	pending = (async () => {
		try {
			const res = await AssetStagesService.list();
			if (res.ok && Array.isArray(res.data)) {
				setAssetStages(res.data);
			} else {
				// Don't leave consumers on a skeleton forever; a forced
				// load retries.
				assetStages.loaded = true;
			}
			return assetStages.items;
		} finally {
			pending = null;
		}
	})();
	return pending;
};

export const invalidateAssetStages = (): void => {
	assetStages.loaded = false;
};
