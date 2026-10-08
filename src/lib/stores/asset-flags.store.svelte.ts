/**
 * Asset-flag taxonomy cache — loaded once per session.
 *
 * The flag list is org-wide and admin-authored, so case views share
 * one lazily fetched copy instead of each asset row asking the API.
 * `assetFlags.items` is reactive; `loadAssetFlags()` is memoised and
 * safe to call from every component that needs the list. The Settings
 * page pushes its fresh list back through `setAssetFlags()` after
 * each change so open case views pick it up without a reload.
 */
import { AssetFlagsService, sortAssetFlags } from '$lib/services/asset-flags.service';
import type { AssetFlag } from '$lib/services/asset-flags.service';

export const assetFlags = $state<{ items: AssetFlag[]; loaded: boolean }>({
	items: [],
	loaded: false
});

let pending: Promise<AssetFlag[]> | null = null;

export const setAssetFlags = (items: AssetFlag[]): void => {
	assetFlags.items = sortAssetFlags(items);
	assetFlags.loaded = true;
};

export const loadAssetFlags = (force = false): Promise<AssetFlag[]> => {
	if (!force && assetFlags.loaded) return Promise.resolve(assetFlags.items);
	if (!force && pending) return pending;

	pending = (async () => {
		try {
			const res = await AssetFlagsService.list();
			if (res.ok && Array.isArray(res.data)) {
				setAssetFlags(res.data);
			} else {
				// Don't leave consumers on a skeleton forever; a forced
				// load retries.
				assetFlags.loaded = true;
			}
			return assetFlags.items;
		} finally {
			pending = null;
		}
	})();
	return pending;
};

export const invalidateAssetFlags = (): void => {
	assetFlags.loaded = false;
};
